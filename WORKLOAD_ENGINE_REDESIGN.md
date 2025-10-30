# Workload Engine & Visit Points Redesign  
*(Implementation Specification — Study Coordinator Pro)*

## 1. Overview
This document defines the next major iteration of the **Workload Engine**, aligning data capture, forecasting, and coordinator load tracking.  
The goal is to connect **weekly effort logs**, **visit-level points**, and **real coordinator assignments** to produce a single, accurate source of truth for workload forecasting and bottleneck analysis.

---

## 2. Objectives
| Goal | Outcome |
|------|----------|
| **Ease of entry** | Coordinators enter three numbers per week instead of per-study data. |
| **Comparable load** | Standardized point system and normalized utilization % by capacity. |
| **Forecast accuracy** | Link points per visit → actual visits → assigned coordinator. |
| **Bottleneck visibility** | Identify overloads and under-utilized staff by week, site, and study. |

---

## 3. Database Additions (Supabase)

### 3.1 New / Updated Tables

#### `visit_types`
| column | type | description |
|---------|------|-------------|
| id | uuid PK | |
| study_id | uuid FK | parent study |
| name | text | visit label (e.g. “Week 12”) |
| base_points | numeric | workload points for this visit type |
| rn_required | boolean | true → only RN-qualified coordinators |
| weight_json | jsonb nullable | optional task-level multipliers |

#### `subject_visits`
(add or extend existing table)
| column | type | description |
|---------|------|-------------|
| id | uuid PK | |
| visit_type_id | uuid FK | |
| assigned_coordinator_id | uuid FK nullable | who performed visit |
| points_override | numeric nullable | manual adjustment |
| points_final | generated | `COALESCE(points_override, visit_types.base_points)` |

#### `visit_work_segments`
(optional if you need splits)
| column | type | description |
|---------|------|-------------|
| subject_visit_id | uuid FK | |
| coordinator_id | uuid FK | |
| percent_or_hours | numeric | portion of visit attributed |

#### `weekly_logs`
(simplified)
| column | type | description |
|---------|------|-------------|
| coordinator_id | uuid FK | |
| week_start | date | ISO week start |
| meetings_hr | numeric | total hours (all studies) |
| screening_hr | numeric | total hours (all studies) |
| queries_hr | numeric | total hours (all studies) |
| notes | text nullable | context |
| locked_bool | boolean | auto-true after deadline |
| created_by | uuid FK | audit |

#### `coordinators`
Add `capacity_hours numeric`, `role text`, `skills text[]`, `site text`.

#### `study_assignments`
Add `start_date`, `end_date`, `status`.

#### `protocol_archetypes`
Library mapping study type → expected hours by category.

#### `holidays`
| date | site | reason | – for capacity adjustments |

---

## 4. Analytics Views

### 4.1 `coordinator_visit_points_daily`
```sql
SELECT
  v.actual_date::date AS d,
  COALESCE(ws.coordinator_id, v.assigned_coordinator_id) AS coordinator_id,
  CASE
    WHEN ws.coordinator_id IS NULL THEN v.points_final
    ELSE v.points_final * ws.percent_or_hours
  END AS points
FROM subject_visits v
LEFT JOIN visit_work_segments ws ON ws.subject_visit_id = v.id
WHERE v.status = 'completed';
```

### 4.2 `coordinator_utilization_weekly`
```sql
SELECT
  c.id AS coordinator_id,
  date_trunc('week', d) AS week_start,
  SUM(points) AS visit_points,
  wl.meetings_hr,
  wl.screening_hr,
  wl.queries_hr,
  c.capacity_hours,
  (wl.meetings_hr + wl.screening_hr + wl.queries_hr)
     / NULLIF(c.capacity_hours,0) AS util_pct_hours
FROM coordinator_visit_points_daily dpts
JOIN coordinators c ON c.id = dpts.coordinator_id
LEFT JOIN weekly_logs wl
  ON wl.coordinator_id = c.id
 AND wl.week_start = date_trunc('week', dpts.d)
GROUP BY 1,2,3,4,5,6,7;
```

### 4.3 `study_points_weekly`
```sql
SELECT
  study_id,
  date_trunc('week', actual_date) AS wk,
  SUM(points_final) AS points
FROM subject_visits
WHERE status = 'completed'
GROUP BY 1,2;
```

---

## 5. UI / UX Changes

### 5.1 Visit Details Modal
- Add **Assigned Coordinator** dropdown (nullable).  
- Optional **Split Work** toggle to add multiple coordinators + percent.  
- Lock assignment once visit = *Completed*.

### 5.2 Weekly Workload Log
**Replace** per-study table with:
```
Meetings (hrs): [ ]
Screening (hrs): [ ]
Queries (hrs): [ ]
Notes: [__________]
[Submit]   [Restore Last Week]
```
Totals roll up to one record / coordinator / week.  
Validation: ≥0, ≤capacity + soft warning, note required if >capacity.  
Deadline lock (Monday 10 AM recommended).

### 5.3 Coordinator Load Dashboard
- Stack **Completed Visit Points** + **Weekly Hours** against capacity.  
- Color-coded utilization (green < 80%, yellow 80–95%, red > 95%).  
- Sparkline of 8-week trend per coordinator.  
- “Unassigned upcoming visits” queue.

### 5.4 Study Detail Page
Add columns:
- Now (pts this week)  
- Next 4 w Forecast (pts)  
- Assigned Coordinators (list)

### 5.5 Feasibility Simulator
Use `protocol_archetypes` + rolling averages to predict incremental hours:
```
expected_screening_hr = avg_screening_hr * projected_screens_per_week
```
Output coordinator utilization % after hypothetical study start.

---

## 6. Governance & Workflow
| Step | Owner | Timing |
|------|--------|--------|
| Log weekly hours | Coordinator | every Fri |
| Auto-lock logs | System | Mon 10 AM |
| Review overloads | Supervisor | weekly stand-up |
| Adjust capacity / reassign visits | Supervisor | as needed |
| Update archetypes | Admin | quarterly |

---

## 7. Future Enhancements
- Auto-calculate visit points from EDC or Asana milestones.  
- “Capacity Health” chart → compare actual vs forecast per study.  
- PTO integration (holiday table adjusts capacity).  
- Editable visit-split percentages via drag in timeline.  
- Live utilization API endpoint for dashboards.

---

## 8. Next Actions
1. Run Supabase migration with tables / views above.  
2. Update API routes and Prisma schema (if applicable).  
3. Build Visit Details → Assign Coordinator form.  
4. Replace current weekly-log table UI.  
5. Add “Coordinator Load” dashboard widgets.  
6. Test data pipeline with sample visits and weekly logs.  
7. Document the workflow in README → link to this file.

---

**Maintainer:** @bvquist1400  
**Last updated:** 2025-10-29  
