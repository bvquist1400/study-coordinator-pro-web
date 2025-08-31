/**
 * Compliance Calculator Module
 * 
 * Provides comprehensive compliance calculation functionality for clinical studies,
 * including drug compliance, visit compliance, and protocol deviation detection.
 */

export interface DrugComplianceData {
  tabletsDispensed: number
  tabletsReturned: number
  dispensingDate: Date
  expectedReturnDate: Date
  actualReturnDate?: Date
  dosingFrequency: number // IP doses per day
  studyDrug: string
}

export interface VisitComplianceData {
  scheduledDate: Date
  actualDate?: Date
  visitWindow: number // days before/after scheduled date
  visitName: string
  status: 'scheduled' | 'completed' | 'missed' | 'delayed'
}

export interface ComplianceResult {
  percentage: number
  status: 'excellent' | 'good' | 'acceptable' | 'poor'
  deviations: string[]
  recommendations: string[]
}

export interface StudyComplianceThresholds {
  excellent: number // >= this percentage
  good: number
  acceptable: number
  // poor is < acceptable
}

// Default compliance thresholds (can be overridden per study)
export const DEFAULT_THRESHOLDS: StudyComplianceThresholds = {
  excellent: 95,
  good: 85,
  acceptable: 75
}

/**
 * Calculate drug compliance based on IP accountability
 */
