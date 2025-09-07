'use client'


export interface BottleEntry {
  id: string // temporary ID for UI management
  ip_id: string
  count: number
  start_date?: string // for dispensing
  last_dose_date?: string // for returns
}

interface MultiBottleEntryProps {
  bottles: BottleEntry[]
  onChange: (bottles: BottleEntry[]) => void
  type: 'dispensing' | 'returns'
  disabled?: boolean
  className?: string
  defaultStartDate?: string
  defaultLastDoseDate?: string
}

export default function MultiBottleEntry({ 
  bottles, 
  onChange, 
  type, 
  disabled = false,
  className = '',
  defaultStartDate,
  defaultLastDoseDate
}: MultiBottleEntryProps) {
  const isDispensing = type === 'dispensing'
  
  const addBottle = () => {
    const newBottle: BottleEntry = {
      id: Date.now().toString(),
      ip_id: '',
      count: 0,
      ...(isDispensing 
        ? { start_date: defaultStartDate || '' } 
        : { last_dose_date: defaultLastDoseDate || '' }
      )
    }
    onChange([...bottles, newBottle])
  }

  const removeBottle = (id: string) => {
    onChange(bottles.filter(bottle => bottle.id !== id))
  }

  const updateBottle = (id: string, field: keyof BottleEntry, value: string | number) => {
    onChange(bottles.map(bottle => 
      bottle.id === id ? { ...bottle, [field]: value } : bottle
    ))
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300">
          {isDispensing ? 'Bottles to Dispense' : 'Bottles Being Returned'}
        </h4>
        {!disabled && (
          <button
            type="button"
            onClick={addBottle}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
          >
            + Add Bottle
          </button>
        )}
      </div>

      {bottles.length === 0 ? (
        <div className="text-gray-500 text-sm italic">
          {isDispensing ? 'No bottles to dispense' : 'No bottles being returned'}
        </div>
      ) : (
        <div className="space-y-3">
          {bottles.map((bottle) => (
            <div key={bottle.id} className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
              <div className="flex items-start justify-between mb-3">
                <div className="text-sm text-gray-400">
                  {isDispensing ? 'Dispensing' : 'Returning'} Bottle #{bottles.indexOf(bottle) + 1}
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeBottle(bottle.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Remove bottle"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Bottle/Kit ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Bottle/Kit ID *
                  </label>
                  {disabled ? (
                    <div className="text-gray-100 text-sm">{bottle.ip_id || '-'}</div>
                  ) : (
                    <input
                      type="text"
                      value={bottle.ip_id}
                      onChange={(e) => updateBottle(bottle.id, 'ip_id', e.target.value)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g., 001, KIT123"
                    />
                  )}
                </div>

                {/* Count */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    {isDispensing ? 'Tablets Dispensed' : 'Tablets Returned'} *
                  </label>
                  {disabled ? (
                    <div className="text-gray-100 text-sm">{bottle.count || '-'}</div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={bottle.count || ''}
                      onChange={(e) => updateBottle(bottle.id, 'count', parseInt(e.target.value) || 0)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  )}
                </div>

                {/* Date field - different for dispensing vs returns */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    {isDispensing ? 'Start Date' : 'Last Dose Date'} *
                  </label>
                  {disabled ? (
                    <div className="text-gray-100 text-sm">
                      {isDispensing ? bottle.start_date || '-' : bottle.last_dose_date || '-'}
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={isDispensing ? bottle.start_date || '' : bottle.last_dose_date || ''}
                      onChange={(e) => updateBottle(
                        bottle.id, 
                        isDispensing ? 'start_date' : 'last_dose_date', 
                        e.target.value
                      )}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* Validation warnings */}
              {!disabled && (
                <div className="mt-2 space-y-1">
                  {!bottle.ip_id.trim() && (
                    <div className="text-red-400 text-xs">Bottle/Kit ID is required</div>
                  )}
                  {bottle.count <= 0 && (
                    <div className="text-red-400 text-xs">Count must be greater than 0</div>
                  )}
                  {isDispensing && !bottle.start_date && (
                    <div className="text-red-400 text-xs">Start date is required</div>
                  )}
                  {!isDispensing && !bottle.last_dose_date && (
                    <div className="text-red-400 text-xs">Last dose date is required</div>
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
