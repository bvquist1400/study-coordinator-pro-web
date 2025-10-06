import { SupabaseClient } from '@supabase/supabase-js'
import logger from '@/lib/logger'
import type { Database } from '@/types/database'

export interface ShipmentSubjectInfo {
  subject_id: string | null
  subject_number: string | null
  visit_id: string | null
  visit_name: string | null
  visit_date: string | null
}

export interface ShipmentKitInfo {
  id: string
  kit_type: string | null
  status: string | null
  accession_number: string | null
  visit_schedule_id: string | null
  visit_schedule?: {
    id: string
    visit_name: string | null
    visit_number: number | null
  } | null
}

export interface EnrichedShipment {
  id: string
  study_id: string | null
  study_protocol: string | null
  study_title: string | null
  lab_kit_id: string | null
  subject_visit_id: string | null
  accession_number: string | null
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  tracking_status: string | null
  ups_tracking_payload: ShipmentPayload
  last_tracking_update: string | null
  subject_assignment: ShipmentSubjectInfo | null
  kit: ShipmentKitInfo | null
}

type Supabase = SupabaseClient<Database>
type ShipmentPayload = Database['public']['Tables']['lab_kit_shipments']['Row']['ups_tracking_payload']

interface ShipmentRow {
  id: string
  lab_kit_id: string | null
  subject_visit_id: string | null
  accession_number: string | null
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  tracking_status: string | null
  ups_tracking_payload: ShipmentPayload
  last_tracking_update: string | null
  study_id: string | null
  study_protocol: string | null
  study_title: string | null
}

/**
 * Fetch lab kit shipments for one or more studies and enrich them with
 * subject assignment + kit metadata so the UI can stay in sync.
 */
