# Forecast Enhancement Proposal: Vendor Lead Times & Expiration Risk

**Version:** 1.0
**Date:** September 2025
**Status:** Research & Design Phase
**Impact:** Medium - Schema additions, no breaking changes
**Effort:** 3-5 days development

---

## Executive Summary

The current forecasting engine calculates kit deficits based on upcoming visit requirements and inventory buffers, but lacks two critical pieces of intelligence:

1. **Vendor Lead Times** - How long does it take for ordered kits to arrive?
2. **Expiration Risk** - Which available kits will expire before they can be used?

This proposal adds these capabilities with minimal schema changes and backward-compatible enhancements.

---

## Problem Statement

### Current Forecasting Gaps

#### Gap 1: No Lead-Time Awareness
```typescript
// Current calculation (simplified)
const deficit = requiredKits - (availableKits + pendingOrderKits)
```

**Problem:** If vendor delivery takes 2 weeks, a deficit might become critical before the order arrives.

**Real-World Example:**
- Dec 1: Forecast shows need for 10 kits by Dec 15
- Dec 1: Coordinator places order for 10 kits
- Dec 1: System shows "Deficit covered by pending order ✅"
- Dec 8: Kits still haven't arrived (vendor takes 3 weeks)
- Dec 15: Visit date arrives, kits unavailable ❌

**Impact:** False confidence in supply coverage

---

#### Gap 2: Expiring Kits Counted as Available
```typescript
// Current inventory count
const availableKits = kits.filter(k => k.status === 'available').length
// ↑ Includes kits expiring before next visit!
```

**Problem:** Kits expiring before they can be used reduce effective inventory.

**Real-World Example:**
- Nov 1: Inventory shows 15 available serum kits
- Nov 1: Next visit requiring serum kit: Dec 10
- Nov 1: 5 of those kits expire Nov 15
- Dec 10: Only 10 kits actually usable

**Impact:** Overestimated inventory leads to unexpected shortages

---

## Proposed Solution

### Part A: Vendor Lead Time Tracking

#### Schema Changes

**Option 1: Study-Level Vendor Configuration (Recommended)**
```sql
-- New table: vendor_lead_times
CREATE TABLE public.vendor_lead_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  kit_type_id UUID NULL REFERENCES public.study_kit_types(id) ON DELETE CASCADE,
  average_lead_days INTEGER NOT NULL CHECK (average_lead_days > 0),
  minimum_lead_days INTEGER NULL CHECK (minimum_lead_days > 0),
  maximum_lead_days INTEGER NULL CHECK (maximum_lead_days > 0),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT NULL,
  UNIQUE(study_id, vendor_name, kit_type_id)
);

CREATE INDEX idx_vendor_lead_times_study_id ON vendor_lead_times(study_id);
CREATE INDEX idx_vendor_lead_times_vendor_name ON vendor_lead_times(vendor_name);

-- Sample data
INSERT INTO vendor_lead_times (study_id, vendor_name, kit_type_id, average_lead_days, minimum_lead_days, maximum_lead_days)
VALUES
  ('study-uuid', 'LabCorp', 'serum-kit-uuid', 10, 7, 14),
  ('study-uuid', 'Quest', 'urine-kit-uuid', 14, 10, 21);
```

**Option 2: Per-Order Learning (Advanced)**
```sql
-- Add to existing lab_kit_orders table
ALTER TABLE public.lab_kit_orders
ADD COLUMN order_date DATE NULL,
ADD COLUMN actual_lead_days INTEGER GENERATED ALWAYS AS (
  CASE
    WHEN received_date IS NOT NULL AND order_date IS NOT NULL
    THEN received_date - order_date
    ELSE NULL
  END
) STORED;

-- Query to compute vendor averages
SELECT
  vendor,
  kit_type_id,
  AVG(actual_lead_days) as avg_lead_days,
  MIN(actual_lead_days) as min_lead_days,
  MAX(actual_lead_days) as max_lead_days,
  COUNT(*) as sample_size
FROM lab_kit_orders
WHERE status = 'received' AND actual_lead_days IS NOT NULL
GROUP BY vendor, kit_type_id;
```

