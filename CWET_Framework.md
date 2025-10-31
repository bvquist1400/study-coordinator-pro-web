# Coordinator Workload Estimation (CWE) Tool — Final Framework

## Purpose
The **Coordinator Workload Estimation (CWE) Tool** is a data-driven framework for quantifying and forecasting clinical research coordinator workload.  
It integrates protocol complexity, study lifecycle, recruitment status, visit-level weights, and real-time coordinator metrics to produce a living workload model that evolves as studies progress.

### Goal
To replace static feasibility scoring with a dynamic workload system that predicts coordinator demand, monitors effort, and supports evidence-based staffing decisions across active research programs.

---

## What’s New in This Version
- Introduced **Recruitment Status** (`enrolling`, `paused`, `closed_to_accrual`, `on_hold`) to toggle screening load.  
- Added **Visit-Level Weighting** to account for differences in visit intensity.  
- Lifecycle remains the macro-phase driver (`start_up → active → follow_up → close_out`).  
- Three key measures calculated: **Now (baseline)**, **Actuals (completed visits)**, and **Forecast (upcoming visits)**.
- Implemented **protocol complexity rubric**, **meeting/admin load**, and guided workload configuration UI in the Study Coordinator Pro web app.
- Introduced **study coordinator assignments + weekly metrics loop** so recorded hours and study counts dynamically adjust screening/query multipliers and meeting load.
- Expanded the **Members** dashboard to resolve coordinator identities (name/email) and manage per-study assignments inline, keeping directory views and workload snapshots aligned.
- Normalized **study status, recruitment status, and lifecycle labels** across the application, with automatic recruitment alignment when studies are closed to enrollment.
- Added **per-study coordinator workload breakdowns** so weekly log submissions capture hours and notes by assignment while preserving the aggregate loop.

---

## Current Implementation Snapshot

| Area | Status | Notes |
|------|--------|-------|
| Schema | ✅ | `studies` table includes lifecycle, recruitment, rubric fields, and meeting/admin load. `coordinator_metrics_notes` stores per-study log breakdowns. |
| API | ✅ | `/api/analytics/workload` and `/api/cwe/[studyId]` deliver workload totals; `/api/cwe/metrics` now persists aggregate + per-study entries via `save_coordinator_metrics_with_breakdown`. |
| UI | ✅ | `/workload` dashboard surfaces portfolio summary; `/studies/[id]/workload` guides rubric scoring, lifecycle selection, multipliers, meeting load, and visit weights. Status chips share a common label & color system. |
| Coordinator Metrics Loop | ✅ | Weekly metrics logging via `/api/cwe/metrics` and study assignments power adaptive multipliers in workload analytics with detailed breakdown persistence. |
| Automation | 🚧 In Progress | Snapshot cache + nightly `/api/cron/cwe-backfill` refresh are live with Slack alerting (`CWE_CRON_ALERT_WEBHOOK_URL`); `cwe-refresh` Edge function deployed and manually verified; Supabase broadcast listener still pending UI support. |

---

## Upcoming Work

- **Visual coverage expansion:** Extend Playwright screenshot tests beyond the stacked breakdown chart (coordinator load table + study detail grid) once layouts stabilize.
- **Realtime automation listener:** remains blocked on Supabase broadcast → Edge bindings; once live, phase out the scheduled `/api/cron/cwe-refresh` job after two weeks of clean realtime runs.
- **Visit intensity wiring:** Connect SOE visit templates to the `visit_weights` configuration so forecast math and dashboards reflect the weighted workload per visit type.
- **Coordinator assignments in SOE:** Explore assigning coordinators while configuring visits so downstream workload logs can pre-fill who owns each step.

---

## 1. Core Components

