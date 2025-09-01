import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import { calculateComplianceMetrics } from '@/lib/ip-accountability'

// GET /api/subjects?study_id=xxx - Get subjects for a study
export async function GET(request: NextRequest) {
  try {
    // Get the auth token from supabase session
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    // Verify user membership on the study's site
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id, created_by')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    const stAny: any = study
    const isOwner = stAny.user_id === user.id || stAny.created_by === user.id
    if (stAny.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', stAny.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member && !isOwner) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if enhanced metrics are requested
    const includeMetrics = searchParams.get('include_metrics') === 'true'

    if (includeMetrics) {
      // Load subjects for study (with filters)
      let subjectQuery = supabase
        .from('subjects')
        .select('id, study_id, subject_number, gender, enrollment_date, randomization_date, treatment_arm, status, discontinuation_reason, discontinuation_date, notes, created_at, updated_at')
        .eq('study_id', studyId)
        .order('subject_number')

      if (status) subjectQuery = subjectQuery.eq('status', status)
      if (search) subjectQuery = subjectQuery.ilike('subject_number', `%${search}%`)

      const { data: subjects, error: subjectsErr } = await subjectQuery
      if (subjectsErr) {
        console.error('Database error:', subjectsErr)
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
      }

      if (!subjects || subjects.length === 0) {
        return NextResponse.json({ subjects: [] })
      }

      // Load Schedule of Events once
      const { data: soaVisits } = await supabase
        .from('visit_schedules')
        .select('id, visit_name, visit_day')
        .eq('study_id', studyId)
        .order('visit_day', { ascending: true })

      // Load all visits for these subjects in one query with IP accountability data
      const subjectIds = (subjects as any[]).map(s => (s as any).id as string)
      const { data: allVisits, error: visitsErr } = await supabase
        .from('subject_visits')
        .select(`
          id,
          subject_id,
          visit_date,
          status,
          ip_id,
          ip_dispensed,
          ip_start_date,
          ip_returned,
          ip_last_dose_date,
          visit_schedules!inner(
            id,
            visit_name,
            visit_day
          )
        `)
        .in('subject_id', subjectIds)
        .order('visit_date', { ascending: true })

      if (visitsErr) {
        console.error('Error fetching visits for subjects', visitsErr)
        return NextResponse.json({ error: 'Failed to fetch subject visits' }, { status: 500 })
      }

      // Group visits by subject
      const visitsBySubject = new Map<string, any[]>()
      for (const v of allVisits || []) {
        const sid = (v as any).subject_id as string
        if (!visitsBySubject.has(sid)) visitsBySubject.set(sid, [])
        visitsBySubject.get(sid)!.push(v)
      }

      // Build metrics
      const now = new Date()
      const subjectsWithMetrics = (subjects as any[]).map((subject: any) => {
        const visits = visitsBySubject.get(subject.id) || []

        const completedVisits = visits.filter(v => (v as any).status === 'completed')
        const upcomingVisits = visits.filter(v => {
          const d = (v as any).visit_date as string | null
          if (!d) return false
          const dt = new Date(d + 'T00:00:00Z')
          return (v as any).status === 'scheduled' && dt >= now
        })
        const overdueVisits = visits.filter(v => {
          const d = (v as any).visit_date as string | null
          if (!d) return false
          const dt = new Date(d + 'T00:00:00Z')
          return (v as any).status === 'scheduled' && dt < now
        })

        const onTimeVisits = completedVisits.filter(v => {
          const d = (v as any).visit_date as string | null
          if (!d) return false
          // Using UTC midnight for stability
          const scheduledDate = new Date(d + 'T00:00:00Z')
          const completedDate = new Date(d + 'T00:00:00Z')
          const diffDays = Math.abs(completedDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24)
          return diffDays <= 3
        })
        const complianceRate = completedVisits.length > 0 ? (onTimeVisits.length / completedVisits.length) * 100 : 100

        const lastVisit = completedVisits.length > 0 ? completedVisits[completedVisits.length - 1] : null
        const nextVisit = upcomingVisits.length > 0 ? upcomingVisits[0] : null

        const daysSinceLastVisit = lastVisit ? Math.floor((now.getTime() - new Date(((lastVisit as any).visit_date as string) + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)) : null
        const daysUntilNextVisit = nextVisit ? Math.floor((new Date(((nextVisit as any).visit_date as string) + 'T00:00:00Z').getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

        // Calculate drug compliance metrics
        const ipVisits = visits.filter(v => (v as any).ip_dispensed && (v as any).ip_dispensed > 0)
        let drugCompliance = null
        let lastDrugDispensing = null
        let activeDrugBottle = null
        let expectedReturnDate = null

        if (ipVisits.length > 0) {
          // Find the most recent IP dispensing
          const lastIpVisit = ipVisits[ipVisits.length - 1] as any
          lastDrugDispensing = {
            visit_date: lastIpVisit.visit_date,
            ip_id: lastIpVisit.ip_id,
            ip_dispensed: lastIpVisit.ip_dispensed,
            ip_start_date: lastIpVisit.ip_start_date || lastIpVisit.visit_date
          }

          // Look for return data in subsequent visits
          const returnVisit = visits.find(v => 
            (v as any).ip_returned !== null && 
            (v as any).ip_returned !== undefined &&
            new Date((v as any).visit_date) > new Date(lastIpVisit.visit_date)
          ) as any

          if (returnVisit) {
            // Calculate compliance using returned data
            const compliance = calculateComplianceMetrics(
              lastIpVisit.ip_dispensed,
              returnVisit.ip_returned,
              lastIpVisit.ip_start_date || lastIpVisit.visit_date,
              returnVisit.ip_last_dose_date || returnVisit.visit_date,
              1 // Default 1 dose per day - could be made dynamic based on study dosing frequency
            )
            drugCompliance = compliance
          } else {
            // Active bottle - no return yet
            activeDrugBottle = {
              ip_id: lastIpVisit.ip_id,
              dispensed_count: lastIpVisit.ip_dispensed,
              start_date: lastIpVisit.ip_start_date || lastIpVisit.visit_date,
              days_since_dispensing: Math.floor((now.getTime() - new Date((lastIpVisit.ip_start_date || lastIpVisit.visit_date) + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
            }

            // Estimate expected return date (30 days after start, or based on dispensed count)
            const startDate = new Date((lastIpVisit.ip_start_date || lastIpVisit.visit_date) + 'T00:00:00Z')
            const estimatedDuration = Math.min(lastIpVisit.ip_dispensed, 30) // Cap at 30 days
            expectedReturnDate = new Date(startDate)
            expectedReturnDate.setDate(expectedReturnDate.getDate() + estimatedDuration)
          }
        }

        const s: any = subject
        return {
          ...s,
          metrics: {
            total_visits: soaVisits?.length || 0,
            completed_visits: completedVisits.length,
            upcoming_visits: upcomingVisits.length,
            overdue_visits: overdueVisits.length,
            last_visit_date: lastVisit ? (lastVisit as any).visit_date : null,
            last_visit_name: lastVisit ? (lastVisit as any).visit_schedules?.visit_name || null : null,
            next_visit_date: nextVisit ? (nextVisit as any).visit_date : null,
            next_visit_name: nextVisit ? (nextVisit as any).visit_schedules?.visit_name || null : null,
            visit_compliance_rate: complianceRate,
            days_since_last_visit: daysSinceLastVisit,
            days_until_next_visit: daysUntilNextVisit,
            // Drug compliance metrics
            drug_compliance: drugCompliance,
            last_drug_dispensing: lastDrugDispensing,
            active_drug_bottle: activeDrugBottle,
            expected_return_date: expectedReturnDate ? expectedReturnDate.toISOString().split('T')[0] : null
          }
        }
      })

      return NextResponse.json({ subjects: subjectsWithMetrics })
    } else {
      // Standard query without metrics
      let query = supabase
        .from('subjects')
        .select('*')
        .eq('study_id', studyId)
        .order('subject_number')

      // Filter by status if provided
      if (status) {
        query = query.eq('status', status)
      }

      // Search by subject number if provided
      if (search) {
        query = query.ilike('subject_number', `%${search}%`)
      }

      const { data: subjects, error } = await query

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
      }

      return NextResponse.json({ subjects })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/subjects - Create new subject
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const subjectData = await request.json()
    
    // Validate required fields
    if (!subjectData.study_id || !subjectData.subject_number) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, subject_number' 
      }, { status: 400 })
    }

    // Verify user membership on the study's site
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', subjectData.study_id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    const stAny: any = study
    if (stAny.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', stAny.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (stAny.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if subject number already exists in this study
    const { data: existingSubject } = await supabase
      .from('subjects')
      .select('id')
      .eq('study_id', subjectData.study_id)
      .eq('subject_number', subjectData.subject_number)
      .single()

    if (existingSubject) {
      return NextResponse.json({ 
        error: `Subject number ${subjectData.subject_number} already exists in this study` 
      }, { status: 409 })
    }

    // Insert subject with user ID
    const { data: subject, error } = await supabase
      .from('subjects')
      .insert({
        ...subjectData,
        user_id: user.id,
        status: subjectData.status || 'screening'
      } as unknown as never)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      console.error('Data being inserted:', {
        ...subjectData,
        user_id: user.id,
        status: subjectData.status || 'screening'
      })
      
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: `Subject number ${subjectData.subject_number} already exists` 
        }, { status: 409 })
      }
      return NextResponse.json({ 
        error: 'Failed to create subject',
        details: error.message 
      }, { status: 500 })
    }

    return NextResponse.json({ subject }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
