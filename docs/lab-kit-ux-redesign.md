# Lab Kit Management UX Redesign Proposal

**Version:** 1.1
**Date:** October 2025
**Status:** Implemented (Inventory workspace refresh)
**Impact:** Medium - UI restructuring, no data model changes

---

## Executive Summary

The approved redesign moved the lab kit workspace from a five-tab layout to a six-tab hub purpose-built around inventory, forecasting, ordering, alerts, and study configuration. This document captures the final interaction model, highlights the outcomes versus the original three-tab concept, and lists follow-up UX enhancements still in flight.

### Previous Layout (Historical Reference)
```
┌─────────────────────────────────────────────────────────┐
│ Inventory | Expired | Shipments | Orders | Alerts       │
└─────────────────────────────────────────────────────────┘
```

### Current Layout (Shipping)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Inventory | Forecast | Orders & Shipments | Archive | Alerts | Settings │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Outcomes:**
- Clear separation between day-to-day inventory work and forecasting intelligence
- Orders & Shipments combined into a single flow with shared quick actions
- Alerts dedicated to severity-triage, backed by inline highlights in Inventory & Forecast
- Settings surfaced for buffer tuning, kit overrides, and manual recompute triggers

---

## 1. Workspace Overview

### Inventory (Default)

**Purpose:** Active lab kit management with inline severity badges, grouped/list toggle, and fast paths to add kits or plan orders.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Lab Kit Management                                                [Add Inventory]   ║
║ Manage inventory, forecasting insights, orders, and shipments     [Plan Order]      ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Studies:  All | PROTO-001 | PROTO-002 | PROTO-003                                  ║
║ View:     [• Inventory] [ Forecast ] [ Orders & Shipments ] [ Archive ]            ║
║           [ Alerts ] [ Settings ]                                                   ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Summary Cards (Available • Expiring • In Use • Ordered • Alerts)                    ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Severity Highlights (rendered when issues exist)                                    ║
║ ┌──────────────────────────────────────────────────────────────────────────────┐   ║
║ │ 🔴  Critical: Serum Collection Kits deficit 15 (3 visits in next 14 days)     │   ║
║ │      [Order Kits] [Open Forecast]                                            │   ║
║ └──────────────────────────────────────────────────────────────────────────────┘   ║
║ ┌──────────────────────────────────────────────────────────────────────────────┐   ║
║ │ 🟡  Warning: 8 kits expiring in 30 days — tap to pre-filter table             │   ║
║ │      [View Expiring Kits] [Snooze]                                           │   ║
║ └──────────────────────────────────────────────────────────────────────────────┘   ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Inventory Table (group/list toggle, bulk actions, inline status updates, filters)   ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Forecast

**Purpose:** Severity-grouped forecast with buffer context, pending coverage highlights, and visit-level drilldowns.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Inventory Forecast                        Only Issues [✓]      Summary Chips:       ║
║ Critical 2 | Warnings 4 | Stable 6                                                ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ 🔴 Critical (auto-expanded)                                                        ║
║   - Serum Collection Kit → deficit 15 after pending                                ║
║   - PK Tube Kit → deficit 6 (buffer shortfall)                                     ║
║ 🟡 Warnings (collapsible)                                                           ║
║ 🔵 Stable (collapsed by default)                                                    ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Expanded row: requirements breakdown • upcoming visits • buffer meta               ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Orders & Shipments

**Purpose:** Unified ordering + logistics hub with pending/overdue surfacing, shipment creation, and mark-received prefill.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Orders & Shipments                                   [Create Shipment]              ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Pending Orders (status, expected arrival, deficit coverage, quick actions)          ║
║ Shipments In Transit (tracking, carrier, overdue flag)                              ║
║ Recently Delivered (last 30 days, deep-link to inventory)                           ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Archive

**Purpose:** Consolidated expired/destroyed/cancelled records with export/report affordances.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Archive Filters: Status (Expired • Destroyed • Cancelled) | Date Range | Search     ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Expired Kits (table)                                                                ║
║ Destroyed Kits (table)                                                              ║
║ Cancelled Orders (table)                                                            ║
║ [Export Archive] [Generate Report]                                                  ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Alerts

