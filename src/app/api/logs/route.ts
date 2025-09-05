import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api/auth'
import { redact } from '@/lib/logger'
import logger from '@/lib/logger'

// POST /api/logs - Log client-side errors
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError) {
      return NextResponse.json({ error: authError }, { status })
    }

    const logData = await request.json()
    
    // Validate log data
    if (!logData.level || !logData.message || !logData.timestamp) {
      return NextResponse.json({ 
        error: 'Missing required fields: level, message, timestamp' 
      }, { status: 400 })
    }

    // Enhanced log data with server context (for future external service integration)
    // const enhancedLogData = {
    //   ...logData,
    //   userId: user.id,
    //   userEmail: user.email,
    //   serverTimestamp: new Date().toISOString(),
    //   ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    //   userAgent: request.headers.get('user-agent') || 'unknown'
    // }

    // Log to console (in production, send to external service)
    const safeLog = redact({
      level: String(logData.level || ''),
      message: String(logData.message || ''),
      timestamp: String(logData.timestamp || ''),
      context: logData.context || undefined,
      stack: logData.stack || undefined,
      user: user?.email || user?.id || 'unknown',
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    })

    // Route through structured logger to satisfy lint rules
    const lvl = String(logData.level || '').toLowerCase()
    const msg = String(safeLog['message'] || '')
    const ctx = { ...safeLog }
    if (lvl === 'error') {
      logger.error(msg, undefined, ctx as any)
    } else if (lvl === 'warn' || lvl === 'warning') {
      logger.warn(msg, ctx as any)
    } else if (lvl === 'debug') {
      logger.debug(msg, ctx as any)
    } else {
      logger.info(msg, ctx as any)
    }

    // TODO: In production, send to external logging service
    // Examples:
    // - Send to Sentry
    // - Send to LogRocket
    // - Send to DataDog
    // - Store in database for analysis
    
    // For now, we'll just acknowledge receipt
    return NextResponse.json({ 
      success: true, 
      message: 'Log entry received',
      logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })

  } catch (error) {
    logger.error('Error processing client log', error as any)
    return NextResponse.json({ error: 'Failed to process log entry' }, { status: 500 })
  }
}
