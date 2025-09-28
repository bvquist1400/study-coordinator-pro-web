import { NextRequest, NextResponse } from 'next/server'

const JOB_TOKEN = process.env.LAB_KIT_RECOMMENDATION_JOB_TOKEN
const DEFAULT_BODY = {
  daysAhead: 60,
  studyStatuses: ['enrolling', 'active']
}

function resolveBaseUrl(): string {
  const explicit = process.env.CRON_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    const protocol = vercelUrl.startsWith('http') ? '' : 'https://'
    return `${protocol}${vercelUrl.replace(/\/$/, '')}`
  }
  return 'http://localhost:3000'
}

export async function GET(request: NextRequest) {
  if (!request.headers.get('x-vercel-cron')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!JOB_TOKEN) {
    return NextResponse.json({ error: 'Missing LAB_KIT_RECOMMENDATION_JOB_TOKEN' }, { status: 500 })
  }

  const baseUrl = resolveBaseUrl()
  const target = `${baseUrl}/api/lab-kit-recommendations/recompute-all`

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${JOB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(DEFAULT_BODY)
    })

    const text = await response.text()
    const contentType = response.headers.get('content-type') ?? 'application/json'

    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': contentType
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
