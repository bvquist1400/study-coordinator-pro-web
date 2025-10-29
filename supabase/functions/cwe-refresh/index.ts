import { serve } from 'https://deno.land/std@0.223.0/http/server.ts'

interface CweEventPayload {
  table: string
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  id?: string
  study_id?: string
  coordinator_id?: string
  week_start?: string
}

const WORKLOAD_REFRESH_PATH = '/api/analytics/workload/refresh'
const DEFAULT_BATCH_INTERVAL_MS = Number(Deno.env.get('BATCH_INTERVAL_MS') ?? '15000')
const MAX_BATCH_SIZE = 25
const queue = new Set<string>()
let flushTimer: number | null = null

const enqueueStudy = (studyId: string) => {
  if (!studyId) return
  queue.add(studyId)
  scheduleFlush()
}

const scheduleFlush = () => {
  if (flushTimer !== null) return
  flushTimer = setTimeout(async () => {
    flushTimer = null
    await flushQueue()
  }, DEFAULT_BATCH_INTERVAL_MS)
}

const flushQueue = async () => {
  if (queue.size === 0) return
  const studies = Array.from(queue).slice(0, MAX_BATCH_SIZE)
  for (const id of studies) {
    queue.delete(id)
  }

  const refreshUrlEnv = Deno.env.get('BASE_URL')
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

  if (!refreshUrlEnv || !serviceKey) {
    console.error('Missing BASE_URL or SERVICE_ROLE_KEY for cwe-refresh function')
    return
  }

  console.log('[cwe-refresh] refreshing studies', JSON.stringify(studies))

  const refreshUrl = new URL(WORKLOAD_REFRESH_PATH, refreshUrlEnv)

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ studyIds: studies })
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('Failed to refresh workloads', response.status, text)
    return
  }

  console.log('[cwe-refresh] refresh completed', { status: response.status })
}

serve(async (_req) => {
  try {
    const payload = await _req.json() as { type?: string; record?: CweEventPayload }
    const event = payload?.record
    if (!event) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no-event' }), { headers: { 'content-type': 'application/json' } })
    }

    const targetStudies = new Set<string>()
    if (event.study_id) {
      targetStudies.add(event.study_id)
    }

    for (const studyId of targetStudies) {
      enqueueStudy(studyId)
    }

    return new Response(JSON.stringify({ ok: true, queued: Array.from(targetStudies) }), { headers: { 'content-type': 'application/json' } })
  } catch (error) {
    console.error('cwe-refresh error', error)
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { headers: { 'content-type': 'application/json' }, status: 500 })
  }
})
