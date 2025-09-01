import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

interface StudyComparison {
  study_id: string
  protocol_number: string
  study_title: string
  status: string
  phase: string | null
  start_date: string | null
  target_enrollment: number | null
  actual_enrollment: number
  enrollment_rate: number
  total_visits: number
  completed_visits: number
  visit_completion_rate: number
  timing_compliance_rate: number
  drug_compliance_rate: number
  overall_performance_score: number
  days_since_start: number
  enrollment_velocity: number
}

interface StudyMilestone {
  study_id: string
  protocol_number: string
  milestones: {
    first_subject_enrolled: string | null
    target_enrollment_date: string | null
    last_subject_enrolled: string | null
    database_lock: string | null
    completion_date: string | null
  }
  progress: {
    enrollment_progress: number
    visit_progress: number
    overall_progress: number
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Use Authorization header like other APIs
    const authHeader = _request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const supabase = createSupabaseAdmin()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get all studies with their data
    // Resolve memberships and restrict studies
    const { data: memberships } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)
    const siteIds = (memberships || []).map(m => m.site_id)

    let baseStudiesQuery = supabase
      .from('studies')
      .select(`
        id,
        protocol_number,
        study_title,
        status,
        phase,
        start_date,
        end_date,
        target_enrollment,
        created_at,
        updated_at,
        site_id,
        user_id
      `)
      .order('created_at', { ascending: false })

    if (siteIds.length > 0) {
      baseStudiesQuery = baseStudiesQuery.in('site_id', siteIds)
    } else {
      baseStudiesQuery = baseStudiesQuery.eq('user_id', user.id)
    }

    const { data: studies, error: studiesError } = await baseStudiesQuery

    if (studiesError) {
      console.error('Error fetching studies:', studiesError)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }

    if (!studies || studies.length === 0) {
      return NextResponse.json({
        comparisons: [],
        milestones: [],
        summary: {
          totalStudies: 0,
          activeStudies: 0,
          avgEnrollmentRate: 0,
          avgCompletionRate: 0
        }
      })
    }

    const studyIds = studies.map(s => s.id)

    // Get subjects for each study
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('id, study_id, enrollment_date, status')
      .in('study_id', studyIds)

    if (subjectsError) {
      console.error('Error fetching subjects:', subjectsError)
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
    }

    // Get visits for each study
    const { data: visits, error: visitsError } = await supabase
      .from('subject_visits')
      .select('id, study_id, status, is_within_window, updated_at')
      .in('study_id', studyIds)

    if (visitsError) {
      console.error('Error fetching visits:', visitsError)
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
    }

    // Get drug compliance data
    const { data: drugCompliance, error: drugError } = await supabase
      .from('drug_compliance')
      .select(`
        id,
        compliance_percentage,
        dispensed_count,
        returned_count,
        expected_taken,
        subject_visits!inner (
          id,
          study_id
        )
      `)
      .in('subject_visits.study_id', studyIds)

    if (drugError) {
      console.error('Error fetching drug compliance:', drugError)
      // Continue without drug compliance data
    }

    // Process data for each study
    const studyComparisons: StudyComparison[] = []
    const studyMilestones: StudyMilestone[] = []

