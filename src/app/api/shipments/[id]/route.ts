import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/shipments/[id] - Get shipment by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { id } = await params

    const { data: shipment, error } = await supabase
      .from('lab_kit_shipments')
      .select(`
        *,
        lab_kits (
          id,
          accession_number,
          kit_type,
          study_id,
          studies (
            protocol_number,
            study_title
          )
        ),
        subject_visits (
          id,
          visit_date,
          subjects (
            subject_number
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch shipment' }, { status: 500 })
    }

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    return NextResponse.json({ shipment })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/shipments/[id] - Update shipment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { id } = await params
    const body = await request.json()
    const { 
      trackingStatus,
      actualDelivery,
      estimatedDelivery,
      notes 
    } = body

    // Verify shipment exists and get lab kit info for access control
    const { data: existingShipment, error: fetchError } = await supabase
      .from('lab_kit_shipments')
      .select(`
        *,
        lab_kits (
          study_id,
          studies (
            user_id
          )
        )
      `)
      .eq('id', id)
      .single()

    if (fetchError || !existingShipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Verify user has access to the study
    const shipmentData = existingShipment as any
    if (!shipmentData.lab_kits?.studies?.user_id || shipmentData.lab_kits.studies.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const updateData: Record<string, any> = {}
    if (trackingStatus !== undefined) updateData.tracking_status = trackingStatus
    if (actualDelivery !== undefined) updateData.actual_delivery = actualDelivery
    if (estimatedDelivery !== undefined) updateData.estimated_delivery = estimatedDelivery
    if (notes !== undefined) updateData.notes = notes

    const { data: updatedShipment, error: updateError } = await supabase
      .from('lab_kit_shipments')
      // @ts-expect-error - TypeScript issue with dynamic update object
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 })
    }

    return NextResponse.json({ shipment: updatedShipment })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}