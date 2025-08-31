'use client'

import { useState, useEffect } from 'react'

interface Subject {
  id: string
  subject_number: string
  gender: string | null
  enrollment_date: string
  randomization_date: string | null
  treatment_arm: string | null
  status: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
  discontinuation_reason: string | null
  discontinuation_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface SubjectMetrics {
  total_visits: number
  completed_visits: number
  upcoming_visits: number
  overdue_visits: number
  last_visit_date: string | null
  last_visit_name: string | null
  next_visit_date: string | null
  next_visit_name: string | null
  visit_compliance_rate: number
  days_since_last_visit: number | null
  days_until_next_visit: number | null
}

interface SubjectCardProps {
  subject: Subject
  metrics: SubjectMetrics
  onClick: () => void
}

const statusColors = {
  screening: 'bg-yellow-900/30 text-yellow-300 border-yellow-600/50',
  active: 'bg-green-900/30 text-green-300 border-green-600/50',
  completed: 'bg-purple-900/30 text-purple-300 border-purple-600/50',
  discontinued: 'bg-red-900/30 text-red-300 border-red-600/50',
  withdrawn: 'bg-gray-900/30 text-gray-300 border-gray-600/50'
}

const statusLabels = {
  screening: 'Screening',
  active: 'Active',
  completed: 'Completed',
  discontinued: 'Discontinued',
  withdrawn: 'Withdrawn'
}

export default function SubjectCard({ subject, metrics, onClick }: SubjectCardProps) {
  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return 'text-green-400'
    if (rate >= 75) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getProgressColor = (completed: number, total: number) => {
    if (total === 0) return 'bg-gray-600'
    const percentage = (completed / total) * 100
    if (percentage >= 80) return 'bg-green-600'
    if (percentage >= 50) return 'bg-yellow-600'
    return 'bg-orange-600'
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getRelativeTime = (days: number | null, isFuture: boolean = false) => {
    if (days === null) return null
    if (days === 0) return isFuture ? 'Today' : 'Today'
    if (days === 1) return isFuture ? 'Tomorrow' : 'Yesterday'
    if (days < 7) return isFuture ? `In ${days} days` : `${days} days ago`
    if (days < 30) {
      const weeks = Math.floor(days / 7)
      return isFuture ? `In ${weeks} week${weeks > 1 ? 's' : ''}` : `${weeks} week${weeks > 1 ? 's' : ''} ago`
    }
    const months = Math.floor(days / 30)
    return isFuture ? `In ${months} month${months > 1 ? 's' : ''}` : `${months} month${months > 1 ? 's' : ''} ago`
  }

  const progressPercentage = metrics.total_visits > 0 ? (metrics.completed_visits / metrics.total_visits) * 100 : 0
  const hasAlerts = metrics.overdue_visits > 0 || (metrics.visit_compliance_rate < 75 && metrics.completed_visits > 0)

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-[1.02] transition-all duration-200 hover:shadow-xl hover:border-gray-600 cursor-pointer relative"
    >
      {/* Alert Badge */}
      {hasAlerts && (
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{subject.subject_number}</h3>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-xs font-medium rounded-full border ${statusColors[subject.status]}`}>
              {statusLabels[subject.status]}
            </span>
            {subject.treatment_arm && (
              <span className="text-sm text-gray-400">{subject.treatment_arm}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Enrolled</div>
          <div className="text-sm text-gray-300">{formatDate(subject.enrollment_date)}</div>
        </div>
      </div>

      {/* Visit Progress */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-300">Visit Progress</span>
          <span className="text-sm text-gray-400">
            {metrics.completed_visits}/{metrics.total_visits} visits
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${getProgressColor(metrics.completed_visits, metrics.total_visits)}`}
            style={{ width: `${Math.min(100, progressPercentage)}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Compliance */}
        {metrics.completed_visits > 0 && (
          <div className="text-center">
            <div className={`text-lg font-bold ${getComplianceColor(metrics.visit_compliance_rate)}`}>
              {Math.round(metrics.visit_compliance_rate)}%
            </div>
            <div className="text-xs text-gray-400">Visit Timing</div>
          </div>
        )}

        {/* Alerts */}
        {metrics.overdue_visits > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">
              {metrics.overdue_visits}
            </div>
            <div className="text-xs text-gray-400">Overdue</div>
          </div>
        )}

        {/* Upcoming */}
        {metrics.upcoming_visits > 0 && metrics.overdue_visits === 0 && (
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {metrics.upcoming_visits}
            </div>
            <div className="text-xs text-gray-400">Upcoming</div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-2">
        {metrics.last_visit_date && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Last visit:</span>
            <div className="text-right">
              <div className="text-gray-300">{metrics.last_visit_name || 'Visit'}</div>
              <div className="text-xs text-gray-500">
                {getRelativeTime(metrics.days_since_last_visit)}
              </div>
            </div>
          </div>
        )}

        {metrics.next_visit_date && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Next visit:</span>
            <div className="text-right">
              <div className={`text-gray-300 ${metrics.days_until_next_visit && metrics.days_until_next_visit < 0 ? 'text-red-400' : ''}`}>
                {metrics.next_visit_name || 'Visit'}
              </div>
              <div className="text-xs text-gray-500">
                {getRelativeTime(Math.abs(metrics.days_until_next_visit || 0), (metrics.days_until_next_visit || 0) >= 0)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Info */}
      <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
        <div className="flex items-center space-x-4 text-xs text-gray-400">
          {subject.gender && (
            <span>{subject.gender === 'M' ? 'Male' : subject.gender === 'F' ? 'Female' : subject.gender}</span>
          )}
          {subject.randomization_date && (
            <span>Randomized {formatDate(subject.randomization_date)}</span>
          )}
        </div>
        
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}