    for (const study of studies) {
      const studySubjects = subjects?.filter(s => s.study_id === study.id) || []
      const studyVisits = visits?.filter(v => v.study_id === study.id) || []
      const studyDrugCompliance = drugCompliance?.filter(dc => 
        (dc as any).subject_visits.study_id === study.id
      ) || []

      // Calculate enrollment metrics
      const actual_enrollment = studySubjects.length
      const enrollment_rate = study.target_enrollment && study.target_enrollment > 0
        ? Math.round((actual_enrollment / study.target_enrollment) * 100)
        : 0

      // Calculate visit metrics
      const total_visits = studyVisits.length
      const completed_visits = studyVisits.filter(v => v.status === 'completed').length
      const visit_completion_rate = total_visits > 0
        ? Math.round((completed_visits / total_visits) * 100)
        : 0

      // Calculate timing compliance
      const completedVisitsWithTiming = studyVisits.filter(v => 
        v.status === 'completed' && v.is_within_window !== null
      )
      const withinWindowVisits = completedVisitsWithTiming.filter(v => v.is_within_window === true).length
      const timing_compliance_rate = completedVisitsWithTiming.length > 0
        ? Math.round((withinWindowVisits / completedVisitsWithTiming.length) * 100)
        : 0

      // Calculate drug compliance
      let drug_compliance_rate = 0
      if (studyDrugCompliance.length > 0) {
        const complianceValues = studyDrugCompliance.map(dc => {
          const record = dc as any
          let compliance = record.compliance_percentage
          if (compliance === null || compliance === undefined) {
            const expected = Number(record.expected_taken) || 0
            const dispensed = Number(record.dispensed_count) || 0
            const returned = Number(record.returned_count) || 0
            const actual = Math.max(0, dispensed - returned)
            compliance = expected > 0 ? (actual / expected) * 100 : 100
          }
          return Number(compliance) || 0
        })
        drug_compliance_rate = Math.round(
          complianceValues.reduce((a, b) => a + b, 0) / complianceValues.length
        )
      }

      // Calculate overall performance score
      const overall_performance_score = Math.round(
        (enrollment_rate + visit_completion_rate + timing_compliance_rate + drug_compliance_rate) / 4
      )

      // Calculate days since start
      const startDate = study.start_date ? new Date(study.start_date) : new Date(study.created_at)
      const today = new Date()
      const days_since_start = Math.round((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // Calculate enrollment velocity (subjects per month)
      const enrollment_velocity = days_since_start > 30 
        ? Math.round((actual_enrollment / days_since_start) * 30) 
        : actual_enrollment

      studyComparisons.push({
        study_id: study.id,
        protocol_number: study.protocol_number,
        study_title: study.study_title,
        status: study.status,
        phase: study.phase,
        start_date: study.start_date,
        target_enrollment: study.target_enrollment,
        actual_enrollment,
        enrollment_rate,
        total_visits,
        completed_visits,
        visit_completion_rate,
        timing_compliance_rate,
        drug_compliance_rate,
        overall_performance_score,
        days_since_start,
        enrollment_velocity
      })

      // Calculate study milestones
      const sortedSubjects = studySubjects
        .filter(s => s.enrollment_date)
        .sort((a, b) => new Date(a.enrollment_date).getTime() - new Date(b.enrollment_date).getTime())

      const first_subject_enrolled = sortedSubjects.length > 0 ? sortedSubjects[0].enrollment_date : null
      const last_subject_enrolled = sortedSubjects.length > 0 
        ? sortedSubjects[sortedSubjects.length - 1].enrollment_date 
        : null

      // Calculate target enrollment date (estimate based on current velocity)
      let target_enrollment_date = null
      if (study.target_enrollment && enrollment_velocity > 0 && actual_enrollment < study.target_enrollment) {
        const remainingSubjects = study.target_enrollment - actual_enrollment
        const monthsToComplete = remainingSubjects / enrollment_velocity
        const targetDate = new Date()
        targetDate.setMonth(targetDate.getMonth() + monthsToComplete)
        target_enrollment_date = targetDate.toISOString().split('T')[0]
      }

      const enrollment_progress = study.target_enrollment && study.target_enrollment > 0
        ? Math.min(100, Math.round((actual_enrollment / study.target_enrollment) * 100))
        : 100

      // Estimate visit progress based on completed visits
      const visit_progress = total_visits > 0
        ? Math.round((completed_visits / total_visits) * 100)
        : 0

      // Overall progress considering both enrollment and visits
      const overall_progress = Math.round((enrollment_progress + visit_progress) / 2)

      studyMilestones.push({
        study_id: study.id,
        protocol_number: study.protocol_number,
        milestones: {
          first_subject_enrolled,
          target_enrollment_date,
          last_subject_enrolled,
          database_lock: null, // Would need separate tracking
          completion_date: study.end_date
        },
        progress: {
          enrollment_progress,
          visit_progress,
          overall_progress
        }
      })
    }

    // Calculate summary statistics
    const activeStudies = studyComparisons.filter(s => 
      s.status === 'enrolling' || s.status === 'active'
    ).length

    const avgEnrollmentRate = studyComparisons.length > 0
      ? Math.round(studyComparisons.reduce((sum, s) => sum + s.enrollment_rate, 0) / studyComparisons.length)
      : 0

    const avgCompletionRate = studyComparisons.length > 0
      ? Math.round(studyComparisons.reduce((sum, s) => sum + s.visit_completion_rate, 0) / studyComparisons.length)
      : 0

    return NextResponse.json({
      comparisons: studyComparisons.sort((a, b) => b.overall_performance_score - a.overall_performance_score),
      milestones: studyMilestones,
      summary: {
        totalStudies: studies.length,
        activeStudies,
        avgEnrollmentRate,
        avgCompletionRate
      }
    })

  } catch (error) {
    console.error('Error in study analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
