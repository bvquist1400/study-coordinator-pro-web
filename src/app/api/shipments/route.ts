import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/shipments?studyId=xxx - Get shipments for a study
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Get shipments with lab kit details
    const { data: shipments, error } = await supabase
      .from('lab_kit_shipments')
      .select(`
        *,
        lab_kits!inner (
          id,
          accession_number,
          kit_type,
          study_id
        ),
        subject_visits (
          id,
          visit_date,
          subjects (
            subject_number
          )
        )
      `)
      .eq('lab_kits.study_id', studyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    return NextResponse.json({ shipments: shipments || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/shipments - Create new shipment
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const body = await request.json()
    const { 
      labKitIds, 
      externalKits,
      airwayBillNumber, 
      carrier = 'fedex',
      shippedDate,
      estimatedDelivery,
      notes,
      studyId 
    } = body

    const hasInternalKits = labKitIds && Array.isArray(labKitIds) && labKitIds.length > 0
    const hasExternalKits = externalKits && Array.isArray(externalKits) && externalKits.length > 0

    if (!hasInternalKits && !hasExternalKits) {
      return NextResponse.json({ error: 'At least one lab kit (internal or external) is required' }, { status: 400 })
    }

    if (!airwayBillNumber) {
      return NextResponse.json({ error: 'airwayBillNumber is required' }, { status: 400 })
    }

    if (!studyId) {
      return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
    }

    // Verify user has access to the study (only for internal kits)
    if (hasInternalKits) {
      const membership = await verifyStudyMembership(studyId, user.id)
      if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

      // Verify all lab kits exist and belong to the study
      const { data: labKits, error: labKitsError } = await supabase
        .from('lab_kits')
        .select('id, status, study_id')
        .in('id', labKitIds)
        .eq('study_id', studyId)

      if (labKitsError) {
        console.error('Lab kits verification error:', labKitsError)
        return NextResponse.json({ error: 'Failed to verify lab kits' }, { status: 500 })
      }

      if (labKits.length !== labKitIds.length) {
        return NextResponse.json({ error: 'Some lab kits not found or not accessible' }, { status: 400 })
      }

      // Check if any lab kits are not available for shipping
      const invalidKits = labKits.filter(kit => !['pending_shipment', 'used'].includes((kit as any).status))
      if (invalidKits.length > 0) {
        return NextResponse.json({ error: 'Some lab kits are not available for shipping' }, { status: 400 })
      }
    }

    // Create shipment records for internal lab kits
    const internalShipmentData = hasInternalKits ? labKitIds.map(labKitId => ({
      lab_kit_id: labKitId,
      airway_bill_number: airwayBillNumber,
      carrier,
      shipped_date: shippedDate || null,
      estimated_delivery: estimatedDelivery || null,
      tracking_status: 'shipped',
      notes: notes || null
    })) : []

    // Create shipment records for external lab kits (using null lab_kit_id with external data in notes)
    const externalShipmentData = hasExternalKits ? externalKits.map(externalKit => ({
      lab_kit_id: null, // External kits don't have internal lab kit IDs
      subject_visit_id: null,
      airway_bill_number: airwayBillNumber,
      carrier,
      shipped_date: shippedDate || null,
      estimated_delivery: estimatedDelivery || null,
      tracking_status: 'shipped',
      notes: JSON.stringify({
        external_kit: true,
        accession_number: externalKit.accession_number,
        kit_type: externalKit.kit_type,
        study_name: externalKit.study_name,
        subject_number: externalKit.subject_number,
        external_notes: externalKit.notes,
        shipment_notes: notes || null
      })
    })) : []

    const allShipmentData = [...internalShipmentData, ...externalShipmentData]

    const { data: shipments, error: shipmentError } = await supabase
      .from('lab_kit_shipments')
      // @ts-expect-error - TypeScript issue with dynamic insert data
      .insert(allShipmentData)
      .select()

    if (shipmentError) {
      console.error('Shipment creation error:', shipmentError)
      return NextResponse.json({ error: 'Failed to create shipments' }, { status: 500 })
    }

    // Update lab kit statuses to 'shipped' (only for internal kits)
    if (hasInternalKits) {
      const { error: updateError } = await supabase
        .from('lab_kits')
        // @ts-expect-error - TypeScript issue with update object
        .update({ status: 'shipped' })
        .in('id', labKitIds)

      if (updateError) {
        console.error('Lab kit status update error:', updateError)
        return NextResponse.json({ error: 'Shipments created but failed to update lab kit status' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      shipments: shipments || [],
      message: `Successfully created ${shipments?.length || 0} shipments`
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}