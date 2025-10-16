jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }),
  },
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: getLabKit, DELETE: deleteLabKit } = require('@/app/api/lab-kits/[id]/route')

function createSupabaseStub(options: {
  authUser?: { id: string; email?: string } | null
  kit?: any | null
  fetchError?: any | null
  member?: boolean
  updateOk?: boolean
  deleteOk?: boolean
}) {
  const state: any = { table: null, updatePayload: null }
  return {
    auth: {
      async getUser(_t: string) {
        if (options.authUser) return { data: { user: options.authUser }, error: null }
        return { data: { user: null }, error: new Error('invalid') as any }
      },
    },
    from(table: string) {
      state.table = table
      const builder: any = {
        select(_s: string) { return builder },
        eq(_k: string, _v: any) { return builder },
        maybeSingle() { return builder.single() },
        order() { return builder },
        limit() { return builder },
        single: async () => {
          if (table === 'lab_kits') {
            if (options.fetchError) return { data: null, error: options.fetchError }
            return { data: options.kit || null, error: options.kit ? null : ({ code: 'PGRST116' } as any) }
          }
          if (table === 'site_members') {
            return { data: options.member ? { user_id: options.authUser?.id } : null, error: null }
          }
          return { data: null, error: null }
        },
        update: (payload: any) => {
          state.updatePayload = payload
          return {
            eq() { return this },
            select() { return this },
            single: async () => ({ data: options.updateOk ? { ...options.kit, ...payload } : null, error: options.updateOk ? null : (new Error('update failed') as any) }),
          }
        },
        delete: () => ({
          eq() { return this },
          async select() { return { data: options.deleteOk ? {} : null, error: options.deleteOk ? null : (new Error('delete failed') as any) } },
          async single() { return { data: options.deleteOk ? {} : null, error: options.deleteOk ? null : (new Error('delete failed') as any) } },
        }),
      }
      return builder
    },
  } as any
}

jest.mock('@/lib/api/auth', () => ({ createSupabaseAdmin: jest.fn(), authenticateUser: jest.fn() }))
jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

describe('Lab Kits API security and constraints', () => {
  const { createSupabaseAdmin, authenticateUser } = jest.requireMock('@/lib/api/auth') as { createSupabaseAdmin: jest.Mock, authenticateUser: jest.Mock }

  test('GET denies non-members (403)', async () => {
    const user = { id: 'u1', email: 'x@y.z' }
    const kit = { id: 'k1', studies: { id: 's1', site_id: 'site1', user_id: 'owner' } }
    createSupabaseAdmin.mockReturnValue(createSupabaseStub({ authUser: user, kit, member: false }))
    authenticateUser.mockResolvedValue({ user })
    const req = { method: 'GET', url: 'http://local/api/lab-kits/k1', headers: new Headers({ Authorization: 'Bearer t' }) }
    const res = await getLabKit(req as any, { params: { id: 'k1' } })
    expect(res.status).toBe(403)
  })

  test('DELETE blocks used/shipped/destroyed', async () => {
    const user = { id: 'u1' }
    const base = { id: 'k1', status: 'used', studies: { id: 's1', site_id: 'site1', user_id: 'owner' } }
    createSupabaseAdmin.mockReturnValue(createSupabaseStub({ authUser: user, kit: base, member: true, deleteOk: false }))
    authenticateUser.mockResolvedValue({ user })
    const req = { method: 'DELETE', url: 'http://local/api/lab-kits/k1', headers: new Headers({ Authorization: 'Bearer t' }) }
    const res = await deleteLabKit(req as any, { params: { id: 'k1' } })
    expect(res.status).toBe(400)
  })
})
/** @jest-environment node */
