import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import logger from '@/lib/logger'
import { computeWorkloads, type ComputeWorkloadsParams, type WorkloadResponse } from './computeWorkloads'

const DEFAULT_TTL_MINUTES = 5

export interface WorkloadSnapshotRow {
  id: string
  study_id: string
  payload: any
  computed_at: string
  expires_at: string
  created_at: string
  updated_at: string
}

export interface SnapshotLookupResult {
  snapshots: Map<string, WorkloadSnapshotRow>
  staleStudies: Set<string>
}

export const computeSnapshotExpiry = (ttlMinutes = DEFAULT_TTL_MINUTES) => {
  const computedAt = new Date()
  const expiresAt = new Date(computedAt.getTime() + ttlMinutes * 60 * 1000)
  return {
    computedAt: computedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  }
}

export async function loadWorkloadSnapshots(
  supabase: SupabaseClient<Database>,
  studyIds: string[]
): Promise<SnapshotLookupResult> {
  if (studyIds.length === 0) {
    return { snapshots: new Map(), staleStudies: new Set() }
  }

  const { data, error } = await supabase
    .from('study_workload_snapshots')
    .select('id, study_id, payload, computed_at, expires_at, created_at, updated_at')
    .in('study_id', studyIds)

  if (error) {
    logger.error('Failed to load workload snapshots', error as any, { studyIds })
    return { snapshots: new Map(), staleStudies: new Set(studyIds) }
  }

  const snapshots = new Map<string, WorkloadSnapshotRow>()
  const staleStudies = new Set<string>()
  const now = Date.now()

  for (const row of (data ?? []) as WorkloadSnapshotRow[]) {
    snapshots.set(row.study_id, row)
    if (!row.expires_at || Date.parse(row.expires_at) <= now) {
      staleStudies.add(row.study_id)
    }
  }

  for (const studyId of studyIds) {
    if (!snapshots.has(studyId)) {
      staleStudies.add(studyId)
    }
  }

  return { snapshots, staleStudies }
}

export async function upsertWorkloadSnapshots(
  supabase: SupabaseClient<Database>,
  workloads: WorkloadResponse[],
  ttlMinutes = DEFAULT_TTL_MINUTES
) {
  if (workloads.length === 0) return

  const { computedAt, expiresAt } = computeSnapshotExpiry(ttlMinutes)
  const rows = workloads.map((entry) => ({
    study_id: entry.studyId,
    payload: entry,
    computed_at: computedAt,
    expires_at: expiresAt,
    updated_at: computedAt
  }))

  const { error } = await (supabase as any)
    .from('study_workload_snapshots')
    .upsert(rows, { onConflict: 'study_id' })

  if (error) {
    logger.error('Failed to upsert workload snapshots', error as any, {
      studies: workloads.map((entry) => entry.studyId)
    })
    throw new Error('Failed to upsert workload snapshots')
  }
}

export interface ComputeAndStoreParams extends Omit<ComputeWorkloadsParams, 'studyRows'> {
  studyRows: ComputeWorkloadsParams['studyRows']
  ttlMinutes?: number
}

export async function computeAndStoreWorkloadSnapshots({
  supabase,
  studyRows,
  lookbackDays,
  ttlMinutes
}: ComputeAndStoreParams): Promise<WorkloadResponse[]> {
  const workloads = await computeWorkloads({ supabase, studyRows, lookbackDays })
  await upsertWorkloadSnapshots(supabase, workloads, ttlMinutes)
  return workloads
}
