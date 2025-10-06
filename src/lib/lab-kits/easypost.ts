import logger from '@/lib/logger'

export type TrackingStatus = 'pending' | 'in_transit' | 'delivered' | 'exception'

export interface TrackingEvent {
  datetime: string | null
  status: string | null
  message: string | null
  location: string | null
}

export interface TrackingSummary {
  status: TrackingStatus
  rawStatus: string | null
  description: string | null
  estimatedDelivery: string | null
  actualDelivery: string | null
  lastEventAt: string | null
  events: TrackingEvent[]
  rawResponse: unknown
}

const DEFAULT_BASE_URL = 'https://api.easypost.com'

class EasyPostError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message)
    this.name = 'EasyPostError'
  }
}

function mapStatus(status: string | null | undefined): TrackingStatus {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'delivered') return 'delivered'
  if (['return_to_sender', 'failure', 'cancelled', 'error', 'unknown'].includes(normalized)) return 'exception'
  if (['in_transit', 'out_for_delivery', 'pre_transit', 'available_for_pickup'].includes(normalized)) return 'in_transit'
  return 'pending'
}

function asISODate(dateTime: string | null | undefined): string | null {
  if (!dateTime) return null
  const dt = new Date(dateTime)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function asDateOnly(dateTime: string | null | undefined): string | null {
  const iso = asISODate(dateTime)
  return iso ? iso.slice(0, 10) : null
}

async function createOrFetchTracker(baseUrl: string, apiKey: string, carrier: string, trackingCode: string) {
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const payload = { tracking_code: trackingCode, carrier }

  const createResp = await fetch(`${baseUrl}/v2/trackers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    body: JSON.stringify(payload)
  })

  if (createResp.ok) {
    const json = await createResp.json().catch(() => null)
    return json?.tracker ?? json
  }

  if (createResp.status === 422) {
    // Tracker may already exist; attempt to fetch
    try {
      const fetchResp = await fetch(`${baseUrl}/v2/trackers/${carrier}/${encodeURIComponent(trackingCode)}`, {
        headers: { Authorization: authHeader }
      })
      if (fetchResp.ok) {
        const json = await fetchResp.json().catch(() => null)
        return json?.tracker ?? json
      }
      const text = await fetchResp.text().catch(() => '')
      throw new EasyPostError(`EasyPost tracker fetch failed (${fetchResp.status}): ${text || fetchResp.statusText}`, fetchResp.status)
    } catch (error) {
      if (error instanceof EasyPostError) throw error
      logger.error('EasyPost tracker fetch error', error as Error)
      throw new EasyPostError((error as Error)?.message || 'Unknown tracker fetch error', 502)
    }
  }

  const text = await createResp.text().catch(() => '')
  throw new EasyPostError(`EasyPost tracker creation failed (${createResp.status}): ${text || createResp.statusText}`, createResp.status)
}

export async function fetchEasyPostTrackingSummary(carrier: string, trackingCode: string): Promise<TrackingSummary> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    throw new EasyPostError('EasyPost API key not configured', 501)
  }

  const baseUrl = process.env.EASYPOST_API_BASE_URL?.trim() || DEFAULT_BASE_URL

  try {
    const tracker = await createOrFetchTracker(baseUrl, apiKey, carrier, trackingCode)
    if (!tracker) {
      throw new EasyPostError('EasyPost tracker response empty', 502)
    }

    const rawStatus: string | null = tracker.status ?? null
    const status = mapStatus(rawStatus)

    const trackingDetails: Array<any> = Array.isArray(tracker.tracking_details) ? tracker.tracking_details : []
    const sortedDetails = trackingDetails
      .slice()
      .sort((a, b) => {
        const da = new Date(a?.datetime || 0).getTime()
        const db = new Date(b?.datetime || 0).getTime()
        return db - da
      })

    const events: TrackingEvent[] = sortedDetails.map(detail => ({
      datetime: asISODate(detail?.datetime),
      status: detail?.status ?? null,
      message: detail?.message ?? detail?.status_detail ?? null,
      location: detail?.tracking_location?.city || detail?.tracking_location?.state || detail?.tracking_location?.country || null
    }))

    const lastEventAt = events.length > 0 ? events[0].datetime : null

    const estimatedDelivery = tracker.est_delivery_date
      ? asDateOnly(tracker.est_delivery_date)
      : tracker.estimated_delivery_date
        ? asDateOnly(tracker.estimated_delivery_date)
        : null

    const actualDelivery = status === 'delivered'
      ? asDateOnly(tracker.delivery_date ?? lastEventAt)
      : tracker.delivery_date
        ? asDateOnly(tracker.delivery_date)
        : null

    return {
      status,
      rawStatus,
      description: tracker.status_detail ?? tracker.status ?? null,
      estimatedDelivery,
      actualDelivery,
      lastEventAt,
      events,
      rawResponse: tracker
    }
  } catch (error) {
    if (error instanceof EasyPostError) {
      throw error
    }
    logger.error('EasyPost tracking summary error', error as any)
    throw new EasyPostError((error as Error)?.message || 'Unknown EasyPost tracking error', 502)
  }
}

export { EasyPostError }

