# Coordinator Workload Estimation (CWE) Integration Guide

This guide describes how to integrate the **Coordinator Workload Estimation (CWE)** system into the Study Coordinator Pro web app.  
It replaces static feasibility scoring with a dynamic workload engine that models **study lifecycle, recruitment status, visit intensity, and real-time coordinator metrics**.

---

## 🧩 Overview

The CWE module introduces:
- **Lifecycle weighting** (`start_up`, `active`, `follow_up`, `close_out`)
- **Recruitment status weighting** (`enrolling`, `paused`, `closed_to_accrual`, `on_hold`)
- **Visit-level intensity weighting** (e.g., Screening, Baseline, Dose/Titration, Follow-up)
- **Dynamic task multipliers** for screening and query burden
- **Protocol complexity rubric** plus **meeting/admin load** to anchor baseline scoring
- **Three core workload states:**
  - **Now:** Baseline snapshot  
  - **Actuals:** Completed visits  
  - **Forecast:** Upcoming 4-week projection

### Implementation Status (Oct 2024)
- ✅ Schema migration (`20251022_cwe_enhanced.sql`) adds lifecycle/recruitment columns, rubric fields, meeting/admin load, visit weights table, and `cwe_*` views.  
- ✅ API routes (`/api/analytics/workload`, `/api/cwe/[studyId]`) support service-role client and gracefully fall back to anon tokens or return empty payloads if the migration has not yet run.  
- ✅ UI: Portfolio workload dashboard (`/workload`) and guided Study Workload Setup page (`/studies/[id]/workload`).  
- ✅ Coordinator metrics capture (weekly screening/query/admin hours) feeds multiplier adjustments and meeting load boosts; automatic refresh hooks still planned for a later release.

### Before You Start
1. Ensure environment variables are set in `.env.local` (and production):  
   - `NEXT_PUBLIC_SUPABASE_URL`  
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   - `SUPABASE_SERVICE_ROLE_KEY` (required for write operations; APIs fall back to anon key but lose elevated privileges).  
2. Apply `migrations/20251022_cwe_enhanced.sql` to your Supabase instance (see “Database Migration” below).  
3. Restart `next dev` after updating env vars so the runtime picks them up.

---

## ⚙️ 1. Database Migration (Supabase SQL)

Create `20251022_cwe_enhanced.sql`:

```sql
-- Lifecycle & recruitment enums
do $$ begin
  create type lifecycle_stage as enum ('start_up','active','follow_up','close_out');
  create type recruitment_status as enum ('enrolling','paused','closed_to_accrual','on_hold');
exception when duplicate_object then null; end $$;

-- Subject phase enum
do $$ begin
  create type subject_phase as enum ('active_treatment','follow_up','screen_fail');
exception when duplicate_object then null; end $$;

-- Extend studies table
alter table studies
  add column if not exists lifecycle lifecycle_stage default 'active' not null,
  add column if not exists recruitment recruitment_status default 'enrolling' not null,
  add column if not exists protocol_score numeric(4,2) default 3.00 not null,
  add column if not exists screening_multiplier numeric(3,2) default 1.00 not null,
  add column if not exists query_multiplier numeric(3,2) default 1.00 not null,
  add column if not exists meeting_admin_points numeric(6,2) default 0.00 not null,
  add column if not exists rubric_trial_type text,
  add column if not exists rubric_phase text,
  add column if not exists rubric_sponsor_type text,
  add column if not exists rubric_visit_volume text,
  add column if not exists rubric_procedural_intensity text,
  add column if not exists rubric_notes text;

alter table subjects
  add column if not exists phase subject_phase default 'active_treatment' not null;

-- Visit-level weighting
create table if not exists visit_weights (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references studies(id) on delete cascade,
  visit_type text not null,
  weight numeric(4,2) not null default 1.00,
  unique(study_id, visit_type)
);

insert into visit_weights (study_id, visit_type, weight)
select s.id, v.kind, v.weight
from studies s
cross join (values
  ('screening',1.50),('baseline',2.00),('regular',1.00),
  ('unscheduled',1.10),('early_termination',0.75),
  ('dose',1.25),('long_term',0.50)
) as v(kind, weight)
on conflict do nothing;

-- Weight lookup
create view cwe_weights as
select
  s.id as study_id,
  case s.lifecycle when 'start_up' then 1.15 when 'active' then 1.00
                   when 'follow_up' then 0.50 when 'close_out' then 0.25 end as lifecycle_w,
  case s.recruitment when 'enrolling' then 1.00 when 'paused' then 0.25
                     when 'closed_to_accrual' then 0.00 when 'on_hold' then 0.00 end as recruitment_w,
  s.protocol_score as ps, s.screening_multiplier as sm, s.query_multiplier as qm, s.meeting_admin_points
from studies s;

-- Now / Actuals / Forecast views
create view cwe_now as
select s.study_id,
  ((s.ps * coalesce(sub.active_n, 0)) + (0.5 * s.ps * coalesce(sub.followup_n, 0)) + s.meeting_admin_points) as raw_now
from cwe_weights s
left join (
  select study_id,
    count(*) filter (where phase='active_treatment') as active_n,
    count(*) filter (where phase='follow_up') as followup_n
  from subjects group by study_id
) sub on sub.study_id = s.study_id;

create view cwe_actuals as
select sv.study_id, sum(coalesce(w.weight, 1.0) * s.ps) as raw_actuals
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights w on w.study_id = sv.study_id and w.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights s on s.study_id = sv.study_id
where sv.status = 'completed'
group by sv.study_id;

create view cwe_forecast_4w as
select sv.study_id, sum(coalesce(w.weight, 1.0) * s.ps) as raw_forecast
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights w on w.study_id = sv.study_id and w.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights s on s.study_id = sv.study_id
where sv.status = 'scheduled'
  and sv.visit_date between current_date and current_date + interval '28 days'
group by sv.study_id;
```

