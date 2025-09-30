# Lab Kit Management UX Redesign Proposal

**Version:** 1.0
**Date:** September 2025
**Status:** Stakeholder Review
**Impact:** Medium - UI restructuring, no data model changes

---

## Executive Summary

This proposal consolidates the lab kit management interface from **5 tabs to 3**, reduces cognitive load, and implements contextual alert placement. All changes are UI-only with zero backend impact.

### Current State: 5 Tabs
```
┌─────────────────────────────────────────────────────────┐
│ Inventory | Expired | Shipments | Orders | Alerts       │
└─────────────────────────────────────────────────────────┘
```

### Proposed: 3 Tabs
```
┌─────────────────────────────────────────────────────────┐
│ Inventory | Orders & Shipments | Archive                │
└─────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- 40% reduction in navigation complexity
- Alerts become contextual (not a separate destination)
- Orders + Shipments unified (they're sequential workflow states)
- Archive consolidates inactive records

---

## 1. Three-Tab Navigation Mockup

### Tab 1: Inventory (Default View)

**Purpose:** Active lab kit management with integrated forecasting and alerts

```
╔═══════════════════════════════════════════════════════════════════════╗
║ Lab Kit Management                                    [Add Inventory] ║
║ Manage inventory, ordering, and shipment tracking     [Plan Order]    ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ Studies: [All Studies] [PROTO-001] [PROTO-002] [PROTO-003]           ║
║ View:    [• Inventory] [ Orders & Shipments] [ Archive]              ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                         Summary Cards                                  ║
║ ┌──────────┬──────────┬──────────┬──────────┐                        ║
║ │Available │ Expiring │ In Use   │ Ordered  │                        ║
║ │   142    │    8     │    45    │    30    │                        ║
║ └──────────┴──────────┴──────────┴──────────┘                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ ⚠️  Critical Alerts (2)                                 [Dismiss All] ║
║ ┌─────────────────────────────────────────────────────────────────┐  ║
║ │ 🔴 Supply Deficit: Serum Collection Kit                         │  ║
║ │    Need 15 more by Dec 5 (3 upcoming visits)                   │  ║
║ │    [Order 15 Kits] [View Forecast]                             │  ║
║ └─────────────────────────────────────────────────────────────────┘  ║
║ ┌─────────────────────────────────────────────────────────────────┐  ║
║ │ 🟡 Expiring Soon: 8 kits expire within 30 days                  │  ║
║ │    [View Expiring Kits] [Dismiss]                               │  ║
║ └─────────────────────────────────────────────────────────────────┘  ║
║                                                                        ║
║ ── ── Show Dismissed Alerts (3) ── ──                                ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ Inventory Table                              [Search] [Status: All ▾] ║
║ ┏━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━┓             ║
║ ┃ Accession┃ Kit Type  ┃ Status ┃ Expiry   ┃ Actions ┃             ║
║ ┣━━━━━━━━━━╋━━━━━━━━━━━╋━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━┫             ║
║ ┃ SCK-0001 ┃ Serum     ┃ 🟢 Avail┃ 2026-03  ┃ [Edit]  ┃             ║
║ ┃ SCK-0002 ┃ Serum     ┃ 🟡 Exp  ┃ 2025-10  ┃ [Edit]  ┃             ║
║ ┃ UCK-0045 ┃ Urine     ┃ 🔵 In Use┃ 2026-01 ┃ [View]  ┃             ║
║ ┗━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━┻━━━━━━━━━━┻━━━━━━━━━┛             ║
║                                                                        ║
║ Showing 142 of 142 kits                                               ║
║                                                                        ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Key Changes:**
1. **Alerts inline** - No separate tab; alerts appear above inventory
2. **Quick actions** - "Order Kits" button directly in deficit alerts
3. **Collapsible dismissed** - Dismissed alerts hidden by default, expandable
4. **Summary cards** - Always visible for at-a-glance status

---

### Tab 2: Orders & Shipments

**Purpose:** Unified view of the ordering → receiving workflow

