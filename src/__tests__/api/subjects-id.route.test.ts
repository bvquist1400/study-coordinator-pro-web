// Mock next/server to avoid dependency on global WHATWG classes
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }),
  },
}))
// Import route after mocks are set
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: getSubject } = require('@/app/api/subjects/[id]/route')

// Minimal Supabase stub with programmable responses
function createSupabaseStub(options: {
  authUser?: { id: string; email?: string } | null
  subject?: any | null
  study?: any | null
}) {
  const state: any = { table: null, filters: new Map<string, any>() }
  return {
    auth: {
      async getUser(_token: string) {
        if (options.authUser) return { data: { user: options.authUser }, error: null }
        return { data: { user: null }, error: new Error('invalid') as any }
      },
    },
    from(table: string) {
      state.table = table
      state.filters.clear()
      const builder: any = {
        select(_cols: string) { return builder },
        eq(key: string, val: any) { state.filters.set(key, val); return builder },
        is(_key: string, _val: any) { return builder },
        in(_key: string, _vals: any[]) { return builder },
        order(_col: string, _opts?: any) { return builder },
        maybeSingle() { return builder.single() },
        async single() {
          if (state.table === 'subjects') {
            if (options.subject) return { data: options.subject, error: null }
            const err: any = { code: 'PGRST116', message: 'not found' }
            return { data: null, error: err }
          }
          if (state.table === 'studies') {
            if (options.study) return { data: options.study, error: null }
            const err: any = { code: 'PGRST116', message: 'not found' }
            return { data: null, error: err }
          }
          return { data: null, error: null }
        },
      }
      return builder
    },
  } as any
}

jest.mock('@/lib/api/auth', () => {
  return {
    // Will be overridden per test
    createSupabaseAdmin: jest.fn(),
  }
})

jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

describe('GET /api/subjects/[id]', () => {
  const { createSupabaseAdmin } = jest.requireMock('@/lib/api/auth') as { createSupabaseAdmin: jest.Mock }

  test('returns 401 when Authorization header is missing/invalid', async () => {
    createSupabaseAdmin.mockReturnValue(createSupabaseStub({}))
    const req = { method: 'GET', url: 'http://localhost/api/subjects/abc', headers: new Headers() }
    const res = await getSubject(req as any, { params: { id: 'abc' } })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/Missing or invalid authorization/i)
  })

  test('returns 200 with subject when user is authorized (legacy owner)', async () => {
    const user = { id: 'user-1', email: 'u@example.com' }
    const subject = { id: 'sub-1', study_id: 'study-1', subject_number: '001' }
    const study = { id: 'study-1', site_id: null, user_id: 'user-1' }
    createSupabaseAdmin.mockReturnValue(createSupabaseStub({ authUser: user, subject, study }))

    const req = { method: 'GET', url: 'http://localhost/api/subjects/sub-1', headers: new Headers({ Authorization: 'Bearer token' }) }
    const res = await getSubject(req as any, { params: { id: 'sub-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subject).toBeTruthy()
    expect(body.subject.id).toBe('sub-1')
    expect(body.subject.subject_number).toBe('001')
  })
})
/** @jest-environment node */