### Oct 2025 Update — Coordinator Metrics Table

Run `migrations/20251025_add_coordinator_metrics.sql` after the core CWE migration to create the `coordinator_metrics` table (weekly per-coordinator totals), indexes, and service-role RLS policy. The migration wires an `updated_at` trigger so analytics see the latest submissions immediately and backfills existing installs by renaming `admin_hours` ➜ `meeting_hours` plus adding the new study-count columns (`screening_study_count`, `query_study_count`).

Run `migrations/20251026_restructure_coordinator_metrics.sql` to drop the legacy `study_id` column, add `recorded_by`, and introduce the `study_coordinators` table used to link coordinators with studies.

---

## 🧱 2. API Routes

> **Note:** Both routes automatically return empty results instead of throwing if the migration has not yet been applied. Once the SQL runs, responses populate with real data.

Add `src/app/api/cwe/[studyId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

export async function GET(request: NextRequest, { params }: { params: { studyId: string }}) {
  const supabase = createSupabaseAdmin()
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: weights, error: weightsError } = await supabase
    .from('cwe_weights')
    .select('lifecycle_w, recruitment_w, sm, qm, ps, meeting_admin_points')
    .eq('study_id', params.studyId)
    .single()
  if (weightsError || !weights) {
    return NextResponse.json({ error: 'Weights not found' }, { status: 404 })
  }

  const [nowRes, actualsRes, forecastRes] = await Promise.all([
    supabase.from('cwe_now').select('raw_now').eq('study_id', params.studyId).single(),
    supabase.from('cwe_actuals').select('raw_actuals').eq('study_id', params.studyId).single(),
    supabase.from('cwe_forecast_4w').select('raw_forecast').eq('study_id', params.studyId).single()
  ])

  if (nowRes.error || actualsRes.error || forecastRes.error) {
    return NextResponse.json({ error: 'Failed to load workload totals' }, { status: 500 })
  }

  const factor = weights.lifecycle_w * weights.qm * (weights.sm * weights.recruitment_w)
  return NextResponse.json({
    studyId: params.studyId,
    meetingAdminPoints: weights.meeting_admin_points ?? 0,
    now: (nowRes.data?.raw_now ?? 0) * factor,
    actuals: (actualsRes.data?.raw_actuals ?? 0) * factor,
    forecast: (forecastRes.data?.raw_forecast ?? 0) * factor
  })
}
```

---