**Recommendation:** Start with **Option 1** (manual configuration), add **Option 2** (automatic learning) in Phase 2.

---

#### Forecasting Logic Enhancement

```typescript
// Current
interface ForecastItem {
  kitTypeId: string
  kitsRequired: number
  kitsAvailable: number
  deficit: number
  pendingOrderQuantity: number
}

// Enhanced
interface ForecastItem {
  kitTypeId: string
  kitsRequired: number
  kitsAvailable: number
  kitsUsable: number              // NEW: available - expiring before use
  deficit: number
  deficitWithLeadTime: number     // NEW: accounts for vendor delivery time
  pendingOrderQuantity: number
  pendingOrderETA: string | null  // NEW: expected arrival date
  vendorLeadTimeDays: number      // NEW: average lead time
  riskLevel: 'low' | 'medium' | 'high' | 'critical' // NEW: risk assessment
}
```

**Updated Calculation:**
```typescript
async function enhancedForecastCalculation(
  studyId: string,
  daysAhead: number
): Promise<ForecastItem[]> {
  // 1. Load vendor lead times
  const vendorLeadTimes = await supabase
    .from('vendor_lead_times')
    .select('*')
    .eq('study_id', studyId)

  const leadTimeMap = new Map<string, number>()
  for (const vlt of vendorLeadTimes.data || []) {
    leadTimeMap.set(vlt.kit_type_id, vlt.average_lead_days)
  }

  // 2. Get upcoming visit requirements
  const requirements = await getUpcomingVisitRequirements(studyId, daysAhead)

  // 3. Get current inventory
  const inventory = await getCurrentInventory(studyId)

  // 4. Calculate per kit type
  const forecast: ForecastItem[] = []

  for (const [kitTypeId, required] of requirements) {
    const availableKits = inventory.filter(k =>
      k.kit_type_id === kitTypeId && k.status === 'available'
    )

    // NEW: Filter out kits expiring before earliest required visit
    const earliestVisitDate = getEarliestVisitDate(kitTypeId, requirements)
    const usableKits = availableKits.filter(k => {
      if (!k.expiration_date) return true
      return new Date(k.expiration_date) >= earliestVisitDate
    })

    const kitsUsable = usableKits.length

    // Get pending orders
    const pendingOrders = await getPendingOrders(studyId, kitTypeId)
    const pendingQuantity = pendingOrders.reduce((sum, o) => sum + o.quantity, 0)

    // NEW: Calculate lead-time-adjusted deficit
    const vendorLeadDays = leadTimeMap.get(kitTypeId) || 0
    const leadTimeDate = new Date()
    leadTimeDate.setDate(leadTimeDate.getDate() + vendorLeadDays)

    // Requirements within lead time window
    const urgentRequirements = getRequirementsBeforeDate(kitTypeId, leadTimeDate)
    const urgentDeficit = Math.max(0, urgentRequirements - kitsUsable)

    // Standard deficit
    const standardDeficit = Math.max(0, required - (kitsUsable + pendingQuantity))

    // Risk assessment
    let riskLevel: 'low' | 'medium' | 'high' | 'critical'
    if (urgentDeficit > 0 && pendingQuantity === 0) {
      riskLevel = 'critical' // Need kits within lead time, no order placed
    } else if (standardDeficit > 0 && pendingQuantity < standardDeficit) {
      riskLevel = 'high' // Deficit exceeds pending orders
    } else if (urgentRequirements > kitsUsable) {
      riskLevel = 'medium' // Relying on pending orders
    } else {
      riskLevel = 'low' // Sufficient coverage
    }

    forecast.push({
      kitTypeId,
      kitsRequired: required,
      kitsAvailable: availableKits.length,
      kitsUsable,
      deficit: standardDeficit,
      deficitWithLeadTime: urgentDeficit,
      pendingOrderQuantity: pendingQuantity,
      pendingOrderETA: getPendingOrderETA(pendingOrders),
      vendorLeadTimeDays: vendorLeadDays,
      riskLevel
    })
  }

  return forecast
}
```

