'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { VisitSchedule, Study } from '@/types/database'

interface ScheduleOfEventsBuilderProps {
  study: Study
  onSave?: (schedules: VisitSchedule[]) => void
}

interface Visit {
  id: string
  visitNumber: string
  visitName: string
  timingValue: number
  timingUnit: 'days' | 'weeks' | 'months'
  visitWindowBefore: number
  visitWindowAfter: number
  isNew?: boolean
}

interface Procedure {
  id: string
  category: string
  name: string
  visits: { [visitId: string]: boolean | 'X' | null }
}

const defaultVisits: Omit<Visit, 'id'>[] = [
  { visitNumber: 'S1', visitName: 'Screening', timingValue: -14, timingUnit: 'days', visitWindowBefore: 30, visitWindowAfter: 0 },
  { visitNumber: 'V1', visitName: 'Baseline', timingValue: 1, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 0 },
  { visitNumber: 'V2', visitName: 'Visit 2', timingValue: 4, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V3', visitName: 'Visit 3', timingValue: 13, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V4', visitName: 'Visit 4', timingValue: 26, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V5', visitName: 'Visit 5', timingValue: 39, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V6', visitName: 'Visit 6', timingValue: 52, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'ET', visitName: 'Early Term', timingValue: 0, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 0 },
  { visitNumber: 'FU', visitName: 'Follow-up', timingValue: 30, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 7 }
]

const defaultProcedures: Omit<Procedure, 'id'>[] = [
  // Laboratory
  { category: 'Laboratory', name: 'Local Labs', visits: {} },
  { category: 'Laboratory', name: 'Lab Kit', visits: {} },
  
  // Investigational Product
  { category: 'Investigational Product', name: 'Medication Dispensing', visits: {} }
]

