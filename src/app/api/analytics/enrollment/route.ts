import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
    
    const supabase = await createServerSupabaseClient()
    
    // Get user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    // Build base query for subjects
    let subjectsQuery = supabase
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
      .gte('enrollment_date', startDate.toISOString())
      .lte('enrollment_date', endDate.toISOString())

    // Filter by study if specified
    if (studyId) {
      subjectsQuery = subjectsQuery.eq('study_id', studyId)
    }

    const { data: subjects, error: subjectsError } = await subjectsQuery

    if (subjectsError) {
      console.error('Error fetching subjects:', subjectsError)
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
    subjects?.forEach(subject => {
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
    const totalEnrolled = subjects?.length || 0
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
    console.error('Error in enrollment analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