---

### Part B: Expiration Risk Visualization

#### UI Enhancement: Risk Indicator

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔴 Critical Risk: Serum Collection Kit                          │
│                                                                  │
│ Available: 15 kits                                              │
│ Usable: 10 kits (5 expire before Dec 10)                       │
│ Required: 18 kits by Dec 10                                     │
│ Deficit: 8 kits                                                 │
│                                                                  │
│ ⏱️  Vendor lead time: 14 days → Order by Nov 26                 │
│                                                                  │
│ [Order 10 kits now] [View Expiring Kits]                       │
└─────────────────────────────────────────────────────────────────┘
```

#### Expiration Timeline

```typescript
interface ExpirationTimeline {
  kitTypeId: string
  weeks: {
    weekStart: string
    expiringCount: number
    expiringKits: { accessionNumber: string; expirationDate: string }[]
    upcomingVisits: number // visits requiring this kit type
  }[]
}
```

**Visual Component:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Expiration Risk: Serum Collection Kit                           │
│                                                                  │
│ Nov 1-7    ░░░░░ (2 kits)     3 visits                         │
│ Nov 8-14   ░░░░░░░░░ (3 kits) 2 visits                         │
│ Nov 15-21  ░░ (0 kits)        4 visits ⚠️ Shortage risk         │
│ Nov 22-28  ░░░ (1 kit)        2 visits                         │
│                                                                  │
│ 📊 Recommendation: Order 5 kits by Nov 8                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### Vendor Lead Time Sources

#### 1. Manual Entry (Phase 1 - MVP)
```typescript
// UI: Study Settings → Vendor Management
interface VendorConfig {
  vendorName: string
  kitTypeId: string
  averageLeadDays: number
  notes: string
}

// Example
{
  vendorName: "LabCorp",
  kitTypeId: "serum-kit-uuid",
  averageLeadDays: 10,
  notes: "Standard shipping, add 3 days for rural sites"
}
```

**Pros:** Simple, immediate implementation
**Cons:** Manual maintenance, no automatic updates

---

#### 2. Historical Order Analysis (Phase 2)
```typescript
// Automatically calculate from past orders
interface VendorStats {
  vendor: string
  kitTypeId: string
  orderCount: number
  avgLeadDays: number
  minLeadDays: number
  maxLeadDays: number
  lastUpdated: string
}

// Query
SELECT
  vendor,
  kit_type_id,
  COUNT(*) as order_count,
  AVG(received_date - expected_arrival) as avg_lead_days,
  MIN(received_date - expected_arrival) as min_lead_days,
  MAX(received_date - expected_arrival) as max_lead_days
FROM lab_kit_orders
WHERE status = 'received'
  AND received_date IS NOT NULL
  AND expected_arrival IS NOT NULL
GROUP BY vendor, kit_type_id
```

**Pros:** Self-improving, reflects actual performance
**Cons:** Requires historical data, slower bootstrap

---

#### 3. Vendor API Integration (Phase 3 - Future)
```typescript
// External vendor APIs for real-time tracking
interface VendorAPIResponse {
  orderId: string
  estimatedDelivery: string
  currentStatus: 'processing' | 'shipped' | 'delivered'
  trackingNumber: string
}

// Integration example
const labCorpAPI = {
  async getOrderStatus(orderId: string): Promise<VendorAPIResponse> {
    const response = await fetch(`https://api.labcorp.com/orders/${orderId}`)
    return response.json()
  }
}
```

**Pros:** Real-time accuracy, automatic updates
**Cons:** Vendor-dependent, complex integration

---

### Expiration Risk Data Sources

#### Source 1: Lab Kit Expiration Dates (Current)
```sql
SELECT
  kit_type_id,
  COUNT(*) as kits_expiring,
  expiration_date
FROM lab_kits
WHERE status = 'available'
  AND expiration_date <= CURRENT_DATE + INTERVAL '30 days'
