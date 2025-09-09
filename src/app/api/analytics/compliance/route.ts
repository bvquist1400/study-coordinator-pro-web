import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

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

    // Bearer token auth
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

    // Resolve allowed studies
    const { data: memberships } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)
    const siteIds = ((memberships || []) as Array<{ site_id: string | null }>).map(m => m.site_id)

    let studiesQuery = supabase
      .from('studies')
      .select('id, site_id, user_id')
    if (studyId) {
      studiesQuery = studiesQuery.eq('id', studyId)
    } else if (siteIds.length > 0) {
      studiesQuery = studiesQuery.in('site_id', siteIds)
    } else {
      studiesQuery = studiesQuery.eq('user_id', user.id)
    }

    const { data: allowedStudies, error: studiesErr } = await studiesQuery
    if (studiesErr) {
      logger.error('Error fetching studies for compliance analytics', studiesErr)
      return NextResponse.json({ error: 'Failed to resolve studies' }, { status: 500 })
    }
    const allowedStudyIds = ((allowedStudies || []) as Array<{ id: string }>).map(s => s.id)
    if (allowedStudyIds.length === 0) {
      return NextResponse.json({ trends: [], studyBreakdown: [], alerts: [], summary: { overallTimingRate: 0, overallDrugRate: 0, totalVisits: 0, totalDrugRecords: 0, activeAlerts: 0 } })
    }

    // Get visit compliance data
    const { data: visits, error: visitsError } = await supabase
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
      .in('study_id', allowedStudyIds)
      .eq('status', 'completed')
      .gte('updated_at', startDate.toISOString())
      .lte('updated_at', endDate.toISOString())
    if (visitsError) {
      logger.error('Error fetching visits for compliance analytics', visitsError)
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
    }

    // Get drug compliance data (legacy table)
    const { data: drugCompliance, error: drugError } = await supabase
      .from('drug_compliance')
      .select(`
        id,
        visit_id,
        ip_id,
        dispensed_count,
        returned_count,
        expected_taken,
        compliance_percentage,
        assessment_date,
        updated_at,
        subjects!inner (
          id,
          subject_number,
          study_id,
          studies!inner (
            id,
            protocol_number,
            study_title
          )
        )
      `)
      .gte('assessment_date', startDate.toISOString().split('T')[0])
      .lte('assessment_date', endDate.toISOString().split('T')[0])
      .in('subjects.study_id', allowedStudyIds)
    if (drugError) {
      logger.error('Error fetching drug compliance for analytics', drugError)
      return NextResponse.json({ error: 'Failed to fetch drug compliance' }, { status: 500 })
    }

    // Get new aggregated compliance data from cycles view
    const { data: cycleCompliance, error: cycleError } = await supabase
      .from('v_subject_drug_compliance')
      .select(`
        id,
        visit_id,
        dispensed_count,
        returned_count,
        expected_taken,
        compliance_percentage,
        ip_last_dose_date,
        updated_at,
        subjects:subject_id!inner (
          id,
          subject_number,
          study_id,
          studies!inner (
            id,
            protocol_number,
            study_title
          )
        )
      `)
      .in('subjects.study_id', allowedStudyIds)
    if (cycleError) {
      logger.error('Error fetching cycle compliance view', cycleError)
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
    const visitsRows = (visits || []) as any[]
    visitsRows.forEach(visit => {
      const month = visit.updated_at.substring(0, 7)
      if (monthlyData[month]) {
        const visitData = visit as any
        // Only include visits with a computed window result; skip nulls
        if (visitData.is_within_window === true) {
          monthlyData[month].visitTiming.push(100)
        } else if (visitData.is_within_window === false) {
          monthlyData[month].visitTiming.push(0)
        }
      }
    })

    // Process drug compliance
    const drugRows = [
      ...(((drugCompliance || []) as any[]) || []),
      ...(((cycleCompliance || []) as any[]) || [])
    ]
    drugRows.forEach(record => {
      const assess = (record as any).assessment_date || (record as any).ip_last_dose_date || ((record as any).updated_at || '').substring(0,10)
      const month = (assess || '').substring(0, 7)
      if (monthlyData[month]) {
        const drugRecord = record as any
        const compliance = drugRecord.compliance_percentage
        
        // Only include records with valid compliance_percentage
        // Skip NULL values (unreturned bottles)
        if (compliance !== null && compliance !== undefined) {
          monthlyData[month].drugCompliance.push(Number(compliance))
        }
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

    visitsRows.forEach(visit => {
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
      
      // Only factor visits with a computed window; exclude nulls from denominator
      if (visitData.is_within_window !== null) {
        studyComplianceMap[study.id].total_visits += 1
      }
      if (visitData.is_within_window === true) {
        studyComplianceMap[study.id].within_window_visits += 1
      }
    })

    drugRows.forEach(record => {
      const drugRecord = record as any
      const study = drugRecord.subjects.studies
      
      if (studyComplianceMap[study.id]) {
        const compliance = drugRecord.compliance_percentage
        
        // Only include records with valid compliance_percentage
        // Skip NULL values (unreturned bottles)
        if (compliance !== null && compliance !== undefined) {
          studyComplianceMap[study.id].drug_records.push(Number(compliance))
        }
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
      return visitData.is_within_window === false
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

    // Drug compliance alerts (low compliance or overuse > 100%)
    const lowDrugCompliance = drugRows.filter(record => {
      const drugRecord = record as any
      const compliance = drugRecord.compliance_percentage
      
      // Only include records with valid compliance_percentage
      // Skip NULL values (unreturned bottles)
      if (compliance === null || compliance === undefined) return false
      const value = Number(compliance)
      return value < 80 || value > 100
    }).slice(0, 5) || []

    lowDrugCompliance.forEach(record => {
      const drugRecord = record as any
      alerts.push({
        id: drugRecord.id,
        type: 'drug',
        subject_number: drugRecord.subjects.subject_number,
        visit_name: 'IP Compliance',
        protocol_number: drugRecord.subjects.studies.protocol_number,
        severity: 'high',
        description: 'Low investigational product compliance',
        created_at: drugRecord.updated_at
      })
    })

    // Calculate summary metrics
    const timingEligibleVisits = visits?.filter(v => (v as any).is_within_window !== null) || []
    const totalVisits = timingEligibleVisits.length
    const withinWindowVisits = timingEligibleVisits.filter(v => (v as any).is_within_window === true).length
    const overallTimingRate = totalVisits > 0 ? Math.round((withinWindowVisits / totalVisits) * 100) : 0

    const allDrugCompliance = drugRows.filter(record => {
      const drugRecord = record as any
      return drugRecord.compliance_percentage !== null && drugRecord.compliance_percentage !== undefined
    }).map(record => {
      const drugRecord = record as any
      // Cap at 100 for averaging so overuse doesn't inflate averages
      const value = Number(drugRecord.compliance_percentage)
      return Math.min(value, 100)
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
        totalDrugRecords: drugRows.length || 0,
        activeAlerts: alerts.length
      }
    })

  } catch (error) {
    logger.error('Error in compliance analytics', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
import logger from '@/lib/logger'
