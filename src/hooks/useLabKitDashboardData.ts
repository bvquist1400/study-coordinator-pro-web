import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type ForecastStatus = 'critical' | 'warning' | 'ok'
type RiskLevel = 'high' | 'medium' | 'low'

export interface DashboardForecastItem {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  optional: boolean
  kitsAvailable: number
  kitsRequired: number
  requiredWithBuffer: number
  kitsExpiringSoon: number
  deficit: number
  originalDeficit: number
  pendingOrderQuantity: number
  status: ForecastStatus
  riskLevel: RiskLevel
  riskScore: number
  riskFactors: Array<{ type: string; score: number; detail: string }>
  bufferTarget: number
  slackAfterBuffer: number
  upcomingVisits: Array<{ visit_date: string | null; subject_number: string | null; visit_name: string | null; quantity_required: number }>
  pendingOrders: Array<{ id: string; quantity: number; expectedArrival: string | null; status: string }>
}

export interface DashboardSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  highRisk: number
  mediumRisk: number
  daysAhead: number
}

export interface DashboardOrdersItem {
  id: string
  kit_type_id: string | null
  kit_type_name: string | null
  quantity: number
  status: 'pending' | 'received' | 'cancelled'
  expected_arrival: string | null
  vendor: string | null
  created_at: string
}

export interface DashboardShipmentItem {
  id: string
  airway_bill_number: string | null
  carrier: string | null
  tracking_status: string | null
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
}

export interface DashboardInventoryItem {
  id: string
  accession_number: string
  status: string
  kit_type_label: string | null
  expiration_date: string | null
}

export interface LabKitDashboardData {
  inventory: DashboardInventoryItem[]
  forecast: DashboardForecastItem[]
  summary: DashboardSummary | null
  orders: DashboardOrdersItem[]
  shipments: DashboardShipmentItem[]
}

type DashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: LabKitDashboardData }
  | { status: 'error'; message: string }

const sanitizeForecastItem = (raw: any): DashboardForecastItem | null => {
  if (!raw || typeof raw !== 'object') return null
  const key = typeof raw.key === 'string' && raw.key.length > 0 ? raw.key : (raw.kitTypeId ?? raw.kit_type_id ?? null)
  if (!key) return null

  const pendingOrdersRaw = Array.isArray(raw.pendingOrders) ? raw.pendingOrders : []
  const pendingOrders = pendingOrdersRaw
    .map((order: any) => {
      const id = typeof order?.id === 'string' ? order.id : null
      const quantity = Number.parseInt(String(order?.quantity ?? '0'), 10)
      if (!id || !Number.isFinite(quantity) || quantity <= 0) return null
      return {
        id,
        quantity,
        expectedArrival: typeof order?.expectedArrival === 'string'
          ? order.expectedArrival
          : (typeof order?.expected_arrival === 'string' ? order.expected_arrival : null),
        status: typeof order?.status === 'string' ? order.status : 'pending'
      }
    })
    .filter(Boolean) as DashboardForecastItem['pendingOrders']

  const bufferTarget = typeof raw?.bufferMeta?.targetKits === 'number'
    ? raw.bufferMeta.targetKits
    : (typeof raw?.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0)

  const kitsAvailable = Number(raw?.kitsAvailable ?? 0)
  const requiredWithBuffer = Number(raw?.requiredWithBuffer ?? 0)
  const slackAfterBuffer = kitsAvailable - requiredWithBuffer

  return {
    key: String(key),
    kitTypeId: typeof raw?.kitTypeId === 'string' ? raw.kitTypeId : null,
    kitTypeName: typeof raw?.kitTypeName === 'string' ? raw.kitTypeName : 'Unnamed kit',
    optional: Boolean(raw?.optional),
    kitsAvailable,
    kitsRequired: Number(raw?.kitsRequired ?? 0),
    requiredWithBuffer,
    kitsExpiringSoon: Number(raw?.kitsExpiringSoon ?? 0),
    deficit: Math.max(0, Number(raw?.deficit ?? 0)),
    originalDeficit: Math.max(0, Number(raw?.originalDeficit ?? raw?.deficit ?? 0)),
    pendingOrderQuantity: Math.max(0, Number(raw?.pendingOrderQuantity ?? 0)),
    status: raw?.status === 'critical' || raw?.status === 'warning' ? raw.status : 'ok',
    riskLevel: raw?.riskLevel === 'high' || raw?.riskLevel === 'medium' ? raw.riskLevel : 'low',
    riskScore: Math.max(0, Number(raw?.riskScore ?? 0)),
    riskFactors: Array.isArray(raw?.riskFactors)
      ? raw.riskFactors.map((factor: any, index: number) => ({
          type: typeof factor?.type === 'string' ? factor.type : `factor-${index}`,
          score: Number(factor?.score) || 0,
          detail: typeof factor?.detail === 'string' ? factor.detail : ''
        }))
      : [],
    bufferTarget: Math.max(0, bufferTarget),
    slackAfterBuffer,
    upcomingVisits: Array.isArray(raw?.upcomingVisits)
      ? raw.upcomingVisits.map((visit: any) => ({
          visit_date: typeof visit?.visit_date === 'string' ? visit.visit_date : null,
          subject_number: typeof visit?.subject_number === 'string' ? visit.subject_number : null,
          visit_name: typeof visit?.visit_name === 'string' ? visit.visit_name : null,
          quantity_required: Number(visit?.quantity_required ?? 0)
        }))
      : [],
    pendingOrders
  }
}