GROUP BY kit_type_id, expiration_date
ORDER BY expiration_date;
```

#### Source 2: Visit Schedule Cross-Reference (New)
```sql
-- Find kits expiring before they can be used
WITH upcoming_visits AS (
  SELECT
    vkr.kit_type_id,
    MIN(sv.visit_date) as earliest_visit
  FROM subject_visits sv
  JOIN visit_kit_requirements vkr ON sv.visit_schedule_id = vkr.visit_schedule_id
  WHERE sv.visit_date > CURRENT_DATE
    AND sv.status NOT IN ('completed', 'cancelled')
  GROUP BY vkr.kit_type_id
)
SELECT
  lk.kit_type_id,
  COUNT(*) as unusable_kits,
  uv.earliest_visit,
  MAX(lk.expiration_date) as latest_expiry
FROM lab_kits lk
JOIN upcoming_visits uv ON lk.kit_type_id = uv.kit_type_id
WHERE lk.status = 'available'
  AND lk.expiration_date < uv.earliest_visit
GROUP BY lk.kit_type_id, uv.earliest_visit;
```

---

## Implementation Phases

### Phase 1: Manual Lead Time Configuration (1-2 days)
**Scope:**
- Create `vendor_lead_times` table
- Add vendor management UI in Study Settings
- Update forecast calculation to use lead times
- Add "Order by [date]" recommendation in alerts

**Deliverables:**
- Migration: `20250930_add_vendor_lead_times.sql`
- Component: `VendorManagementModal.tsx`
- API: `GET/POST /api/vendor-lead-times`

---

### Phase 2: Expiration Risk Integration (2-3 days)
**Scope:**
- Add `kitsUsable` field to forecast response
- Create expiration timeline component
- Update deficit alerts to show expiration impact
- Add "Expiring Soon" badge to inventory table

**Deliverables:**
- Component: `ExpirationTimeline.tsx`
- Update: `src/app/api/inventory-forecast/route.ts`
- Update: `LabKitAlertsPanel.tsx` with usable vs available

---

### Phase 3: Historical Analysis (Future)
**Scope:**
- Add `order_date` to `lab_kit_orders`
- Create vendor performance dashboard
- Auto-update lead times based on actual deliveries
- Alert when vendor performance degrades

**Deliverables:**
- Migration: `20251015_add_order_tracking.sql`
- Page: `src/app/lab-kits/vendor-analytics/page.tsx`
- Scheduled job: Daily vendor stats update

---

## Schema Changes Summary

### New Tables

```sql
-- vendor_lead_times
CREATE TABLE public.vendor_lead_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  kit_type_id UUID NULL REFERENCES public.study_kit_types(id) ON DELETE CASCADE,
  average_lead_days INTEGER NOT NULL CHECK (average_lead_days > 0),
  minimum_lead_days INTEGER NULL CHECK (minimum_lead_days > 0),
  maximum_lead_days INTEGER NULL CHECK (maximum_lead_days > 0),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(study_id, vendor_name, kit_type_id)
);

CREATE INDEX idx_vendor_lead_times_study_id ON vendor_lead_times(study_id);
CREATE INDEX idx_vendor_lead_times_vendor_name ON vendor_lead_times(vendor_name);
```

### Modified Tables (Phase 2+)

```sql
-- lab_kit_orders (optional - for historical analysis)
ALTER TABLE public.lab_kit_orders
ADD COLUMN order_date DATE NULL DEFAULT CURRENT_DATE,
ADD COLUMN actual_lead_days INTEGER GENERATED ALWAYS AS (
  CASE
    WHEN received_date IS NOT NULL AND order_date IS NOT NULL
    THEN received_date - order_date
    ELSE NULL
  END
) STORED;
```

**Backward Compatibility:** ✅ All changes are additive, no breaking changes

---

## API Changes

### New Endpoints

```typescript
// GET /api/vendor-lead-times?study_id={uuid}
{
  vendors: [
    {
      id: "uuid",
      studyId: "uuid",
      vendorName: "LabCorp",
      kitTypeId: "uuid",
      kitTypeName: "Serum Collection Kit",
      averageLeadDays: 10,
      minimumLeadDays: 7,
      maximumLeadDays: 14,
      lastUpdated: "2025-09-20T10:00:00Z",
      notes: "Standard shipping"
    }
  ]
}

