'use client'

import { useEffect, useState } from 'react'

export interface DrugCycleEntry {
  id: string
  drug_label: string // code or name; server resolves to study_drugs
  drug_id?: string
  bottles?: number
  tablets_per_bottle?: number
  tablets_dispensed?: number // overrides bottles * tablets_per_bottle
  start_date?: string
  tablets_returned?: number
  last_dose_date?: string
}

interface PerDrugEntryProps {
  cycles: DrugCycleEntry[]
  onChange: (cycles: DrugCycleEntry[]) => void
  disabled?: boolean
  className?: string
  defaultStartDate?: string
  defaultLastDoseDate?: string
  drugOptions?: Array<{ id: string; code: string; name: string }>
  priorCompletedVisitDate?: string
}

export default function PerDrugEntry({
  cycles,
  onChange,
  disabled = false,
  className = '',
  defaultStartDate,
  defaultLastDoseDate,
  drugOptions = [],
  priorCompletedVisitDate
}: PerDrugEntryProps) {
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({})
  const addCycle = () => {
    const nowId = Date.now().toString()
    const newCycle: DrugCycleEntry = {
      id: nowId,
      drug_label: '',
      bottles: 1,
      tablets_per_bottle: 30,
      tablets_dispensed: undefined,
      start_date: defaultStartDate || '',
      tablets_returned: 0,
      last_dose_date: defaultLastDoseDate || ''
    }
    // If there is exactly one study drug, auto-select it
    if (drugOptions.length === 1) {
      newCycle.drug_id = drugOptions[0].id
      newCycle.drug_label = `${drugOptions[0].name}`
    }
    onChange([...(cycles || []), newCycle])
  }

  const removeCycle = (id: string) => {
    onChange((cycles || []).filter(c => c.id !== id))
  }

  // If there is exactly one study drug, auto-select it for any cycle missing a selection
  useEffect(() => {
    if (drugOptions.length !== 1 || (cycles || []).length === 0) return
    const only = drugOptions[0]
    let changed = false
    const updated = (cycles || []).map(c => {
      if (!c.drug_id) {
        changed = true
        return { ...c, drug_id: only.id, drug_label: `${only.name}` }
      }
      return c
    })
    if (changed) onChange(updated)
  }, [drugOptions, cycles, onChange])

  const updateCycle = (id: string, field: keyof DrugCycleEntry, value: string | number | undefined) => {
    onChange((cycles || []).map(c => {
      if (c.id !== id) return c
      const updated = { ...c, [field]: value }
      // Always auto-calc tablets_dispensed from bottles * tablets_per_bottle when either changes
      if (field === 'bottles' || field === 'tablets_per_bottle') {
        const b = Number(updated.bottles || 0)
        const t = Number(updated.tablets_per_bottle || 0)
        updated.tablets_dispensed = b > 0 && t > 0 ? b * t : 0
      }
      return updated
    }))
  }

  const updateCycleFields = (id: string, updates: Partial<DrugCycleEntry>) => {
    onChange((cycles || []).map(c => {
      if (c.id !== id) return c
      const updated: DrugCycleEntry = { ...c, ...updates }
      // Auto-calc tablets_dispensed if bottles or tablets_per_bottle included in updates
      if (Object.prototype.hasOwnProperty.call(updates, 'bottles') || Object.prototype.hasOwnProperty.call(updates, 'tablets_per_bottle')) {
        const b = Number(updated.bottles || 0)
        const t = Number(updated.tablets_per_bottle || 0)
        updated.tablets_dispensed = b > 0 && t > 0 ? b * t : 0
      }
      return updated
    }))
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-end">
        {!disabled && (
          <button
            type="button"
            onClick={addCycle}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
          >
            + Add another drug
          </button>
        )}
      </div>

      {(cycles || []).length === 0 ? (
        <div className="text-gray-500 text-sm italic">No drug entries</div>
      ) : (
        <div className="space-y-3">
          {(cycles || []).map((c, idx) => (
            <div key={c.id} className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
              <div className="flex items-start justify-between mb-3">
                <div className="text-sm text-gray-400">Entry #{idx + 1}</div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeCycle(c.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Remove entry"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Drug selection */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-12">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Drug *</label>
                  {disabled ? (
                    <div className="text-gray-100 text-sm">{c.drug_label || '-'}</div>
                  ) : (
                    <select
                      value={c.drug_id || ''}
                      onChange={(e) => {
                        const selected = drugOptions.find(d => d.id === e.target.value)
                        updateCycleFields(c.id, {
                          drug_id: e.target.value || undefined,
                          drug_label: selected ? `${selected.name}` : ''
                        })
                      }}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select a drug…</option>
                      {drugOptions.map(d => (
                        <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Dispense and Return sections */}
                <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Dispensed previously */}
                  <div className="md:col-span-7 bg-gray-800/40 rounded-md p-3 border border-gray-600/50">
                    <div className="text-xs font-semibold text-gray-300 mb-2">Dispensed previously</div>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Total Tablets Dispensed *</label>
                        {disabled ? (
                          <div className="text-gray-100 text-sm">{c.tablets_dispensed ?? '-'}</div>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={c.tablets_dispensed ?? 0}
                            onChange={(e) => updateCycle(c.id, 'tablets_dispensed', Number(e.target.value) || 0)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="e.g., 30"
                          />
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">From last dispensing. Edit if needed.</div>
                      </div>
                      <div className="md:col-span-3 flex items-end">
                        <button
                          type="button"
                          className="text-xs text-gray-300 hover:text-white"
                          onClick={() => setAdvancedOpen(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                        >
                          {advancedOpen[c.id] ? 'Hide Advanced' : 'Show Advanced (bottles × tablets)'}
                        </button>
                      </div>
                      {advancedOpen[c.id] && (
                        <div className="md:col-span-6 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1"># Bottles</label>
                            {disabled ? (
                              <div className="text-gray-100 text-sm">{c.bottles ?? '-'}</div>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={c.bottles ?? ''}
                                onChange={(e) => updateCycle(c.id, 'bottles', Number(e.target.value) || 0)}
                                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="1"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Tablets/Bottle</label>
                            {disabled ? (
                              <div className="text-gray-100 text-sm">{c.tablets_per_bottle ?? '-'}</div>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={c.tablets_per_bottle ?? ''}
                                onChange={(e) => updateCycle(c.id, 'tablets_per_bottle', Number(e.target.value) || 0)}
                                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="30"
                              />
                            )}
                          </div>
                          <div className="col-span-2 text-[10px] text-gray-400">Total is auto-calculated when bottles and tablets/bottle are provided.</div>
                        </div>
                      )}
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Start Date *</label>
                        {disabled ? (
                          <div className="text-gray-100 text-sm">{c.start_date || '-'}</div>
                        ) : (
                          <input
                            type="date"
                            value={c.start_date || ''}
                            onChange={(e) => updateCycle(c.id, 'start_date', e.target.value)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                        {priorCompletedVisitDate && (
                          <div className="text-[10px] text-gray-400 mt-1">Suggestion: Prior completed visit {priorCompletedVisitDate}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Return From Previous Visit */}
                  <div className="md:col-span-5 bg-gray-800/40 rounded-md p-3 border border-gray-600/50">
                    <div className="text-xs font-semibold text-gray-300 mb-2">Returned today</div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Tablets Returned</label>
                        {disabled ? (
                          <div className="text-gray-100 text-sm">{c.tablets_returned ?? 0}</div>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={c.tablets_returned ?? 0}
                            onChange={(e) => updateCycle(c.id, 'tablets_returned', Number(e.target.value) || 0)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="0"
                          />
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">Count returned tablets during today’s visit.</div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Last Dose Date</label>
                        {disabled ? (
                          <div className="text-gray-100 text-sm">{c.last_dose_date || '-'}</div>
                        ) : (
                          <input
                            type="date"
                            value={c.last_dose_date || ''}
                            onChange={(e) => updateCycle(c.id, 'last_dose_date', e.target.value)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      
                    </div>
                  </div>
                </div>
              </div>

              {!disabled && (
                <div className="mt-2 space-y-1">
                  {!(c.drug_id || '').toString().trim() && (
                    <div className="text-red-400 text-xs">Drug code or name is required</div>
                  )}
                  {(c.tablets_dispensed ?? 0) <= 0 && (
                    <div className="text-red-400 text-xs">Total tablets dispensed must be greater than 0</div>
                  )}
                  {!c.start_date && (
                    <div className="text-red-400 text-xs">Start date is required</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