const sanitizeSummary = (raw: any): DashboardSummary | null => {
  if (!raw || typeof raw !== 'object') return null
  return {
    totalVisitsScheduled: Number(raw?.totalVisitsScheduled ?? 0),
    criticalIssues: Number(raw?.criticalIssues ?? 0),
    warnings: Number(raw?.warnings ?? 0),
    highRisk: Number(raw?.highRisk ?? 0),
    mediumRisk: Number(raw?.mediumRisk ?? 0),
    daysAhead: Number(raw?.daysAhead ?? 0)
  }
}

const sanitizeInventory = (rows: any[]): DashboardInventoryItem[] => {
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: String(row?.id ?? crypto.randomUUID()),
      accession_number: typeof row?.accession_number === 'string' ? row.accession_number : '—',
      status: typeof row?.status === 'string' ? row.status : 'unknown',
      kit_type_label: typeof row?.kit_type_info?.name === 'string'
        ? row.kit_type_info.name
        : (typeof row?.kit_type_label === 'string' ? row.kit_type_label : null),
      expiration_date: typeof row?.expiration_date === 'string' ? row.expiration_date : null
    }))
}

const sanitizeOrders = (rows: any[]): DashboardOrdersItem[] => {
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: String(row?.id ?? crypto.randomUUID()),
      kit_type_id: typeof row?.kit_type_id === 'string' ? row.kit_type_id : null,
      kit_type_name: typeof row?.kit_type_name === 'string' ? row.kit_type_name : null,
      quantity: Number(row?.quantity ?? 0),
      status: row?.status === 'received' || row?.status === 'cancelled' ? row.status : 'pending',
      expected_arrival: typeof row?.expected_arrival === 'string' ? row.expected_arrival : null,
      vendor: typeof row?.vendor === 'string' ? row.vendor : null,
      created_at: typeof row?.created_at === 'string' ? row.created_at : ''
    }))
}

const sanitizeShipments = (rows: any[]): DashboardShipmentItem[] => {
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: String(row?.id ?? crypto.randomUUID()),
      airway_bill_number: typeof row?.airway_bill_number === 'string' ? row.airway_bill_number : null,
      carrier: typeof row?.carrier === 'string' ? row.carrier : null,
      tracking_status: typeof row?.tracking_status === 'string' ? row.tracking_status : null,
      shipped_date: typeof row?.shipped_date === 'string' ? row.shipped_date : null,
      estimated_delivery: typeof row?.estimated_delivery === 'string' ? row.estimated_delivery : null,
      actual_delivery: typeof row?.actual_delivery === 'string' ? row.actual_delivery : null
    }))
}

const buildErrorMessage = (errors: Array<{ label: string; message: string | null }>) => {
  const actionable = errors.filter(({ message }) => message)
  if (actionable.length === 0) return 'Failed to load lab kit dashboard data.'
  return actionable.map(({ label, message }) => `${label}: ${message}`).join(' • ')
}

