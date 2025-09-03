import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

interface InventoryForecast {
  visitName: string
  visitsScheduled: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  upcomingVisits: Array<{
    visit_date: string
    subject_number: string
  }>
}

// GET /api/inventory-forecast?study_id=xxx&days=30 - Get inventory forecast
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const days = parseInt(searchParams.get('days') || '30')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    // Verify user membership on the study
    type StudyAccessRow = { id: string; site_id: string | null; user_id: string }
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', studyId)
      .single()

    const studyRow = study as StudyAccessRow | null
    if (studyError || !studyRow) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (studyRow.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', studyRow.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (studyRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Calculate date range
    const today = new Date()
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + days)

    // Load visit schedule kit requirements (SOE indicates whether a lab kit is required)
    const { data: visitSchedules } = await supabase
      .from('visit_schedules')
      .select('visit_name, procedures')
      .eq('study_id', studyId)

    const requiresKitByName = new Set<string>()
    for (const vs of (visitSchedules || []) as Array<{ visit_name: string; procedures: string[] | null }>) {
      const names = (vs.procedures || []).map(p => String(p).toLowerCase())
      const requiresKit = names.includes('lab kit') || names.includes('labkit')
      if (requiresKit) requiresKitByName.add(vs.visit_name)
    }

    // Query upcoming visits by visit type (only consider visit types that require kits)
    const { data: upcomingVisits, error: visitsError } = await supabase
      .from('subject_visits')
      .select(`
        visit_name,
        visit_date,
        subjects!inner(subject_number)
      `)
      .eq('study_id', studyId)
      .eq('status', 'scheduled')
      .gte('visit_date', today.toISOString().split('T')[0])
      .lte('visit_date', futureDate.toISOString().split('T')[0])

    if (visitsError) {
      console.error('Visits error:', visitsError)
      return NextResponse.json({ error: 'Failed to fetch upcoming visits' }, { status: 500 })
    }

    // Query available kits by visit assignment
    const { data: labKits, error: kitsError } = await supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number)
      `)
      .eq('study_id', studyId)
      .in('status', ['available', 'assigned'])

    if (kitsError) {
      console.error('Kits error:', kitsError)
      return NextResponse.json({ error: 'Failed to fetch lab kits' }, { status: 500 })
    }

    // Group upcoming visits by visit name
    type UpcomingVisitRow = { visit_name: string; visit_date: string; subjects: { subject_number: string } }
    const uVisits = ((upcomingVisits || []) as UpcomingVisitRow[])
      // Only track visits that require lab kits per SOE
      .filter(v => requiresKitByName.has(v.visit_name))
    const visitGroups = uVisits.reduce((groups, visit) => {
      const visitName = visit.visit_name
      if (!groups[visitName]) {
        groups[visitName] = []
      }
      groups[visitName].push({
        visit_date: visit.visit_date,
        subject_number: visit.subjects.subject_number
      })
      return groups
    }, {} as Record<string, Array<{ visit_date: string, subject_number: string }>>)

    // Group available kits by visit assignment
    type KitRow = { status: string; expiration_date: string | null; visit_schedules?: { visit_name?: string | null } | null }
    const kits = (labKits || []) as KitRow[]
    const kitGroups = kits.reduce((groups, kit) => {
      const visitName = kit.visit_schedules?.visit_name || 'Unassigned'
      if (!groups[visitName]) {
        groups[visitName] = {
          available: 0,
          expiringSoon: 0
        }
      }
      
      if (kit.status === 'available') {
        groups[visitName].available++
        
        // Check if expiring within 30 days
        if (kit.expiration_date) {
          const expDate = new Date(kit.expiration_date)
          const thirtyDaysFromNow = new Date()
          thirtyDaysFromNow.setDate(today.getDate() + 30)
          
          if (expDate <= thirtyDaysFromNow && expDate >= today) {
            groups[visitName].expiringSoon++
          }
        }
      }
      
      return groups
    }, {} as Record<string, { available: number, expiringSoon: number }>)

    // Calculate forecast for each visit type
    const forecast: InventoryForecast[] = []

    // Get all unique visit names from both visits and kits
    const allVisitNames = new Set(
      [
        ...Object.keys(visitGroups),
        ...Object.keys(kitGroups).filter(name => name !== 'Unassigned')
      ].filter(name => requiresKitByName.has(name))
    )

    for (const visitName of allVisitNames) {
      const visitsScheduled = visitGroups[visitName]?.length || 0
      const kitsData = kitGroups[visitName] || { available: 0, expiringSoon: 0 }
      const deficit = Math.max(0, visitsScheduled - kitsData.available)
      
      let status: 'ok' | 'warning' | 'critical' = 'ok'
      
      if (deficit > 0) {
        status = 'critical'
      } else if (kitsData.available - visitsScheduled <= 2 || kitsData.expiringSoon > 0) {
        status = 'warning'
      }

      forecast.push({
        visitName,
        visitsScheduled,
        kitsAvailable: kitsData.available,
        kitsExpiringSoon: kitsData.expiringSoon,
        deficit,
        status,
        upcomingVisits: visitGroups[visitName] || []
      })
    }

    // Sort by status priority (critical first, then warning, then ok)
    forecast.sort((a, b) => {
      const statusOrder = { 'critical': 0, 'warning': 1, 'ok': 2 }
      return statusOrder[a.status] - statusOrder[b.status]
    })

    return NextResponse.json({ 
      forecast,
      summary: {
        totalVisitsScheduled: Object.values(visitGroups).reduce((sum, visits) => sum + visits.length, 0),
        criticalIssues: forecast.filter(f => f.status === 'critical').length,
        warnings: forecast.filter(f => f.status === 'warning').length,
        daysAhead: days
      }
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