**Purpose:** Dedicated severity-triage center mirroring forecast buckets, with dismissal controls and audit of snoozed alerts.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Alerts Summary: Critical 2 | Warnings 3 | Stable 5                                  ║
║ [Restore Dismissed]                                                                 ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ 🔴 Critical (always expanded, non-dismissible)                                      ║
║ 🟡 Warnings (dismissible, auto-restore planned)                                     ║
║ 🔵 Stable (collapsed, informational)                                                ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Settings

**Purpose:** Study-specific configuration for buffers, kit overrides, and manual recompute.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ Kit Type Settings Panel                                                             ║
║ - Buffer Days (inventory + visit window)                                            ║
║ - Kit-specific overrides                                                            ║
║ - Manual "Recompute Recommendations" trigger                                       ║
║ - Audit log of recent changes                                                       ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

**Key Outcomes:**
1. **Inventory remains the home tab** while keeping quick access to add/plan and inline severity context.
2. **Forecast earns a dedicated surface** so the inventory table stays focused on on-hand operations.
3. **Orders & Shipments share a single progression** from pending → in transit → delivered with mark-received hooks.
4. **Alerts tab provides triage history** while Inventory/Forecast expose callouts for immediate workflows.
5. **Settings consolidates buffers and overrides** to avoid cluttering the operational tabs.

**Still Pending:**
- Global quick actions on non-Inventory tabs (tracked as a UX follow-up).
- Cross-device alert dismissal persistence (engineered but not yet shipped).
## 2. Alert Regrouping Strategy

### Severity Buckets (Shipping)

The Alerts tab and the inline Inventory/Forecast callouts share the same three-bucket model.

```typescript
type SeverityBucket = 'critical' | 'warning' | 'stable'

interface AlertBucketSummary {
  key: SeverityBucket
  items: Alert[]
  dismissible: boolean
  autoExpand: boolean
}
```

#### Bucket Definitions

- **🔴 Critical (non-dismissible):** Supply deficits without coverage, orders beyond ETA, or zero buffer scenarios.
- **🟡 Warnings (dismissible, slated for smart auto-restore):** Low buffer, expiring soon, shipments aging.<br>Users can snooze but the alert will return when conditions worsen (future enhancement).
- **🔵 Stable (dismissible, collapsed):** Informational notices such as resolved deficits with pending coverage or kits already replenished.

### Visual Presentation

**Default State**
```
╔════════════════════════════════════════════════════════════════╗
║ 🔴 Critical (2)                                   [Collapse]    ║
║   • Serum Collection: deficit 15 after pending order            ║
║   • PK Tubes: deficit 6 (buffer shortfall)                      ║
║ ── 🟡 Warnings (3) [Expand] ──                                  ║
║ ── 🔵 Stable (5) [Expand] ──                                    ║
║ ── Dismissed Alerts (2) [Restore] ──                            ║
╚════════════════════════════════════════════════════════════════╝
```

**Expanded Warning Example**
```
╔════════════════════════════════════════════════════════════════╗
║ 🟡 Warnings (3)                                   [Collapse]    ║
║ ┌────────────────────────────────────────────────────────────┐ ║
║ │ 🟡 Expiring Soon: 8 kits within 30 days                    │ ║
║ │    [Filter Inventory] [Snooze]                            │ ║
║ └────────────────────────────────────────────────────────────┘ ║
║ ┌────────────────────────────────────────────────────────────┐ ║
║ │ 🟡 Low Buffer: Serum Kits buffer 1 (< target 4)            │ ║
║ │    [Open Settings] [Dismiss]                              │ ║
║ └────────────────────────────────────────────────────────────┘ ║
╚════════════════════════════════════════════════════════════════╝
```

**Follow-ups:**
- Persist dismissals in Supabase with TTL (replaces localStorage implementation).
- Auto-restore warnings when deficit/expiring counts worsen by thresholded amounts.
- Surface cross-links back into Forecast/Inventory from each card (partially implemented via `onNavigate`).

---

## 3. Progressive Disclosure Strategy

### Principle: Default to the essentials, let power users opt in

#### Level 1: Baseline (new coordinator)
**Goal:** Add kits, respond to urgent deficits.
```
- Inventory loads with summary cards + critical callouts only.
- Forecast defaults to “Only issues” with Stable collapsed.
- Orders & Shipments emphasises Pending + Mark Received.
- Empty states link to QuickStart + Add Inventory actions.
```

