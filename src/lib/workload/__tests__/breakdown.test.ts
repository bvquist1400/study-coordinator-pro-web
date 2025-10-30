import { groupBreakdownRows } from '../breakdown'

describe('groupBreakdownRows', () => {
  it('groups rows by study and week with coordinator totals', () => {
    const map = groupBreakdownRows([
      {
        study_id: 'study-1',
        coordinator_id: 'coord-1',
        week_start: '2026-01-05',
        meeting_hours: 2.25,
        screening_hours: 3.5,
        query_hours: 1,
        total_hours: 6.75,
        note_entries: 1,
        last_updated_at: '2026-01-09T12:00:00Z'
      },
      {
        study_id: 'study-1',
        coordinator_id: 'coord-2',
        week_start: '2026-01-05',
        meeting_hours: 1,
        screening_hours: 0.5,
        query_hours: 0.25,
        total_hours: 1.75,
        note_entries: 0,
        last_updated_at: '2026-01-08T12:00:00Z'
      },
      {
        study_id: 'study-1',
        coordinator_id: 'coord-1',
        week_start: '2026-01-12',
        meeting_hours: 3,
        screening_hours: 2,
        query_hours: 1,
        total_hours: 6,
        note_entries: 2,
        last_updated_at: '2026-01-16T12:00:00Z'
      }
    ])

    const breakdown = map.get('study-1')
    expect(breakdown).toBeDefined()
    expect(breakdown?.weeks).toHaveLength(2)

    const [firstWeek, secondWeek] = breakdown!.weeks
    expect(firstWeek.weekStart).toBe('2026-01-05')
    expect(firstWeek.coordinators).toHaveLength(2)
    expect(firstWeek.totals).toEqual({
      meetingHours: 3.25,
      screeningHours: 4,
      queryHours: 1.25,
      totalHours: 8.5,
      notesCount: 1
    })

    expect(secondWeek.weekStart).toBe('2026-01-12')
    expect(secondWeek.coordinators).toHaveLength(1)
    expect(secondWeek.coordinators[0]).toMatchObject({
      coordinatorId: 'coord-1',
      meetingHours: 3,
      screeningHours: 2,
      queryHours: 1,
      totalHours: 6,
      notesCount: 2,
      lastUpdatedAt: '2026-01-16T12:00:00Z'
    })
  })

  it('ignores rows missing identifiers', () => {
    const map = groupBreakdownRows([
      {
        study_id: null,
        coordinator_id: 'coord-1',
        week_start: '2026-01-05',
        meeting_hours: 1,
        screening_hours: 1,
        query_hours: 1,
        total_hours: 3,
        note_entries: 0,
        last_updated_at: null
      },
      {
        study_id: 'study-1',
        coordinator_id: null,
        week_start: '2026-01-05',
        meeting_hours: 1,
        screening_hours: 1,
        query_hours: 1,
        total_hours: 3,
        note_entries: 0,
        last_updated_at: null
      },
      {
        study_id: 'study-1',
        coordinator_id: 'coord-1',
        week_start: null,
        meeting_hours: 1,
        screening_hours: 1,
        query_hours: 1,
        total_hours: 3,
        note_entries: 0,
        last_updated_at: null
      }
    ])

    expect(map.size).toBe(0)
  })

  it('handles empty input', () => {
    const map = groupBreakdownRows([])
    expect(map.size).toBe(0)
  })
})
