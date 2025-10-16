// Mock next/server first
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }),
  },
}))

// Mock auth helpers and supabase admin
jest.mock('@/lib/api/auth', () => ({
  authenticateUser: jest.fn(),
  verifyStudyMembership: jest.fn(),
  createSupabaseAdmin: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

// Import route after mocks are set
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PUT: saveIp } = require('@/app/api/subject-visits/[id]/ip-accountability/route')

describe('PUT /api/subject-visits/[id]/ip-accountability', () => {
  const { authenticateUser, verifyStudyMembership, createSupabaseAdmin } = jest.requireMock('@/lib/api/auth') as {
    authenticateUser: jest.Mock
    verifyStudyMembership: jest.Mock
    createSupabaseAdmin: jest.Mock
  }

  function createSupabaseStub() {
    const state: any = { table: '', lastSelect: '', filters: new Map<string, any>(), updatedPayload: null }
    const rpc = jest.fn(async (name: string, payload: any) => {
      state.lastRpc = { name, payload }
      return { data: null, error: null }
    })
    const builder: any = {
      select(cols: string) { state.lastSelect = cols; return builder },
      eq(key: string, val: any) { state.filters.set(key, val); return builder },
      order() { return builder },
      limit() { return builder },
      async single() {
        if (state.table === 'subject_visits' && state.lastSelect.includes('subject_id')) {
          return { data: { subject_id: 'sub-1', study_id: 'study-1' }, error: null }
        }
        if (state.table === 'studies') {
          return { data: { site_id: 'site-1', user_id: 'owner-1' }, error: null }
        }
        if (state.table === 'subject_visits' && state.lastSelect === '*') {
          return { data: { id: state.filters.get('id'), status: 'completed' }, error: null }
        }
        return { data: null, error: null }
      },
      update(payload: any) {
        state.updatedPayload = payload
        // Return an object that supports .eq(...).await
        return {
          eq: async (_key: string, _val: any) => ({ data: null, error: null })
        }
      },
    }
    const from = (table: string) => { state.table = table; state.filters.clear(); return builder }
    return { rpc, from, _state: state }
  }

  test('saves multi-bottle payload via RPC and updates visit summary', async () => {
    authenticateUser.mockResolvedValue({ user: { id: 'user-1' } })
    verifyStudyMembership.mockResolvedValue({ success: true })
    const stub = createSupabaseStub()
    createSupabaseAdmin.mockReturnValue(stub)

    const reqBody = {
      dispensed_bottles: [ { ip_id: 'KIT-1', count: 30, start_date: '2025-09-01' } ],
      returned_bottles:  [ { ip_id: 'KIT-1', count: 25, last_dose_date: '2025-09-10' } ],
      status: 'completed'
    }

    const req = {
      method: 'PUT',
      headers: new Headers({ Authorization: 'Bearer token', 'Content-Type': 'application/json' }),
      json: async () => reqBody,
    }

    const res = await saveIp(req as any, { params: { id: 'visit-1' } } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(stub._state.lastRpc).toBeTruthy()
    expect(stub._state.lastRpc.name).toBe('save_visit_ip_batch')
    expect(stub._state.lastRpc.payload.p_subject_id).toBe('sub-1')
    expect(stub._state.lastRpc.payload.p_user_id).toBe('user-1')
    expect(stub._state.lastRpc.payload.p_visit_id).toBe('visit-1')
    expect(stub._state.lastRpc.payload.p_dispensed[0]).toMatchObject({ ip_id: 'KIT-1', count: 30, start_date: '2025-09-01' })
    expect(stub._state.lastRpc.payload.p_returned[0]).toMatchObject({ ip_id: 'KIT-1', count: 25, last_dose_date: '2025-09-10' })

    // Visit update summary should include first dispensed/returned
    expect(stub._state.updatedPayload).toMatchObject({
      status: 'completed',
      ip_dispensed: 30,
      ip_id: 'KIT-1',
      ip_start_date: '2025-09-01',
      ip_returned: 25,
      return_ip_id: 'KIT-1',
      ip_last_dose_date: '2025-09-10',
    })
  })
})
/** @jest-environment node */