```
╔═══════════════════════════════════════════════════════════════════════╗
║ Lab Kit Management                                    [Add Inventory] ║
║ Manage inventory, ordering, and shipment tracking     [Plan Order]    ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ Studies: [All Studies] [PROTO-001] [PROTO-002] [PROTO-003]           ║
║ View:    [ Inventory] [• Orders & Shipments] [ Archive]              ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ 📦 Pending Orders (3)                                  [+ Plan Order] ║
║ ┌─────────────────────────────────────────────────────────────────┐  ║
║ │ Serum Collection Kit × 15                                       │  ║
║ │ Ordered: Nov 15 • Expected: Dec 1 • Vendor: LabCorp            │  ║
║ │ [Mark Received] [Edit] [Cancel]                                │  ║
║ └─────────────────────────────────────────────────────────────────┘  ║
║ ┌─────────────────────────────────────────────────────────────────┐  ║
║ │ 🔴 OVERDUE: Urine Collection Kit × 8                            │  ║
║ │ Ordered: Oct 20 • Expected: Nov 5 • Vendor: Quest              │  ║
║ │ [Mark Received] [Edit] [Contact Vendor]                        │  ║
║ └─────────────────────────────────────────────────────────────────┘  ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ 🚚 In-Transit Shipments (2)                       [+ Create Shipment] ║
║ ┌─────────────────────────────────────────────────────────────────┐  ║
║ │ Accession: SCK-0150 → Subject 12345                             │  ║
║ │ Shipped: Nov 20 • Tracking: 1Z999AA1234567890                  │  ║
║ │ [Mark Delivered] [View Details] [Track Package]                │  ║
║ └─────────────────────────────────────────────────────────────────┘  ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ ✅ Recent Deliveries (Last 30 Days)                                   ║
║ ┏━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━┓              ║
║ ┃ Date       ┃ Accession    ┃ Subject   ┃ Status    ┃              ║
║ ┣━━━━━━━━━━━━╋━━━━━━━━━━━━━━╋━━━━━━━━━━━╋━━━━━━━━━━━┫              ║
║ ┃ Nov 18     ┃ SCK-0145     ┃ 12340     ┃ Delivered ┃              ║
║ ┃ Nov 15     ┃ UCK-0067     ┃ 12338     ┃ Delivered ┃              ║
║ ┗━━━━━━━━━━━━┻━━━━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━━┛              ║
║                                                                        ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Key Changes:**
1. **Workflow progression** - Pending → In-Transit → Delivered in one view
2. **Status hierarchy** - Overdue orders highlighted at top
3. **Quick actions** - "Mark Received" triggers inventory entry modal
4. **Recent history** - Last 30 days visible, full history in Archive

---

### Tab 3: Archive

**Purpose:** Consolidated view of expired, destroyed, and historical records

```
╔═══════════════════════════════════════════════════════════════════════╗
║ Lab Kit Management                                    [Add Inventory] ║
║ Manage inventory, ordering, and shipment tracking     [Plan Order]    ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ Studies: [All Studies] [PROTO-001] [PROTO-002] [PROTO-003]           ║
║ View:    [ Inventory] [ Orders & Shipments] [• Archive]              ║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ Archive Filters                                                        ║
║ Status: [Expired ✓] [Destroyed ✓] [Cancelled ✓]  Date: [Last Year ▾]║
║                                                                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║ 🗑️  Expired Kits (24)                                                 ║
║ ┏━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━┓           ║
║ ┃ Accession┃ Kit Type  ┃ Expired   ┃ Reason   ┃ Actions ┃           ║
║ ┣━━━━━━━━━━╋━━━━━━━━━━━╋━━━━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━┫           ║
║ ┃ SCK-0012 ┃ Serum     ┃ 2025-08   ┃ Expired  ┃ [View]  ┃           ║
║ ┃ UCK-0034 ┃ Urine     ┃ 2025-07   ┃ Damaged  ┃ [View]  ┃           ║
║ ┗━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━┻━━━━━━━━━┛           ║
║                                                                        ║
║ [Export Archive] [Generate Report]                                    ║
║                                                                        ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Key Changes:**
1. **Single archive** - Expired, destroyed, and cancelled in one place
2. **Audit-focused** - Export and reporting tools prominent
3. **Read-only** - Simplified actions (view only, no editing)