// POST /api/vendor-lead-times
{
  studyId: "uuid",
  vendorName: "LabCorp",
  kitTypeId: "uuid",
  averageLeadDays: 10,
  minimumLeadDays: 7,
  maximumLeadDays: 14,
  notes: "Standard shipping"
}

// PUT /api/vendor-lead-times/{id}
{
  averageLeadDays: 12,
  notes: "Updated based on recent delays"
}

// DELETE /api/vendor-lead-times/{id}
```

### Modified Endpoints

```typescript
// GET /api/inventory-forecast?study_id={uuid}&days={number}
// BEFORE
{
  forecast: [
    {
      kitTypeId: "uuid",
      kitsRequired: 18,
      kitsAvailable: 15,
      deficit: 3,
      pendingOrderQuantity: 0
    }
  ]
}

// AFTER (backward compatible - adds new fields)
{
  forecast: [
    {
      kitTypeId: "uuid",
      kitTypeName: "Serum Collection Kit",
      kitsRequired: 18,
      kitsAvailable: 15,
      kitsUsable: 10,              // NEW
      deficit: 3,
      deficitWithLeadTime: 8,      // NEW
      pendingOrderQuantity: 0,
      pendingOrderETA: null,       // NEW
      vendorLeadTimeDays: 10,      // NEW
      riskLevel: "critical",       // NEW
      expiringKits: [              // NEW
        {
          accessionNumber: "SCK-001",
          expirationDate: "2025-11-15",
          daysUntilExpiry: 10
        }
      ]
    }
  ]
}
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('Enhanced Forecast Calculation', () => {
  it('should exclude expiring kits from usable count', () => {
    const inventory = [
      { id: '1', expirationDate: '2025-11-15', status: 'available' },
      { id: '2', expirationDate: '2026-01-15', status: 'available' }
    ]
    const earliestVisit = new Date('2025-12-01')
    const usable = calculateUsableKits(inventory, earliestVisit)
    expect(usable).toBe(1) // Only second kit is usable
  })

  it('should calculate deficit with lead time', () => {
    const required = 10
    const usable = 5
    const leadTimeDays = 14
    const todayPlusLeadTime = addDays(new Date(), 14)
    const urgentRequirements = 8 // visits within lead time window

    const deficit = calculateDeficitWithLeadTime(
      required, usable, urgentRequirements, leadTimeDays
    )
    expect(deficit).toBe(3) // 8 urgent - 5 usable
  })

  it('should assess risk level correctly', () => {
    // Critical: deficit within lead time, no pending orders
    expect(assessRisk(10, 5, 0, 14, 8)).toBe('critical')

    // High: deficit exceeds pending orders
    expect(assessRisk(10, 5, 3, 14, 8)).toBe('high')

    // Medium: relying on pending orders
    expect(assessRisk(10, 5, 5, 14, 8)).toBe('medium')

    // Low: sufficient coverage
    expect(assessRisk(10, 12, 0, 14, 8)).toBe('low')
  })
})
```

### Integration Tests
```typescript
describe('Vendor Lead Time API', () => {
  it('should create vendor lead time configuration', async () => {
    const response = await fetch('/api/vendor-lead-times', {
      method: 'POST',
      body: JSON.stringify({
        studyId: 'test-study',
        vendorName: 'LabCorp',
        kitTypeId: 'serum-kit',
        averageLeadDays: 10
      })
    })
    expect(response.status).toBe(201)
  })

  it('should prevent duplicate vendor configs', async () => {
    // Create once
    await createVendorLeadTime('LabCorp', 'serum-kit', 10)

    // Try to create duplicate
    const response = await createVendorLeadTime('LabCorp', 'serum-kit', 12)
    expect(response.status).toBe(409) // Conflict
  })
})
```

### User Acceptance Tests
```gherkin
Feature: Lead Time Aware Forecasting

Scenario: Show critical alert when deficit within lead time
  Given vendor "LabCorp" has 14-day lead time
  And we have 5 serum kits available
  And we need 10 serum kits in 10 days
  When I view the alerts panel
  Then I should see a "Critical" alert
  And the alert should say "Order by [today's date]"

