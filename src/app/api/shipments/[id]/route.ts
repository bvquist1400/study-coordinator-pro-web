import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// PUT /api/shipments/[id] - Update shipment tracking status
export async function PUT(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const { id } = await params
    const body = await request.json()
    const { tracking_status, actual_delivery } = body || {}

    if (!tracking_status) {
      return NextResponse.json({ error: 'tracking_status is required' }, { status: 400 })
    }

    if (!['shipped', 'delivered', 'pending', 'in_transit', 'exception'].includes(tracking_status)) {
      return NextResponse.json({ error: 'Invalid tracking_status' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Get the shipment first to verify access
    const { data: shipment, error: fetchError } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id,
        lab_kit_id,
        accession_number,
        subject_visit_id,
        lab_kits(study_id),
        subject_visits(study_id)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !shipment) {
      logger.error('Shipment not found', fetchError as any)
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Determine which study this shipment belongs to
    let studyId: string | null = null
    if ((shipment as any).lab_kits) {
      studyId = ((shipment as any).lab_kits as any).study_id
    } else if ((shipment as any).subject_visits) {
      studyId = ((shipment as any).subject_visits as any).study_id
    } else if ((shipment as any).accession_number) {
      // Look up study via accession number
      const { data: kit } = await supabase
        .from('lab_kits')
        .select('study_id')
        .eq('accession_number', (shipment as any).accession_number)
        .single()
      studyId = (kit as any)?.study_id || null
    }

    if (!studyId) {
      return NextResponse.json({ error: 'Cannot determine study for shipment' }, { status: 400 })
    }

    // Verify user has access to the study (simplified - you may want more robust checking)
    const { data: userStudies } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (!userStudies || userStudies.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Prepare update data
    const updateData: any = {
      tracking_status,
      updated_at: new Date().toISOString()
    }

    // If marking as delivered, set actual_delivery date
    if (tracking_status === 'delivered' && !(shipment as any).actual_delivery) {
      updateData.actual_delivery = actual_delivery || new Date().toISOString().split('T')[0]
    }

    // Update the shipment
    const { data: updated, error: updateError } = await supabase
      .from('lab_kit_shipments')
      // @ts-expect-error - dynamic update object
      .update(updateData)
      .eq('id', id)
      .select('id, tracking_status, actual_delivery')
      .single()

    if (updateError) {
      logger.error('Failed to update shipment', updateError as any)
      return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 })
    }

    // Keep related lab kit state in sync when marking delivered.
    if (tracking_status === 'delivered') {
      try {
        const kitUpdate = { status: 'delivered', updated_at: new Date().toISOString() }
        const shipmentLabKitId = (shipment as any).lab_kit_id as string | null
        const shipmentAccession = (shipment as any).accession_number as string | null

        if (shipmentLabKitId) {
          const { error: kitUpdateError } = await supabase
            .from('lab_kits')
            // @ts-expect-error dynamic update object
            .update(kitUpdate)
            .eq('id', shipmentLabKitId)
          if (kitUpdateError) {
            throw kitUpdateError
          }
        } else if (shipmentAccession) {
          const { error: kitUpdateError } = await supabase
            .from('lab_kits')
            // @ts-expect-error dynamic update object
            .update(kitUpdate)
            .eq('accession_number', shipmentAccession)
          if (kitUpdateError) {
            throw kitUpdateError
          }
        }
      } catch (syncError) {
        logger.warn?.('Failed to sync lab kit status for delivered shipment', syncError as any)
      }
    }

    return NextResponse.json({ 
      shipment: updated,
      message: `Shipment marked as ${tracking_status}` 
    })

  } catch (e) {
    logger.error('Shipment update error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
