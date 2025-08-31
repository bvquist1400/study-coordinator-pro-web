import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

interface VisitPerformance {
  month: string
  scheduled: number
  completed: number
  missed: number
  completion_rate: number
}

interface StudyVisitStats {
  study_id: string
  protocol_number: string
  study_title: string
  total_visits: number
  completed_visits: number
  scheduled_visits: number
  missed_visits: number
  completion_rate: number
  avg_days_to_completion: number
  overdue_visits: number
}

interface VisitTypeBreakdown {
  visit_name: string
  total: number
  completed: number
  completion_rate: number
  avg_duration: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get('months') || '12')
    const studyId = searchParams.get('studyId')

    // Get user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    // Get visit data
    let visitsQuery = supabase
      .from('subject_visits')
      .select(`
        id,
        visit_name,
        status,
        visit_date,
        updated_at,
        created_at,
        study_id,
        subjects!inner (
          id,
          subject_number,
          studies!inner (
            id,
            protocol_number,
            study_title,
            site_id
          )
        )
      `)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (studyId) {
      visitsQuery = visitsQuery.eq('study_id', studyId)
    }

    const { data: visits, error: visitsError } = await visitsQuery
    if (visitsError) {
      console.error('Error fetching visits:', visitsError)
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
    }

    // Calculate monthly visit performance
    const monthlyData: { [key: string]: { scheduled: number, completed: number, missed: number } } = {}
    
    // Initialize months
    for (let i = 0; i < months; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - (months - 1 - i))
      const monthKey = date.toISOString().substring(0, 7)
      monthlyData[monthKey] = { scheduled: 0, completed: 0, missed: 0 }
    }

    // Process visits by creation month
    visits?.forEach(visit => {
      const visitData = visit as any
      const month = visitData.created_at.substring(0, 7)
      if (monthlyData[month]) {
        monthlyData[month].scheduled += 1
        if (visitData.status === 'completed') {
          monthlyData[month].completed += 1
        } else if (visitData.status === 'missed') {
          monthlyData[month].missed += 1
        }
      }
    })

    // Convert to performance data
    const visitPerformance: VisitPerformance[] = Object.keys(monthlyData).sort().map(month => {
      const data = monthlyData[month]
      const date = new Date(month + '-01')
      const completion_rate = data.scheduled > 0 ? Math.round((data.completed / data.scheduled) * 100) : 0

      return {
        month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        scheduled: data.scheduled,
        completed: data.completed,
        missed: data.missed,
        completion_rate
      }
    })

    // Calculate per-study visit statistics
    const studyStatsMap: { [key: string]: any } = {}

    visits?.forEach(visit => {
      const visitData = visit as any
      const study = visitData.subjects.studies
      
      if (!studyStatsMap[study.id]) {
        studyStatsMap[study.id] = {
          study_id: study.id,
          protocol_number: study.protocol_number,
          study_title: study.study_title,
          total_visits: 0,
          completed_visits: 0,
          scheduled_visits: 0,
          missed_visits: 0,
          completion_times: [], // For calculating average days to completion
          overdue_visits: 0
        }
      }
      
      const stats = studyStatsMap[study.id]
      stats.total_visits += 1
      
      switch (visitData.status) {
        case 'completed':
          stats.completed_visits += 1
          // Calculate days from scheduled to completed
          if (visitData.visit_date && visitData.updated_at) {
            const scheduledDate = new Date(visitData.visit_date)
            const completedDate = new Date(visitData.updated_at)
            const daysDiff = Math.round((completedDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24))
            if (daysDiff >= 0) stats.completion_times.push(daysDiff)
          }
          break
        case 'scheduled':
          stats.scheduled_visits += 1
          // Check if overdue
          if (visitData.visit_date) {
            const visitDate = new Date(visitData.visit_date)
            const today = new Date()
            if (visitDate < today) {
              stats.overdue_visits += 1
            }
          }
          break
        case 'missed':
          stats.missed_visits += 1
          break
      }
    })

    // Convert to study visit stats array
    const studyVisitStats: StudyVisitStats[] = Object.values(studyStatsMap).map((study: any) => {
      const completion_rate = study.total_visits > 0 
        ? Math.round((study.completed_visits / study.total_visits) * 100)
        : 0
      
      const avg_days_to_completion = study.completion_times.length > 0
        ? Math.round(study.completion_times.reduce((a: number, b: number) => a + b, 0) / study.completion_times.length)
        : 0

      return {
        study_id: study.study_id,
        protocol_number: study.protocol_number,
        study_title: study.study_title,
        total_visits: study.total_visits,
        completed_visits: study.completed_visits,
        scheduled_visits: study.scheduled_visits,
        missed_visits: study.missed_visits,
        completion_rate,
        avg_days_to_completion,
        overdue_visits: study.overdue_visits
      }
    })

    // Calculate visit type breakdown
    const visitTypeMap: { [key: string]: { total: number, completed: number, durations: number[] } } = {}

    visits?.forEach(visit => {
      const visitData = visit as any
      const visitName = visitData.visit_name || 'Unspecified'
      
      if (!visitTypeMap[visitName]) {
        visitTypeMap[visitName] = { total: 0, completed: 0, durations: [] }
      }
      
      visitTypeMap[visitName].total += 1
      if (visitData.status === 'completed') {
        visitTypeMap[visitName].completed += 1
        
        // Calculate visit duration (mock data for now - would need actual duration tracking)
        // For now, assume random duration between 30-90 minutes based on visit type
        const mockDuration = visitName.toLowerCase().includes('screening') ? 90 : 
                            visitName.toLowerCase().includes('follow') ? 45 : 60
        visitTypeMap[visitName].durations.push(mockDuration)
      }
    })

    const visitTypeBreakdown: VisitTypeBreakdown[] = Object.entries(visitTypeMap).map(([visitName, data]) => ({
      visit_name: visitName,
      total: data.total,
      completed: data.completed,
      completion_rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      avg_duration: data.durations.length > 0 
        ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
        : 0
    }))

    // Calculate summary metrics
    const totalVisits = visits?.length || 0
    const completedVisits = visits?.filter(v => (v as any).status === 'completed').length || 0
    const scheduledVisits = visits?.filter(v => (v as any).status === 'scheduled').length || 0
    const missedVisits = visits?.filter(v => (v as any).status === 'missed').length || 0
    const overallCompletionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0

    // Count overdue visits
    const today = new Date()
    const overdueVisits = visits?.filter(v => {
      const visitData = v as any
      return visitData.status === 'scheduled' && 
             visitData.visit_date && 
             new Date(visitData.visit_date) < today
    }).length || 0

    return NextResponse.json({
      performance: visitPerformance,
      studyStats: studyVisitStats,
      visitTypes: visitTypeBreakdown.sort((a, b) => b.total - a.total),
      summary: {
        totalVisits,
        completedVisits,
        scheduledVisits,
        missedVisits,
        overdueVisits,
        overallCompletionRate
      }
    })

  } catch (error) {
    console.error('Error in visit analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}