export default function ScheduleOfEventsBuilder({ study, onSave }: ScheduleOfEventsBuilderProps) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingCell, setEditingCell] = useState<{ type: string; id: string; field?: string } | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')

  // Initialize with default data
  useEffect(() => {
    loadScheduleData()
  }, [study.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadScheduleData = async () => {
    try {
      // Use API route instead of direct Supabase call to handle RLS properly
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      let existingSchedules = null
      
      if (token) {
        try {
          const response = await fetch(`/api/visit-schedules?study_id=${study.id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            existingSchedules = data.visitSchedules
          }
        } catch (apiError) {
          console.warn('API error, trying direct database access:', apiError)
        }
      }
      
      // Fallback to direct Supabase call if API fails
      if (!existingSchedules) {
        const { data, error } = await supabase
          .from('visit_schedules')
          .select('*')
          .eq('study_id', study.id)
          .order('visit_number')
        
        if (error) throw error
        existingSchedules = data
      }
      
      console.log('Loaded existing schedules from DB:', existingSchedules)

      let visitsToUse: Visit[]
      let proceduresToUse: Procedure[]

      if (existingSchedules && existingSchedules.length > 0) {
        // Load existing data from database
        visitsToUse = existingSchedules.map((schedule, i) => {
          const visitDay = schedule.visit_day || 0
          
          // Convert visit_day back to timingValue and timingUnit
          let timingValue: number
          let timingUnit: 'days' | 'weeks' | 'months'
          
          if (visitDay === 0) {
            timingValue = 0
            timingUnit = 'days'
          } else if (visitDay < 0) {
            // Negative values are always in days
            timingValue = visitDay // Keep negative
            timingUnit = 'days'
          } else if (visitDay % 7 === 0) {
            // Positive values divisible by 7 are likely weeks
            timingValue = visitDay / 7
            timingUnit = 'weeks'
          } else {
            // Other positive values are days
            timingValue = visitDay
            timingUnit = 'days'
          }
          
          return {
            id: `visit-${i}`,
            visitNumber: `V${schedule.visit_number}`,
            visitName: schedule.visit_name,
            timingValue,
            timingUnit,
            visitWindowBefore: schedule.window_before_days,
            visitWindowAfter: schedule.window_after_days
          }
        })
        
        console.log('Converted visits for display:', visitsToUse)

        // Create procedures with saved procedure assignments
        proceduresToUse = defaultProcedures.map((p, i) => {
          const procedureWithId: Procedure = {
            ...p,
            id: `proc-${i}`,
            visits: {}
          }
          
          // Map procedures to visits based on saved data
          existingSchedules.forEach((schedule, visitIndex) => {
            const visitId = `visit-${visitIndex}`
            if (schedule.procedures.includes(p.name)) {
              procedureWithId.visits[visitId] = true
            }
          })
          
          return procedureWithId
        })
      } else {
        // Use default data for new studies
        visitsToUse = defaultVisits.map((v, i) => ({
          ...v,
          id: `visit-${i}`
        }))
        
        proceduresToUse = defaultProcedures.map((p, i) => {
          const procedureWithId: Procedure = {
            ...p,
            id: `proc-${i}`,
            visits: {}
          }
          
          // Set some default checkmarks for common procedures
          if (p.name === 'Local Labs') {
            visitsToUse.forEach((v, visitIndex) => {
              if (visitIndex > 0 && visitIndex < visitsToUse.length - 2) {
                procedureWithId.visits[v.id] = true
              }
            })
          }
          if (p.name === 'Medication Dispensing') {
            visitsToUse.forEach((v, visitIndex) => {
              if (visitIndex > 0 && visitIndex < visitsToUse.length - 1) {
                procedureWithId.visits[v.id] = true
              }
            })
          }
          
          return procedureWithId
        })
      }

      setVisits(visitsToUse)
      setProcedures(proceduresToUse)
    } catch (error) {
      console.error('Error loading schedule:', error)
      // Use defaults on error
      setVisits(defaultVisits.map((v, i) => ({ ...v, id: `visit-${i}` })))
      setProcedures(defaultProcedures.map((p, i) => ({ ...p, id: `proc-${i}`, visits: {} })))
    } finally {
      setIsLoading(false)
    }
  }

  const toggleProcedure = (procedureId: string, visitId: string) => {
    setProcedures(procedures.map(proc => {
      if (proc.id === procedureId) {
        const currentValue = proc.visits[visitId]
        const newValue = currentValue ? null : true
        return {
          ...proc,
          visits: {
            ...proc.visits,
            [visitId]: newValue
          }
        }
      }
      return proc
    }))
  }

  const addVisit = () => {
    const newVisitNumber = visits.length + 1
    const newVisit: Visit = {
      id: `visit-new-${Date.now()}`,
      visitNumber: `V${newVisitNumber}`,
      visitName: `Visit ${newVisitNumber}`,
      timingValue: 1,
      timingUnit: 'weeks',
      visitWindowBefore: 7,
      visitWindowAfter: 7,
      isNew: true
    }
    setVisits([...visits, newVisit])
  }

  // Remove unused functions to keep procedures fixed

  const updateVisit = (visitId: string, field: keyof Visit, value: string | number) => {
    setVisits(visits.map(v => 
      v.id === visitId ? { ...v, [field]: value } : v
    ))
  }

  const updateProcedure = (procedureId: string, field: keyof Procedure, value: string) => {
    setProcedures(procedures.map(p => 
      p.id === procedureId ? { ...p, [field]: value } : p
    ))
  }

  const saveSchedule = async () => {
    setIsSaving(true)
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        throw new Error('Authentication required')
      }

      // Convert visits to database format
      const visitSchedulesToSave = visits.map((visit, index) => {
        // Get procedures that are required for this visit
        const requiredProcedures = procedures
          .filter(proc => proc.visits[visit.id] === true || proc.visits[visit.id] === 'X')
          .map(proc => proc.name)

        return {
          study_id: study.id,
          visit_name: visit.visitName,
          visit_number: index + 1, // Sequential numbering
          visit_day: visit.timingUnit === 'days' ? visit.timingValue : visit.timingValue * 7,
          window_before_days: visit.visitWindowBefore,
          window_after_days: visit.visitWindowAfter,
          is_required: true, // Default to required
          visit_type: (visit.visitName.toLowerCase().includes('screening') ? 'screening' : 
                       visit.visitName.toLowerCase().includes('baseline') || visit.visitName.toLowerCase().includes('rand') ? 'baseline' :
                       visit.visitName.toLowerCase().includes('early') || visit.visitName.toLowerCase().includes('term') ? 'early_termination' :
                       visit.visitName.toLowerCase().includes('follow') || visit.visitName.toLowerCase().includes('unscheduled') ? 'unscheduled' : 
                       'regular') as 'screening' | 'baseline' | 'regular' | 'unscheduled' | 'early_termination',
          procedures: requiredProcedures,
          notes: null
        }
      })

      console.log('Saving visit schedules:', JSON.stringify(visitSchedulesToSave, null, 2))

      // Save via API route (handles RLS properly)
      const response = await fetch('/api/visit-schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          study_id: study.id,
          visit_schedules: visitSchedulesToSave
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('API Error Response:', errorData)
        console.error('Response status:', response.status)
        throw new Error(errorData.details || errorData.error || 'Failed to save schedule')
      }

      // Save notes if any
      if (notes.trim()) {
        // Could save notes to a separate table or study notes field
        console.log('Notes to save:', notes)
      }

      console.log('Schedule saved successfully!')
      
      if (onSave) {
        // onSave expects full VisitSchedule objects, but we're just saving
        // For now, just call it with empty array to indicate success
        onSave([])
      }
    } catch (error) {
      console.error('Error saving schedule:', error)
      alert('Error saving schedule. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent"></div>
        <span className="ml-3 text-gray-300">Loading schedule...</span>
      </div>
    )
  }

  const categories = Array.from(new Set(procedures.map(p => p.category)))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Schedule of Events</h3>
          <p className="text-gray-300 text-sm mt-1">
            Protocol: {study.protocol_number} - {study.study_title}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {showNotes ? 'Hide' : 'Show'} Notes
          </button>
          <button
            onClick={saveSchedule}
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {/* Main Schedule Table */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Header Rows */}
            <thead>
              
              {/* Visit Number Row */}
              <tr className="bg-gray-900/30 border-b border-gray-700">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Visit Number/Title
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600 min-w-[80px]">
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'number' ? (
                      <input
                        type="text"
                        value={visit.visitNumber}
                        onChange={(e) => updateVisit(visit.id, 'visitNumber', e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        className="w-full bg-gray-700 text-white text-sm px-1 py-0.5 rounded text-center"
                        autoFocus
                      />
                    ) : (
                      <div 
                        className="text-white font-semibold cursor-pointer hover:bg-gray-700 rounded px-1 py-0.5"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'number' })}
                      >
                        {visit.visitNumber}
                      </div>
                    )}
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'name' ? (
                      <input
                        type="text"
                        value={visit.visitName}
                        onChange={(e) => updateVisit(visit.id, 'visitName', e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        className="w-full mt-1 bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded"
                        autoFocus
                      />
                    ) : (
                      <div 
                        className="text-gray-400 text-xs mt-1 cursor-pointer hover:text-gray-200"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'name' })}
                      >
                        {visit.visitName}
                      </div>
                    )}
                  </th>
                ))}
                <th className="px-2 py-2">
                  <button
                    onClick={addVisit}
                    className="text-green-400 hover:text-green-300 text-xs"
                    title="Add Visit"
                  >
                    + Add
                  </button>
                </th>
              </tr>
              
              {/* Week/Day Row */}
              <tr className="bg-gray-900/30 border-b border-gray-700">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Week/Day
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600">
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'timing' ? (
                      <div 
                        className="space-y-1"
                        onMouseLeave={() => setEditingCell(null)}
                      >
                        <input
                          type="number"
                          value={visit.timingValue}
                          onChange={(e) => updateVisit(visit.id, 'timingValue', parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                          placeholder="#"
                          autoFocus
                        />
                        <select
                          value={visit.timingUnit}
                          onChange={(e) => updateVisit(visit.id, 'timingUnit', e.target.value)}
                          className="w-full bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                        >
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                          <option value="months">Months</option>
                        </select>
                      </div>
                    ) : (
                      <div 
                        className="text-gray-300 text-xs cursor-pointer hover:text-gray-100"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'timing' })}
                      >
                        <div className="font-semibold">{visit.timingValue}</div>
                        <div className="text-gray-400 capitalize">{visit.timingUnit}</div>
                      </div>
                    )}
                  </th>
                ))}
                <th></th>
              </tr>
              
              {/* Visit Window Row */}
              <tr className="bg-gray-900/30 border-b-2 border-gray-600">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Visit Window
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600">
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'window' ? (
                      <div 
                        className="space-y-1"
                        onBlur={(e) => {
                          // Only close if clicking outside the entire container
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setEditingCell(null)
                          }
                        }}
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span className="text-xs text-gray-400">-</span>
                          <input
                            type="number"
                            value={visit.visitWindowBefore}
                            onChange={(e) => updateVisit(visit.id, 'visitWindowBefore', parseInt(e.target.value) || 0)}
                            className="w-10 bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                            min="0"
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center justify-center space-x-1">
                          <span className="text-xs text-gray-400">+</span>
                          <input
                            type="number"
                            value={visit.visitWindowAfter}
                            onChange={(e) => updateVisit(visit.id, 'visitWindowAfter', parseInt(e.target.value) || 0)}
                            className="w-10 bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                            min="0"
                          />
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="text-gray-400 text-xs cursor-pointer hover:text-gray-200"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'window' })}
                      >
                        {visit.visitWindowBefore === 0 && visit.visitWindowAfter === 0 ? 'N/A' : `-${visit.visitWindowBefore}/+${visit.visitWindowAfter} days`}
                      </div>
                    )}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            
            {/* Procedures Body */}
            <tbody>
              {categories.map((category) => {
                const categoryProcedures = procedures.filter(p => p.category === category)
                
                return (
                  <React.Fragment key={category}>
                    {/* Category Header */}
                    <tr className="bg-gray-800/70">
                      <td colSpan={visits.length + 3} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-200">{category}</span>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Procedures in Category */}
                    {categoryProcedures.map((procedure, procIndex) => (
                      <tr 
                        key={procedure.id} 
                        className={`hover:bg-gray-700/30 ${procIndex % 2 === 0 ? 'bg-gray-800/20' : ''}`}
                      >
                        <td className="w-8 px-2 border-r border-gray-700">
                          {/* Fixed procedures - no remove button */}
                        </td>
                        <td className="px-4 py-2 border-r border-gray-700">
                          {editingCell?.type === 'procedure' && editingCell?.id === procedure.id ? (
                            <input
                              type="text"
                              value={procedure.name}
                              onChange={(e) => updateProcedure(procedure.id, 'name', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              className="w-full bg-gray-700 text-gray-200 px-2 py-1 rounded"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="text-gray-200 cursor-pointer hover:text-white"
                              onClick={() => setEditingCell({ type: 'procedure', id: procedure.id })}
                            >
                              {procedure.name}
                            </div>
                          )}
                        </td>
                        {visits.map(visit => (
                          <td 
                            key={visit.id} 
                            className="text-center border-r border-gray-700/50 hover:bg-gray-600/30 cursor-pointer"
                            onClick={() => toggleProcedure(procedure.id, visit.id)}
                          >
                            {procedure.visits[visit.id] && (
                              <span className="text-green-400 text-lg">✓</span>
                            )}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes Section */}
      {showNotes && (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h4 className="text-lg font-semibold text-white mb-3">Notes</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add schedule notes, footnotes, or special instructions..."
            className="w-full h-32 bg-gray-700/50 text-gray-200 rounded-lg p-3 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
          />
          <div className="mt-3 text-xs text-gray-400">
          </div>
        </div>
      )}
    </div>
  )
}