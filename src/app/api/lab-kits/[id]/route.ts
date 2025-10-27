import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import type { LabKitUpdate } from '@/types/database'
import logger from '@/lib/logger'

type StudyAccessRow = { id: string; site_id: string | null; user_id: string }
type LabKitWithStudy = Record<string, unknown> & { studies: StudyAccessRow; study_kit_types?: { id: string; name: string } | null }

function hasStudyAccess(row: unknown): row is { studies: StudyAccessRow } {
  const candidate = row as { studies?: unknown } | null | undefined
  const study = candidate?.studies as Record<string, unknown> | undefined
  if (!study || typeof study !== 'object') return false
  const id = (study as { id?: unknown }).id
  const userId = (study as { user_id?: unknown }).user_id
  const siteId = (study as { site_id?: unknown }).site_id
  const siteValid = siteId === null || typeof siteId === 'string'
  return typeof id === 'string' && typeof userId === 'string' && siteValid
}

// GET /api/lab-kits/[id] - Get specific lab kit details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    const { id: kitId } = await params

    // Get lab kit with study information for access control
    const { data: labKit, error } = await supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number),
        study_kit_types(id, name, description, is_active),
        studies!inner(id, site_id, user_id)
      `)
      .eq('id', kitId)
      .single()

    if (error || !labKit) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access to this lab kit's study
    if (!hasStudyAccess(labKit)) {
      logger.error('lab kit missing study join', { kitId })
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    const lk = labKit as LabKitWithStudy
    const study = lk.studies
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Clean up the response (omit joined study object)
    const labKitClean = Object.fromEntries(
      Object.entries(lk).filter(([key]) => key !== 'studies')
    )
    return NextResponse.json({ labKit: labKitClean })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/lab-kits/[id] - Update specific lab kit
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    const { id: kitId } = await params
    const updateData = await request.json()

    // First get the lab kit to verify access
    const { data: existingKit, error: fetchError } = await supabase
      .from('lab_kits')
      .select(`
        id,
        study_id,
        accession_number,
        kit_type_id,
        studies!inner(id, site_id, user_id)
      `)
      .eq('id', kitId)
      .single()

    if (fetchError || !existingKit || !hasStudyAccess(existingKit)) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access
    const study = (existingKit as Record<string, unknown> & { studies: StudyAccessRow }).studies
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check for duplicate accession number if it's being changed
    if (updateData.accession_number && updateData.accession_number !== (existingKit as { accession_number: string }).accession_number) {
      const { data: duplicateKit } = await supabase
        .from('lab_kits')
        .select('id')
        .eq('study_id', (existingKit as { study_id: string }).study_id)
        .eq('accession_number', updateData.accession_number)
        .neq('id', kitId)
        .maybeSingle()

      if (duplicateKit) {
        return NextResponse.json({ 
          error: 'A lab kit with this accession number already exists in this study' 
        }, { status: 409 })
      }
    }

    // Update the lab kit
    const updatePayload: LabKitUpdate = {
      ...updateData,
      updated_at: new Date().toISOString()
    }

    delete (updatePayload as any).study_id

    if (updateData.kit_type_id !== undefined) {
      if (updateData.kit_type_id) {
        type KitTypeLookupRow = { id: string; study_id: string; name: string | null }
        const { data: kitTypeRecordRaw, error: kitTypeError } = await supabase
          .from('study_kit_types')
          .select('id, study_id, name')
          .eq('id', updateData.kit_type_id)
          .single()
        const kitTypeRecord = kitTypeRecordRaw as KitTypeLookupRow | null
        if (kitTypeError || !kitTypeRecord || kitTypeRecord.study_id !== (existingKit as { study_id: string }).study_id) {
          return NextResponse.json({ error: 'Kit type not found for this study' }, { status: 400 })
        }
        updatePayload.kit_type_id = kitTypeRecord.id
        updatePayload.kit_type = kitTypeRecord.name ?? null
      } else {
        updatePayload.kit_type_id = null
        updatePayload.kit_type = null
      }
    }

    if (updatePayload.accession_number) {
      updatePayload.accession_number = updatePayload.accession_number.trim()
    }
    if (typeof updatePayload.kit_type === 'string') {
      updatePayload.kit_type = updatePayload.kit_type.trim()
    }

    const { data: updatedKit, error: updateError } = await (supabase as any)
      .from('lab_kits')
      .update(updatePayload)
      .eq('id', kitId)
      .select(`*, visit_schedules(visit_name, visit_number), study_kit_types(id, name, description, is_active)`)
      .single()

    if (updateError) {
      logger.error('Database error updating lab kit', updateError)
      return NextResponse.json({ error: 'Failed to update lab kit' }, { status: 500 })
    }

    return NextResponse.json({ labKit: updatedKit })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/lab-kits/[id] - Delete specific lab kit
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    const { id: kitId } = await params

    // First get the lab kit to verify access
    const { data: existingKit, error: fetchError } = await supabase
      .from('lab_kits')
      .select(`
        id,
        study_id,
        status,
        studies!inner(id, site_id, user_id)
      `)
      .eq('id', kitId)
      .single()

    if (fetchError || !existingKit || !hasStudyAccess(existingKit)) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access
    const study = (existingKit as Record<string, unknown> & { studies: StudyAccessRow }).studies
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Prevent deletion of used, shipped, or destroyed kits
    if ((existingKit as { status: string }).status === 'used' || (existingKit as { status: string }).status === 'shipped' || (existingKit as { status: string }).status === 'destroyed') {
      return NextResponse.json({ 
        error: 'Cannot delete lab kits that have been used, shipped, or destroyed' 
      }, { status: 400 })
    }

    // Delete the lab kit
    const { error: deleteError } = await supabase
      .from('lab_kits')
      .delete()
      .eq('id', kitId)

    if (deleteError) {
      logger.error('Database error deleting lab kit', deleteError)
      return NextResponse.json({ error: 'Failed to delete lab kit' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Lab kit deleted successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
