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

jest.mock('@/lib/lab-kits/forecast-service', () => {
  const actual = jest.requireActual('@/lib/lab-kits/forecast-service')
  return {
    ...actual,
    loadInventoryForecast: jest.fn(),
  }
})

jest.mock('@/lib/logger', () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: getForecastAlerts } = require('@/app/api/lab-kits/forecast-alerts/route')

const { authenticateUser, verifyStudyMembership, createSupabaseAdmin } = jest.requireMock('@/lib/api/auth') as {
  authenticateUser: jest.Mock
  verifyStudyMembership: jest.Mock
  createSupabaseAdmin: jest.Mock
}

const { loadInventoryForecast, ForecastServiceError } = jest.requireMock('@/lib/lab-kits/forecast-service') as {
  loadInventoryForecast: jest.Mock
  ForecastServiceError: typeof import('@/lib/lab-kits/forecast-service').ForecastServiceError
}

function makeForecastItem(overrides: Partial<import('@/lib/lab-kits/forecast-service').InventoryForecastItem>): import('@/lib/lab-kits/forecast-service').InventoryForecastItem {
  return {
    key: 'kit-1',
    kitTypeId: 'kt-1',
    kitTypeName: 'Kit 1',
    visitName: 'Visit 1',
    optional: false,
    visitsScheduled: 2,
    kitsRequired: 3,
    requiredWithBuffer: 4,
    kitsAvailable: 1,
    kitsExpiringSoon: 0,
    deficit: 2,
    status: 'critical',
    upcomingVisits: [],
    requirements: [],
    originalDeficit: 2,
    pendingOrderQuantity: 0,
    pendingOrders: [],
    bufferKitsNeeded: 1,
    ...overrides,
  }
}

function createSupabaseStub(options: { kits?: any[]; error?: unknown }) {
  return {
    from(table: string) {
      expect(table).toBe('lab_kits')
      const builder: any = {
        select() { return builder },
        eq(_key: string, _value: unknown) {
          return Promise.resolve({ data: options.kits ?? [], error: options.error ?? null })
        },
      }
      return builder
    },
  }
}

describe('GET /api/lab-kits/forecast-alerts', () => {
  const user = { id: 'user-1' }
  const studyId = 'study-1'

  beforeEach(() => {
    jest.clearAllMocks()
    authenticateUser.mockResolvedValue({ user, error: null, status: 200 })
    verifyStudyMembership.mockResolvedValue({ success: true })
  })

  test('returns grouped alerts with limit enforcement and severity metadata', async () => {
    const pendingOrder = {
      id: 'order-1',
      quantity: 1,
      vendor: 'Acme',
      expectedArrival: '2024-05-10',
      status: 'pending',
      isOverdue: false,
      notes: null,
      createdAt: '2024-05-01T00:00:00Z',
      createdBy: 'user-1',
      receivedDate: null,
    }

    const criticalItem = makeForecastItem({
      key: 'critical-item',
      kitTypeId: 'kit-critical',
      kitTypeName: 'Critical Kit',
      deficit: 2,
      originalDeficit: 3,
      pendingOrderQuantity: 1,
      pendingOrders: [pendingOrder],
      status: 'critical',
    })

    const coveredItem = makeForecastItem({
      key: 'covered-item',
      kitTypeId: 'kit-covered',
      kitTypeName: 'Covered Kit',
      deficit: 0,
      originalDeficit: 2,
      pendingOrderQuantity: 2,
      pendingOrders: [pendingOrder],
      status: 'warning',
      kitsAvailable: 5,
      kitsRequired: 5,
    })

    const kits = [
      {
        id: 'kit-expiring',
        accession_number: 'ACC-1',
        kit_type_id: 'kit-critical',
        kit_type: 'Critical Kit',
        status: 'available',
        expiration_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: null,
      },
      {
        id: 'kit-pending',
        accession_number: 'ACC-2',
        kit_type_id: null,
        kit_type: 'Pending Kit',
        status: 'pending_shipment',
        expiration_date: null,
        created_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: null,
      },
      {
        id: 'kit-shipped',
        accession_number: 'ACC-3',
        kit_type_id: null,
        kit_type: 'Shipped Kit',
        status: 'shipped',
        expiration_date: null,
        created_at: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: null,
      },
      {
        id: 'kit-expired',
        accession_number: 'ACC-4',
        kit_type_id: 'kit-covered',
        kit_type: 'Covered Kit',
        status: 'expired',
        expiration_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]

    loadInventoryForecast.mockResolvedValue({
      forecast: [criticalItem, coveredItem],
      summary: {
        totalVisitsScheduled: 0,
        criticalIssues: 0,
        warnings: 0,
        daysAhead: 30,
        baseWindowDays: 30,
        inventoryBufferDays: 0,
        visitWindowBufferDays: 0,
      },
      context: {
        todayISO: '2024-05-01',
        futureISO: '2024-05-31',
        effectiveDaysAhead: 30,
        expiryCutoffISO: '2024-05-31',
        expiryWindowDays: 30,
        inventoryBufferDays: 0,
        visitWindowBufferDays: 0,
        kitTypeNames: {
          'kit-critical': 'Critical Kit',
          'kit-covered': 'Covered Kit',
        },
      },
    })

    createSupabaseAdmin.mockReturnValue(createSupabaseStub({ kits }))

    const request = {
      method: 'GET',
      url: `http://localhost/api/lab-kits/forecast-alerts?studyId=${studyId}&limit=1`,
      headers: new Headers({ Authorization: 'Bearer token' }),
    }

    const response = await getForecastAlerts(request as any)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.meta.limit).toBe(1)
    expect(body.groups.supplyDeficit.total).toBe(2)
    expect(body.groups.supplyDeficit.items).toHaveLength(1)
    expect(body.groups.supplyDeficit.hasMore).toBe(true)
    expect(body.groups.supplyDeficit.severity).toBe('critical')
    expect(body.groups.supplyDeficit.items[0].kitTypeName).toBe('Critical Kit')
    expect(body.summary.bySeverity.critical).toBe(1)
    expect(body.summary.bySeverity.warning).toBeGreaterThan(0)
    expect(body.groups.expiringSoon.total).toBe(1)
    expect(body.groups.expiringSoon.items[0].kitTypeName).toBe('Critical Kit')
    expect(body.groups.pendingShipment.total).toBe(1)
    expect(body.groups.shippedWithoutDelivery.total).toBe(1)
    expect(body.groups.expired.total).toBe(1)
  })

  test('bubbles up forecast service errors', async () => {
    const error = new ForecastServiceError('forecast failed', 503)
    loadInventoryForecast.mockRejectedValue(error)
    createSupabaseAdmin.mockReturnValue(createSupabaseStub({ kits: [] }))

    const request = {
      method: 'GET',
      url: `http://localhost/api/lab-kits/forecast-alerts?studyId=${studyId}`,
      headers: new Headers({ Authorization: 'Bearer token' }),
    }

    const response = await getForecastAlerts(request as any)
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe('forecast failed')
  })

  test('rejects missing studyId', async () => {
    const request = {
      method: 'GET',
      url: 'http://localhost/api/lab-kits/forecast-alerts',
      headers: new Headers({ Authorization: 'Bearer token' }),
    }

    const response = await getForecastAlerts(request as any)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/studyId/i)
  })
})
/** @jest-environment node */