Add `src/app/api/cwe/metrics/route.ts` for coordinator-level workload capture:

- `GET /api/cwe/metrics?coordinatorId=<uuid>` returns `{ coordinatorId, metrics: [...], assignments: [...] }`. If no coordinator is supplied, the logged-in user is assumed. Results include weekly hours plus the studies linked through `study_coordinators`.
- `POST /api/cwe/metrics` accepts `{ coordinatorId?, weekStart, meetingHours, screeningHours, screeningStudyCount, queryHours, queryStudyCount, notes? }` and records the entry with `recorded_by` set to the caller. Legacy columns are handled automatically for environments that have not yet run the restructuring migration.

This service powers the coordinator-facing submission panel and feeds analytics adjustments.

Add `src/app/api/study-coordinators/route.ts` (GET + POST) and `src/app/api/study-coordinators/[id]/route.ts` (DELETE) to manage assignments, along with `src/app/api/coordinators/route.ts` to surface coordinator profiles and linked studies for the dashboard and directory.

---

## 💻 3. UI Components

### A) Study Workload Setup Page (`/studies/[studyId]/workload`)
- Guided rubric for protocol complexity (trial type, phase, sponsor, visit volume, procedural intensity) with auto-calculated baseline score
- Lifecycle selector with contextual descriptions and recruitment cadence summary
- Fields for screening/query multipliers, meeting/admin points, and rubric notes
- Visit-type weighting grid (Screening, Baseline, Dose, Regular, Unscheduled, Long-term, Early Termination) with reset-to-defaults

### B) Portfolio Dashboard (`/workload`)
- Portfolio summary cards with lifecycle, recruitment, meeting load, and forecast status
- Checklist describing the setup steps before diving into each protocol
- “Configure Study Workload” button on every card linking to the guided page
- Coordinator Weekly Workload Log captures coordinator-level meeting hours, screening hours/study counts, and query hours/study counts, displays recent submissions, and triggers analytics refresh. Admins can select any active coordinator while beta testing.
- Coordinator Directory (`/coordinators`) lists every active coordinator with contact info and linked studies for quick QA or reassignment.
  - Prompts: hours spent in meetings, screening hours, number of studies screened, query hours resolved, and number of studies with queries that week.

### C) Analytics Enhancements
- `/api/analytics/workload` now ingests the 4-week rolling coordinator metrics to adjust screening/query multipliers (clamped between 0.6×–1.8×), distributing hours across studies via `study_coordinators` assignments when available.
- Admin/meeting load incorporates hour deltas (±40 pts window) so baseline dashboards reflect current coordination effort.
- Workload tables expose effective multipliers, average hours, contributor counts, and adjusted meeting points for transparency.

---

## 🚀 Deployment Checklist

1. [ ] Set Supabase env vars (`URL`, `ANON`, `SERVICE_ROLE`) for the target environment.  
2. [ ] Run `migrations/20251022_cwe_enhanced.sql` against Supabase (`supabase db push` or SQL editor).  
3. [ ] Run `migrations/20251025_add_coordinator_metrics.sql` to provision the initial metrics table and policies.  
4. [ ] Run `migrations/20251026_restructure_coordinator_metrics.sql` to enable coordinator-level logging and the `study_coordinators` table.  
5. [ ] Redeploy the Next.js app so updated API/React components are live.  
6. [ ] Open `/coordinators` to confirm assignments, then `/workload` and `/studies/<id>/workload` to complete the rubric + load configuration for each protocol.

---

## 🔄 4. Role-Based Workflows

### Admin
- Complete protocol rubric & meeting/admin load per study  
- Set lifecycle & recruitment cadence  
- Adjust multipliers and weights  
- Review dashboards weekly  
- Use workload data for staffing & forecasting

### Coordinator
- Mark visits **Completed** promptly  
- Log weekly **screening/query hours**  
- Monitor personal workload dashboard  
- Flag heavy or paused studies

---

## ✅ Summary

The enhanced CWE system creates a **living workload model** that continuously evolves with:
- Real-time study and visit activity  
- Changing recruitment and lifecycle phases  
- Coordinator input and observed complexity  

Together, it enables **data-driven staffing**, **predictive forecasting**, and **fair workload balance** across your research team.
