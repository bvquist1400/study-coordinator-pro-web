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

---

## 🧱 2. API Routes

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
