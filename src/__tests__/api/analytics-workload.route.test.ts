jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body
    })
  }
}))

jest.mock('@/lib/api/auth', () => ({ createSupabaseAdmin: jest.fn() }))
jest.mock('@/lib/workload/snapshots', () => ({
  loadWorkloadSnapshots: jest.fn(),
  computeAndStoreWorkloadSnapshots: jest.fn()
}))
jest.mock('@/lib/workload/computeWorkloads', () => ({
  computeWorkloads: jest.fn()
}))
jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }))

function makeQuery(data: any[], error: any = null) {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    single: async () => ({ data: data[0] ?? null, error }),
    maybeSingle: async () => ({ data: data[0] ?? null, error }),
    then: (resolve: (value: { data: any[]; error: any }) => void) => resolve({ data, error })
  }
  return builder
}

function createSupabaseStub(options: {
  userId: string
  siteIds: string[]
  studies: any[]
  breakdownRows: any[]
}) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: options.userId } }, error: null }
      }
    },
    from(table: string) {
      switch (table) {
        case 'site_members':
          return makeQuery(options.siteIds.map(site_id => ({ site_id })))
        case 'studies':
          return makeQuery(options.studies)
        case 'v_coordinator_metrics_breakdown_weekly':
          return makeQuery(options.breakdownRows)
        default:
          return makeQuery([])
      }
    }
  } as any
}

describe('/api/analytics/workload (breakdown)', () => {
  const { loadWorkloadSnapshots, computeAndStoreWorkloadSnapshots } = jest.requireMock('@/lib/workload/snapshots')
  const { computeWorkloads } = jest.requireMock('@/lib/workload/computeWorkloads')
  const { createSupabaseAdmin } = jest.requireMock('@/lib/api/auth')
  const logger = jest.requireMock('@/lib/logger').default

  beforeEach(() => {
    jest.clearAllMocks()
    loadWorkloadSnapshots.mockResolvedValue({ snapshots: new Map(), staleStudies: [] })
    computeAndStoreWorkloadSnapshots.mockResolvedValue([])
  })

  it('returns structured breakdown data when includeBreakdown=true', async () => {
    const studyId = 'study-1'
    createSupabaseAdmin.mockReturnValue(
      createSupabaseStub({
        userId: 'user-1',
        siteIds: ['site-1'],
        studies: [{
          id: studyId,
          protocol_number: 'ABC-123',
          study_title: 'Protocol ABC',
          lifecycle: 'active',
          recruitment: 'enrolling',
          status: 'active',
          site_id: 'site-1',
          user_id: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
          meeting_admin_points: 4
        }],
        breakdownRows: [
          {
            coordinator_id: 'coord-1',
            study_id: studyId,
            week_start: '2026-01-05',
            meeting_hours: 1.5,
            screening_hours: 2,
            query_hours: 0.5,
            total_hours: 4,
            note_entries: 1,
            last_updated_at: '2026-01-07T10:00:00Z'
          },
          {
            coordinator_id: 'coord-2',
            study_id: studyId,
            week_start: '2026-01-05',
            meeting_hours: 0.5,
            screening_hours: 1,
            query_hours: 0.25,
            total_hours: 1.75,
            note_entries: 0,
            last_updated_at: '2026-01-07T11:00:00Z'
          }
        ]
      })
    )

    computeWorkloads.mockResolvedValue([{
      studyId,
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
      }
    }])

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/analytics/workload/route')
    const req = {
      method: 'GET',
      url: 'http://localhost/api/analytics/workload?includeBreakdown=true',
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer token' : null)
      }
    }

    const res = await GET(req as any)
    const body = await res.json()
    if (res.status !== 200) {
      const errorCalls = logger.error.mock.calls
      throw new Error(`Request failed with status ${res.status}. body=${JSON.stringify(body)} logger.error calls=${JSON.stringify(errorCalls)}`)
    }

    expect(body.workloads).toHaveLength(1)
    const breakdown = body.workloads[0].breakdown
    expect(breakdown).toBeDefined()
    expect(breakdown.weeks).toHaveLength(1)
    expect(breakdown.weeks[0]).toEqual({
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
    })
  })
})
