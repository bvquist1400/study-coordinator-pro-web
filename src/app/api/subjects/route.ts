import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

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
      .select('id, site_id, user_id')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

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

    // Check if enhanced metrics are requested
    const includeMetrics = searchParams.get('include_metrics') === 'true'

    if (includeMetrics) {
      // Build query for subjects with visit metrics
      let subjectQuery = supabase
        .from('subjects')
        .select('*')
        .eq('study_id', studyId)
        .order('subject_number')

      // Filter by status if provided
      if (status) {
        subjectQuery = subjectQuery.eq('status', status)
      }

      // Search by subject number if provided
      if (search) {
        subjectQuery = subjectQuery.ilike('subject_number', `%${search}%`)
      }

      const { data: subjects, error } = await subjectQuery

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
      }

      // Get visit metrics for each subject
      const subjectsWithMetrics = await Promise.all(subjects.map(async (subject) => {
        // Get the total planned visits from the Schedule of Events
        const { data: soaVisits, error: soaError } = await supabase
          .from('visit_schedules')
          .select('id, visit_name, visit_day')
          .eq('study_id', studyId)
          .order('visit_day', { ascending: true })

        if (soaError) {
          console.error('Error fetching SOE visits for study', studyId, soaError)
        }

        // Get actual subject visits
        const { data: visits, error: visitsError } = await supabase
          .from('subject_visits')
          .select(`
            id,
            visit_date,
            status,
            visit_schedules!inner(
              id,
              visit_name,
              visit_day
            )
          `)
          .eq('subject_id', subject.id)
          .order('visit_date', { ascending: true })

        if (visitsError) {
          console.error('Error fetching visits for subject', subject.id, visitsError)
          return {
            ...subject,
            metrics: {
              total_visits: soaVisits?.length || 0,
              completed_visits: 0,
              upcoming_visits: 0,
              overdue_visits: 0,
              last_visit_date: null,
              last_visit_name: null,
              next_visit_date: null,
              next_visit_name: null,
              visit_compliance_rate: 0,
              days_since_last_visit: null,
              days_until_next_visit: null
            }
          }
        }

        const now = new Date()
        const completedVisits = visits?.filter(v => v.status === 'completed') || []
        const upcomingVisits = visits?.filter(v => v.status === 'scheduled' && new Date(v.visit_date) >= now) || []
        const overdueVisits = visits?.filter(v => v.status === 'scheduled' && new Date(v.visit_date) < now) || []
        
        // Calculate compliance rate (percentage of visits completed on time)
        const onTimeVisits = completedVisits.filter(v => {
          // Consider on-time if completed within 3 days of scheduled date
          const scheduledDate = new Date(v.visit_date)
          const completedDate = new Date(v.visit_date) // Using visit_date as actual completion
          const diffDays = Math.abs(completedDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24)
          return diffDays <= 3
        })
        const complianceRate = completedVisits.length > 0 ? (onTimeVisits.length / completedVisits.length) * 100 : 100

        // Find last and next visits
        const lastVisit = completedVisits.length > 0 ? completedVisits[completedVisits.length - 1] : null
        const nextVisit = upcomingVisits.length > 0 ? upcomingVisits[0] : null

        // Calculate days since/until
        const daysSinceLastVisit = lastVisit ? Math.floor((now.getTime() - new Date(lastVisit.visit_date).getTime()) / (1000 * 60 * 60 * 24)) : null
        const daysUntilNextVisit = nextVisit ? Math.floor((new Date(nextVisit.visit_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

        return {
          ...subject,
          metrics: {
            total_visits: soaVisits?.length || 0,
            completed_visits: completedVisits.length,
            upcoming_visits: upcomingVisits.length,
            overdue_visits: overdueVisits.length,
            last_visit_date: lastVisit?.visit_date || null,
            last_visit_name: lastVisit?.visit_schedules?.visit_name || null,
            next_visit_date: nextVisit?.visit_date || null,
            next_visit_name: nextVisit?.visit_schedules?.visit_name || null,
            visit_compliance_rate: complianceRate,
            days_since_last_visit: daysSinceLastVisit,
            days_until_next_visit: daysUntilNextVisit
          }
        }
      }))

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
