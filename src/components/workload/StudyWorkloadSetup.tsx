'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase/client'

type LifecycleStage = 'start_up' | 'active' | 'follow_up' | 'close_out'
type RecruitmentStatus = 'enrolling' | 'paused' | 'closed_to_accrual' | 'on_hold'

const LIFECYCLE_OPTIONS: Array<{ value: LifecycleStage; label: string; description: string }> = [
  { value: 'start_up', label: 'Start-up', description: 'Site activation, regulatory submission, and training.' },
  { value: 'active', label: 'Active', description: 'Primary accrual period with full visit schedule.' },
  { value: 'follow_up', label: 'Follow-up', description: 'Patient monitoring after active treatment.' },
  { value: 'close_out', label: 'Close-out', description: 'Final data review, query resolution, archive.' }
]

const RECRUITMENT_LABELS: Record<RecruitmentStatus, string> = {
  enrolling: 'Enrolling (active accrual)',
  paused: 'Paused (temporarily on hold)',
  closed_to_accrual: 'Closed to Accrual',
  on_hold: 'On Hold (no activity)'
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  screening: 'Screening',
  baseline: 'Baseline / Day 0',
  regular: 'Cycle / Routine Visit',
  unscheduled: 'Unscheduled / Safety',
  early_termination: 'Early Termination',
  dose: 'Dose / Titration',
  long_term: 'Long-term Follow-up'
}

const DEFAULT_VISIT_WEIGHTS: Record<string, number> = {
  screening: 1.5,
  baseline: 2.0,
  regular: 1.0,
  unscheduled: 1.1,
  early_termination: 0.75,
  dose: 1.25,
  long_term: 0.5
}

const TRIAL_TYPE_OPTIONS = [
  { value: 'observational', label: 'Observational / Registry', score: 1 },
  { value: 'interventional_low', label: 'Interventional (Low Intensity)', score: 3 },
  { value: 'interventional_high', label: 'Interventional (High Intensity)', score: 5 }
] as const

const PHASE_OPTIONS = [
  { value: 'phase_early', label: 'Phase I / FIH', score: 2 },
  { value: 'phase_late', label: 'Phase II / III', score: 1 },
  { value: 'phase_other', label: 'Other / Not Applicable', score: 0 }
] as const

const SPONSOR_OPTIONS = [
  { value: 'industry', label: 'Industry-Sponsored', score: 1 },
  { value: 'academic', label: 'Academic / Cooperative Group', score: 0 },
  { value: 'investigator', label: 'Investigator Initiated', score: 0 }
] as const

const VISIT_VOLUME_OPTIONS = [
  { value: 'high', label: '≥ 8 visits per participant', score: 2 },
  { value: 'moderate', label: '4–7 visits per participant', score: 1 },
  { value: 'low', label: '≤ 3 visits per participant', score: 0 }
] as const

const PROCEDURAL_INTENSITY_OPTIONS = [
  { value: 'high', label: 'High (imaging, biopsies, IP infusion)', score: 2 },
  { value: 'moderate', label: 'Moderate (labs, vitals, questionnaires)', score: 1 },
  { value: 'low', label: 'Low (remote follow-up, data only)', score: 0 }
] as const

interface VisitWeightFormRow {
  id?: string
  visitType: string
  weight: number
}

interface StudyWorkloadState {
  id: string
  studyTitle: string
  protocolNumber: string
  status: string | null
  lifecycle: LifecycleStage
  recruitment: RecruitmentStatus
  protocolScore: number
  screeningMultiplier: number
  queryMultiplier: number
  meetingAdminPoints: number
  rubricTrialType: string | null
  rubricPhase: string | null
  rubricSponsorType: string | null
  rubricVisitVolume: string | null
  rubricProceduralIntensity: string | null
  rubricNotes: string | null
  visitWeights: VisitWeightFormRow[]
  coordinators: Array<{
    id: string
    coordinatorId: string
    name: string
    email: string | null
    role: string | null
    joinedAt: string
  }>
}

interface StudyWorkloadSetupProps {
  studyId: string
}

interface StudyBreakdownWeek {
  weekStart: string
  meetingHours: number
  screeningHours: number
  queryHours: number
  totalHours: number
  notesCount: number
}