| Component | Description |
|------------|-------------|
| **Protocol Complexity** | Base difficulty score from rubric: phase, procedures, sponsor, and volume. |
| **Lifecycle Stage** | `start_up (1.15)`, `active (1.00)`, `follow_up (0.50)`, `close_out (0.25)` |
| **Recruitment Status** | `enrolling (1.00)`, `paused (0.25)`, `closed_to_accrual (0.00)`, `on_hold (0.00)` — controls screening workload. |
| **Visit-Level Weighting** | Each visit type (Screening, Baseline, Follow-up) has a defined workload intensity. |
| **Task Multipliers** | `screening_multiplier (0.5–2.0)`, `query_multiplier (0.5–1.5)` |
| **Calendar Forecast** | Upcoming visits (next 4 weeks) × visit-type weight × protocol score. |
| **Coordinator Metrics** | Weekly hours in meetings, screening, and queries for calibration and validation. |

---

## 2. Base Scoring Rubric

| Attribute | Criteria | Example | Score |
|------------|-----------|----------|--------|
| Trial Type | Observational / Registry |  | 1 |
| Trial Type | Interventional (Low Intensity) |  | 3 |
| Trial Type | Interventional (High Intensity) |  | 5 |
| Trial Phase | Phase II / III |  | +1 |
| Trial Phase | Phase I or FIH |  | +2 |
| Sponsor Type | Industry-sponsored |  | +1 |
| Visit Volume | ≥ 8 visits per patient |  | +2 |
| Procedural Intensity | High (Imaging, Biopsies, etc.) |  | +2 |

---

## 3. Recruitment Status

| Status | Weight | Effect |
|---------|---------|--------|
| enrolling | 1.00 | Full screening and enrollment effort. |
| paused | 0.25 | Minimal screening activity; temporary hold. |
| closed_to_accrual | 0.00 | Study remains active but no new participants. |
| on_hold | 0.00 | Inactive — regulatory or contractual suspension. |

---

## 4. Visit-Level Weighting

| Visit Type | Default Weight | Notes |
|-------------|----------------|--------|
| Screening | 1.5 | Multiplied by recruitment weight; inactive when closed_to_accrual. |
| Baseline / Day 1 | 2.0 | Highest operational and data load. |
| Dose / Titration | 1.25 | Moderate complexity, frequent checks. |
| Routine Follow-up | 1.0 | Standard recurring visit. |
| Long-term Follow-up | 0.5 | Minimal load, mostly data verification. |
| Unscheduled | 1.0 | Unexpected or urgent visits. |

---

## 5. Dynamic Task Modifiers

| Task Type | Range | Description |
|------------|--------|-------------|
| Screening Complexity | 0.5–2.0 | Adjusts for internal screening workflow difficulty. |
| Query / Data Burden | 0.5–1.5 | Adjusts for data resolution and EDC load. |
| Meeting / Admin Load | 2–4 pts/mo | Optional, department-level contribution. |

---

## 6. Workload Formulas

Let  
`LW` = lifecycle weight  
`RW` = recruitment weight  
`SM` = screening multiplier  
`QM` = query multiplier  
`PS` = protocol score  
`A` = active patients  
`F` = follow-up patients  
`M` = meeting/admin points  

### Now (Baseline)
```
LW × [ (PS × A) + (0.5 × PS × F) + M ] × QM × (SM × RW)
```

### Actuals (Completed Visits)
```
LW × (Σ completed visits × PS × visit_weight) × QM × (SM × RW)
```

### Forecast (Next 4 Weeks)
```
LW × (Σ scheduled visits × PS × visit_weight) × QM × (SM × RW)
```

---

## 7. Implementation Notes
- Add **Recruitment Status** and **Visit Weights** to each study’s data model.  
- Lifecycle defines the macro phase; Recruitment determines screening activity.  
- Visit weighting refines accuracy for forecasting and reporting.  
- Weekly coordinator metrics (meeting/screening/query hours + study counts) feed adaptive Screening/Query multipliers and meeting load adjustments.  
- Study coordinator assignments distribute recorded effort across linked protocols before multiplier scaling.  
- Workload dashboards serve cached 5-minute snapshots, automatically refreshed after key events or via nightly automation.  
- Dashboards show three states — **Now**, **Actuals**, and **Forecast** — for proactive workload management.