---

## 2. Alert Regrouping Strategy

### Current: 6 Separate Alert Sections
- Supply Deficit
- Expiring Soon
- Pending Orders Aging
- Shipped but Stuck
- Low Buffer Warning
- Expired Kits

### Proposed: 3 Priority Groups

```typescript
interface AlertGroups {
  critical: Alert[]   // Always show, can't dismiss
  operational: Alert[] // Logistics issues, dismissible
  warnings: Alert[]    // Proactive alerts, dismissible
}
```

#### Alert Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 Critical (Non-dismissible)                               │
│ ├─ Supply Deficit (0 coverage for upcoming visits)         │
│ └─ Overdue Orders (past expected delivery date)            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 🟡 Operational (Dismissible, auto-restore on worsen)       │
│ ├─ Pending Orders Aging (>7 days with no update)           │
│ ├─ Shipments Stuck (>5 days since ship, no delivery)       │
│ └─ Low Buffer Warning (<50% recommended buffer)            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 🔵 Warnings (Dismissible, 7-day auto-restore)              │
│ ├─ Expiring Soon (within 30 days)                          │
│ └─ Expired Kits (ready for archive)                        │
└─────────────────────────────────────────────────────────────┘
```

### Visual Presentation

**Collapsed State (Default)**
```
╔═══════════════════════════════════════════════════════════════╗
║ ⚠️  Critical Alerts (2)                        [Expand All]   ║
║ 🔴 Supply Deficit: 2 kit types need orders                    ║
║ 🔴 Overdue Order: Serum Collection Kit (15 days late)         ║
║                                                                ║
║ ── 🟡 Operational Alerts (1) [Expand] ──                      ║
║ ── 🔵 Warnings (2) [Expand] ──                                ║
║ ── ── Dismissed Alerts (3) [Restore] ── ──                    ║
╚═══════════════════════════════════════════════════════════════╝
```

**Expanded State**
```
╔═══════════════════════════════════════════════════════════════╗
║ ⚠️  Critical Alerts (2)                      [Collapse All]   ║
║ ┌───────────────────────────────────────────────────────────┐ ║
║ │ 🔴 Supply Deficit: Serum Collection Kit                   │ ║
║ │    Need 15 more by Dec 5 (3 upcoming visits)             │ ║
║ │    Pending order (15 qty) expected Nov 30                │ ║
║ │    [Order More] [View Forecast]                          │ ║
║ └───────────────────────────────────────────────────────────┘ ║
║ ┌───────────────────────────────────────────────────────────┐ ║
║ │ 🔴 Overdue Order: Urine Collection Kit                    │ ║
║ │    Ordered Oct 20, expected Nov 5 (15 days overdue)      │ ║
║ │    [Mark Received] [Contact Vendor] [Cancel Order]       │ ║
║ └───────────────────────────────────────────────────────────┘ ║
║                                                                ║
║ ── 🟡 Operational Alerts (1) [Collapse] ──                    ║
║ ┌───────────────────────────────────────────────────────────┐ ║
║ │ 🟡 Pending Order Aging: Serum Kit order (10 days old)    │ ║
║ │    [Check Status] [Dismiss for 7 days]                   │ ║
║ └───────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 3. Progressive Disclosure Strategy

### Principle: Show complexity only when needed

#### Level 1: Basic User (New Coordinator)
**Goal:** Add inventory, ship kits
```
[Inventory Tab]
- Summary cards
- Critical alerts only
- Simple table view
- [+ Add Inventory] button prominent
```

#### Level 2: Intermediate User (Regular Use)
**Goal:** Manage orders, track shipments
```
[Inventory Tab]
+ Operational alerts
+ Status filters
+ Search functionality

[Orders & Shipments Tab]
+ Order planning
+ Shipment creation
+ Tracking updates
```

#### Level 3: Advanced User (Study Coordinator)
**Goal:** Forecasting, bulk operations, reporting
```
[Inventory Tab]
+ All alerts
+ Grouped/list view toggle
+ Bulk operations
+ Export functionality

[Orders & Shipments Tab]
+ Historical data
+ Vendor management
+ Custom date ranges

[Archive Tab]
+ Full audit trail
+ Report generation
```