const formatStatus = (value: string | null) => {
  if (!value) return '—'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function StudyWorkloadSetup({ studyId }: StudyWorkloadSetupProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formState, setFormState] = useState<StudyWorkloadState | null>(null)
  const [breakdownWeeks, setBreakdownWeeks] = useState<StudyBreakdownWeek[]>([])

  const loadStudy = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('You must be signed in to configure workload settings.')
      }

      const [response, breakdownResponse] = await Promise.all([
        fetch(`/api/cwe/settings/${studyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/analytics/workload?includeBreakdown=true&force=true', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (!response.ok) {
        throw new Error('Failed to load workload settings for this study.')
      }

      const payload = await response.json()

      if (breakdownResponse.ok) {
        const breakdownPayload = await breakdownResponse.json()
        const entry = (breakdownPayload.workloads || []).find((item: any) => item.studyId === studyId)
        const weeks: StudyBreakdownWeek[] = Array.isArray(entry?.breakdown?.weeks)
          ? (entry.breakdown.weeks as any[])
              .map((week: any) => {
                if (!week || typeof week !== 'object') return null
                const weekStart = week.weekStart ?? week.week_start
                if (!weekStart) return null
                const totals = week.totals ?? week
                return {
                  weekStart,
                  meetingHours: Number(totals?.meetingHours ?? totals?.meeting_hours ?? week.meetingHours ?? 0),
                  screeningHours: Number(totals?.screeningHours ?? totals?.screening_hours ?? week.screeningHours ?? 0),
                  queryHours: Number(totals?.queryHours ?? totals?.query_hours ?? week.queryHours ?? 0),
                  totalHours: Number(totals?.totalHours ?? totals?.total_hours ?? week.totalHours ?? 0),
                  notesCount: Number(totals?.notesCount ?? totals?.notes_count ?? week.notesCount ?? 0)
                } as StudyBreakdownWeek
              })
              .filter((week: StudyBreakdownWeek | null): week is StudyBreakdownWeek => !!week)
          : []
        setBreakdownWeeks(weeks)
      } else {
        setBreakdownWeeks([])
      }
      const mappedWeights = (payload.visitWeights || []).map((row: any) => ({
        id: row.id,
        visitType: row.visitType,
        weight: Number(row.weight ?? 1)
      })) as VisitWeightFormRow[]

      const visitTypes = Array.from(
        new Set<string>([
          ...Object.keys(DEFAULT_VISIT_WEIGHTS),
          ...mappedWeights.map((row) => row.visitType)
        ])
      )

      const mergedWeights = visitTypes.map((type) => {
        const existing = mappedWeights.find((row) => row.visitType === type)
        const defaultWeight = DEFAULT_VISIT_WEIGHTS[type] ?? 1
        return existing ?? { visitType: type, weight: defaultWeight }
      })

      setFormState({
        id: payload.study.id,
        studyTitle: payload.study.studyTitle,
        protocolNumber: payload.study.protocolNumber,
        status: payload.study.status,
        lifecycle: payload.study.lifecycle,
        recruitment: payload.study.recruitment,
        protocolScore: Number(payload.study.protocolScore ?? 0),
        screeningMultiplier: Number(payload.study.screeningMultiplier ?? 1),
        queryMultiplier: Number(payload.study.queryMultiplier ?? 1),
        meetingAdminPoints: Number(payload.study.meetingAdminPoints ?? 0),
        rubricTrialType: payload.study.rubric?.trialType ?? TRIAL_TYPE_OPTIONS[0].value,
        rubricPhase: payload.study.rubric?.phase ?? PHASE_OPTIONS[0].value,
        rubricSponsorType: payload.study.rubric?.sponsorType ?? SPONSOR_OPTIONS[0].value,
        rubricVisitVolume: payload.study.rubric?.visitVolume ?? VISIT_VOLUME_OPTIONS[0].value,
        rubricProceduralIntensity: payload.study.rubric?.proceduralIntensity ?? PROCEDURAL_INTENSITY_OPTIONS[0].value,
        rubricNotes: payload.study.rubric?.notes ?? null,
        visitWeights: mergedWeights,
        coordinators: (payload.coordinators || []).map((entry: any) => ({
          id: entry.id,
          coordinatorId: entry.coordinatorId ?? entry.coordinator_id,
          name: entry.name,
          email: entry.email ?? null,
          role: entry.role ?? null,
          joinedAt: entry.joinedAt ?? entry.joined_at
        }))
      })
    } catch (err) {
      setBreakdownWeeks([])
      setError(err instanceof Error ? err.message : 'Failed to load workload settings.')
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadStudy()
  }, [loadStudy])

  const complexity = useMemo(() => {
    if (!formState) return null
    const base =
      Number(formState.protocolScore || 0) *
      Number(formState.screeningMultiplier || 0) *
      Number(formState.queryMultiplier || 0)
    const meeting = Number(formState.meetingAdminPoints || 0)
    const lifecycleWeight = (() => {
      switch (formState.lifecycle) {
        case 'start_up':
          return 1.15
        case 'follow_up':
          return 0.5
        case 'close_out':
          return 0.25
        default:
          return 1.0
      }
    })()
    const recruitmentWeight = (() => {
      switch (formState.recruitment) {
        case 'paused':
          return 0.25
        case 'closed_to_accrual':
        case 'on_hold':
          return 0
        default:
          return 1.0
      }
    })()

    return {
      base,
      meeting,
      lifecycleWeight,
      recruitmentWeight,
      total: (base + meeting) * lifecycleWeight * recruitmentWeight
    }
  }, [formState])

  const recommendedScore = useMemo(() => {
    if (!formState) return 0
    const lookupScore = (options: ReadonlyArray<{ value: string; score: number }>, value: string | null) => {
      const match = options.find((option) => option.value === value)
      return match ? match.score : 0
    }

    return (
      lookupScore(TRIAL_TYPE_OPTIONS, formState.rubricTrialType) +
      lookupScore(PHASE_OPTIONS, formState.rubricPhase) +
      lookupScore(SPONSOR_OPTIONS, formState.rubricSponsorType) +
      lookupScore(VISIT_VOLUME_OPTIONS, formState.rubricVisitVolume) +
      lookupScore(PROCEDURAL_INTENSITY_OPTIONS, formState.rubricProceduralIntensity)
    )
  }, [formState])

  const breakdownSummary = useMemo(() => {
    if (breakdownWeeks.length === 0) {
      return {
        averageWeeklyHours: 0,
        latestWeek: null as string | null,
        latestTotal: 0,
        totalWeeks: 0,
        notesLogged: 0
      }
    }

    const totalWeeks = breakdownWeeks.length
    const totalHours = breakdownWeeks.reduce((sum, week) => sum + week.totalHours, 0)
    const notesLogged = breakdownWeeks.reduce((sum, week) => sum + week.notesCount, 0)
    const latest = breakdownWeeks[breakdownWeeks.length - 1]

    return {
      averageWeeklyHours: totalHours / totalWeeks,
      latestWeek: latest.weekStart,
      latestTotal: latest.totalHours,
      totalWeeks,
      notesLogged
    }
  }, [breakdownWeeks])

  const recentBreakdownWeeks = useMemo(() => {
    if (breakdownWeeks.length === 0) return []
    return [...breakdownWeeks].slice(-12).reverse()
  }, [breakdownWeeks])

  const handleNumericChange = (field: keyof Pick<StudyWorkloadState, 'protocolScore' | 'screeningMultiplier' | 'queryMultiplier'>) => (event: ChangeEvent<HTMLInputElement>) => {
    if (!formState) return
    const numericValue = Number(event.target.value)
    if (Number.isNaN(numericValue)) return
    setFormState({ ...formState, [field]: numericValue })
  }

  const handleLifecycleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!formState) return
    setFormState({ ...formState, lifecycle: event.target.value as LifecycleStage })
  }

  const handleRubricChange = (field: keyof Pick<StudyWorkloadState, 'rubricTrialType' | 'rubricPhase' | 'rubricSponsorType' | 'rubricVisitVolume' | 'rubricProceduralIntensity'>, value: string) => {
    if (!formState) return
    setFormState({ ...formState, [field]: value })
  }

  const handleVisitWeightChange = (visitType: string, value: string) => {
    if (!formState) return
    const numericValue = Number(value)
    if (Number.isNaN(numericValue)) return
    setFormState({
      ...formState,
      visitWeights: formState.visitWeights.map((row) =>
        row.visitType === visitType ? { ...row, weight: numericValue } : row
      )
    })
  }

  const handleResetWeights = () => {
    if (!formState) return
    setFormState({
      ...formState,
      visitWeights: formState.visitWeights.map((row) => ({
        ...row,
        weight: DEFAULT_VISIT_WEIGHTS[row.visitType] ?? 1
      }))
    })
    setSuccess('Visit weights reset to recommended defaults.')
  }

  const handleSave = async () => {
    if (!formState) return
    try {
      setSaving(true)
      setSuccess(null)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('You must be signed in to save workload settings.')
      }

      const response = await fetch(`/api/cwe/settings/${formState.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lifecycle: formState.lifecycle,
          protocolScore: formState.protocolScore,
          screeningMultiplier: formState.screeningMultiplier,
          queryMultiplier: formState.queryMultiplier,
          meetingAdminPoints: formState.meetingAdminPoints,
          rubricTrialType: formState.rubricTrialType,
          rubricPhase: formState.rubricPhase,
          rubricSponsorType: formState.rubricSponsorType,
          rubricVisitVolume: formState.rubricVisitVolume,
          rubricProceduralIntensity: formState.rubricProceduralIntensity,
          rubricNotes: formState.rubricNotes?.trim() ? formState.rubricNotes : null,
          visitWeights: formState.visitWeights
        })
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to save workload settings.' }))
        throw new Error(payload.error || 'Failed to save workload settings.')
      }

      await loadStudy()
      setSuccess('Workload configuration saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workload settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link href="/workload" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Workload Engine
          </Link>
          <h1 className="text-3xl font-bold text-white">Study Workload Setup</h1>
          <p className="text-gray-300 max-w-2xl">
            Configure lifecycle weighting, baseline complexity, and visit intensity for <span className="font-semibold">{formState?.studyTitle ?? 'your study'}</span>.
            Work through the guided steps below—each section explains what the field controls and how it impacts coordinator load.
          </p>
        </div>
        <div className="w-full md:w-72 space-y-3">
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-gray-200">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Assigned coordinators</div>
            {formState?.coordinators && formState.coordinators.length > 0 ? (
              <ul className="space-y-1">
                {formState.coordinators.map((coordinator) => (
                  <li key={coordinator.id}>
                    <span className="font-medium text-white">{coordinator.name}</span>
                    {coordinator.role ? ` — ${coordinator.role}` : ''}
                    <div className="text-xs text-gray-500">{coordinator.email ?? 'No email on file'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No coordinators linked yet.</p>
            )}
            <Link href="/coordinators" className="mt-3 inline-flex items-center text-xs text-blue-400 hover:text-blue-300">
              View coordinator directory
            </Link>
          </div>
          <Link
            href="/studies"
            className="inline-flex items-center justify-center rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-colors w-full"
          >
            Back to Studies
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      {loading || !formState ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse">
          <div className="h-5 w-56 bg-gray-700 rounded mb-4" />
          <div className="h-4 w-full bg-gray-700 rounded mb-3" />
          <div className="h-4 w-2/3 bg-gray-700 rounded" />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Study</p>
              <p className="text-white font-semibold">{formState.studyTitle}</p>
              <p className="text-sm text-gray-400">Protocol {formState.protocolNumber}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Current status</p>
              <p className="text-white">{formatStatus(formState.status)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Recruitment cadence</p>
              <p className="text-white">{RECRUITMENT_LABELS[formState.recruitment] ?? formatStatus(formState.recruitment)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Update from the Study → Edit modal to keep analytics and staffing aligned.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Complexity preview</p>
              <p className="text-white font-semibold">{complexity ? complexity.total.toFixed(2) : '0.00'} pts</p>
              <p className="text-xs text-gray-500 mt-1">
                {complexity
                  ? `[(Base ${complexity.base.toFixed(2)} + meeting ${complexity.meeting.toFixed(2)}) × lifecycle ${complexity.lifecycleWeight.toFixed(2)} × recruitment ${complexity.recruitmentWeight.toFixed(2)}]`
                  : '[(Baseline + meeting load) × lifecycle × recruitment]'}
              </p>
            </div>
          </div>

          <section className="bg-gray-800/40 border border-gray-700 rounded-lg p-6 space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Per-study breakdown history</h2>
                <p className="text-sm text-gray-400">
                  Recent weekly submissions for this study, grouped by meeting, screening, and query effort.
                </p>
              </div>
              {breakdownWeeks.length > 0 && (
                <div className="text-xs text-gray-500">
                  Tracking {breakdownSummary.totalWeeks} week{breakdownSummary.totalWeeks === 1 ? '' : 's'} · {breakdownSummary.notesLogged} note{breakdownSummary.notesLogged === 1 ? '' : 's'} logged
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Average weekly hours</p>
                <p className="text-2xl font-semibold text-white">{breakdownSummary.averageWeeklyHours.toFixed(1)} hrs</p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Most recent week</p>
                <p className="text-2xl font-semibold text-white">{breakdownSummary.latestWeek ?? '—'}</p>
                {breakdownSummary.latestWeek && (
                  <p className="text-xs text-gray-500 mt-1">{breakdownSummary.latestTotal.toFixed(1)} hrs recorded</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Notes captured</p>
                <p className="text-2xl font-semibold text-white">{breakdownSummary.notesLogged}</p>
                <p className="text-xs text-gray-500 mt-1">Across all weeks</p>
              </div>
            </div>

            {recentBreakdownWeeks.length === 0 ? (
              <div className="border border-dashed border-gray-700 rounded-lg px-4 py-6 text-sm text-gray-400 text-center">
                No per-study breakdown entries have been logged for this study yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-800 text-sm">
                  <thead className="bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-300">Week start</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-300">Meetings (hrs)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-300">Screening (hrs)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-300">Queries (hrs)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-300">Total (hrs)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-300">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {recentBreakdownWeeks.map((week) => (
                      <tr key={week.weekStart} className="hover:bg-gray-900/40 transition-colors">
                        <td className="px-4 py-3 text-gray-100">{week.weekStart}</td>
                        <td className="px-4 py-3 text-right text-gray-200">{week.meetingHours.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-200">{week.screeningHours.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-200">{week.queryHours.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-200">{week.totalHours.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{week.notesCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-gray-800/40 border border-gray-700 rounded-lg p-6 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Step 1</p>
              <h2 className="text-xl font-semibold text-white">Protocol complexity rubric</h2>
              <p className="text-sm text-gray-300 mt-1">
                Score the protocol using the CWE rubric. We translate these selections into a recommended baseline score—apply it or override as needed.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className="text-xs uppercase tracking-wide text-gray-400">Trial type</legend>
                  {TRIAL_TYPE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="radio"
                        name="rubric_trial_type"
                        className="accent-blue-500"
                        checked={formState.rubricTrialType === option.value}
                        onChange={() => handleRubricChange('rubricTrialType', option.value)}
                      />
                      <span>{option.label} <span className="text-gray-500">(+{option.score})</span></span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-xs uppercase tracking-wide text-gray-400">Trial phase</legend>
                  {PHASE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="radio"
                        name="rubric_phase"
                        className="accent-blue-500"
                        checked={formState.rubricPhase === option.value}
                        onChange={() => handleRubricChange('rubricPhase', option.value)}
                      />
                      <span>{option.label} <span className="text-gray-500">(+{option.score})</span></span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-xs uppercase tracking-wide text-gray-400">Sponsor type</legend>
                  {SPONSOR_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="radio"
                        name="rubric_sponsor"
                        className="accent-blue-500"
                        checked={formState.rubricSponsorType === option.value}
                        onChange={() => handleRubricChange('rubricSponsorType', option.value)}
                      />
                      <span>{option.label} <span className="text-gray-500">(+{option.score})</span></span>
                    </label>
                  ))}
                </fieldset>
              </div>

              <div className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className="text-xs uppercase tracking-wide text-gray-400">Visit volume per participant</legend>
                  {VISIT_VOLUME_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="radio"
                        name="rubric_visit_volume"
                        className="accent-blue-500"
                        checked={formState.rubricVisitVolume === option.value}
                        onChange={() => handleRubricChange('rubricVisitVolume', option.value)}
                      />
                      <span>{option.label} <span className="text-gray-500">(+{option.score})</span></span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-xs uppercase tracking-wide text-gray-400">Procedural intensity</legend>
                  {PROCEDURAL_INTENSITY_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="radio"
                        name="rubric_procedural"
                        className="accent-blue-500"
                        checked={formState.rubricProceduralIntensity === option.value}
                        onChange={() => handleRubricChange('rubricProceduralIntensity', option.value)}
                      />
                      <span>{option.label} <span className="text-gray-500">(+{option.score})</span></span>
                    </label>
                  ))}
                </fieldset>

                <label className="flex flex-col text-sm text-gray-300">
                  <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Rubric notes</span>
                  <textarea
                    rows={3}
                    value={formState.rubricNotes ?? ''}
                    onChange={(event) => setFormState({ ...formState, rubricNotes: event.target.value })}
                    className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Document special procedures or workload considerations."
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3">
              <div className="text-sm text-gray-300">
                Recommended baseline score: <span className="font-semibold text-white">{recommendedScore.toFixed(1)}</span>
              </div>
              <button
                type="button"
                onClick={() => setFormState({ ...formState, protocolScore: Number(recommendedScore.toFixed(1)) })}
                className="inline-flex items-center justify-center rounded-lg border border-blue-500/50 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-600/20 transition-colors"
              >
                Apply recommended score
              </button>
            </div>
          </section>

          <section className="bg-gray-800/40 border border-gray-700 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Step 2</p>
                <h2 className="text-xl font-semibold text-white">Lifecycle stage</h2>
                <p className="text-sm text-gray-300 mt-1">
                  Pick the lifecycle phase that best describes the workload for the next quarter. This weight scales every other metric.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col text-sm text-gray-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Lifecycle</span>
                <select
                  value={formState.lifecycle}
                  onChange={handleLifecycleChange}
                  className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {LIFECYCLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-gray-300">
                {LIFECYCLE_OPTIONS.find((option) => option.value === formState.lifecycle)?.description}
              </div>
            </div>
          </section>

          <section className="bg-gray-800/40 border border-gray-700 rounded-lg p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Step 3</p>
              <h2 className="text-xl font-semibold text-white">Baseline complexity</h2>
              <p className="text-sm text-gray-300 mt-1">
                These multipliers describe how demanding the protocol is for coordinators. Higher values create more workload points for every subject and visit.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex flex-col text-sm text-gray-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Protocol score</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formState.protocolScore}
                  onChange={handleNumericChange('protocolScore')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 mt-1">
                  1.0 = baseline. Sophisticated or data-heavy protocols often land between 2.0 and 4.0.
                </span>
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Screening multiplier</span>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={formState.screeningMultiplier}
                  onChange={handleNumericChange('screeningMultiplier')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 mt-1">
                  Raise this if screening requires extra coordinator time (lab kits, SOC outreach, multi-visit screening).
                </span>
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Query multiplier</span>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={formState.queryMultiplier}
                  onChange={handleNumericChange('queryMultiplier')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 mt-1">
                  Use &gt; 1.0 if the sponsor or CRO routinely drives high data query volume.
                </span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col text-sm text-gray-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">Meeting / admin load (pts per month)</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={formState.meetingAdminPoints}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setFormState({ ...formState, meetingAdminPoints: Number.isFinite(value) ? value : 0 })
                  }}
                  className="bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 mt-1">
                  Capture recurring meetings, monitoring visits, or administrative load. These points feed into baseline workload before lifecycle weighting.
                </span>
              </label>
              <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-gray-300">
                Recommended baseline score from rubric: <span className="text-white font-semibold">{recommendedScore.toFixed(1)}</span>. Apply if you haven&apos;t tweaked the protocol score manually.
              </div>
            </div>
          </section>

          <section className="bg-gray-800/40 border border-gray-700 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Step 4</p>
                <h2 className="text-xl font-semibold text-white">Visit intensity weighting</h2>
                <p className="text-sm text-gray-300 mt-1">
                  Weight visit types according to the time and coordination they require. These values multiply the protocol score before applying lifecycle and recruitment weights.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetWeights}
                className="text-sm text-blue-300 hover:text-blue-200 border border-blue-500/40 rounded-lg px-3 py-1.5 transition-colors"
              >
                Reset to defaults
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700 text-sm">
                <thead className="bg-gray-900/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-300">Visit type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-300">Guidance</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {formState.visitWeights.map((row) => (
                    <tr key={row.visitType}>
                      <td className="px-4 py-3 text-white">{VISIT_TYPE_LABELS[row.visitType] ?? row.visitType}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        Recommended default {DEFAULT_VISIT_WEIGHTS[row.visitType] ?? 1}. Increase for long chair time, intensive source review, or sponsor-mandated co-visits.
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          value={row.weight}
                          onChange={(event) => handleVisitWeightChange(row.visitType, event.target.value)}
                          className="w-24 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-sm text-gray-400">
              Saving updates recalculates workload analytics immediately. Revisit the Analytics → Studies tab to see how forecasts change.
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition-colors"
              >
                {saving ? 'Saving…' : 'Save workload configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