#### Level 2: Working Coordinator
**Goal:** Manage supply proactively, keep shipments moving.
```
- User can expand Warnings/Stable sections for broader context.
- Inventory filters (status, expiring-only) persist per session.
- Orders & Shipments exposes search/date filters and the shipment guide.
```

#### Level 3: Power User / Site Manager
**Goal:** Forecast tuning, audits, bulk maintenance.
```
- Settings tab surfaces buffer overrides + recompute controls.
- Inventory offers grouped/list view toggle, bulk actions, archive navigation.
- Archive exposes multi-status filters + export/report buttons.
```

### Implementation Notes
- Feature access currently controlled via component props; formal role-based toggles are a future enhancement.
- Forecast + Alerts remember collapsed sections client-side (localStorage); migrate to user-scoped persistence during alert lifecycle work.
- Consider adding lightweight onboarding modals / tours keyed off coordinator role (tracked in backlog).

---

## 4. Empty States Redesign

### Current Empty State
```
No lab kits found
```

### Proposed: Context-Aware Empty States *(status: pending implementation)*

#### True Empty (No kits in database)
```
╔═══════════════════════════════════════════════════════════════╗
║                                                                ║
║                      🧪 Get Started                            ║
║                                                                ║
║     Welcome to Lab Kit Management! Here's how to begin:       ║
║                                                                ║
║  1️⃣  Add Kit Types                                            ║
║     Define which lab kits your study uses                     ║
║     → Go to Study Settings → Lab Kit Types                    ║
║                                                                ║
║  2️⃣  Set Visit Requirements                                   ║
║     Specify which visits need which kits                      ║
║     → Schedule of Events → Kit Requirements                   ║
║                                                                ║
║  3️⃣  Add Inventory                                            ║
║     Record kits you've received from vendors                  ║
║     → Click "Add Inventory" above                             ║
║                                                                ║
║         [📚 View Quick Start Guide] [+ Add First Kit]         ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
```

#### Filtered Empty (Kits exist but hidden)
```
╔═══════════════════════════════════════════════════════════════╗
║                                                                ║
║                  🔍 No kits match your filters                 ║
║                                                                ║
║         Current filters: Status = "Expired" + "SCK"           ║
║                                                                ║
║                      [Clear All Filters]                       ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
```

#### Study-Specific Empty
```
╔═══════════════════════════════════════════════════════════════╗
║                                                                ║
║        📦 No lab kits for Study PROTO-001 yet                  ║
║                                                                ║
║  This study uses: Serum Collection Kit, Urine Collection Kit  ║
║                                                                ║
║         [+ Add Inventory] [Plan First Order]                   ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 5. Migration Recap

| Phase | Status | Notes |
|-------|--------|-------|
| Feature flag rollout | ✅ Completed | `NEXT_PUBLIC_LAB_KIT_NEW_LAYOUT` guarded the new layout during pilot. |
| Beta with coordinators | ✅ Completed | Feedback from three sites drove additions (Forecast tab, Settings access). |
| Gradual rollout | ✅ Completed | 25% → 50% → 100% rollout executed over two weeks with minimal regressions. |
| Legacy removal | ✅ Completed | Old components removed in commit `d6f5fb0`; documentation updated. |
| Post-launch follow-ups | ⏳ In progress | Alert persistence + empty states remain outstanding. |

---

## 6. User Acceptance Criteria (Post-Launch Audit)

| Priority | Criterion | Status | Notes |
|----------|-----------|--------|-------|
| P0 | All legacy tab functions accessible in new workspace | ✅ | Inventory, Forecast, Orders & Shipments, Archive, Alerts, Settings cover prior flows. |
| P0 | Critical alerts always visible / non-dismissible | ✅ | Enforced in Alert bucket logic + inline callouts. |
| P0 | No data loss or workflow disruption during rollout | ✅ | Monitored via pilot + gradual rollout. |
| P0 | Mobile responsiveness ≥320px | ✅ | Verified during QA (Inventory table collapses to cards). |
| P1 | Alert dismissal persists across sessions/devices | ⚠️ Partial | LocalStorage persistence only; Supabase-backed persistence planned. |
| P1 | Empty states provide actionable guidance | ⚠️ Pending | Design documented here; implementation in backlog. |
| P1 | Keyboard navigation (Tab, Enter, Escape) | ✅ | Buttons/segmented controls accessible; bulk actions to monitor. |
| P2 | User-customisable alert thresholds | ⏳ | Not started. |
| P2 | Drag-and-drop tab reordering | ⏳ | Not started; low priority. |
| P2 | Export/import user preferences | ⏳ | Not started. |

---

## 7. Analytics & Success Metrics

### Key Performance Indicators

```typescript
interface Metrics {
  // Efficiency
  avgTimeToAddInventory: number  // Target: <30s (from 45s)
  avgClicksToOrder: number        // Target: 2 (from 4)
  avgTimeToFindKit: number        // Target: <10s (from 20s)

