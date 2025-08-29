'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import ErrorBoundary from './ErrorBoundary'

interface Props {
  children?: ReactNode
  apiEndpoint?: string
}

interface State {
  hasError: boolean
  error?: Error
  isNetworkError?: boolean
}

export default class ApiErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): State {
    const isNetworkError = error.message.includes('fetch') || 
                          error.message.includes('network') || 
                          error.message.includes('Failed to fetch')
    
    return { 
      hasError: true, 
      error,
      isNetworkError 
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ApiErrorBoundary caught an error:', error, errorInfo)
    
    // Log API-specific error details
    const apiErrorData = {
      endpoint: this.props.apiEndpoint,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      isNetworkError: this.state.isNetworkError,
      timestamp: new Date().toISOString()
    }

    console.group('🔌 API Error Boundary - API Error Details')
    console.table(apiErrorData)
    console.groupEnd()

    // TODO: Send to API error tracking service
  }

  private getErrorMessage = () => {
    if (this.state.isNetworkError) {
      return "Unable to connect to the server. Please check your internet connection."
    }
    
    if (this.state.error?.message.includes('401')) {
      return "Your session has expired. Please log in again."
    }
    
    if (this.state.error?.message.includes('403')) {
      return "You don't have permission to access this resource."
    }
    
    if (this.state.error?.message.includes('404')) {
      return "The requested resource was not found."
    }
    
    if (this.state.error?.message.includes('500')) {
      return "Server error occurred. Please try again later."
    }
    
    return "An error occurred while communicating with the server."
  }

  private getErrorIcon = () => {
    if (this.state.isNetworkError) {
      return (
        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    }
    
    return (
      <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  public render() {
    if (this.state.hasError) {
      const customFallback = (
        <div className="bg-red-900/20 border border-red-700 rounded-2xl p-6 text-center">
          <div className="text-red-400 mb-4">
            {this.getErrorIcon()}
          </div>
          
          <h3 className="text-lg font-bold text-white mb-2">API Error</h3>
          <p className="text-gray-300 mb-4 text-sm">
            {this.getErrorMessage()}
          </p>
          
          {this.props.apiEndpoint && (
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-400 font-mono">
                Endpoint: {this.props.apiEndpoint}
              </p>
            </div>
          )}
          
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Retry Request
          </button>
        </div>
      )

      return (
        <ErrorBoundary fallback={customFallback}>
          {this.props.children}
        </ErrorBoundary>
      )
    }

    return (
      <ErrorBoundary>
        {this.props.children}
      </ErrorBoundary>
    )
  }
}