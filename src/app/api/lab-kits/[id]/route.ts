import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/lab-kits/[id] - Get specific lab kit details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const kitId = params.id

    // Get lab kit with study information for access control
    const { data: labKit, error } = await supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number),
        studies!inner(id, site_id, user_id)
      `)
      .eq('id', kitId)
      .single()

    if (error || !labKit) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access to this lab kit's study
    const study = labKit.studies
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

    // Clean up the response
    delete (labKit as any).studies

    return NextResponse.json({ labKit })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/lab-kits/[id] - Update specific lab kit
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const kitId = params.id
    const updateData = await request.json()

    // First get the lab kit to verify access
    const { data: existingKit, error: fetchError } = await supabase
      .from('lab_kits')
      .select(`
        id,
        study_id,
        accession_number,
        studies!inner(id, site_id, user_id)
      `)
      .eq('id', kitId)
      .single()

    if (fetchError || !existingKit) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access
    const study = existingKit.studies
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
    if (updateData.accession_number && updateData.accession_number !== existingKit.accession_number) {
      const { data: duplicateKit } = await supabase
        .from('lab_kits')
        .select('id')
        .eq('study_id', existingKit.study_id)
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
    const { data: updatedKit, error: updateError } = await supabase
      .from('lab_kits')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', kitId)
      .select()
      .single()

    if (updateError) {
      console.error('Database error:', updateError)
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
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ') ) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const kitId = params.id

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

    if (fetchError || !existingKit) {
      return NextResponse.json({ error: 'Lab kit not found' }, { status: 404 })
    }

    // Verify user access
    const study = existingKit.studies
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
    if (existingKit.status === 'used' || existingKit.status === 'shipped' || existingKit.status === 'destroyed') {
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
      console.error('Database error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete lab kit' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Lab kit deleted successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}