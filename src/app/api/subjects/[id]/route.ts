import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import type { SubjectUpdate } from '@/types/database'
import logger from '@/lib/logger'

// GET /api/subjects/[id] - Get specific subject
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const subjectId = params.id
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get subject first (no relationship dependency)
    const { data: subject, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
      }
      logger.error('Database error fetching subject', error)
      return NextResponse.json({ error: 'Failed to fetch subject' }, { status: 500 })
    }

    // Membership check via subject.study_id -> studies.site_id (robust even without FK metadata)
    const { data: studyRow, error: stErr } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', (subject as any).study_id)
      .single()
    if (stErr || !studyRow) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    const sr: any = studyRow
    if (sr.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', sr.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (sr.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ subject })
  } catch (error) {
    logger.error('API error in subject GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/subjects/[id] - Update subject
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const updateData = await request.json()
    const subjectId = params.id

    // Create update object with allowed fields
    const updateObject = {
      subject_number: updateData.subject_number,
      gender: updateData.gender,
      enrollment_date: updateData.enrollment_date,
      randomization_date: updateData.randomization_date,
      treatment_arm: updateData.treatment_arm,
      status: updateData.status,
      discontinuation_reason: updateData.discontinuation_reason,
      discontinuation_date: updateData.discontinuation_date,
      notes: updateData.notes,
      updated_at: new Date().toISOString()
    }

    // Remove undefined fields
    Object.keys(updateObject).forEach(key => {
      if (updateObject[key as keyof typeof updateObject] === undefined) {
        delete updateObject[key as keyof typeof updateObject]
      }
    })

    // Verify membership before update
    const { data: subRow, error: subErr } = await supabase
      .from('subjects')
      .select('study_id')
      .eq('id', subjectId)
      .single()
    if (subErr || !subRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const { data: st } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', (subRow as any).study_id)
      .single()
    if (!st) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    const srec: any = st
    if (srec.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', srec.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (srec.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Load current subject to detect date changes
    const { data: currentSubject, error: curErr } = await (supabase as any)
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .single()
    if (curErr || !currentSubject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    const prevEnrollmentDate: string | null = (currentSubject as any).enrollment_date || null
    const prevRandomizationDate: string | null = (currentSubject as any).randomization_date || null

    // Update subject
    const { data: subject, error } = await (supabase as any)
      .from('subjects')
      .update(updateObject as SubjectUpdate)
      .eq('id', subjectId)
      .select()
      .single()

    if (error) {
      logger.error('Database error updating subject', error as any)
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: 'Subject number already exists in this study' 
        }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to update subject' }, { status: 500 })
    }

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or access denied' }, { status: 404 })
    }

    // If anchor-driving dates changed, update section anchors and reschedule pending visits
    try {
      const newEnrollmentDate: string | null = (subject as any).enrollment_date || null
      const newRandomizationDate: string | null = (subject as any).randomization_date || null

      const enrollmentChanged = updateObject.hasOwnProperty('enrollment_date') && newEnrollmentDate !== prevEnrollmentDate
      const randomizationChanged = updateObject.hasOwnProperty('randomization_date') && newRandomizationDate !== prevRandomizationDate

      if (enrollmentChanged || randomizationChanged) {
        // Find active subject sections for this subject
        const { data: subjSections, error: secErr } = await (supabase as any)
          .from('subject_sections')
          .select('id, study_section_id, anchor_date, ended_at, study_sections(order_index)')
          .eq('subject_id', subjectId)
          .is('ended_at', null)

        if (!secErr && subjSections && subjSections.length > 0) {
          // Determine earliest active section by study_sections.order_index (fallback to first)
          const getOrder = (s: any) => (s?.study_sections?.order_index ?? Number.MAX_SAFE_INTEGER)
          const sorted = [...(subjSections as any[])].sort((a, b) => getOrder(a) - getOrder(b))
          const earliestActiveId = sorted[0]?.id

          for (const ss of sorted) {
            // Load study_section to determine anchor behavior
            const { data: studySection, error: ssErr } = await (supabase as any)
              .from('study_sections')
              .select('id, anchor_type, anchor_offset_days')
              .eq('id', ss.study_section_id)
              .single()
            if (ssErr || !studySection) continue

            const anchorType = (studySection as any).anchor_type as string
            const offsetDays = Number((studySection as any).anchor_offset_days || 0)

            let newAnchorBase: string | null = null
            if (anchorType === 'enrollment_date' && enrollmentChanged) newAnchorBase = newEnrollmentDate
            if (anchorType === 'randomization_date' && randomizationChanged) newAnchorBase = newRandomizationDate

            // If section uses its own anchor, but the existing anchor matches the previous subject-level date + offset, treat it as derived and update too
            if (!newAnchorBase && anchorType === 'section_anchor_date' && ss.id === earliestActiveId) {
              const prevBase = randomizationChanged && prevRandomizationDate ? prevRandomizationDate : (enrollmentChanged ? prevEnrollmentDate : null)
              const nextBase = randomizationChanged ? newRandomizationDate : (enrollmentChanged ? newEnrollmentDate : null)
              if (prevBase && nextBase) {
                const prev = new Date(prevBase + 'T00:00:00Z')
                prev.setUTCDate(prev.getUTCDate() + offsetDays)
                const expectedPrev = prev.toISOString().slice(0, 10)
                if (ss.anchor_date === expectedPrev) {
                  newAnchorBase = nextBase
                }
              }
            }

            if (!newAnchorBase) continue

            // Compute new anchor_date with offset
            const base = new Date(newAnchorBase + 'T00:00:00Z')
            base.setUTCDate(base.getUTCDate() + offsetDays)
            const newAnchorDate = base.toISOString().slice(0, 10)

            // Update subject_sections anchor_date
            await (supabase as any)
              .from('subject_sections')
              .update({ anchor_date: newAnchorDate, updated_at: new Date().toISOString() })
              .eq('id', ss.id)

            // Fetch visit templates for this section. If no section-specific templates,
            // include global (null section) templates for this study.
            const { data: templates } = await (supabase as any)
              .from('visit_schedules')
              .select('id, visit_day, section_id, study_id')
              .or(`section_id.eq.${ss.study_section_id},section_id.is.null`)
              .eq('study_id', (subRow as any).study_id)

            if (templates && templates.length > 0) {
              for (const t of templates as any[]) {
                // Compute new target date for each template relative to anchor
                const dt = new Date(newAnchorDate + 'T00:00:00Z')
                const visitDay = Number((t as any).visit_day || 0)
                dt.setUTCDate(dt.getUTCDate() + visitDay)
                const newVisitDate = dt.toISOString().slice(0, 10)

                // Update only pending visits for this section/template
                await (supabase as any)
                  .from('subject_visits')
                  .update({ visit_date: newVisitDate, updated_at: new Date().toISOString() })
                  .eq('subject_id', subjectId)
                  .eq('subject_section_id', ss.id)
                  .eq('visit_schedule_id', (t as any).id)
                  .eq('status', 'scheduled')
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn('Post-update reschedule failed (non-fatal)', e as any)
    }

    return NextResponse.json({ subject })
  } catch (error) {
    logger.error('API error in subject PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/subjects/[id] - Delete subject
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const subjectId = params.id
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Perform cascaded delete (FKs handle related records)

    // Verify membership before delete
    const { data: subRow, error: subErr } = await supabase
      .from('subjects')
      .select('study_id')
      .eq('id', subjectId)
      .single()
    if (subErr || !subRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    const { data: st } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', (subRow as any).study_id)
      .single()
    if (!st) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    const srow: any = st
    if (srow.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', srow.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (srow.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Perform delete after authorization
    const { data: subject, error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', subjectId)
      .select()
      .single()

    if (error) {
      if ((error as any).code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
      }
      logger.error('Database error deleting subject', error as any)
      return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Subject deleted successfully', 
      subject 
    })
  } catch (error) {
    logger.error('API error in subject DELETE', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
