// Mock next/server to avoid dependency on global WHATWG classes
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }),
  },
}))

// Import route after mocks are set
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: createSubject } = require('@/app/api/subjects/route')

// Minimal stub that records calls and supports chained query behavior used by the POST route
function createSupabaseStub(options: {
  authUser?: { id: string; email?: string } | null
  study?: any | null
  existingSubject?: any | null
}) {
  const calls: any = { inserts: { subjects: [], subject_sections: [] } }
  const state: any = { table: null, orderBy: [], filters: new Map<string, any>(), lastSelect: '' }
  const stub: any = {
    _calls: calls,
    auth: {
      async getUser(_token: string) {
        if (options.authUser) return { data: { user: options.authUser }, error: null }
        return { data: { user: null }, error: new Error('invalid') as any }
      },
    },
    from(table: string) {
      state.table = table
      state.filters = new Map()
      state.orderBy = []
      const builder: any = {
        select(cols: string) { state.lastSelect = cols; return builder },
        eq(key: string, val: any) { state.filters.set(key, val); return builder },
        order(col: string, opts?: any) {
          state.orderBy.push({ col, opts });
          // For study_sections flow, return final result here when awaited
          if (table === 'study_sections') {
            return Promise.resolve({ data: [{ id: 'sec-1', order_index: 1 }], error: null })
          }
          return builder
        },
        single() { return builder },
        maybeSingle() { return builder.single() },
        async insert(payload: any) {
          if (table === 'subjects') {
            const row = {
              id: 'new-subj-1',
              study_id: payload.study_id,
              subject_number: payload.subject_number,
              enrollment_date: payload.enrollment_date || '2025-01-01',
              randomization_date: payload.randomization_date || null,
              ...payload,
            }
            calls.inserts.subjects.push(row)
            return { data: row, error: null }
          }
          if (table === 'subject_sections') {
            calls.inserts.subject_sections.push(payload)
            return { data: { id: 'sub-sec-1', ...payload }, error: null }
          }
          return { data: null, error: null }
        },
        async single() {
          if (table === 'studies') {
            if (options.study) return { data: options.study, error: null }
            return { data: null, error: { code: '404' } }
          }
          if (table === 'subjects' && state.lastSelect === 'id') {
            return { data: options.existingSubject || null, error: options.existingSubject ? null : ({ code: 'PGRST116' } as any) }
          }
          return { data: null, error: null }
        },
        async then() { /* to satisfy potential awaits */ },
      }
      return builder
    },
  }
  return stub
}

jest.mock('@/lib/api/auth', () => {
  return {
    createSupabaseAdmin: jest.fn(),
  }
})

jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

describe('POST /api/subjects auto-enrolls first section', () => {
  const { createSupabaseAdmin } = jest.requireMock('@/lib/api/auth') as { createSupabaseAdmin: jest.Mock }

  test.skip('creates subject_sections row for first study section with anchor', async () => {
    const user = { id: 'user-1', email: 'u@example.com' }
    const study = { id: 'study-1', site_id: null, user_id: 'user-1' }
    const supabase = createSupabaseStub({ authUser: user, study })
    ;(createSupabaseAdmin as any).mockReturnValue(supabase)

    const req = {
      method: 'POST',
      url: 'http://localhost/api/subjects',
      headers: new Headers({ Authorization: 'Bearer token' }),
      json: async () => ({
        study_id: 'study-1',
        subject_number: '001',
        enrollment_date: '2025-09-01',
        randomization_date: '2025-09-03',
        status: 'screening',
      })
    }

    const res = await createSubject(req as any)
    expect(res.status).toBe(201)
    // Ensure subject_sections insert was attempted
    const calls = (supabase as any)._calls
    expect(calls.inserts.subjects.length).toBe(1)
    expect(calls.inserts.subject_sections.length).toBe(1)
    expect(calls.inserts.subject_sections[0]).toMatchObject({
      subject_id: 'new-subj-1',
      study_section_id: 'sec-1',
      anchor_date: '2025-09-03', // randomization preferred over enrollment
    })
  })
})
/** @jest-environment node */
