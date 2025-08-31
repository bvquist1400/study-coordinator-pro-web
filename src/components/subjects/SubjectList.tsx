'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import SubjectCard from './SubjectCard'

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
  metrics?: SubjectMetrics
}

interface SubjectListProps {
  studyId: string
  onSubjectClick: (subjectId: string) => void
  refreshKey?: number
}

const statusColors = {
  screening: 'bg-yellow-900/50 text-yellow-300 border-yellow-600',
  active: 'bg-green-900/50 text-green-300 border-green-600',
  completed: 'bg-purple-900/50 text-purple-300 border-purple-600',
  discontinued: 'bg-red-900/50 text-red-300 border-red-600',
  withdrawn: 'bg-gray-900/50 text-gray-300 border-gray-600'
}

const statusLabels = {
  screening: 'Screening',
  active: 'Active',
  completed: 'Completed',
  discontinued: 'Discontinued',
  withdrawn: 'Withdrawn'
}

export default function SubjectList({ studyId, onSubjectClick, refreshKey }: SubjectListProps) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const loadSubjects = useCallback(async () => {
    try {
      setLoading(true)
      
      // Get the auth session
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!session?.user) {
        console.error('No authenticated user')
        setLoading(false)
        return
      }

      // Try API first with enhanced metrics
      if (token) {
        try {
          const response = await fetch(`/api/subjects?study_id=${studyId}&include_metrics=true`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })

          if (response.ok) {
            const { subjects } = await response.json()
            setSubjects(subjects || [])
            setLoading(false)
            return
          }
        } catch (apiError) {
          console.warn('API error, trying direct database access:', apiError)
        }
      }

      // Fallback: Direct database access
      const { data: subjects, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('study_id', studyId)
        .order('subject_number')

      if (error) {
        console.error('Database error:', error)
      } else {
        setSubjects(subjects || [])
      }

    } catch (error) {
      console.error('Error loading subjects:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    if (studyId) {
      loadSubjects()
    }
  }, [studyId, refreshKey, loadSubjects])


  const filteredSubjects = subjects.filter(subject => {
    const matchesStatus = statusFilter === 'all' || subject.status === statusFilter
    const matchesSearch = !searchTerm || 
      subject.subject_number.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesStatus && matchesSearch
  })

  // Removed unused formatDate to reduce lint warnings


  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-700 rounded"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search subjects by number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="screening">Screening</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="discontinued">Discontinued</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(statusLabels).map(([status, label]) => {
          const count = subjects.filter(s => s.status === status).length
          return (
            <div
              key={status}
              className={`p-3 rounded-lg border ${statusColors[status as keyof typeof statusColors]}`}
            >
              <div className="text-lg font-bold">{count}</div>
              <div className="text-xs opacity-75">{label}</div>
            </div>
          )
        })}
      </div>

      {/* Subject Cards Grid */}
      {filteredSubjects.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredSubjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              metrics={subject.metrics || {
                total_visits: 0,
                completed_visits: 0,
                upcoming_visits: 0,
                overdue_visits: 0,
                last_visit_date: null,
                last_visit_name: null,
                next_visit_date: null,
                next_visit_name: null,
                visit_compliance_rate: 0,
                days_since_last_visit: null,
                days_until_next_visit: null
              }}
              onClick={() => onSubjectClick(subject.id)}
            />
          ))}
        </div>
      ) : (
        /* No Subjects State */
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">
            {searchTerm || statusFilter !== 'all' ? 'No subjects match your filters' : 'No subjects enrolled yet'}
          </div>
          <p className="text-gray-400 text-sm mt-2">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search or filter criteria.'
              : 'Click "Add Subject" to enroll your first subject in this study.'
            }
          </p>
        </div>
      )}
    </div>
  )
}
