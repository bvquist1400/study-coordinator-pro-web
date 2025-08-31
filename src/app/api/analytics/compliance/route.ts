import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface ComplianceTrend {
  month: string
  visitTiming: number
  drugCompliance: number
}

interface StudyCompliance {
  study_id: string
  protocol_number: string
  study_title: string
  total_visits: number
  within_window_visits: number
  timing_compliance_rate: number
  total_drug_records: number
  avg_drug_compliance: number
  overall_score: number
}

interface ComplianceAlert {
  id: string
  type: 'timing' | 'drug' | 'deviation'
  subject_number: string
  visit_name: string
  protocol_number: string
  severity: 'low' | 'medium' | 'high'
  description: string
  created_at: string
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

    // Get visit compliance data
    let visitsQuery = supabase
      .from('subject_visits')
      .select(`
        id,
        visit_name,
        status,
        visit_date,
        is_within_window,
        updated_at,
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
      .eq('status', 'completed')
      .gte('updated_at', startDate.toISOString())
      .lte('updated_at', endDate.toISOString())

    if (studyId) {
      visitsQuery = visitsQuery.eq('study_id', studyId)
    }

    const { data: visits, error: visitsError } = await visitsQuery
    if (visitsError) {
      console.error('Error fetching visits:', visitsError)
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
    }

    // Get drug compliance data
    let drugQuery = supabase
      .from('drug_compliance')
      .select(`
        id,
        visit_id,
        ip_id,
        dispensed_count,
        returned_count,
        expected_taken,
        compliance_percentage,
        updated_at,
        subject_visits!inner (
          id,
          study_id,
          subjects!inner (
            id,
            subject_number,
            studies!inner (
              id,
              protocol_number,
              study_title
            )
          )
        )
      `)
      .gte('updated_at', startDate.toISOString())
      .lte('updated_at', endDate.toISOString())

    if (studyId) {
      drugQuery = drugQuery.eq('subject_visits.study_id', studyId)
    }

    const { data: drugCompliance, error: drugError } = await drugQuery
    if (drugError) {
      console.error('Error fetching drug compliance:', drugError)
      return NextResponse.json({ error: 'Failed to fetch drug compliance' }, { status: 500 })
    }

    // Calculate monthly trends
    const monthlyData: { [key: string]: { visitTiming: number[], drugCompliance: number[] } } = {}
    
    // Initialize months
    for (let i = 0; i < months; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - (months - 1 - i))
      const monthKey = date.toISOString().substring(0, 7)
      monthlyData[monthKey] = { visitTiming: [], drugCompliance: [] }
    }

    // Process visit timing compliance
    visits?.forEach(visit => {
      const month = visit.updated_at.substring(0, 7)
      if (monthlyData[month]) {
        const visitData = visit as any
        monthlyData[month].visitTiming.push(visitData.is_within_window ? 100 : 0)
      }
    })

    // Process drug compliance
    drugCompliance?.forEach(record => {
      const month = record.updated_at.substring(0, 7)
      if (monthlyData[month]) {
        const drugRecord = record as any
        let compliance = drugRecord.compliance_percentage
        
        if (compliance === null || compliance === undefined) {
          const expected = Number(drugRecord.expected_taken) || 0
          const dispensed = Number(drugRecord.dispensed_count) || 0
          const returned = Number(drugRecord.returned_count) || 0
          const actual = Math.max(0, dispensed - returned)
          compliance = expected > 0 ? Math.min(100, Math.max(0, (actual / expected) * 100)) : 0
        }
        
        monthlyData[month].drugCompliance.push(Number(compliance) || 0)
      }
    })

    // Convert to trend data
    const trends: ComplianceTrend[] = Object.keys(monthlyData).sort().map(month => {
      const data = monthlyData[month]
      const date = new Date(month + '-01')
      
      const avgVisitTiming = data.visitTiming.length > 0 
        ? Math.round(data.visitTiming.reduce((a, b) => a + b, 0) / data.visitTiming.length)
        : 0
      
      const avgDrugCompliance = data.drugCompliance.length > 0
        ? Math.round(data.drugCompliance.reduce((a, b) => a + b, 0) / data.drugCompliance.length)
        : 0

      return {
        month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        visitTiming: avgVisitTiming,
        drugCompliance: avgDrugCompliance
      }
    })

    // Calculate per-study compliance
    const studyComplianceMap: { [key: string]: any } = {}

    visits?.forEach(visit => {
      const visitData = visit as any
      const study = visitData.subjects.studies
      
      if (!studyComplianceMap[study.id]) {
        studyComplianceMap[study.id] = {
          study_id: study.id,
          protocol_number: study.protocol_number,
          study_title: study.study_title,
          total_visits: 0,
          within_window_visits: 0,
          drug_records: [],
        }
      }
      
      studyComplianceMap[study.id].total_visits += 1
      if (visitData.is_within_window) {
        studyComplianceMap[study.id].within_window_visits += 1
      }
    })

    drugCompliance?.forEach(record => {
      const drugRecord = record as any
      const study = drugRecord.subject_visits.subjects.studies
      
      if (studyComplianceMap[study.id]) {
        let compliance = drugRecord.compliance_percentage
        if (compliance === null || compliance === undefined) {
          const expected = Number(drugRecord.expected_taken) || 0
          const dispensed = Number(drugRecord.dispensed_count) || 0
          const returned = Number(drugRecord.returned_count) || 0
          const actual = Math.max(0, dispensed - returned)
          compliance = expected > 0 ? Math.min(100, Math.max(0, (actual / expected) * 100)) : 0
        }
        studyComplianceMap[study.id].drug_records.push(Number(compliance) || 0)
      }
    })

    // Convert to study compliance array
    const studyCompliance: StudyCompliance[] = Object.values(studyComplianceMap).map((study: any) => {
      const timing_compliance_rate = study.total_visits > 0 
        ? Math.round((study.within_window_visits / study.total_visits) * 100)
        : 0
      
      const avg_drug_compliance = study.drug_records.length > 0
        ? Math.round(study.drug_records.reduce((a: number, b: number) => a + b, 0) / study.drug_records.length)
        : 0
      
      const overall_score = Math.round((timing_compliance_rate + avg_drug_compliance) / 2)

      return {
        study_id: study.study_id,
        protocol_number: study.protocol_number,
        study_title: study.study_title,
        total_visits: study.total_visits,
        within_window_visits: study.within_window_visits,
        timing_compliance_rate,
        total_drug_records: study.drug_records.length,
        avg_drug_compliance,
        overall_score
      }
    })

    // Generate compliance alerts
    const alerts: ComplianceAlert[] = []

    // Visit timing alerts (recent out-of-window visits)
    const recentBadVisits = visits?.filter(v => {
      const visitData = v as any
      return !visitData.is_within_window
    }).slice(0, 5) || []

    recentBadVisits.forEach(visit => {
      const visitData = visit as any
      alerts.push({
        id: visitData.id,
        type: 'timing',
        subject_number: visitData.subjects.subject_number,
        visit_name: visitData.visit_name,
        protocol_number: visitData.subjects.studies.protocol_number,
        severity: 'medium',
        description: 'Visit completed outside protocol window',
        created_at: visitData.updated_at
      })
    })

    // Drug compliance alerts (low compliance)
    const lowDrugCompliance = drugCompliance?.filter(record => {
      const drugRecord = record as any
      let compliance = drugRecord.compliance_percentage
      if (compliance === null) {
        const expected = Number(drugRecord.expected_taken) || 0
        const dispensed = Number(drugRecord.dispensed_count) || 0
        const returned = Number(drugRecord.returned_count) || 0
        const actual = Math.max(0, dispensed - returned)
        compliance = expected > 0 ? (actual / expected) * 100 : 100
      }
      return Number(compliance) < 80
    }).slice(0, 5) || []

    lowDrugCompliance.forEach(record => {
      const drugRecord = record as any
      alerts.push({
        id: drugRecord.id,
        type: 'drug',
        subject_number: drugRecord.subject_visits.subjects.subject_number,
        visit_name: 'IP Compliance',
        protocol_number: drugRecord.subject_visits.subjects.studies.protocol_number,
        severity: 'high',
        description: 'Low investigational product compliance',
        created_at: drugRecord.updated_at
      })
    })

    // Calculate summary metrics
    const totalVisits = visits?.length || 0
    const withinWindowVisits = visits?.filter(v => (v as any).is_within_window).length || 0
    const overallTimingRate = totalVisits > 0 ? Math.round((withinWindowVisits / totalVisits) * 100) : 0

    const allDrugCompliance = drugCompliance?.map(record => {
      const drugRecord = record as any
      let compliance = drugRecord.compliance_percentage
      if (compliance === null) {
        const expected = Number(drugRecord.expected_taken) || 0
        const dispensed = Number(drugRecord.dispensed_count) || 0
        const returned = Number(drugRecord.returned_count) || 0
        const actual = Math.max(0, dispensed - returned)
        compliance = expected > 0 ? (actual / expected) * 100 : 100
      }
      return Number(compliance) || 0
    }) || []

    const overallDrugRate = allDrugCompliance.length > 0
      ? Math.round(allDrugCompliance.reduce((a, b) => a + b, 0) / allDrugCompliance.length)
      : 0

    return NextResponse.json({
      trends,
      studyBreakdown: studyCompliance,
      alerts: alerts.slice(0, 10), // Limit to top 10 alerts
      summary: {
        overallTimingRate,
        overallDrugRate,
        totalVisits,
        totalDrugRecords: drugCompliance?.length || 0,
        activeAlerts: alerts.length
      }
    })

  } catch (error) {
    console.error('Error in compliance analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
