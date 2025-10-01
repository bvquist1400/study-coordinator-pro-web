# Smart Alert Dismissal: Design Specification

**Version:** 1.1
**Date:** October 2025
**Status:** Updated design (Supabase persistence)
**Impact:** Medium - Supabase table + client sync
**Effort:** 3-4 days development

---

## Problem Statement

The original dismissal flow stored alert IDs in `localStorage`, meaning alerts stayed hidden forever on that device, conditions at dismissal were lost, and coordinators switching devices re-saw the same noise. Now that alerts underpin mission-critical forecasting, we need cross-device persistence and auto-restore when conditions worsen or enough time passes.

---

## Goals

1. Persist alert dismissals per user/study in Supabase
2. Capture dismissal context (deficit, expiring counts, etc.) and compare on refresh
3. Auto-restore alerts when thresholds are exceeded or the snooze window lapses
4. Maintain quick client interactions (optimistic updates) with background sync
5. Provide auditability and telemetry (`dismiss`, `auto_restore`, `restore_manual`)

---

## Data Model

Create a new table `lab_kit_alert_dismissals`.

```sql
create table lab_kit_alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  study_id uuid not null,
  alert_id text not null,
  dismissed_at timestamptz not null default now(),
  conditions jsonb not null,
  snooze_until timestamptz null,
  auto_restore_rule text null,
  manually_restored boolean not null default false,
  restored_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index on lab_kit_alert_dismissals (user_id, study_id, alert_id) where restored_at is null;
```

- `conditions` stores snapshot values (`deficit`, `kitsExpiringSoon`, `pendingOrderQuantity`, etc.).
- `snooze_until` = `dismissed_at + interval '7 days'` (default) but configurable per rule.
- `auto_restore_rule` stores which rule caused the latest auto-restore (optional).

RLS policy (pseudo): users can read/write rows where `user_id = auth.uid()` and `study_id` matches their memberships.

---

## Client Workflow

1. **Dismiss Alert**
   - POST `/api/lab-kit-alerts/dismiss` → upsert dismissal row, return latest snapshot
   - Optimistically hide alert locally

2. **Restore Alert (manual)**
   - DELETE `/api/lab-kit-alerts/dismiss?alert_id=...`
   - Mark `manually_restored = true`, set `restored_at = now()`

3. **Auto-Restore Check**
   - Forecast/Alerts API fetch includes current alert metrics
   - API service compares against stored `conditions` + rules; if thresholds met (percentage increase, absolute deficit, snooze expired), mark row `restored_at` and include alert in response with flag `autoRestored=true`
   - Client shows badge or toast (“Alert re-opened: deficit increased 60% since dismissal”)

---

## Auto-Restore Rules

| Alert Type | Snapshot Fields | Rules |
|------------|----------------|-------|
| Deficit | `deficit`, `kitsRequired`, `kitsAvailable` | - Deficit increased ≥ 50% vs snapshot<br>- Deficit now ≥ critical threshold (10 kits)<br>- Snooze window (7 days) expired |
| Low Buffer | `bufferTarget`, `bufferShortfall` | - Buffer shortfall ≥ 2 kits<br>- Snooze window expired |
| Expiring Soon | `kitsExpiringSoon`, `earliestExpiryDate` | - Expiring count doubled<br>- Earliest expiry now within 7 days<br>- Snooze window expired |
| Pending Aging / Shipments Stuck | `daysAging`, `status` | - Aging surpassed 14 days<br>- Status changed to worse state (e.g., `shipped`→`pending`) |

Rules are encoded server-side for reproducibility; store IDs/strings for analytics.

---

## API Additions

- `POST /api/lab-kit-alerts/dismiss`
  ```json
  {
    "alert_id": "deficit-serum-kit",
    "study_id": "...",
    "conditions": {
      "deficit": 5,
      "kitsRequired": 15,
      "kitsAvailable": 10
    }
  }
  ```

- `DELETE /api/lab-kit-alerts/dismiss`
  - Query params: `alert_id`, `study_id`

- `GET /api/lab-kit-alerts/dismissed`
  - Optional, returns active dismissals for debugging/UI state

- Forecast/Alerts endpoints consult `lab_kit_alert_dismissals` when deciding whether to include alerts.

---

## Front-End Changes

- Replace localStorage with Supabase-backed hook
- Show a subtle message when an alert is auto-restored (e.g., pill `AUTO-RESTORED`)
- Add “Snooze until” metadata in Alerts tab (optional) → communicates when it returns
- Track analytics events (`lab_kits.alert.dismiss`, `lab_kits.alert.auto_restore`, `lab_kits.alert.restore_manual`)

---

## Migration Plan

1. Create table + policies (see Data Model)
2. Update API routes to read/write dismissals (fallback to prior behavior if table empty)
3. Ship client changes with optimistic updates and Supabase sync
4. Write background job that reviews rows nightly (belt-and-suspenders check) to auto-restore missed cases
5. Deprecate localStorage key after successful rollout (cleanup code + data)

---

## Testing & Acceptance

- Unit tests for rule evaluation (deficit increase, time-based restore)
- Integration test: dismiss → alter forecast data → ensure alert returns
- E2E: user dismisses, switches device/browser → alert stays hidden until rule triggers
- Observability: log auto-restore decisions; add dashboard showing counts by rule

Success criteria:
- Alerts remain hidden across devices until conditions worsen or snooze elapses
- Auto-restore happens within one refresh cycle when thresholds hit
- Telemetry available for future tuning of thresholds and snooze durations
