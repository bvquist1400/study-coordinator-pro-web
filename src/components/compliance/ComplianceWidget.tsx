'use client'

import { 
  ComplianceResult,
  getComplianceColor,
  getComplianceLabel 
} from '@/lib/compliance-calculator'

interface ComplianceWidgetProps {
  compliance: ComplianceResult
  title: string
  subtitle?: string
  showDetails?: boolean
  compact?: boolean
}

export default function ComplianceWidget({ 
  compliance, 
  title, 
  subtitle,
  showDetails = false,
  compact = false 
}: ComplianceWidgetProps) {
  if (compact) {
    return (
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComplianceColor(compliance.status)}`}>
        <div className="flex items-center space-x-2">
          <span>{compliance.percentage}%</span>
          <span className="opacity-75">{getComplianceLabel(compliance.status)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border-2 p-4 ${getComplianceColor(compliance.status)}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-semibold text-sm">{title}</h4>
          {subtitle && <p className="text-xs opacity-75">{subtitle}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{compliance.percentage}%</div>
          <div className="text-xs opacity-75">{getComplianceLabel(compliance.status)}</div>
        </div>
      </div>

      {showDetails && (compliance.deviations.length > 0 || compliance.recommendations.length > 0) && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-20">
          {compliance.deviations.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium mb-1">Issues:</p>
              <ul className="text-xs space-y-1 opacity-75">
                {compliance.deviations.slice(0, 2).map((deviation, index) => (
                  <li key={index}>• {deviation}</li>
                ))}
                {compliance.deviations.length > 2 && (
                  <li>• +{compliance.deviations.length - 2} more...</li>
                )}
              </ul>
            </div>
          )}

          {compliance.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Actions:</p>
              <ul className="text-xs space-y-1 opacity-75">
                {compliance.recommendations.slice(0, 2).map((recommendation, index) => (
                  <li key={index}>• {recommendation}</li>
                ))}
                {compliance.recommendations.length > 2 && (
                  <li>• +{compliance.recommendations.length - 2} more...</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compliance Status Indicator - Simple dot indicator
 */
interface ComplianceIndicatorProps {
  status: ComplianceResult['status']
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function ComplianceIndicator({ status, size = 'md', showLabel = false }: ComplianceIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3', 
    lg: 'w-4 h-4'
  }

  const colorClasses = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    acceptable: 'bg-yellow-500',
    poor: 'bg-red-500'
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`rounded-full ${sizeClasses[size]} ${colorClasses[status]}`}></div>
      {showLabel && (
        <span className="text-sm font-medium">{getComplianceLabel(status)}</span>
      )}
    </div>
  )
}

/**
 * Compliance Progress Bar
 */
interface ComplianceProgressBarProps {
  percentage: number
  status: ComplianceResult['status']
  height?: 'sm' | 'md' | 'lg'
  showPercentage?: boolean
}

export function ComplianceProgressBar({ 
  percentage, 
  status, 
  height = 'md',
  showPercentage = true 
}: ComplianceProgressBarProps) {
  const heightClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  }

  const colorClasses = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    acceptable: 'bg-yellow-500',
    poor: 'bg-red-500'
  }

  return (
    <div className="space-y-1">
      <div className={`w-full rounded-full bg-gray-800/60 ${heightClasses[height]} overflow-hidden`}>
        <div
          className={`${heightClasses[height]} ${colorClasses[status]} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        ></div>
      </div>
      {showPercentage && (
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span className="font-medium text-gray-200">{percentage}%</span>
          <span className="capitalize">{getComplianceLabel(status)}</span>
        </div>
      )}
    </div>
  )
}
