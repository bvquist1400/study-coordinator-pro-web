jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }),
  },
}))

jest.mock('@/lib/api/auth', () => ({
  authenticateUser: jest.fn(),
  verifyStudyMembership: jest.fn(),
  createSupabaseAdmin: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dismissalsRoute = require('@/app/api/lab-kits/alerts/dismissals/route')
const { GET: getDismissals, POST: postDismissal, DELETE: deleteDismissals } = dismissalsRoute

const { authenticateUser, verifyStudyMembership, createSupabaseAdmin } = jest.requireMock('@/lib/api/auth') as {
  authenticateUser: jest.Mock
  verifyStudyMembership: jest.Mock
  createSupabaseAdmin: jest.Mock
}

const user = { id: 'user-1' }
const studyId = 'study-1'

function buildSelectStub(options: { data?: any[]; error?: unknown }) {
  return {
    from(table: string) {
      expect(table).toBe('lab_kit_alert_dismissals')
      const builder: any = {
        select() { return builder },
        eq() { return builder },
        gt() { return builder },
        order() { return Promise.resolve({ data: options.data ?? [], error: options.error ?? null }) },
      }
      return builder
    },
  }
}

function buildUpsertStub(options: { row?: any; error?: unknown }) {
  const state: { lastUpsert?: any; conflict?: string } = {}
  const supabase = {
    get lastUpsert() { return state.lastUpsert },
    from(table: string) {
      expect(table).toBe('lab_kit_alert_dismissals')
      const builder: any = {
        upsert(payload: any, opts?: { onConflict?: string }) {
          state.lastUpsert = payload
          state.conflict = opts?.onConflict
          return builder
        },
        select() { return builder },
        single() {
          return Promise.resolve({ data: options.row ?? null, error: options.error ?? null })
        },
      }
      return builder
    },
  }
  return supabase
}

function buildDeleteStub(calls: { op: string; key?: string; value?: unknown }[], error?: unknown) {
  const builder: any = {
    delete() { calls.push({ op: 'delete' }); return builder },
    eq(key: string, value: unknown) { calls.push({ op: 'eq', key, value }); return builder },
    in(key: string, value: unknown) { calls.push({ op: 'in', key, value }); return builder },
    then(resolve: (value: { error: unknown }) => unknown) { return resolve({ error: error ?? null }) },
    catch() { return builder },
  }
  return {
    from(table: string) {
      expect(table).toBe('lab_kit_alert_dismissals')
      return builder
    },
  }
}

describe('Lab kit alert dismissals API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authenticateUser.mockResolvedValue({ user, error: null, status: 200 })
    verifyStudyMembership.mockResolvedValue({ success: true })
  })

  test('GET returns active dismissals and normalizes metadata', async () => {
    const supabase = buildSelectStub({
      data: [
        {
          id: 'dismiss-1',
          alert_hash: 'group:critical',
          dismissed_at: '2024-05-01T00:00:00Z',
          expires_at: '2024-06-01T00:00:00Z',
          metadata: null,
        },
      ],
    })
    createSupabaseAdmin.mockReturnValue(supabase)

    const request = {
      method: 'GET',
      url: `http://localhost/api/lab-kits/alerts/dismissals?studyId=${studyId}`,
      headers: new Headers({ Authorization: 'Bearer token' }),
    }

    const response = await getDismissals(request as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.dismissals).toHaveLength(1)
    expect(body.dismissals[0]).toMatchObject({
      id: 'dismiss-1',
      alertHash: 'group:critical',
      metadata: {},
    })
  })

  test('POST upserts dismissal with clamped TTL and metadata coercion', async () => {
    const upsertSupabase = buildUpsertStub({
      row: {
        id: 'dismiss-1',
        alert_hash: 'group:warning',
        dismissed_at: '2024-05-02T00:00:00Z',
        expires_at: '2024-07-31T00:00:00Z',
        metadata: { reason: 'covered' },
      },
    })

    createSupabaseAdmin.mockReturnValue(upsertSupabase)

    const request = {
      method: 'POST',
      url: 'http://localhost/api/lab-kits/alerts/dismissals',
      headers: new Headers({ Authorization: 'Bearer token' }),
      json: async () => ({
        studyId,
        alertHash: 'group:warning',
        ttlDays: 120,
        metadata: 'already covered',
      }),
    }

    const before = new Date()
    const response = await postDismissal(request as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.dismissal.alertHash).toBe('group:warning')
    expect(upsertSupabase.lastUpsert).toBeDefined()
    expect(upsertSupabase.lastUpsert.metadata).toEqual({ value: 'already covered' })
    const expires = new Date(upsertSupabase.lastUpsert.expires_at ?? body.dismissal.expiresAt)
    const diffMs = expires.getTime() - before.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeLessThanOrEqual(91)
  })

  test('DELETE clears specific hashes when provided', async () => {
    const calls: { op: string; key?: string; value?: unknown }[] = []
    createSupabaseAdmin.mockReturnValue(buildDeleteStub(calls))

    const request = {
      method: 'DELETE',
      url: 'http://localhost/api/lab-kits/alerts/dismissals',
      headers: new Headers({ Authorization: 'Bearer token' }),
      json: async () => ({ studyId, alertHashes: ['group:critical', 'group:critical', 'group:warning'] }),
    }

    const response = await deleteDismissals(request as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    const inCall = calls.find((call) => call.op === 'in')
    expect(inCall?.value).toEqual(['group:critical', 'group:warning'])
    const eqCalls = calls.filter((call) => call.op === 'eq')
    expect(eqCalls.some((call) => call.key === 'user_id' && call.value === user.id)).toBe(true)
    expect(eqCalls.some((call) => call.key === 'study_id' && call.value === studyId)).toBe(true)
  })

  test('returns 400 when required POST fields missing', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/lab-kits/alerts/dismissals',
      headers: new Headers({ Authorization: 'Bearer token' }),
      json: async () => ({ alertHash: 'group:test' }),
    }

    const response = await postDismissal(request as any)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/studyId/i)
  })
})
/** @jest-environment node */
