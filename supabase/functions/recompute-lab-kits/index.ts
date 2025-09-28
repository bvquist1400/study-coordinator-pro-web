/// <reference path="./deps.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'

const siteUrl = Deno.env.get('SITE_URL')
const jobToken = Deno.env.get('LAB_KIT_RECOMMENDATION_JOB_TOKEN')

serve(async () => {
  if (!siteUrl || !jobToken) {
    console.error('recompute-lab-kits: missing SITE_URL or LAB_KIT_RECOMMENDATION_JOB_TOKEN')
    return new Response('Server misconfigured', { status: 500 })
  }

  const endpoint = `${siteUrl.replace(/\/$/, '')}/api/lab-kit-recommendations/recompute-all`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jobToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      daysAhead: 60,
      studyStatuses: ['enrolling', 'active']
    })
  })

  const text = await response.text()

  if (!response.ok) {
    console.error('recompute-lab-kits: recompute failed', response.status, text)
    return new Response(text, { status: response.status })
  }

  console.log('recompute-lab-kits: recompute succeeded', text)
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  })
})
