
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

const DEFAULT_MAX_PAYLOAD = Number(process.env.LOG_MAX_PAYLOAD || 4096)
const ENABLE_REDACTION = (process.env.LOG_REDACT || (process.env.NODE_ENV === 'production' ? 'on' : 'off')) !== 'off'
const LOG_TO_SERVICE = (process.env.LOG_TO_SERVICE || (process.env.NODE_ENV === 'production' ? 'on' : 'off')) !== 'off'
const LOG_SAMPLE_RATE = Math.max(0, Math.min(1, Number(process.env.LOG_SAMPLE_RATE ?? '1')))

type RedactOptions = {
  maxLen?: number
  aggressive?: boolean
}

const SENSITIVE_KEYS = [
  'authorization','access_token','refresh_token','token','jwt','apiKey','supabaseKey',
  'email','full_name','ip_id','return_ip_id','accession_number','password','secret','ssn','subject_number','user_id','idToken'
]

function maskEmail(value: string) {
  const [user, domain] = value.split('@')
  if (!domain) return '[REDACTED]'
  const first = user.slice(0, 1)
  return `${first}${'*'.repeat(Math.max(0, user.length - 1))}@${domain}`
}

function maskIdLike(value: string) {
  if (value.length <= 4) return '****'
  const keep = Math.min(6, Math.floor(value.length / 3))
  return `${value.slice(0, keep)}${'*'.repeat(Math.max(4, value.length - keep))}`
}

function shouldRedactKey(key: string) {
  const k = key.toLowerCase()
  return SENSITIVE_KEYS.some(s => k.includes(s))
}

function redactValueByKey(key: string, value: any) {
  if (value == null) return value
  const k = key.toLowerCase()
  if (k.includes('email') && typeof value === 'string') return maskEmail(value)
  if (k.includes('authorization') || k.includes('token') || k.includes('apikey') || k.includes('key') || k.includes('password') || k.includes('secret')) return '[REDACTED]'
  if (k.includes('ip_id') || k.includes('return_ip_id') || k.includes('accession') || k.includes('subject_number') || k === 'user_id') {
    if (typeof value === 'string') return maskIdLike(value)
    return '[REDACTED]'
  }
  return value
}

export function redact(obj: any, options: RedactOptions = {}) {
  if (!ENABLE_REDACTION) return obj
  const maxLen = options.maxLen ?? DEFAULT_MAX_PAYLOAD
  const seen = new WeakSet()

  function limitStr(s: string) {
    if (s.length <= maxLen) return s
    return s.slice(0, maxLen) + `…[truncated ${s.length - maxLen}]`
  }

  function walk(input: any, parentKey?: string, depth = 0): any {
    if (input == null) return input
    if (depth > 5) return '[Depth limit]'
    if (typeof input === 'string') return parentKey ? redactValueByKey(parentKey, limitStr(input)) : limitStr(input)
    if (typeof input !== 'object') return input
    if (seen.has(input)) return '[Circular]'
    seen.add(input)

    if (Array.isArray(input)) {
      const out: any[] = []
      const limit = Math.min(input.length, 100)
      for (let i = 0; i < limit; i++) out.push(walk(input[i], parentKey, depth + 1))
      if (input.length > limit) out.push(`[+${input.length - limit} more]`)
      return out
    }

    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(input)) {
      if (shouldRedactKey(k)) {
        out[k] = redactValueByKey(k, v)
      } else {
        out[k] = walk(v, k, depth + 1)
      }
    }
    return out
  }

  return walk(obj)
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
      context: context ? (ENABLE_REDACTION ? redact(context) : context) : undefined
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
    // Only log errors to service in dev; all logs in prod (sampled/toggleable)
    const shouldLogToService = (!this.isDevelopment && LOG_TO_SERVICE) || (this.isDevelopment && entry.level === 'error' && LOG_TO_SERVICE)
    if (!shouldLogToService) return
    // Sampling guard
    if (LOG_SAMPLE_RATE < 1 && Math.random() > LOG_SAMPLE_RATE) return
    
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

      // Send to API endpoint if conditions are met (client-side only)
      if (typeof window !== 'undefined') {
        // Get auth token from supabase session
        const supabase = (await import('@/lib/supabase/client')).supabase
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.access_token) {
          const redacted = ENABLE_REDACTION ? redact(entry) : entry
          fetch('/api/logs', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(redacted)
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