  // Engagement
  alertsDismissedPerSession: number
  alertsAutoRestoredPerWeek: number
  tabSwitchesPerSession: number   // Target: <5 (from 8)

  // Errors
  orderErrorRate: number          // Target: <2% (from 5%)
  searchEmptyResults: number      // Target: <10% (from 25%)
}
```

### Experiment Hypotheses
1. **Inventory + Forecast separation reduces time-to-task by 30%** (baseline vs v1.1 telemetry).
2. **Inline severity highlights drive 20% more timely order creation** (orders placed within 24h of deficit).
3. **Smart dismissal + auto-restore will reduce repeated alert exposure by 40%** (post-implementation goal).

---

## 8. Stakeholder Review Checklist

### For Study Coordinators
- [ ] Can you find all current features in the new layout?
- [ ] Do the alerts feel helpful or overwhelming?
- [ ] Is the "Add Inventory" button easy to find?
- [ ] Would the empty state guidance help new users?

### For Site Managers
- [ ] Does the archive provide sufficient audit trail?
- [ ] Are reporting tools easily accessible?
- [ ] Does the orders/shipments workflow make sense?

### For Technical Team
- [ ] Are migration risks acceptable?
- [ ] Is the feature flag strategy clear?
- [ ] Can we A/B test safely?

---

## Appendix A: Component Mapping

### Current → New
| Legacy Tab | Shipped Location | Component Notes |
|------------|------------------|-----------------|
| Inventory  | Inventory         | Retained; summary + severity badges inline. |
| Expired    | Archive           | Folded into multi-status archive filters. |
| Shipments  | Orders & Shipments| Combined with ordering; shared quick actions. |
| Orders     | Orders & Shipments| See above; new unified component. |
| Alerts     | Alerts            | Dedicated severity bucket view + dismissal history. |
| *(new)* Settings | Settings    | Houses buffer overrides, kit-type config. |

### File Changes
```
MODIFY: src/app/lab-kits/page.tsx
  - Expand ViewMode type: 5 → 6 options
  - Merge orders/shipments rendering
  - Support six view modes (inventory, forecast, orders-shipments, archive, alerts, settings)
  - Route inline alerts + severity highlights

MODIFY: src/components/lab-kits/LabKitAlertsPanel.tsx
  - Implement severity buckets + dismissal persistence (localStorage → Supabase planned)
  - Surface navigation callbacks back into Inventory/Forecast

MODIFY: src/components/lab-kits/InventoryForecast.tsx
  - Group rows by severity, add summary chips, collapsible sections

MODIFY: src/components/lab-kits/OrdersAndShipmentsView.tsx
  - Combine pending orders + shipments + recent deliveries
  - Trigger `Create Shipment` modal + Locate kit callbacks

MODIFY: src/components/lab-kits/ArchiveView.tsx
  - Multi-status filters and export/report hooks

MODIFY: src/components/lab-kits/KitTypeSettingsPanel.tsx
  - Buffer overrides, manual recompute action, audit log

TODO: src/components/lab-kits/EmptyStateGuide.tsx (planned)
  - Context-aware empty states + quick-start guidance
```

---

## Next Steps

1. Ship Supabase-backed alert dismissal + auto-restore thresholds (align with lab-kit management review).
2. Implement context-aware empty states and QuickStart banner from Section 4.
3. Add global quick actions (Add Inventory / Plan Order) to Orders & Shipments, Alerts, and Settings views.
4. Capture usage analytics (tab switches, forecast interactions) to validate KPI targets in Section 7.
5. Re-run usability check with coordinators once alert lifecycle and empty states land.

---

**Questions or Feedback?** Contact the development team or add comments to this document.
