import type {
  WorkloadBreakdown,
  WorkloadBreakdownCoordinator,
  WorkloadBreakdownWeek
} from './computeWorkloads'

export interface CoordinatorMetricsBreakdownRow {
  study_id: string | null
  coordinator_id: string | null
  week_start: string | null
  meeting_hours: number | null
  screening_hours: number | null
  query_hours: number | null
  total_hours: number | null
  note_entries: number | null
  last_updated_at: string | null
}

const roundTwo = (value: number) => Math.round(value * 100) / 100

export function groupBreakdownRows(
  rows: CoordinatorMetricsBreakdownRow[]
): Map<string, WorkloadBreakdown> {
  const byStudy = new Map<string, Map<string, WorkloadBreakdownWeek>>()

  for (const row of rows) {
    const studyId = row.study_id ?? undefined
    const coordinatorId = row.coordinator_id ?? undefined
    const weekStart = row.week_start ?? undefined
    if (!studyId || !coordinatorId || !weekStart) continue

    const meeting = roundTwo(Number(row.meeting_hours ?? 0))
    const screening = roundTwo(Number(row.screening_hours ?? 0))
    const query = roundTwo(Number(row.query_hours ?? 0))
    const total = roundTwo(Number(row.total_hours ?? meeting + screening + query))
    const notesCount = Number(row.note_entries ?? 0)
    const lastUpdatedAt = row.last_updated_at ?? null

    if (!byStudy.has(studyId)) {
      byStudy.set(studyId, new Map())
    }
    const weeks = byStudy.get(studyId)!

    if (!weeks.has(weekStart)) {
      weeks.set(weekStart, {
        weekStart,
        coordinators: [],
        totals: {
          meetingHours: 0,
          screeningHours: 0,
          queryHours: 0,
          totalHours: 0,
          notesCount: 0
        }
      })
    }

    const weekGroup = weeks.get(weekStart)!
    const coordinatorEntry: WorkloadBreakdownCoordinator = {
      coordinatorId,
      meetingHours: meeting,
      screeningHours: screening,
      queryHours: query,
      totalHours: total,
      notesCount,
      lastUpdatedAt
    }

    weekGroup.coordinators.push(coordinatorEntry)
    weekGroup.totals.meetingHours = roundTwo(weekGroup.totals.meetingHours + meeting)
    weekGroup.totals.screeningHours = roundTwo(weekGroup.totals.screeningHours + screening)
    weekGroup.totals.queryHours = roundTwo(weekGroup.totals.queryHours + query)
    weekGroup.totals.totalHours = roundTwo(weekGroup.totals.totalHours + total)
    weekGroup.totals.notesCount += notesCount
  }

  const result = new Map<string, WorkloadBreakdown>()

  for (const [studyId, weeks] of byStudy.entries()) {
    const sortedWeeks = Array.from(weeks.values()).sort((a, b) => {
      if (a.weekStart === b.weekStart) return 0
      return a.weekStart < b.weekStart ? -1 : 1
    })

    for (const week of sortedWeeks) {
      week.coordinators.sort((a, b) => {
        if (a.coordinatorId === b.coordinatorId) return 0
        return a.coordinatorId < b.coordinatorId ? -1 : 1
      })
    }

    result.set(studyId, { weeks: sortedWeeks })
  }

  return result
}