export async function fetchShipmentsForStudies(
  supabase: Supabase,
  studyIds: string[]
): Promise<EnrichedShipment[]> {
  if (!Array.isArray(studyIds) || studyIds.length === 0) {
    return []
  }

  try {
    // First, gather raw shipment rows via three access patterns.
    const shipmentsById = new Map<string, ShipmentRow>()

    const mergeRow = (row: any, fallbackStudy?: { id: string | null; protocol?: string | null; title?: string | null }) => {
      const id = row.id as string
      if (!id) return
      const existing = shipmentsById.get(id)
      const study = fallbackStudy || {
        id: (row.lab_kits as any)?.study_id ?? (row.subject_visits as any)?.study_id ?? row.study_id ?? null,
        protocol: (row.lab_kits as any)?.studies?.protocol_number ?? (row.subject_visits as any)?.studies?.protocol_number ?? row.study_protocol ?? null,
        title: (row.lab_kits as any)?.studies?.study_title ?? (row.subject_visits as any)?.studies?.study_title ?? row.study_title ?? null
      }

      const next: ShipmentRow = existing || {
        id,
        lab_kit_id: null,
        subject_visit_id: null,
        accession_number: null,
        airway_bill_number: row.airway_bill_number as string,
        carrier: row.carrier as string,
        shipped_date: row.shipped_date as string | null,
        estimated_delivery: row.estimated_delivery as string | null,
        actual_delivery: row.actual_delivery as string | null,
        tracking_status: row.tracking_status as string | null,
        ups_tracking_payload: (row.ups_tracking_payload ?? null) as ShipmentPayload,
        last_tracking_update: row.last_tracking_update as string | null,
        study_id: study.id,
        study_protocol: study.protocol ?? null,
        study_title: study.title ?? null
      }

      next.lab_kit_id = next.lab_kit_id ?? (row.lab_kit_id as string | null) ?? ((row.lab_kits as any)?.id ?? null)
      next.subject_visit_id = next.subject_visit_id ?? (row.subject_visit_id as string | null) ?? ((row.subject_visits as any)?.id ?? null)
      next.accession_number = next.accession_number ?? (row.accession_number as string | null) ?? ((row.lab_kits as any)?.accession_number ?? null)
      if (!next.ups_tracking_payload && row.ups_tracking_payload) {
        next.ups_tracking_payload = row.ups_tracking_payload as ShipmentPayload
      }
      if (!next.last_tracking_update && row.last_tracking_update) {
        next.last_tracking_update = row.last_tracking_update as string | null
      }

      if (!next.study_id) next.study_id = study.id
      if (!next.study_protocol) next.study_protocol = study.protocol ?? null
      if (!next.study_title) next.study_title = study.title ?? null

      shipmentsById.set(id, next)
    }

    // Shipments linked directly to lab kits in these studies.
    const { data: data1, error: err1 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, lab_kit_id, subject_visit_id, accession_number,
        airway_bill_number, carrier, shipped_date, estimated_delivery, actual_delivery, tracking_status, ups_tracking_payload, last_tracking_update,
        lab_kits:lab_kits!inner(id, study_id, accession_number,
          status, kit_type, visit_schedule_id,
          studies(protocol_number, study_title)
        )
      `)
      .in('lab_kits.study_id', studyIds)
      .order('created_at', { ascending: false })

    if (err1) {
      throw new Error(`Failed to fetch shipments linked to lab kits: ${err1.message}`)
    }
    for (const row of data1 || []) mergeRow(row)

    // Shipments referencing subject visits (accession only) within these studies.
    const { data: data2, error: err2 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, lab_kit_id, subject_visit_id, accession_number,
        airway_bill_number, carrier, shipped_date, estimated_delivery, actual_delivery, tracking_status, ups_tracking_payload, last_tracking_update,
        subject_visits:subject_visits!inner(id, study_id,
          accession_number, visit_name, visit_date,
          studies(protocol_number, study_title)
        )
      `)
      .is('lab_kit_id', null)
      .not('accession_number', 'is', null)
      .in('subject_visits.study_id', studyIds)
      .order('created_at', { ascending: false })

    if (err2) {
      throw new Error(`Failed to fetch shipments linked to visits: ${err2.message}`)
    }
    for (const row of data2 || []) mergeRow(row)

    // Shipments matching by accession number alone.
    const { data: kitMatches, error: kitMatchErr } = await supabase
      .from('lab_kits')
      .select('id, accession_number, study_id, studies(protocol_number, study_title)')
      .in('study_id', studyIds)

    if (kitMatchErr) {
      throw new Error(`Failed to map accession numbers to kits: ${kitMatchErr.message}`)
    }
    const accToKit = new Map<string, { id: string; study_id: string; protocol?: string | null; title?: string | null }>()
    for (const kit of kitMatches || []) {
      const acc = (kit as any).accession_number as string | null
      if (!acc) continue
      accToKit.set(acc, {
        id: (kit as any).id as string,
        study_id: (kit as any).study_id as string,
        protocol: (kit as any).studies?.protocol_number ?? null,
        title: (kit as any).studies?.study_title ?? null
      })
    }

    const accessionList = Array.from(accToKit.keys())
    if (accessionList.length > 0) {
      const { data: orphanRows, error: orphanErr } = await supabase
        .from('lab_kit_shipments')
        .select('id, lab_kit_id, subject_visit_id, accession_number, airway_bill_number, carrier, shipped_date, estimated_delivery, actual_delivery, tracking_status, ups_tracking_payload, last_tracking_update')
        .is('lab_kit_id', null)
        .in('accession_number', accessionList)

      if (orphanErr) {
        throw new Error(`Failed to fetch accession-only shipments: ${orphanErr.message}`)
      }

      for (const row of orphanRows || []) {
        const acc = (row as any).accession_number as string | null
        const kitMeta = acc ? accToKit.get(acc) : undefined
        mergeRow(row, kitMeta ? { id: kitMeta.study_id, protocol: kitMeta.protocol ?? null, title: kitMeta.title ?? null } : undefined)
        if (kitMeta) {
          const current = shipmentsById.get((row as any).id as string)
          if (current) {
            current.lab_kit_id = current.lab_kit_id ?? kitMeta.id
            current.study_id = current.study_id ?? kitMeta.study_id
            current.study_protocol = current.study_protocol ?? kitMeta.protocol ?? null
            current.study_title = current.study_title ?? kitMeta.title ?? null
          }
        }
      }
    }

    const shipments = Array.from(shipmentsById.values())
    if (shipments.length === 0) return []

    const labKitIds = new Set<string>()
    const subjectVisitIds = new Set<string>()
    const accessions = new Set<string>()

    for (const shipment of shipments) {
      if (shipment.lab_kit_id) labKitIds.add(shipment.lab_kit_id)
      if (shipment.subject_visit_id) subjectVisitIds.add(shipment.subject_visit_id)
      if (shipment.accession_number) accessions.add(shipment.accession_number)
    }

    // Load kit metadata (status, kit type, schedule).
    type KitMeta = ShipmentKitInfo & { study_id: string | null; study_protocol?: string | null; study_title?: string | null }
    const kitMap = new Map<string, KitMeta>()
    const kitByAccession = new Map<string, KitMeta>()
    const scheduleIds = new Set<string>()

    const registerKit = (raw: any) => {
      const id = raw.id as string
      const visitScheduleId = raw.visit_schedule_id as string | null
      if (visitScheduleId) scheduleIds.add(visitScheduleId)

      let meta = kitMap.get(id)
      if (!meta) {
        meta = {
          id,
          kit_type: raw.kit_type ?? null,
          status: raw.status ?? null,
          accession_number: raw.accession_number ?? null,
          visit_schedule_id: visitScheduleId,
          visit_schedule: null,
          study_id: raw.study_id ?? null,
          study_protocol: raw.studies?.protocol_number ?? null,
          study_title: raw.studies?.study_title ?? null
        }
        kitMap.set(id, meta)
      } else {
        meta.kit_type = meta.kit_type ?? raw.kit_type ?? null
        meta.status = meta.status ?? raw.status ?? null
        meta.accession_number = meta.accession_number ?? raw.accession_number ?? null
        if (!meta.visit_schedule_id) meta.visit_schedule_id = visitScheduleId
        if (!meta.study_protocol) meta.study_protocol = raw.studies?.protocol_number ?? null
        if (!meta.study_title) meta.study_title = raw.studies?.study_title ?? null
        if (meta.visit_schedule_id) scheduleIds.add(meta.visit_schedule_id)
      }

      if (meta.accession_number) {
        kitByAccession.set(meta.accession_number, meta)
      }
    }

    if (labKitIds.size > 0) {
      const { data: kitRows, error: kitErr } = await supabase
        .from('lab_kits')
        .select('id, study_id, status, kit_type, visit_schedule_id, accession_number, studies(protocol_number, study_title)')
        .in('id', Array.from(labKitIds))

      if (kitErr) {
        throw new Error(`Failed to load kit metadata: ${kitErr.message}`)
      }

      for (const kit of kitRows || []) {
        registerKit(kit as any)
      }
    }

    const accessionsNeedingKit = Array.from(accessions).filter(acc => !kitByAccession.has(acc))

    if (accessionsNeedingKit.length > 0) {
      const { data: accKits, error: accKitErr } = await supabase
        .from('lab_kits')
        .select('id, study_id, status, kit_type, visit_schedule_id, accession_number, studies(protocol_number, study_title)')
        .in('accession_number', accessionsNeedingKit)

      if (accKitErr) {
        throw new Error(`Failed to backfill kits by accession: ${accKitErr.message}`)
      }

      for (const kit of accKits || []) {
        registerKit(kit as any)
      }
    }

    // Load visit schedule display names.
    const scheduleMap = new Map<string, { id: string; visit_name: string | null; visit_number: number | null }>()
    if (scheduleIds.size > 0) {
      const { data: scheduleRows, error: scheduleErr } = await supabase
        .from('visit_schedules')
        .select('id, visit_name, visit_number')
        .in('id', Array.from(scheduleIds))

      if (scheduleErr) {
        throw new Error(`Failed to load visit schedules: ${scheduleErr.message}`)
      }
      for (const row of scheduleRows || []) {
        scheduleMap.set((row as any).id as string, {
          id: (row as any).id as string,
          visit_name: (row as any).visit_name ?? null,
          visit_number: (row as any).visit_number ?? null
        })
      }
    }

    for (const kit of kitMap.values()) {
      if (kit.visit_schedule_id) {
        kit.visit_schedule = scheduleMap.get(kit.visit_schedule_id) ?? null
      }
    }

    // Backfill shipment accession numbers from linked kits so downstream
    // consumers (subject lookup, UI display) always have a value.
    for (const shipment of shipments) {
      if (!shipment.accession_number && shipment.lab_kit_id) {
        const kit = kitMap.get(shipment.lab_kit_id)
        if (kit?.accession_number) {
          shipment.accession_number = kit.accession_number
          accessions.add(kit.accession_number)
        }
      }
    }

    // Load subject visit assignments.
    const subjectById = new Map<string, ShipmentSubjectInfo & { study_id: string | null }>()
    if (subjectVisitIds.size > 0) {
      const { data: visitRows, error: visitErr } = await supabase
        .from('subject_visits')
        .select('id, study_id, subject_id, visit_name, visit_date, accession_number, subjects(subject_number)')
        .in('id', Array.from(subjectVisitIds))

      if (visitErr) {
        throw new Error(`Failed to load subject visit assignments: ${visitErr.message}`)
      }

      for (const row of visitRows || []) {
        subjectById.set((row as any).id as string, {
          subject_id: (row as any).subject_id ?? null,
          subject_number: (row as any).subjects?.subject_number ?? null,
          visit_id: (row as any).id as string,
          visit_name: (row as any).visit_name ?? null,
          visit_date: (row as any).visit_date ?? null,
          study_id: (row as any).study_id ?? null
        })
      }
    }

    const subjectByAcc = new Map<string, ShipmentSubjectInfo & { study_id: string | null }>()
    if (accessions.size > 0) {
      const { data: visitByAccRows, error: visitByAccErr } = await supabase
        .from('subject_visits')
        .select('id, study_id, subject_id, visit_name, visit_date, accession_number, created_at, subjects(subject_number)')
        .in('accession_number', Array.from(accessions))
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (visitByAccErr) {
        throw new Error(`Failed to map accession numbers to visits: ${visitByAccErr.message}`)
      }

      for (const row of visitByAccRows || []) {
        const acc = (row as any).accession_number as string | null
        if (!acc || subjectByAcc.has(acc)) continue
        subjectByAcc.set(acc, {
          subject_id: (row as any).subject_id ?? null,
          subject_number: (row as any).subjects?.subject_number ?? null,
          visit_id: (row as any).id as string,
          visit_name: (row as any).visit_name ?? null,
          visit_date: (row as any).visit_date ?? null,
          study_id: (row as any).study_id ?? null
        })
      }
    }

    const enriched: EnrichedShipment[] = []

    for (const shipment of shipments) {
      const kit = shipment.lab_kit_id
        ? kitMap.get(shipment.lab_kit_id) ?? null
        : shipment.accession_number
          ? kitByAccession.get(shipment.accession_number) ?? null
          : null

      const subjectFromId = shipment.subject_visit_id ? subjectById.get(shipment.subject_visit_id) ?? null : null
      const accessionNumber = shipment.accession_number ?? kit?.accession_number ?? null
      const subjectFromAcc = !subjectFromId && accessionNumber ? subjectByAcc.get(accessionNumber) ?? null : null
      const subject = subjectFromId || subjectFromAcc || null

      const studyId = shipment.study_id || kit?.study_id || subject?.study_id || null
      const studyProtocol = shipment.study_protocol || kit?.study_protocol || null
      const studyTitle = shipment.study_title || kit?.study_title || null

      enriched.push({
        id: shipment.id,
        study_id: studyId,
        study_protocol: studyProtocol,
        study_title: studyTitle,
        lab_kit_id: shipment.lab_kit_id ?? (kit ? kit.id : null),
        subject_visit_id: shipment.subject_visit_id ?? (subject?.visit_id ?? null),
        accession_number: accessionNumber,
        airway_bill_number: shipment.airway_bill_number,
        carrier: shipment.carrier,
        shipped_date: shipment.shipped_date,
        estimated_delivery: shipment.estimated_delivery,
        actual_delivery: shipment.actual_delivery,
        tracking_status: shipment.tracking_status,
        ups_tracking_payload: shipment.ups_tracking_payload,
        last_tracking_update: shipment.last_tracking_update,
        subject_assignment: subject ? {
          subject_id: subject.subject_id,
          subject_number: subject.subject_number,
          visit_id: subject.visit_id,
          visit_name: subject.visit_name,
          visit_date: subject.visit_date
        } : null,
        kit: kit ? {
          id: kit.id,
          kit_type: kit.kit_type ?? null,
          status: kit.status ?? null,
          accession_number: kit.accession_number ?? null,
          visit_schedule_id: kit.visit_schedule_id,
          visit_schedule: kit.visit_schedule ?? null
        } : null
      })
    }

    return enriched
  } catch (error) {
    logger.error('fetchShipmentsForStudies failed', error as any)
    throw error instanceof Error ? error : new Error('Failed to load shipments')
  }
}
