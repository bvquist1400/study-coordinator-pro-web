'use client'

import React from 'react'

interface _LegendItem {
  color: string
  label: string
  description?: string
  percentage?: string
}

interface ComplianceLegendProps {
  type?: 'compliance' | 'status' | 'severity' | 'activity'
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  showDescriptions?: boolean
  className?: string
}

const LEGEND_CONFIGS = {
  compliance: [
    { 
      color: 'bg-green-500', 
      label: 'Excellent', 
      description: '90-100% compliance',
      percentage: '≥90%'
    },
    { 
      color: 'bg-blue-500', 
      label: 'Good', 
      description: '80-89% compliance',
      percentage: '80-89%'
    },
    { 
      color: 'bg-yellow-500', 
      label: 'Acceptable', 
      description: '70-79% compliance',
      percentage: '70-79%'
    },
    { 
      color: 'bg-red-500', 
      label: 'Poor', 
      description: 'Below 70% compliance',
      percentage: '<70%'
    }
  ],
  status: [
    { color: 'bg-green-600', label: 'Completed', description: 'Visit completed successfully' },
    { color: 'bg-blue-600', label: 'Scheduled', description: 'Visit scheduled for future' },
    { color: 'bg-yellow-600', label: 'Upcoming', description: 'Visit approaching soon' },
    { color: 'bg-red-600', label: 'Overdue', description: 'Visit past due date' },
    { color: 'bg-gray-600', label: 'Cancelled', description: 'Visit cancelled' },
    { color: 'bg-gray-700', label: 'Not Scheduled', description: 'Visit not yet scheduled' }
  ],
  severity: [
    { color: 'bg-red-500', label: 'High', description: 'Immediate attention required' },
    { color: 'bg-orange-500', label: 'Medium', description: 'Attention needed soon' },
    { color: 'bg-yellow-500', label: 'Low', description: 'Monitor for changes' },
    { color: 'bg-gray-500', label: 'Info', description: 'Informational only' }
  ],
  activity: [
    { color: 'bg-blue-500', label: 'Laboratory', description: 'Lab tests and sample collection' },
    { color: 'bg-purple-500', label: 'Blood Work', description: 'Blood sample collection' },
    { color: 'bg-green-500', label: 'IP Dispensing', description: 'Medication dispensing' },
    { color: 'bg-orange-500', label: 'Vitals', description: 'Vital signs assessment' },
    { color: 'bg-yellow-500', label: 'Physical Exam', description: 'Physical examination' },
    { color: 'bg-red-500', label: 'ECG', description: 'Electrocardiogram' },
    { color: 'bg-indigo-500', label: 'Questionnaire', description: 'Patient questionnaires' },
    { color: 'bg-teal-500', label: 'Imaging', description: 'Medical imaging' },
    { color: 'bg-pink-500', label: 'PK Sample', description: 'Pharmacokinetic sampling' }
  ]
}