export function calculateDrugCompliance(
  data: DrugComplianceData,
  thresholds: StudyComplianceThresholds = DEFAULT_THRESHOLDS
): ComplianceResult {
  const deviations: string[] = []
  const recommendations: string[] = []

  // Calculate expected IP doses to be taken
  const daysBetween = Math.ceil(
    (data.expectedReturnDate.getTime() - data.dispensingDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  
  const tabletsExpected = Math.max(0, daysBetween * data.dosingFrequency)
  const tabletsActuallyTaken = Math.max(0, data.tabletsDispensed - data.tabletsReturned)
  
  // Calculate compliance percentage
  const rawPercentage = tabletsExpected > 0 ? (tabletsActuallyTaken / tabletsExpected) * 100 : 0
  const percentage = Math.min(100, Math.max(0, rawPercentage))

  // Determine compliance status
  let status: ComplianceResult['status']
  if (percentage >= thresholds.excellent) {
    status = 'excellent'
  } else if (percentage >= thresholds.good) {
    status = 'good'
  } else if (percentage >= thresholds.acceptable) {
    status = 'acceptable'
  } else {
    status = 'poor'
  }

  // Detect deviations
  if (tabletsActuallyTaken > tabletsExpected) {
    deviations.push(`Over-compliance: ${tabletsActuallyTaken} IP doses taken vs ${tabletsExpected} expected`)
    recommendations.push('Reinforce proper dosing instructions with subject')
  }

  if (percentage < thresholds.acceptable) {
    deviations.push(`Poor compliance: ${percentage.toFixed(1)}% (below ${thresholds.acceptable}% threshold)`)
    recommendations.push('Schedule additional subject counseling session')
    recommendations.push('Consider IP counting and compliance aids')
  }

  if (data.tabletsReturned < 0) {
    deviations.push('Negative IP return count - data entry error')
    recommendations.push('Verify IP accountability data with site staff')
  }

  if (data.tabletsDispensed <= 0) {
    deviations.push('No IP dispensed recorded')
    recommendations.push('Verify dispensing records')
  }

  return {
    percentage: Math.round(percentage * 100) / 100,
    status,
    deviations,
    recommendations
  }
}

/**
 * Calculate visit compliance based on timing
 */
export function calculateVisitCompliance(
  data: VisitComplianceData,
  thresholds: StudyComplianceThresholds = DEFAULT_THRESHOLDS
): ComplianceResult {
  const deviations: string[] = []
  const recommendations: string[] = []
  let percentage = 0
  let status: ComplianceResult['status'] = 'poor'

  if (!data.actualDate) {
    // Visit not completed
    const today = new Date()
    const daysPastDue = Math.ceil(
      (today.getTime() - data.scheduledDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysPastDue > data.visitWindow) {
      deviations.push(`Visit overdue by ${daysPastDue - data.visitWindow} days`)
      recommendations.push('Contact subject immediately to reschedule')
      recommendations.push('Document reason for visit delay')
    }

    return { percentage: 0, status: 'poor', deviations, recommendations }
  }

  // Calculate visit timing compliance
  const daysDifference = Math.abs(
    Math.ceil((data.actualDate.getTime() - data.scheduledDate.getTime()) / (1000 * 60 * 60 * 24))
  )

  // Perfect timing = 100%, linear decrease outside window
  if (daysDifference <= data.visitWindow) {
    // Within window - excellent compliance
    percentage = 100 - (daysDifference / data.visitWindow) * 5 // Small penalty for not being exact
    status = percentage >= thresholds.excellent ? 'excellent' : 'good'
  } else {
    // Outside window - reduced compliance
    const excessDays = daysDifference - data.visitWindow
    percentage = Math.max(0, 75 - (excessDays * 10)) // Steep penalty outside window
    
    if (percentage >= thresholds.acceptable) {
      status = 'acceptable'
    } else {
      status = 'poor'
    }

    deviations.push(`Visit completed ${excessDays} days outside protocol window`)
    recommendations.push('Document protocol deviation')
    
    if (excessDays > 7) {
      recommendations.push('Report significant protocol deviation to sponsor')
    }
  }

  // Additional checks
  if (data.actualDate < data.scheduledDate) {
    const daysEarly = Math.ceil(
      (data.scheduledDate.getTime() - data.actualDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysEarly > data.visitWindow) {
      deviations.push(`Visit completed ${daysEarly} days early`)
    }
  }

  return {
    percentage: Math.round(percentage * 100) / 100,
    status,
    deviations,
    recommendations
  }
}

/**
 * Calculate overall subject compliance across multiple visits and drug periods
 */
export function calculateOverallCompliance(
  drugCompliances: ComplianceResult[],
  visitCompliances: ComplianceResult[],
  weights: { drug: number; visit: number } = { drug: 0.7, visit: 0.3 }
): ComplianceResult {
  const allDeviations: string[] = []
  const allRecommendations: string[] = []

  // Calculate weighted average
  const avgDrugCompliance = drugCompliances.length > 0
    ? drugCompliances.reduce((sum, c) => sum + c.percentage, 0) / drugCompliances.length
    : 0

  const avgVisitCompliance = visitCompliances.length > 0
    ? visitCompliances.reduce((sum, c) => sum + c.percentage, 0) / visitCompliances.length
    : 0

  const overallPercentage = (avgDrugCompliance * weights.drug) + (avgVisitCompliance * weights.visit)

  // Determine overall status
  let status: ComplianceResult['status']
  if (overallPercentage >= DEFAULT_THRESHOLDS.excellent) {
    status = 'excellent'
  } else if (overallPercentage >= DEFAULT_THRESHOLDS.good) {
    status = 'good'
  } else if (overallPercentage >= DEFAULT_THRESHOLDS.acceptable) {
    status = 'acceptable'
  } else {
    status = 'poor'
  }

  // Collect all deviations and recommendations
  [...drugCompliances, ...visitCompliances].forEach(compliance => {
    allDeviations.push(...compliance.deviations)
    allRecommendations.push(...compliance.recommendations)
  })

  // Remove duplicates
  const uniqueDeviations = [...new Set(allDeviations)]
  const uniqueRecommendations = [...new Set(allRecommendations)]

  // Add overall recommendations
  if (status === 'poor') {
    uniqueRecommendations.push('Consider subject for enhanced monitoring')
    uniqueRecommendations.push('Review study protocol adherence with subject')
  }

  return {
    percentage: Math.round(overallPercentage * 100) / 100,
    status,
    deviations: uniqueDeviations,
    recommendations: uniqueRecommendations
  }
}

/**
 * Get compliance color coding for UI display
 */
export function getComplianceColor(status: ComplianceResult['status']): string {
  switch (status) {
    case 'excellent':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'good':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'acceptable':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'poor':
      return 'text-red-600 bg-red-50 border-red-200'
  }
}

/**
 * Get compliance status label for display
 */
export function getComplianceLabel(status: ComplianceResult['status']): string {
  switch (status) {
    case 'excellent':
      return 'Excellent'
    case 'good':
      return 'Good'
    case 'acceptable':
      return 'Acceptable'
    case 'poor':
      return 'Poor'
  }
}
