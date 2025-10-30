// src/app/api/cron/cwe-refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function isAuthorized(request: NextRequest) {
  if (!CRON_SECRET) {
    return false
  }
  const headerSecret = request.headers.get('x-cron-secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  return headerSecret === CRON_SECRET || bearerSecret === CRON_SECRET
}

async function triggerRefresh() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or service role key for cron refresh')
  }

  const refreshUrl = new URL('/functions/v1/cwe-refresh', SUPABASE_URL)

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ manual_trigger: true })
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = `cwe-refresh Edge function returned ${response.status}`
    logger.error(message, undefined, { response: payload })
    throw new Error(message)
  }

  return payload
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await triggerRefresh()
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    logger.error('CWE refresh cron failed', error as any)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