export default function ComplianceLegend({ 
  type = 'compliance',
  orientation = 'horizontal',
  size = 'md',
  showDescriptions = false,
  className = ''
}: ComplianceLegendProps) {
  const items = LEGEND_CONFIGS[type] || []
  
  const sizeConfig = {
    sm: {
      dot: 'w-2 h-2',
      text: 'text-xs',
      spacing: orientation === 'horizontal' ? 'space-x-3' : 'space-y-1',
      itemSpacing: 'space-x-1'
    },
    md: {
      dot: 'w-3 h-3',
      text: 'text-sm',
      spacing: orientation === 'horizontal' ? 'space-x-4' : 'space-y-2',
      itemSpacing: 'space-x-2'
    },
    lg: {
      dot: 'w-4 h-4',
      text: 'text-base',
      spacing: orientation === 'horizontal' ? 'space-x-6' : 'space-y-3',
      itemSpacing: 'space-x-3'
    }
  }

  const config = sizeConfig[size]

  return (
    <div className={`${className}`}>
      <div className={`flex ${orientation === 'horizontal' ? 'flex-wrap' : 'flex-col'} ${config.spacing}`}>
        {items.map((item, index) => (
          <div 
            key={index} 
            className={`flex items-center ${config.itemSpacing} ${orientation === 'vertical' ? 'min-w-0' : ''}`}
          >
            <div className={`${config.dot} ${item.color} rounded-full flex-shrink-0`}></div>
            <div className="min-w-0">
              <div className={`${config.text} font-medium text-gray-200 flex items-center space-x-2`}>
                <span>{item.label}</span>
                {item.percentage && (
                  <span className="text-gray-400 font-normal">({item.percentage})</span>
                )}
              </div>
              {showDescriptions && item.description && (
                <div className={`${size === 'sm' ? 'text-xs' : 'text-xs'} text-gray-400 mt-0.5`}>
                  {item.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Tablet/Pill Visualization Legend - Shows tablet colors for IP tracking
 */
interface TabletLegendProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showCounts?: boolean
}

export function TabletLegend({ 
  className = '',
  size = 'md',
  showCounts = false 
}: TabletLegendProps) {
  const tabletItems = [
    { 
      color: 'bg-green-500', 
      borderColor: 'border-green-400',
      label: 'Taken (Compliant)', 
      description: 'Medication taken as prescribed',
      count: showCounts ? '85%' : undefined
    },
    { 
      color: 'bg-blue-500',
      borderColor: 'border-blue-400', 
      label: 'Dispensed', 
      description: 'Medication dispensed to patient',
      count: showCounts ? '120' : undefined
    },
    { 
      color: 'bg-yellow-500',
      borderColor: 'border-yellow-400', 
      label: 'Missed Doses', 
      description: 'Doses not taken as scheduled',
      count: showCounts ? '8' : undefined
    },
    { 
      color: 'bg-red-500',
      borderColor: 'border-red-400', 
      label: 'Returned', 
      description: 'Unused medication returned',
      count: showCounts ? '27' : undefined
    },
    { 
      color: 'bg-gray-500',
      borderColor: 'border-gray-400', 
      label: 'Expected', 
      description: 'Total expected doses',
      count: showCounts ? '150' : undefined
    }
  ]

  const sizeConfig = {
    sm: { tablet: 'w-4 h-3', text: 'text-xs', spacing: 'space-x-3' },
    md: { tablet: 'w-5 h-4', text: 'text-sm', spacing: 'space-x-4' },
    lg: { tablet: 'w-6 h-5', text: 'text-base', spacing: 'space-x-6' }
  }

  const config = sizeConfig[size]

  return (
    <div className={`bg-gray-800/30 rounded-lg p-4 ${className}`}>
      <h4 className={`${config.text} font-semibold text-gray-200 mb-3 flex items-center`}>
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v1a2 2 0 002 2h6a2 2 0 002 2v8a4 4 0 01-4 4H7z" />
        </svg>
        Tablet Color Legend
      </h4>
      <div className={`flex flex-wrap ${config.spacing}`}>
        {tabletItems.map((item, index) => (
          <div key={index} className="flex items-center space-x-2">
            {/* Tablet Shape */}
            <div className={`${config.tablet} ${item.color} ${item.borderColor} border-2 rounded-md flex-shrink-0`}></div>
            <div>
              <div className={`${config.text} font-medium text-gray-200 flex items-center space-x-1`}>
                <span>{item.label}</span>
                {item.count && (
                  <span className="text-gray-400 font-normal">({item.count})</span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                {item.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Compact Legend for small spaces
 */
interface CompactLegendProps {
  items: Array<{color: string, label: string}>
  className?: string
}

export function CompactLegend({ items, className = '' }: CompactLegendProps) {
  return (
    <div className={`flex flex-wrap gap-2 text-xs ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-1">
          <div className={`w-2 h-2 ${item.color} rounded-full`}></div>
          <span className="text-gray-300">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Legend with progress bars for percentages
 */
interface ProgressLegendProps {
  items: Array<{
    color: string
    label: string
    percentage: number
    value: number
    total: number
  }>
  className?: string
}

export function ProgressLegend({ items, className = '' }: ProgressLegendProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 ${item.color} rounded`}></div>
              <span className="text-gray-200">{item.label}</span>
            </div>
            <div className="text-gray-400">
              {item.value}/{item.total} ({item.percentage}%)
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div 
              className={`h-1.5 ${item.color} rounded-full transition-all duration-300`}
              style={{ width: `${item.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}