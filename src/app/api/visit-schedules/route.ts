import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import type { VisitSchedule, VisitScheduleInsert, VisitScheduleUpdate } from '@/types/database'
import logger from '@/lib/logger'

// GET /api/visit-schedules?study_id=xxx - Get visit schedules for a study
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const sectionId = searchParams.get('section_id')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Get visit schedules for the study - order by visit_day, then by window_before_days (desc) for same-day visits
    let query = (supabase as any)
      .from('visit_schedules')
      .select('*')
      .eq('study_id', studyId)
      .order('visit_day', { ascending: true })
      .order('window_before_days', { ascending: false })

    if (sectionId) {
      query = query.eq('section_id', sectionId)
    }

    const { data: visitSchedules, error } = await query

    if (error) {
      logger.error('Database error fetching visit schedules', error as any, { studyId })
      return NextResponse.json({ error: 'Failed to fetch visit schedules' }, { status: 500 })
    }

    let enrichedSchedules = visitSchedules || []

    if (enrichedSchedules.length > 0) {
      const ids = enrichedSchedules.map((s: any) => s.id).filter(Boolean)
      if (ids.length > 0) {
        const { data: requirements, error: requirementsError } = await supabase
          .from('visit_kit_requirements')
          .select('*, study_kit_types(id, name, description, is_active)')
          .in('visit_schedule_id', ids)
          .order('created_at', { ascending: true })

        if (requirementsError) {
          logger.error('Failed to fetch visit kit requirements', requirementsError as any)
        } else if (requirements) {
          const requirementRows = (requirements as any[]) as Array<{ visit_schedule_id: string }>
          const grouped = requirementRows.reduce((acc, row) => {
            const key = row.visit_schedule_id
            if (!acc.has(key)) acc.set(key, [])
            acc.get(key)!.push(row)
            return acc
          }, new Map<string, any[]>())

          enrichedSchedules = enrichedSchedules.map((schedule: any) => ({
            ...schedule,
            kit_requirements: grouped.get(schedule.id as string) || []
          }))
        }
      }
    }

    return NextResponse.json({ visitSchedules: enrichedSchedules })
  } catch (error) {
    logger.error('API error in visit schedules GET', error as any)
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
      logger.error('Fetch error loading existing visit schedules', fetchError)
      return NextResponse.json({ error: 'Failed to fetch existing visit schedules' }, { status: 500 })
    }

    const schedulesToUpdate: VisitScheduleUpdate[] = []
    const schedulesToInsert: VisitScheduleInsert[] = []
    const scheduleIdMap = new Map()

    logger.debug('Processing visit schedules counts', { existingCount: existingSchedules?.length || 0, incomingCount: visit_schedules.length })

    // Process each incoming visit schedule
    // The frontend sends visit schedules with their visit_number as text (e.g., "OLS", "V1", etc.)
    visit_schedules.forEach((schedule, index) => {
      const visitNumber = schedule.visit_number || `V${index + 1}` // Default to V1, V2, etc. for new visits
      const sectionKey = (schedule as any).section_id ?? null
      const existingSchedule = (existingSchedules as VisitSchedule[])?.find(s => (
        s.visit_number === visitNumber && (((s as any).section_id ?? null) === sectionKey)
      ))
      
      logger.debug('Processing visit schedule', { visitNumber, incoming: schedule.visit_name, existing: existingSchedule?.visit_name, existingId: existingSchedule?.id })
      
      if (existingSchedule) {
        // Update existing schedule - preserve ID and visit_number to maintain lab kit associations
        const updateSchedule: VisitScheduleUpdate = {
          id: existingSchedule.id,
          ...schedule,
          visit_number: existingSchedule.visit_number, // Keep original visit number (text)
          study_id,
          updated_at: new Date().toISOString()
        }
        schedulesToUpdate.push(updateSchedule)
        scheduleIdMap.set(visitNumber, existingSchedule.id)
        logger.debug('Queued schedule update', { visit_name: updateSchedule.visit_name, visit_number: updateSchedule.visit_number })
      } else {
        // Insert new schedule - use the provided visit number (or generate one)
        const insertSchedule: VisitScheduleInsert = {
          ...schedule,
          visit_number: visitNumber, // Use the text visit number as provided
          study_id
        }
        schedulesToInsert.push(insertSchedule)
        logger.debug('Queued schedule insert', { visit_name: insertSchedule.visit_name, visit_number: visitNumber })
      }
    })

    // Remove any existing schedules that are no longer needed — scoped per section_id
    // Build map: section_id -> set of incoming visit_numbers
    const incomingBySection = new Map<string | null, Set<string>>()
    for (const schedule of visit_schedules) {
      const key = (schedule as any).section_id ?? null
      const vnum = schedule.visit_number
      if (!vnum || !vnum.trim()) continue
      if (!incomingBySection.has(key)) incomingBySection.set(key, new Set())
      incomingBySection.get(key)!.add(vnum)
    }
    logger.debug('Incoming visit numbers by section', {
      sections: Array.from(incomingBySection.entries()).map(([k, set]) => ({ section_id: k, count: set.size }))
    })

    // For each section present in incoming payload, compute deletions only within that section
    const toDeleteIds: string[] = []
    for (const [key, set] of incomingBySection.entries()) {
      const candidates = (existingSchedules as VisitSchedule[]).filter(s => ((s as any).section_id ?? null) === key)
      for (const s of candidates) {
        if (!set.has(s.visit_number)) toDeleteIds.push(s.id as any)
      }
    }
    logger.debug('Schedules to delete', { count: toDeleteIds.length })

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('visit_schedules')
        .delete()
        .in('id', toDeleteIds)

      if (deleteError) {
        logger.error('Delete error removing unused visit schedules', deleteError)
        return NextResponse.json({ error: 'Failed to remove unused visit schedules' }, { status: 500 })
      }
    }

    // Update existing schedules
    const updatedSchedules: any[] = []
    logger.debug('Updating schedules count', { updateCount: schedulesToUpdate.length })
    
    for (const schedule of schedulesToUpdate) {
      logger.debug('Updating schedule', { id: schedule.id, visit_name: schedule.visit_name, visit_number: schedule.visit_number })
      
      const updateData: VisitScheduleUpdate = {
        visit_name: schedule.visit_name,
        visit_day: schedule.visit_day,
        window_before_days: schedule.window_before_days,
        window_after_days: schedule.window_after_days,
        is_required: schedule.is_required,
        visit_type: schedule.visit_type,
        procedures: schedule.procedures,
        notes: schedule.notes,
        updated_at: schedule.updated_at
      }
      
      const { data: updated, error: updateError } = await (supabase as any)
        .from('visit_schedules')
        .update(updateData as VisitScheduleUpdate)
        .eq('id', schedule.id)
        .select()
        .single()

      if (updateError) {
        logger.error('Update error for visit schedule', updateError, { id: schedule.id })
        return NextResponse.json({ error: 'Failed to update visit schedule', details: updateError.message }, { status: 500 })
      }
      
      logger.debug('Successfully updated schedule', { id: updated?.id, visit_number: updated?.visit_number })
      updatedSchedules.push(updated)
    }

    // Insert new schedules
    let insertedSchedules: VisitSchedule[] = []
    if (schedulesToInsert.length > 0) {
      const { data: inserted, error: insertError } = await (supabase as any)
        .from('visit_schedules')
        .insert(schedulesToInsert as VisitScheduleInsert[])
        .select()

      if (insertError) {
        logger.error('Insert error creating visit schedules', insertError)
        return NextResponse.json({ 
          error: 'Failed to create visit schedules',
          details: insertError.message 
        }, { status: 500 })
      }
      insertedSchedules = inserted || []
    }

    const allSchedules = [...updatedSchedules, ...insertedSchedules].sort((a, b) => a.visit_number - b.visit_number)
    
    logger.debug('Successfully saved visit schedules', { count: allSchedules.length })
    return NextResponse.json({ visitSchedules: allSchedules }, { status: 201 })
  } catch (error) {
    logger.error('API error in visit schedules POST', error as any)
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
    const { data: visitSchedule, error } = await (supabase as any)
      .from('visit_schedules')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      } as VisitScheduleUpdate)
      .eq('id', id)
      .eq('study_id', study_id) // Extra security check
      .select()
      .single()

    if (error) {
      logger.error('Database error updating visit schedule', error as any, { id })
      return NextResponse.json({ error: 'Failed to update visit schedule' }, { status: 500 })
    }

    if (!visitSchedule) {
      return NextResponse.json({ error: 'Visit schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ visitSchedule })
  } catch (error) {
    logger.error('API error in visit schedules PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
