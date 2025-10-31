import logger from '@/lib/logger'

const WEBHOOK_ENV_KEYS = [
  'CWE_CRON_ALERT_WEBHOOK_URL',
  'CWE_ALERT_WEBHOOK_URL',
  'SLACK_WEBHOOK_URL'
] as const

const MAX_CONTEXT_LENGTH = 2900

function resolveWebhookUrl() {
  for (const key of WEBHOOK_ENV_KEYS) {
    const value = process.env[key]
    if (value) return value
  }
  return null
}

function formatContext(context: Record<string, unknown> | undefined) {
  if (!context) return undefined
  try {
    const serialized = JSON.stringify(context, null, 2)
    if (!serialized) return undefined
    return serialized.length > MAX_CONTEXT_LENGTH
      ? `${serialized.slice(0, MAX_CONTEXT_LENGTH)}…`
      : serialized
  } catch (error) {
    logger.warn('Failed to serialize cron alert context', error as any)
    return undefined
  }
}

export async function sendCronAlert(
  message: string,
  context?: Record<string, unknown>
) {
  const webhookUrl = resolveWebhookUrl()
  if (!webhookUrl) {
    return
  }

  const contextText = formatContext(context)

  try {
    const body = {
      text: message,
      attachments: contextText
        ? [
            {
              color: '#f87171',
              text: `\`\`\`\n${contextText}\n\`\`\``
            }
          ]
        : undefined
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } catch (error) {
    logger.warn('Failed to send cron alert', error as any)
  }
}
