import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

interface EnrollmentTrend {
  month: string
  enrolled: number
  cumulative: number
}

interface StudyEnrollment {
  study_id: string
  protocol_number: string
  study_title: string
  target_enrollment: number | null
  actual_enrollment: number
  enrollment_rate: number
  start_date: string | null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get('months') || '12')
    const studyId = searchParams.get('studyId')

    // Authorization: Bearer token (align with other APIs)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const supabase = createSupabaseAdmin()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    // Resolve membership: allowed study IDs (site-based or legacy user-owned)
    const { data: memberships } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)
    const siteIds = ((memberships || []) as Array<{ site_id: string | null }>).map(m => m.site_id)

    let studiesQuery = supabase
      .from('studies')
      .select('id, protocol_number, study_title, target_enrollment, start_date, site_id, user_id')
    if (studyId) {
      studiesQuery = studiesQuery.eq('id', studyId)
    } else if (siteIds.length > 0) {
      studiesQuery = studiesQuery.in('site_id', siteIds)
    } else {
      studiesQuery = studiesQuery.eq('user_id', user.id)
    }

    const { data: allowedStudies, error: studiesErr } = await studiesQuery
    if (studiesErr) {
      logger.error('Error fetching studies for enrollment analytics', studiesErr)
      return NextResponse.json({ error: 'Failed to resolve studies' }, { status: 500 })
    }
    const allowedStudyIds = ((allowedStudies || []) as Array<{ id: string }>).map(s => s.id)
    if (allowedStudyIds.length === 0) {
      return NextResponse.json({ trends: [], studyBreakdown: [], summary: { totalEnrolled: 0, totalTarget: 0, overallRate: 0, activeStudies: 0 } })
    }

    const toDateOnly = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    // Build subjects query within allowed studies and date range
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select(`
        id,
        study_id,
        enrollment_date,
        status,
        studies!inner (
          id,
          protocol_number,
          study_title,
          target_enrollment,
          start_date,
          site_id
        )
      `)
      .in('study_id', allowedStudyIds)
      .gte('enrollment_date', toDateOnly(startDate))
      .lte('enrollment_date', toDateOnly(endDate))

    if (subjectsError) {
      logger.error('Error fetching subjects for enrollment analytics', subjectsError)
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
    }

    // Calculate monthly enrollment trends
    const monthlyEnrollment: { [key: string]: number } = {}
    const enrollmentData: EnrollmentTrend[] = []

    // Initialize months with zero enrollments
    for (let i = 0; i < months; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - (months - 1 - i))
      const monthKey = date.toISOString().substring(0, 7) // YYYY-MM
      monthlyEnrollment[monthKey] = 0
    }

    // Count enrollments by month
    const subjectsRows = (subjects || []) as any[]
    subjectsRows.forEach(subject => {
      const enrollmentMonth = subject.enrollment_date.substring(0, 7)
      if (monthlyEnrollment.hasOwnProperty(enrollmentMonth)) {
        monthlyEnrollment[enrollmentMonth]++
      }
    })

    // Convert to trend data with cumulative counts
    let cumulative = 0
    Object.keys(monthlyEnrollment).sort().forEach(month => {
      const enrolled = monthlyEnrollment[month]
      cumulative += enrolled
      const date = new Date(month + '-01')
      enrollmentData.push({
        month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        enrolled,
        cumulative
      })
    })

    // Calculate per-study enrollment metrics
    const studyEnrollmentMap: { [key: string]: any } = {}

    subjects?.forEach(subject => {
      const study = (subject as any).studies
      if (!studyEnrollmentMap[study.id]) {
        studyEnrollmentMap[study.id] = {
          study_id: study.id,
          protocol_number: study.protocol_number,
          study_title: study.study_title,
          target_enrollment: study.target_enrollment,
          actual_enrollment: 0,
          start_date: study.start_date
        }
      }
      studyEnrollmentMap[study.id].actual_enrollment++
    })

    // Calculate enrollment rates and convert to array
    const studyEnrollment: StudyEnrollment[] = Object.values(studyEnrollmentMap).map((study: any) => ({
      ...study,
      enrollment_rate: study.target_enrollment > 0 
        ? Math.round((study.actual_enrollment / study.target_enrollment) * 100) 
        : 0
    }))

    // Get total metrics
    const totalEnrolled = subjectsRows.length || 0
    const totalTarget = studyEnrollment.reduce((sum, study) => sum + (study.target_enrollment || 0), 0)
    const overallRate = totalTarget > 0 ? Math.round((totalEnrolled / totalTarget) * 100) : 0

    return NextResponse.json({
      trends: enrollmentData,
      studyBreakdown: studyEnrollment,
      summary: {
        totalEnrolled,
        totalTarget,
        overallRate,
        activeStudies: studyEnrollment.length
      }
    })

  } catch (error) {
    logger.error('Error in enrollment analytics', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
import logger from '@/lib/logger'
