/* eslint-disable @typescript-eslint/no-explicit-any */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, any>
  stack?: string
  userId?: string
  sessionId?: string
  userAgent?: string
  url?: string
}

class Logger {
  private isDevelopment: boolean
  private sessionId: string
  private userId?: string

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development'
    this.sessionId = this.generateSessionId()
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  setUserId(userId: string) {
    this.userId = userId
  }

  private createLogEntry(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      context
    }

    if (this.userId) {
      entry.userId = this.userId
    }

    if (typeof window !== 'undefined') {
      entry.userAgent = window.navigator.userAgent
      entry.url = window.location.href
    }

    if (error) {
      entry.stack = error.stack
    }

    return entry
  }

  private logToConsole(entry: LogEntry) {
    if (!this.isDevelopment) return

    const style = this.getConsoleStyle(entry.level)
    const prefix = `[${entry.level.toUpperCase()}] ${entry.timestamp}`
    
    console.groupCollapsed(`%c${prefix} ${entry.message}`, style)
    
    if (entry.context) {
      console.table(entry.context)
    }
    
    if (entry.stack) {
      console.error('Stack trace:', entry.stack)
    }
    
    console.groupEnd()
  }

  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return 'color: #9CA3AF; font-weight: normal;'
      case 'info':
        return 'color: #3B82F6; font-weight: bold;'
      case 'warn':
        return 'color: #F59E0B; font-weight: bold;'
      case 'error':
        return 'color: #EF4444; font-weight: bold; background: #FEE2E2; padding: 2px 4px; border-radius: 3px;'
      default:
        return 'color: inherit;'
    }
  }

  private async logToService(entry: LogEntry) {
    // Only log errors to service, or all logs in production
    const shouldLogToService = !this.isDevelopment || entry.level === 'error'
    
    try {
      // Store in localStorage for development debugging
      if (typeof window !== 'undefined') {
        const logs = JSON.parse(localStorage.getItem('app_logs') || '[]')
        logs.push(entry)
        
        // Keep only last 100 logs to prevent storage bloat
        if (logs.length > 100) {
          logs.splice(0, logs.length - 100)
        }
        
        localStorage.setItem('app_logs', JSON.stringify(logs))
      }

      // Send to API endpoint if conditions are met
      if (shouldLogToService && typeof window !== 'undefined') {
        // Get auth token from supabase session
        const supabase = (await import('@/lib/supabase/client')).supabase
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.access_token) {
          fetch('/api/logs', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(entry)
          }).catch(error => {
            console.error('Failed to send log to API:', error)
          })
        }
      }
    } catch (error) {
      console.error('Failed to log to service:', error)
    }
  }

  debug(message: string, context?: Record<string, any>) {
    const entry = this.createLogEntry('debug', message, context)
    this.logToConsole(entry)
    this.logToService(entry)
  }

  info(message: string, context?: Record<string, any>) {
    const entry = this.createLogEntry('info', message, context)
    this.logToConsole(entry)
    this.logToService(entry)
  }

  warn(message: string, context?: Record<string, any>) {
    const entry = this.createLogEntry('warn', message, context)
    this.logToConsole(entry)
    this.logToService(entry)
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    const entry = this.createLogEntry('error', message, context, error)
    this.logToConsole(entry)
    this.logToService(entry)
  }

  // Specific methods for common scenarios
  apiError(endpoint: string, error: Error, context?: Record<string, any>) {
    this.error(`API Error: ${endpoint}`, error, {
      endpoint,
      ...context
    })
  }

  userAction(action: string, context?: Record<string, any>) {
    this.info(`User Action: ${action}`, {
      action,
      ...context
    })
  }

  performance(operation: string, duration: number, context?: Record<string, any>) {
    this.debug(`Performance: ${operation} took ${duration}ms`, {
      operation,
      duration,
      ...context
    })
  }

  // Method to get logs for debugging (development only)
  getLogs(): LogEntry[] {
    if (!this.isDevelopment || typeof window === 'undefined') {
      return []
    }
    
    try {
      return JSON.parse(localStorage.getItem('app_logs') || '[]')
    } catch {
      return []
    }
  }

  // Clear logs
  clearLogs() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('app_logs')
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export for testing
export { Logger }