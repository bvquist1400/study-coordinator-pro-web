import { useCallback } from 'react'
import { logger } from '@/lib/logger'

export interface ErrorHandlerOptions {
  logLevel?: 'warn' | 'error'
  showToast?: boolean
  context?: Record<string, unknown>
}

export interface ApiError {
  message: string
  status?: number
  endpoint?: string
  details?: unknown
}

export function useErrorHandler() {
  const handleError = useCallback((error: Error | ApiError | string, options: ErrorHandlerOptions = {}) => {
    const {
      logLevel = 'error',
      showToast = false,
      context = {}
    } = options

    // Normalize error to Error object
    let normalizedError: Error
    let errorContext = { ...context }

    if (typeof error === 'string') {
      normalizedError = new Error(error)
    } else if ('status' in error) {
      // ApiError
      normalizedError = new Error(error.message)
      errorContext = {
        ...errorContext,
        status: error.status,
        endpoint: error.endpoint,
        details: error.details
      }
    } else {
      // Error object
      normalizedError = error instanceof Error ? error : new Error('Unknown error')
    }

    // Log the error
    if (logLevel === 'error') {
      logger.error(normalizedError.message, normalizedError, errorContext)
    } else {
      logger.warn(normalizedError.message, errorContext)
    }

    // Show toast notification if requested
    if (showToast && typeof window !== 'undefined') {
      // TODO: Integrate with toast notification system when implemented
      console.log('Toast would show:', normalizedError.message)
    }

    return normalizedError
  }, [])

  const handleApiError = useCallback(async (response: Response, endpoint: string, context: Record<string, unknown> = {}) => {
    let errorDetails
    try {
      errorDetails = await response.json()
    } catch {
      errorDetails = { message: 'Failed to parse error response' }
    }

    const apiError: ApiError = {
      message: errorDetails.error || errorDetails.message || `API Error: ${response.status}`,
      status: response.status,
      endpoint,
      details: errorDetails
    }

    return handleError(apiError, {
      logLevel: 'error',
      showToast: true,
      context: {
        ...context,
        responseStatus: response.status,
        responseStatusText: response.statusText
      }
    })
  }, [handleError])

  const handleAsyncError = useCallback(<T>(
    asyncFn: () => Promise<T>,
    errorMessage: string = 'An error occurred',
    context: Record<string, unknown> = {}
  ) => {
    return async (): Promise<T | null> => {
      try {
        return await asyncFn()
      } catch (error) {
        handleError(error as Error, {
          logLevel: 'error',
          showToast: true,
          context: {
            ...context,
            operation: errorMessage
          }
        })
        return null
      }
    }
  }, [handleError])

  const logUserAction = useCallback((action: string, context: Record<string, unknown> = {}) => {
    logger.userAction(action, context)
  }, [])

  const logPerformance = useCallback((operation: string, startTime: number, context: Record<string, unknown> = {}) => {
    const duration = Date.now() - startTime
    logger.performance(operation, duration, context)
  }, [])

  return {
    handleError,
    handleApiError,
    handleAsyncError,
    logUserAction,
    logPerformance
  }
}