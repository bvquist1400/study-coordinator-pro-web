import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import WorkloadEngineView from '@/components/workload/WorkloadEngineView'

describe('WorkloadEngineView', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock fetch responses for the chained requests the component performs
    global.fetch = jest.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('/api/analytics/workload') && !url.includes('/trend')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            workloads: [
              {
                studyId: 'study-1',
                protocolNumber: 'ABC-123',
                studyTitle: 'Protocol ABC',
                lifecycle: 'active',
                recruitment: 'enrolling',
                status: 'active',
                lifecycleWeight: 1,
                recruitmentWeight: 1,
                screeningMultiplier: 1,
                screeningMultiplierEffective: 1,
                queryMultiplier: 1,
                queryMultiplierEffective: 1,
                meetingAdminPoints: 4,
                meetingAdminPointsAdjusted: 4,
                protocolScore: 3,
                now: { raw: 5, weighted: 5 },
                actuals: { raw: 4, weighted: 4 },
                forecast: { raw: 6, weighted: 6 },
                metrics: {
                  contributors: 2,
                  avgMeetingHours: 1,
                  avgScreeningHours: 1.5,
                  avgScreeningStudyCount: 1,
                  avgQueryHours: 0.5,
                  avgQueryStudyCount: 1,
                  screeningScale: 1,
                  queryScale: 1,
                  meetingPointsAdjustment: 0,
                  entries: 2,
                  lastWeekStart: '2026-01-05'
                },
                breakdown: {
                  weeks: [
                    {
                      weekStart: '2026-01-05',
                      coordinators: [
                        {
                          coordinatorId: 'coord-1',
                          meetingHours: 1.5,
                          screeningHours: 2,
                          queryHours: 0.5,
                          totalHours: 4,
                          notesCount: 1,
                          lastUpdatedAt: '2026-01-07T10:00:00Z'
                        },
                        {
                          coordinatorId: 'coord-2',
                          meetingHours: 0.5,
                          screeningHours: 1,
                          queryHours: 0.25,
                          totalHours: 1.75,
                          notesCount: 0,
                          lastUpdatedAt: '2026-01-07T11:00:00Z'
                        }
                      ],
                      totals: {
                        meetingHours: 2,
                        screeningHours: 3,
                        queryHours: 0.75,
                        totalHours: 5.75,
                        notesCount: 1
                      }
                    }
                  ]
                }
              }
            ],
            meta: { studies: 1, cacheHits: 0, recomputed: 1, skippedCache: false }
          })
        } as Response
      }

      if (url.includes('/api/coordinators')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            coordinators: [
              {
                id: 'coord-1',
                name: 'Alex Morgan',
                email: 'alex@example.com',
                organization: 'Main Site',
                assignments: [
                  {
                    id: 'study-1',
                    studyTitle: 'Protocol ABC',
                    protocolNumber: 'ABC-123',
                    role: 'Lead Coordinator',
                    joinedAt: '2025-12-01'
                  }
                ]
              }
            ]
          })
        } as Response
      }

      if (url.includes('/api/analytics/workload/trend')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            points: [
              { weekStart: '2025-12-15', actual: 4, forecast: 5 },
              { weekStart: '2025-12-22', actual: 4.5, forecast: 5.2 }
            ]
          })
        } as Response
      }

      if (url.includes('/api/cwe/metrics?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            metrics: [
              {
                id: 'metric-1',
                weekStart: '2026-01-05',
                meetingHours: 1.5,
                screeningHours: 2,
                screeningStudyCount: 1,
                queryHours: 0.5,
                queryStudyCount: 1,
                notes: 'Busy week',
                updatedAt: '2026-01-07T10:00:00Z'
              }
            ],
            breakdowns: [
              {
                studyId: 'study-1',
                weekStart: '2026-01-05',
                meetingHours: 1.5,
                screeningHours: 2,
                queryHours: 0.5,
                notes: 'Busy week'
              }
            ]
          })
        } as Response
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not mocked' })
      } as Response
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders per-study breakdown card with summary metrics', async () => {
    render(<WorkloadEngineView />)

    await waitFor(() => {
      expect(screen.getByText('Per-study breakdown')).toBeInTheDocument()
    })

    expect(screen.getByText('Avg weekly hours')).toBeInTheDocument()
    expect(screen.getAllByText(/5\.8\s*hrs/i).length).toBeGreaterThan(0)

    expect(screen.getAllByText('2026-01-05').length).toBeGreaterThan(0)

    expect(screen.getByText('Contributing coordinators')).toBeInTheDocument()
    expect(screen.getByText('Unique coordinators in the selected range')).toBeInTheDocument()

    expect(screen.getAllByText('Protocol ABC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Total meetings (hrs)').length).toBeGreaterThan(0)
    expect(screen.getByText('Screening (hrs)')).toBeInTheDocument()
  })

  it('lets coordinators distribute total hours evenly across assigned studies', async () => {
    render(<WorkloadEngineView />)

    await waitFor(() => {
      expect(screen.getByText('Weekly workload log')).toBeInTheDocument()
    })

    const totalMeetings = screen.getByLabelText('Total meetings (hrs)') as HTMLInputElement
    const totalScreening = screen.getByLabelText('Total screening (hrs)') as HTMLInputElement
    const totalQueries = screen.getByLabelText('Total queries (hrs)') as HTMLInputElement

    await waitFor(() => {
      expect(totalMeetings).toBeInTheDocument()
    })

    const tables = await screen.findAllByRole('table')
    const logTable = tables.find((table) => within(table).queryByText('Screening (hrs)'))
    expect(logTable).toBeTruthy()

    const studyCellBefore = within(logTable as HTMLTableElement).getAllByText('Protocol ABC').find((element) =>
      element.closest('tr') !== null
    )
    expect(studyCellBefore).toBeTruthy()

    const clearButton = screen.getByRole('button', { name: 'Clear hours' })
    clearButton.click()

    fireEvent.change(totalMeetings, { target: { value: '4.5' } })
    fireEvent.change(totalScreening, { target: { value: '6' } })
    fireEvent.change(totalQueries, { target: { value: '2.5' } })

    const distributeButton = screen.getByRole('button', { name: 'Spread across studies' })
    distributeButton.click()

    const tablesAfter = screen.getAllByRole('table')
    const logTableAfter = tablesAfter.find((table) => within(table).queryByText('Screening (hrs)'))
    expect(logTableAfter).toBeTruthy()

    const studyCell = within(logTableAfter as HTMLTableElement).getAllByText('Protocol ABC').find((element) =>
      element.closest('tr') !== null
    )
    expect(studyCell).toBeTruthy()

    const row = studyCell?.closest('tr')
    expect(row).not.toBeNull()

    const inputs = within(row as HTMLTableRowElement).getAllByRole('spinbutton')
    expect(inputs).toHaveLength(2)
    const [screeningInput, queryInput] = inputs

    await waitFor(() => {
      expect(totalMeetings).toHaveDisplayValue('4.5')
      expect(screeningInput).toHaveDisplayValue('6')
      expect(queryInput).toHaveDisplayValue('2.5')
    })
  })
})
