import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api/auth'

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
    console.group(`📊 Client Log - ${logData.level.toUpperCase()}`)
    console.log('Message:', logData.message)
    console.log('User:', user?.email)
    console.log('Timestamp:', logData.timestamp)
    
    if (logData.context) {
      console.log('Context:', logData.context)
    }
    
    if (logData.stack) {
      console.error('Stack:', logData.stack)
    }
    
    console.groupEnd()

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
    console.error('Error processing log:', error)
    return NextResponse.json({ error: 'Failed to process log entry' }, { status: 500 })
  }
}