### Implementation: Feature Flags

```typescript
interface UserLevel {
  showAdvancedFilters: boolean
  showBulkOperations: boolean
  showForecastingTools: boolean
  showReporting: boolean
}

const levels = {
  basic: {
    showAdvancedFilters: false,
    showBulkOperations: false,
    showForecastingTools: false,
    showReporting: false
  },
  intermediate: {
    showAdvancedFilters: true,
    showBulkOperations: false,
    showForecastingTools: false,
    showReporting: false
  },
  advanced: {
    showAdvancedFilters: true,
    showBulkOperations: true,
    showForecastingTools: true,
    showReporting: true
  }
}
```

---

## 4. Empty States Redesign

### Current Empty State
```
No lab kits found
```

### Proposed: Context-Aware Empty States

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

## 5. Migration Path

### Phase 1: Feature Flag Rollout (Week 1-2)
```typescript
// Add feature flag
const USE_NEW_LAYOUT = process.env.NEXT_PUBLIC_LAB_KIT_NEW_LAYOUT === 'true'

// Render conditionally
{USE_NEW_LAYOUT ? <NewLabKitLayout /> : <LegacyLabKitLayout />}
```

### Phase 2: Beta Testing (Week 3-4)
- Enable for 2-3 pilot sites
- Collect feedback via in-app survey
- Monitor analytics (time-to-task, clicks to complete)

### Phase 3: Gradual Rollout (Week 5-6)
- 25% of sites → Week 5
- 50% of sites → Week 6
- 100% of sites → Week 7

### Phase 4: Remove Legacy (Week 8)
- Remove feature flag
- Delete old component files
- Update documentation

---

## 6. User Acceptance Criteria

### Must-Have (P0)
- ✅ All 5 current tab functions accessible in 3 tabs
- ✅ Critical alerts always visible (non-dismissible)
- ✅ Zero data loss or workflow disruption
- ✅ Mobile-responsive (320px minimum width)

### Should-Have (P1)
- ✅ Alert dismissal persists across sessions
- ✅ Empty states provide actionable guidance
- ✅ Keyboard navigation support (Tab, Enter, Escape)

### Nice-to-Have (P2)
- ⏳ User-customizable alert thresholds
- ⏳ Drag-and-drop tab reordering
- ⏳ Export/import user preferences

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

### A/B Test Hypotheses
1. **3-tab layout reduces time-to-task by 30%**
2. **Inline alerts increase order completion by 20%**
3. **Smart dismissal reduces alert fatigue by 40%**

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
| Current Tab | New Location | Component Changes |
|-------------|--------------|-------------------|
| Inventory   | Inventory    | Add alerts inline |
| Expired     | Archive      | Merge with filters |
| Shipments   | Orders & Shipments | Add order section |
| Orders      | Orders & Shipments | Add shipment section |
| Alerts      | *Removed*    | Distribute contextually |

### File Changes
```
MODIFY: src/app/lab-kits/page.tsx
  - Change ViewMode type: 5 → 3 options
  - Merge orders/shipments rendering
  - Move alerts to inline components

MODIFY: src/components/lab-kits/LabKitAlertsPanel.tsx
  - Change from page to inline component
  - Add collapse/expand state
  - Implement priority grouping

CREATE: src/components/lab-kits/EmptyStateGuide.tsx
  - Context-aware empty states
  - Onboarding steps

CREATE: src/components/lab-kits/OrdersAndShipmentsView.tsx
  - Unified orders + shipments
  - Status-based sections
```

---

## Next Steps

1. **Review this document** with stakeholders (coordinators, managers, product)
2. **Conduct user testing** with 3-5 coordinators using static mockups
3. **Refine based on feedback** (expect 1-2 iteration rounds)
4. **Create implementation tickets** (estimate: 3-5 days development)
5. **Begin Phase 1 development** with feature flag

**Estimated Timeline:** 4-6 weeks from approval to full rollout

---

**Questions or Feedback?** Contact the development team or add comments to this document.