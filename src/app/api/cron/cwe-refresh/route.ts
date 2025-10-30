// src/app/api/cron/cwe-refresh/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/cwe-refresh`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ manual_trigger: true }),
      }
    )

    const data = await response.json()
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('❌ CWE refresh cron failed', error)
    return NextResponse.json({ ok: false, error: String(error) })
  }
}
