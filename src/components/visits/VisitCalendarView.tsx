'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Visit {
  id: string
  visit_name: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  is_within_window: boolean | null
  subject_number: string
  subject_id: string
}

interface VisitCalendarViewProps {
  studyId: string
  onVisitClick: (visitId: string) => void
  refreshKey?: number
  initialDate?: string
}

export default function VisitCalendarView({ studyId, onVisitClick, refreshKey, initialDate }: VisitCalendarViewProps) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialDate) {
      const parsed = new Date(initialDate)
      if (!isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  })
  const [loading, setLoading] = useState(true)

  const loadVisits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(
        `/api/subject-visits?studyId=${studyId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )

      if (response.ok) {
        const data = await response.json()
        setVisits(data.subjectVisits || [])
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('Failed loading visits:', response.status, err)
        setVisits([])
      }
    } catch (error) {
      console.error('Error loading visits:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadVisits()
  }, [loadVisits, currentDate, refreshKey])

  // If initialDate changes (e.g., navigation with a different ?date=), update current month
  useEffect(() => {
    if (initialDate) {
      const parsed = new Date(initialDate)
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed)
      }
    }
  }, [initialDate])

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    
    return days
  }

  const getVisitsForDate = (date: Date | null) => {
    if (!date) return []
    // Build local YYYY-MM-DD string to compare with DB date string
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const dateString = `${y}-${m}-${d}`
    return visits.filter(visit => (visit.visit_date || '').slice(0, 10) === dateString)
  }

  const getStatusColor = (status: string, isWithinWindow?: boolean | null) => {
    switch (status) {
      case 'completed':
        return isWithinWindow 
          ? 'bg-green-600 text-white' 
          : 'bg-yellow-600 text-white'
      case 'scheduled':
        return 'bg-blue-600 text-white'
      case 'missed':
        return 'bg-red-600 text-white'
      case 'cancelled':
        return 'bg-gray-600 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div>
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-700 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(35)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Calendar Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-md transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-6">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {dayNames.map(day => (
            <div key={day} className="text-center text-sm font-medium text-gray-400 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-2">
          {getDaysInMonth().map((date, index) => {
            const dayVisits = getVisitsForDate(date)
            const isToday = date && date.toDateString() === new Date().toDateString()
            
            return (
              <div
                key={index}
                className={`min-h-[100px] p-2 rounded-lg border ${
                  date 
                    ? isToday
                      ? 'bg-blue-900/20 border-blue-600'
                      : 'bg-gray-700/30 border-gray-600 hover:bg-gray-700/50'
                    : 'bg-transparent border-transparent'
                } transition-colors`}
              >
                {date && (
                  <>
                    <div className={`text-sm font-medium mb-2 ${
                      isToday ? 'text-blue-300' : 'text-gray-300'
                    }`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayVisits.slice(0, 3).map(visit => (
                        <button
                          key={visit.id}
                          onClick={() => onVisitClick(visit.id)}
                          className={`w-full text-xs px-2 py-1 rounded text-left truncate ${
                            getStatusColor(visit.status, visit.is_within_window)
                          } hover:opacity-80 transition-opacity`}
                          title={`${visit.subject_number} - ${visit.visit_name}`}
                        >
                          {visit.subject_number} - {visit.visit_name}
                        </button>
                      ))}
                      {dayVisits.length > 3 && (
                        <div className="text-xs text-gray-400 px-2">
                          +{dayVisits.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-6">
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-600 rounded"></div>
            <span className="text-gray-400">Scheduled</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-600 rounded"></div>
            <span className="text-gray-400">Completed (In Window)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-600 rounded"></div>
            <span className="text-gray-400">Completed (Out of Window)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-600 rounded"></div>
            <span className="text-gray-400">Missed</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-600 rounded"></div>
            <span className="text-gray-400">Cancelled</span>
          </div>
        </div>
      </div>
    </div>
  )
}
