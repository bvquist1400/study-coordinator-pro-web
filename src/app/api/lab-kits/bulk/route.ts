import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import type { LabKitInsert } from '@/types/database'

type StudyAccessRow = { id: string; site_id: string | null; user_id: string }

interface BulkLabKit {
  study_id: string
  visit_schedule_id: string | null
  accession_number: string
  kit_type: string
  lot_number: string | null
  expiration_date: string | null
  received_date: string | null
  status: string
}

// POST /api/lab-kits/bulk - Bulk create lab kits
export async function POST(request: NextRequest) {
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

    const { labKits }: { labKits: BulkLabKit[] } = await request.json()
    
    // Validate request
    if (!Array.isArray(labKits) || labKits.length === 0) {
      return NextResponse.json({ error: 'labKits array is required' }, { status: 400 })
    }

    // Validate each lab kit
    for (const kit of labKits) {
      if (!kit.study_id || !kit.accession_number || !kit.kit_type) {
        return NextResponse.json({ 
          error: 'Each lab kit must have study_id, accession_number, and kit_type' 
        }, { status: 400 })
      }
    }

    // Get unique study IDs to verify access
    const studyIds = [...new Set(labKits.map(kit => kit.study_id))]
    
    // Verify user access to all studies
    for (const studyId of studyIds) {
      const { data: study, error: studyError } = await supabase
        .from('studies')
        .select('id, site_id, user_id')
        .eq('id', studyId)
        .single()

      const studyRow = study as StudyAccessRow | null
      if (studyError || !studyRow) {
        return NextResponse.json({ error: `Study not found: ${studyId}` }, { status: 404 })
      }

      // Check access
      if (studyRow.site_id) {
        const { data: member } = await supabase
          .from('site_members')
          .select('user_id')
          .eq('site_id', studyRow.site_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!member) {
          return NextResponse.json({ error: `Access denied to study: ${studyId}` }, { status: 403 })
        }
      } else if (studyRow.user_id !== user.id) {
        return NextResponse.json({ error: `Access denied to study: ${studyId}` }, { status: 403 })
      }
    }

    // Check for duplicate accession numbers within each study
    for (const studyId of studyIds) {
      const studyKits = labKits.filter(kit => kit.study_id === studyId)
      const accessionNumbers = studyKits.map(kit => kit.accession_number.trim())
      
      // Check for duplicates within the request
      const duplicates = accessionNumbers.filter((item, index) => accessionNumbers.indexOf(item) !== index)
      if (duplicates.length > 0) {
        return NextResponse.json({ 
          error: `Duplicate accession numbers in request: ${duplicates.join(', ')}` 
        }, { status: 409 })
      }

      // Check for existing accession numbers in the database
      const { data: existingKits } = await supabase
        .from('lab_kits')
        .select('accession_number')
        .eq('study_id', studyId)
        .in('accession_number', accessionNumbers)

      if (existingKits && existingKits.length > 0) {
        type AccRow = { accession_number: string }
        const existing = (existingKits as AccRow[]).map(kit => kit.accession_number)
        return NextResponse.json({ 
          error: `These accession numbers already exist in study ${studyId}: ${existing.join(', ')}` 
        }, { status: 409 })
      }
    }

    // Prepare lab kits for insertion
    const kitsToInsert: LabKitInsert[] = labKits.map(kit => ({
      study_id: kit.study_id,
      visit_schedule_id: kit.visit_schedule_id,
      accession_number: kit.accession_number.trim(),
      kit_type: kit.kit_type.trim(),
      lot_number: kit.lot_number?.trim() || null,
      expiration_date: kit.expiration_date || null,
      received_date: kit.received_date || null,
      status: kit.status || 'available',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))

    // Insert all lab kits
    const { data: insertedKits, error: insertError } = await (supabase as any)
      .from('lab_kits')
      .insert(kitsToInsert as LabKitInsert[])
      .select()

    if (insertError) {
      console.error('Database error:', insertError)
      return NextResponse.json({ error: 'Failed to create lab kits' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Lab kits created successfully',
      imported: insertedKits?.length || 0,
      labKits: insertedKits 
    }, { status: 201 })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
