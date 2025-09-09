/**
 * Visit Date Calculator Module
 * 
 * Handles visit date calculations from baseline date considering study-specific
 * anchor day configuration (Day 0 vs Day 1 protocols).
 * 
 * Examples:
 * - Day 0 Study: Baseline = Day 0, Week 4 visit = Day 28 from baseline
 * - Day 1 Study: Baseline = Day 1, Week 4 visit = Day 29 from baseline  
 * 
 * This ensures accurate visit window calculations regardless of study protocol design.
 */

export interface VisitScheduleInfo {
  visitNumber: string
  visitName: string
  timingValue: number
  timingUnit: 'days' | 'weeks' | 'months'
  windowBefore: number
  windowAfter: number
}

export interface CalculatedVisitDate {
  scheduledDate: Date
  windowStart: Date
  windowEnd: Date
  daysFromBaseline: number
}

/**
 * Calculate visit date from baseline considering study anchor day
 * 
 * @param baselineDate - The subject's baseline/randomization date
 * @param timingValue - The numeric value (e.g., 4, -14, 2)
 * @param timingUnit - The unit ('days', 'weeks', 'months')
 * @param anchorDay - Study anchor day (0 or 1)
 * @param windowBefore - Days before scheduled date (visit window)
 * @param windowAfter - Days after scheduled date (visit window)
 */
export function calculateVisitDate(
  baselineDate: Date,
  timingValue: number,
  timingUnit: 'days' | 'weeks' | 'months',
  anchorDay: number = 0,
  windowBefore: number = 7,
  windowAfter: number = 7
): CalculatedVisitDate {
  let daysFromBaseline: number

  // Convert timing to days based on unit
  switch (timingUnit) {
    case 'days':
      daysFromBaseline = timingValue
      break
    case 'weeks':
      daysFromBaseline = timingValue * 7
      break
    case 'months':
      daysFromBaseline = timingValue * 30 // Using 30-day months for simplicity
      break
    default:
      daysFromBaseline = timingValue
  }

  // Apply anchor day offset consistently
  // Day 0 studies: baseline = Day 0 → offset 0
  // Day 1 studies: baseline = Day 1 → Day 1 maps to anchor date, so offset -1
  const anchorOffset = anchorDay === 1 ? -1 : 0
  const totalDaysFromBaseline = daysFromBaseline + anchorOffset

  // Calculate scheduled date
  const scheduledDate = new Date(baselineDate)
  scheduledDate.setDate(scheduledDate.getDate() + totalDaysFromBaseline)

  // Calculate visit window
  const windowStart = new Date(scheduledDate)
  windowStart.setDate(windowStart.getDate() - windowBefore)

  const windowEnd = new Date(scheduledDate)
  windowEnd.setDate(windowEnd.getDate() + windowAfter)

  return {
    scheduledDate,
    windowStart,
    windowEnd,
    daysFromBaseline: totalDaysFromBaseline
  }
}

/**
 * Calculate all visit dates for a study schedule
 */
export function calculateStudyVisitSchedule(
  baselineDate: Date,
  visitSchedules: VisitScheduleInfo[],
  anchorDay: number = 0
): Array<VisitScheduleInfo & CalculatedVisitDate> {
  return visitSchedules.map(visit => ({
    ...visit,
    ...calculateVisitDate(
      baselineDate,
      visit.timingValue,
      visit.timingUnit,
      anchorDay,
      visit.windowBefore,
      visit.windowAfter
    )
  }))
}

/**
 * Check if a visit date falls within the protocol window
 */
export function isWithinVisitWindow(
  actualDate: Date,
  scheduledDate: Date,
  windowBefore: number,
  windowAfter: number
): boolean {
  const windowStart = new Date(scheduledDate)
  windowStart.setDate(windowStart.getDate() - windowBefore)

  const windowEnd = new Date(scheduledDate)
  windowEnd.setDate(windowEnd.getDate() + windowAfter)

  return actualDate >= windowStart && actualDate <= windowEnd
}

/**
 * Get days difference from scheduled date (negative = early, positive = late)
 */
export function getDaysFromScheduled(actualDate: Date, scheduledDate: Date): number {
  const diffTime = actualDate.getTime() - scheduledDate.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Format visit window for display
 */
export function formatVisitWindow(windowBefore: number, windowAfter: number): string {
  if (windowBefore === 0 && windowAfter === 0) {
    return 'N/A'
  }
  return `-${windowBefore}/+${windowAfter} days`
}

/**
 * Get visit status based on current date and visit timing
 */
export function getVisitStatus(
  scheduledDate: Date,
  actualDate?: Date,
  windowBefore: number = 7,
  windowAfter: number = 7
): 'scheduled' | 'due' | 'overdue' | 'completed' | 'early' | 'late' {
  const today = new Date()
  const windowStart = new Date(scheduledDate)
  windowStart.setDate(windowStart.getDate() - windowBefore)

  const windowEnd = new Date(scheduledDate)
  windowEnd.setDate(windowEnd.getDate() + windowAfter)

  if (actualDate) {
    // Visit completed
    if (isWithinVisitWindow(actualDate, scheduledDate, windowBefore, windowAfter)) {
      return 'completed'
    } else if (actualDate < windowStart) {
      return 'early'
    } else {
      return 'late'
    }
  }

  // Visit not completed yet
  if (today < windowStart) {
    return 'scheduled'
  } else if (today <= windowEnd) {
    return 'due'
  } else {
    return 'overdue'
  }
}