Scenario: Exclude expiring kits from usable inventory
  Given we have 10 serum kits available
  And 3 of those kits expire in 5 days
  And the next visit requiring serum is in 10 days
  When I view the forecast
  Then "Usable" should show 7
  And "Available" should show 10
```

---

## Success Metrics

### Quantitative
- **Forecast Accuracy:** Reduce unexpected shortages by 50%
- **Order Timing:** 90% of orders placed within optimal window
- **Expiration Waste:** Reduce expired kit count by 30%
- **Alert Relevance:** <5% false positive critical alerts

### Qualitative
- Coordinators report higher confidence in supply predictions
- Reduced urgent/emergency orders
- Better vendor performance visibility

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Manual lead time entry burden** | High | Medium | Provide defaults, auto-update in Phase 2 |
| **Vendor performance variability** | Medium | Medium | Use min/max ranges, not just averages |
| **Expiration date data quality** | Medium | High | Add validation, alert on missing dates |
| **Coordinator alert fatigue** | Medium | Medium | Smart grouping (already in UX redesign) |

---

## Next Steps

### Week 1: Review & Refinement
- [ ] Review proposal with study coordinators
- [ ] Gather feedback on vendor lead time sources
- [ ] Validate expiration risk calculations
- [ ] Confirm Phase 1 scope

### Week 2: Phase 1 Implementation
- [ ] Create `vendor_lead_times` table migration
- [ ] Build vendor management UI
- [ ] Update forecast API with lead time logic
- [ ] Add "Order by [date]" to alerts

### Week 3: Phase 2 Implementation
- [ ] Add expiration risk to forecast calculation
- [ ] Build expiration timeline component
- [ ] Update inventory table with usable/available split
- [ ] Write unit + integration tests

### Week 4: Testing & Rollout
- [ ] Beta test with 2-3 sites
- [ ] Monitor forecast accuracy
- [ ] Iterate based on feedback
- [ ] Full rollout

---

## Appendix: Sample Calculations

### Example 1: Lead Time Impact

**Scenario:**
- Today: Nov 1
- Vendor: LabCorp (14-day lead time)
- Available: 5 serum kits
- Upcoming visits requiring serum:
  - Nov 10: 2 kits
  - Nov 20: 3 kits
  - Dec 5: 5 kits

**Calculation:**
```typescript
// Without lead time
const totalRequired = 2 + 3 + 5 // 10
const deficit = 10 - 5 // 5
const recommendation = "Order 5 kits"

// With lead time
const leadTimeDate = Nov 1 + 14 days = Nov 15
const urgentVisits = [Nov 10, Nov 20] // Within lead time window
const urgentRequired = 2 + 3 // 5
const urgentDeficit = 5 - 5 // 0

// But wait, Nov 20 visit needs 3, we only have 5 total
// After Nov 10 uses 2, we have 3 left
// So deficit for Nov 20 is actually 0 (we have exactly enough)

// However, Dec 5 visit needs 5, and we'll have 0 left after Nov 20
// Lead time from Nov 1 means order arrives Nov 15
// But Dec 5 is AFTER Nov 15, so order can cover it

const recommendation = "Order 5 kits by Nov 1 (for Dec 5 visit)"
const riskLevel = "medium" // Relying on timely delivery
```

---

### Example 2: Expiration Risk

**Scenario:**
- Today: Nov 1
- Available: 10 serum kits
- Expiration dates:
  - 3 kits expire Nov 15
  - 7 kits expire Feb 1
- Next visit requiring serum: Dec 1

**Calculation:**
```typescript
const earliestVisit = new Date('2025-12-01')
const expiringBeforeUse = inventory.filter(k =>
  new Date(k.expirationDate) < earliestVisit
)
// expiringBeforeUse = 3 kits (expire Nov 15)

const kitsAvailable = 10
const kitsUsable = 10 - 3 // 7

const recommendation = "7 usable (3 expire before Dec 1)"
```

---

**Questions or Feedback?** Contact the development team or comment on this document.