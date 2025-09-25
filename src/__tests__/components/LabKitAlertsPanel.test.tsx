import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LabKitAlertsPanel from '@/components/lab-kits/LabKitAlertsPanel'

const mockUseDismissals = jest.fn()
const mockUseGroupedAlerts = jest.fn()

jest.mock('@/hooks/useLabKitAlertDismissals', () => ({
  useLabKitAlertDismissals: (...args: unknown[]) => mockUseDismissals(...args),
}))

jest.mock('@/hooks/useGroupedLabKitAlerts', () => ({
  useGroupedLabKitAlerts: (...args: unknown[]) => mockUseGroupedAlerts(...args),
}))

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockUseDismissals.mockReturnValue({
    dismissedHashes: new Set(),
    isLoading: false,
    error: null,
    dismiss: jest.fn(),
    restore: jest.fn(),
  })
  mockUseGroupedAlerts.mockReturnValue({
    data: {
      groups: {
        supplyDeficit: {
          severity: 'critical',
          active: 1,
          total: 2,
          hasMore: true,
          items: [{
            key: 'kit-critical',
            kitTypeName: 'Critical Kit',
            deficit: 2,
            originalDeficit: 3,
            pendingOrderQuantity: 1,
            pendingOrders: [],
          }],
        },
        expiringSoon: {
          severity: 'warning',
          total: 1,
          hasMore: false,
          items: [{ id: 'kit-expiring', accessionNumber: 'ACC-1', kitTypeName: 'Kit X', expirationDate: '2024-05-30' }],
        },
        pendingShipment: {
          severity: 'warning',
          total: 0,
          hasMore: false,
          items: [],
        },
        shippedWithoutDelivery: {
          severity: 'warning',
          total: 0,
          hasMore: false,
          items: [],
        },
        lowBuffer: {
          severity: 'warning',
          total: 0,
          hasMore: false,
          items: [],
        },
        expired: {
          severity: 'info',
          total: 0,
          hasMore: false,
          items: [],
        },
      },
      summary: {
        total: 3,
        bySeverity: { critical: 1, warning: 2, info: 0 },
      },
      meta: { limit: 5, daysAhead: 30, expiringDays: 30, pendingAgingDays: 7, shippedAgingDays: 10 },
      forecastSummary: {
        totalVisitsScheduled: 0,
        criticalIssues: 0,
        warnings: 0,
        daysAhead: 30,
        baseWindowDays: 30,
        inventoryBufferDays: 0,
        visitWindowBufferDays: 0,
      },
    },
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  })
})

describe('LabKitAlertsPanel dismissal behavior', () => {
  test('dismiss button hides section when clicked', async () => {
    const dismissMock = jest.fn().mockResolvedValue(undefined)
    mockUseDismissals.mockReturnValue({
      dismissedHashes: new Set(),
      isLoading: false,
      error: null,
      dismiss: dismissMock,
      restore: jest.fn(),
    })

    render(<LabKitAlertsPanel studyId="study-1" />)

    const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i })
    const supplyDeficitDismiss = dismissButtons[0]
    fireEvent.click(supplyDeficitDismiss)

    await waitFor(() => {
      expect(dismissMock).toHaveBeenCalledWith('group:supplyDeficit', { metadata: undefined })
    })
  })

  test('restore hidden button reopens groups', async () => {
    const restoreMock = jest.fn().mockResolvedValue(undefined)
    mockUseDismissals.mockReturnValue({
      dismissedHashes: new Set(['group:supplyDeficit']),
      isLoading: false,
      error: null,
      dismiss: jest.fn(),
      restore: restoreMock,
    })

    render(<LabKitAlertsPanel studyId="study-1" />)

    const restoreButton = screen.getByRole('button', { name: /restore hidden/i })
    fireEvent.click(restoreButton)

    await waitFor(() => {
      expect(restoreMock).toHaveBeenCalled()
    })
  })
})