export function useLabKitDashboardData(studyId: string | null) {
  const [state, setState] = useState<DashboardState>({ status: 'idle' })

  const load = useCallback(async () => {
    if (!studyId) {
      setState({ status: 'error', message: 'Select a study to load dashboard data.' })
      return
    }

    setState({ status: 'loading' })

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setState({ status: 'error', message: 'Authentication required. Please sign in again.' })
        return
      }

      const headers = { Authorization: `Bearer ${token}` }

      const requests = await Promise.allSettled([
        fetch(`/api/lab-kits?studyId=${studyId}`, { headers }),
        fetch(`/api/inventory-forecast?study_id=${studyId}&days=30`, { headers }),
        fetch(`/api/lab-kit-orders?studyId=${studyId}`, { headers }),
        fetch(`/api/shipments?studyId=${studyId}`, { headers })
      ])

      const [inventoryResult, forecastResult, ordersResult, shipmentsResult] = requests

      const errors: Array<{ label: string; message: string | null }> = []

      let inventoryRows: any[] = []
      if (inventoryResult.status === 'fulfilled') {
        if (inventoryResult.value.ok) {
          const json = await inventoryResult.value.json().catch(() => ({}))
          inventoryRows = Array.isArray(json?.labKits) ? json.labKits : []
        } else {
          errors.push({ label: 'Inventory', message: `HTTP ${inventoryResult.value.status}` })
        }
      } else {
        errors.push({ label: 'Inventory', message: inventoryResult.reason instanceof Error ? inventoryResult.reason.message : null })
      }

      let forecastItems: DashboardForecastItem[] = []
      let summary: DashboardSummary | null = null
      if (forecastResult.status === 'fulfilled') {
        if (forecastResult.value.ok) {
          const json = await forecastResult.value.json().catch(() => ({}))
          summary = sanitizeSummary(json?.summary)
          const itemsRaw = Array.isArray(json?.forecast) ? json.forecast : []
          forecastItems = itemsRaw
            .map((item: any) => sanitizeForecastItem(item))
            .filter(Boolean) as DashboardForecastItem[]
        } else {
          errors.push({ label: 'Forecast', message: `HTTP ${forecastResult.value.status}` })
        }
      } else {
        errors.push({ label: 'Forecast', message: forecastResult.reason instanceof Error ? forecastResult.reason.message : null })
      }

      let orders: DashboardOrdersItem[] = []
      if (ordersResult.status === 'fulfilled') {
        if (ordersResult.value.ok) {
          const json = await ordersResult.value.json().catch(() => ({}))
          const rows = Array.isArray(json?.orders) ? json.orders : []
          orders = sanitizeOrders(rows)
        } else {
          errors.push({ label: 'Orders', message: `HTTP ${ordersResult.value.status}` })
        }
      } else {
        errors.push({ label: 'Orders', message: ordersResult.reason instanceof Error ? ordersResult.reason.message : null })
      }

      let shipments: DashboardShipmentItem[] = []
      if (shipmentsResult.status === 'fulfilled') {
        if (shipmentsResult.value.ok) {
          const json = await shipmentsResult.value.json().catch(() => ({}))
          const rows = Array.isArray(json?.shipments) ? json.shipments : []
          shipments = sanitizeShipments(rows)
        } else {
          errors.push({ label: 'Shipments', message: `HTTP ${shipmentsResult.value.status}` })
        }
      } else {
        errors.push({ label: 'Shipments', message: shipmentsResult.reason instanceof Error ? shipmentsResult.reason.message : null })
      }

      if (errors.length > 0 && forecastItems.length === 0 && inventoryRows.length === 0) {
        setState({ status: 'error', message: buildErrorMessage(errors) })
        return
      }

      setState({
        status: 'loaded',
        data: {
          inventory: sanitizeInventory(inventoryRows),
          forecast: forecastItems,
          summary,
          orders,
          shipments
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error loading dashboard data.'
      setState({ status: 'error', message })
    }
  }, [studyId])

  useEffect(() => {
    void load()
  }, [load])

  const reload = useCallback(() => {
    void load()
  }, [load])

  const derived = useMemo(() => {
    if (state.status !== 'loaded') {
      return {
        status: state.status,
        data: null,
        error: state.status === 'error' ? state.message : null
      }
    }

    const { inventory, forecast, summary, orders, shipments } = state.data

    const inventoryByStatus = inventory.reduce<Record<string, number>>((acc, kit) => {
      acc[kit.status] = (acc[kit.status] ?? 0) + 1
      return acc
    }, {})

    const criticalForecast = forecast.filter((item) => item.status === 'critical' || item.deficit > 0)
    const warningForecast = forecast.filter((item) => item.status === 'warning' && item.deficit === 0)
    const expiringSoon = forecast.filter((item) => item.kitsExpiringSoon > 0)
    const bufferOnly = forecast.filter((item) => item.bufferTarget > 0 && item.slackAfterBuffer === 0 && item.deficit === 0)

    return {
      status: 'loaded' as const,
      data: {
        inventory,
        inventoryByStatus,
        forecast,
        summary,
        orders,
        shipments,
        slices: {
          criticalForecast,
          warningForecast,
          expiringSoon,
          bufferOnly
        }
      }
    }
  }, [state])

  const errorMessage = state.status === 'error' ? state.message : null
  const loading = state.status === 'loading'

  return {
    loading,
    error: errorMessage,
    reload,
    state: derived
  }
}

