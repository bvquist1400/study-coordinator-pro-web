import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import type { VisitSchedule } from '@/types/database'

// GET /api/visit-schedules?study_id=xxx - Get visit schedules for a study
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Get visit schedules for the study - order by visit_day, then by window_before_days (desc) for same-day visits
    const { data: visitSchedules, error } = await supabase
      .from('visit_schedules')
      .select('*')
      .eq('study_id', studyId)
      .order('visit_day', { ascending: true })
      .order('window_before_days', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch visit schedules' }, { status: 500 })
    }

    return NextResponse.json({ visitSchedules })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/visit-schedules - Create or update visit schedules for a study
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { study_id, visit_schedules } = await request.json()
    
    if (!study_id || !visit_schedules || !Array.isArray(visit_schedules)) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id and visit_schedules array' 
      }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Get existing visit schedules to preserve IDs and associations - order by visit_day, then by window_before_days (desc) for same-day visits
    const { data: existingSchedules, error: fetchError } = await supabase
      .from('visit_schedules')
      .select('*')
      .eq('study_id', study_id)
      .order('visit_day', { ascending: true })
      .order('window_before_days', { ascending: false })

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch existing visit schedules' }, { status: 500 })
    }

    const schedulesToUpdate: any[] = []
    const schedulesToInsert: any[] = []
    const scheduleIdMap = new Map()

    console.log('Processing visit schedules. Existing:', existingSchedules?.length, 'Incoming:', visit_schedules.length)

    // Process each incoming visit schedule
    // The frontend sends visit schedules with their visit_number as text (e.g., "OLS", "V1", etc.)
    visit_schedules.forEach((schedule, index) => {
      const visitNumber = schedule.visit_number || `V${index + 1}` // Default to V1, V2, etc. for new visits
      const existingSchedule = (existingSchedules as VisitSchedule[])?.find(s => s.visit_number === visitNumber)
      
      console.log(`Processing visit ${visitNumber}:`, {
        incoming: schedule.visit_name,
        existing: existingSchedule?.visit_name,
        existingId: existingSchedule?.id
      })
      
      if (existingSchedule) {
        // Update existing schedule - preserve ID and visit_number to maintain lab kit associations
        const updateSchedule = {
          id: existingSchedule.id,
          ...schedule,
          visit_number: existingSchedule.visit_number, // Keep original visit number (text)
          study_id,
          updated_at: new Date().toISOString()
        }
        schedulesToUpdate.push(updateSchedule)
        scheduleIdMap.set(visitNumber, existingSchedule.id)
        console.log('Queued for update:', updateSchedule.visit_name, 'visit_number:', updateSchedule.visit_number)
      } else {
        // Insert new schedule - use the provided visit number (or generate one)
        const insertSchedule = {
          ...schedule,
          visit_number: visitNumber, // Use the text visit number as provided
          study_id
        }
        schedulesToInsert.push(insertSchedule)
        console.log('Queued for insert:', insertSchedule.visit_name, 'visit_number:', visitNumber)
      }
    })

    // Remove any existing schedules that are no longer needed
    // Get visit numbers from the incoming schedules (now text values)
    const incomingVisitNumbers = visit_schedules
      .map(schedule => schedule.visit_number)
      .filter(n => n && n.trim() !== '') // Filter out empty/null visit numbers
    console.log('Incoming visit numbers:', incomingVisitNumbers)
    
    // Only delete schedules that aren't in the incoming list
    const schedulesToDelete = (existingSchedules as VisitSchedule[])?.filter(s => 
      !incomingVisitNumbers.includes(s.visit_number)
    ) || []
    
    console.log('Schedules to delete:', schedulesToDelete.map(s => ({id: s.id, visit_number: s.visit_number, visit_name: s.visit_name})))
    
    if (schedulesToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('visit_schedules')
        .delete()
        .in('id', schedulesToDelete.map(s => s.id))

      if (deleteError) {
        console.error('Delete error:', deleteError)
        return NextResponse.json({ error: 'Failed to remove unused visit schedules' }, { status: 500 })
      }
    }

    // Update existing schedules
    const updatedSchedules: any[] = []
    console.log('Updating schedules:', schedulesToUpdate.length, 'schedules')
    
    for (const schedule of schedulesToUpdate) {
      console.log('Updating schedule:', {
        id: schedule.id,
        visit_name: schedule.visit_name,
        visit_number: schedule.visit_number
      })
      
      const { data: updated, error: updateError } = await supabase
        .from('visit_schedules')
        .update({
          visit_name: schedule.visit_name,
          visit_day: schedule.visit_day,
          window_before_days: schedule.window_before_days,
          window_after_days: schedule.window_after_days,
          is_required: schedule.is_required,
          visit_type: schedule.visit_type,
          procedures: schedule.procedures,
          notes: schedule.notes,
          updated_at: schedule.updated_at
        } as any)
        .eq('id', schedule.id)
        .select()
        .single()

      if (updateError) {
        console.error('Update error for schedule:', schedule.id, updateError)
        return NextResponse.json({ error: 'Failed to update visit schedule', details: updateError.message }, { status: 500 })
      }
      
      console.log('Successfully updated schedule:', updated)
      updatedSchedules.push(updated)
    }

    // Insert new schedules
    let insertedSchedules: any[] = []
    if (schedulesToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('visit_schedules')
        .insert(schedulesToInsert as unknown as never)
        .select()

      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json({ 
          error: 'Failed to create visit schedules',
          details: insertError.message 
        }, { status: 500 })
      }
      insertedSchedules = inserted || []
    }

    const allSchedules = [...updatedSchedules, ...insertedSchedules].sort((a, b) => a.visit_number - b.visit_number)
    
    console.log('Successfully saved visit schedules:', allSchedules)
    return NextResponse.json({ visitSchedules: allSchedules }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/visit-schedules - Update a specific visit schedule
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { id, study_id, ...updateData } = await request.json()
    
    if (!id || !study_id) {
      return NextResponse.json({ error: 'Visit schedule ID and study_id are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Update visit schedule
    const { data: visitSchedule, error } = await supabase
      .from('visit_schedules')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      } as unknown as never)
      .eq('id', id)
      .eq('study_id', study_id) // Extra security check
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update visit schedule' }, { status: 500 })
    }

    if (!visitSchedule) {
      return NextResponse.json({ error: 'Visit schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ visitSchedule })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
