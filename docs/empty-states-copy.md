# Lab Kit Management: Empty State Copy

**Version:** 1.0
**Purpose:** Component copy for all empty state scenarios
**Status:** Ready for implementation

---

## Implementation Checklist

To keep implementation consistent, wire these empty states through a single presenter (for example `EmptyState` or `InventoryEmptyState`) that accepts a `type` and optional context. Follow the steps below before handing this work off to another engineer/bot.

1. **Add dispatcher constants** – define a small enum/object that maps UI contexts to the `type` strings used in this document (e.g. `EMPTY_STATES.TRUE_EMPTY = 'first-time'`).
2. **Choose the right context** – when rendering an empty state, pass the minimum data needed for the copy (e.g. protocol number, kit types, active filters).
3. **Handle `action.type`** – route every `action.type` value to the correct handler (modal open, navigation, filter reset, etc.). Use the table below as a reference.
4. **Fallback logic** – if an unexpected dataset slips through, render the generic "first-time" or "filtered" state rather than leaving the user with a blank screen.

| `action.type`            | Expected handler                                 |
|--------------------------|---------------------------------------------------|
| `open-add-kit`           | Open single-kit modal                            |
| `open-bulk-import`       | Route to `/lab-kits/bulk-import`                 |
| `open-quickstart`        | Open coordinator quick-start (modal or new tab)  |
| `open-create-shipment`   | Open shipment modal                              |
| `open-shipments-guide`   | Surface shipments documentation/help             |
| `open-order-modal`       | Open order planning modal                        |
| `go-forecast`            | Navigate to forecast/alerts view                 |
| `go-inventory`           | Navigate back to inventory tab                   |
| `clear-filters`          | Reset search + filters in-place                  |
| `reset-filters`          | Same as `clear-filters`, but return to default   |
| `reset-expiring-filter`  | Turn off the "expiring" toggle                   |
| `select-study`           | Focus/open study selector                        |
| `refresh-forecast`       | Trigger inventory forecast refetch               |

> Suggested file layout: keep a single `getEmptyStateConfig(type, context)` helper in `src/lib/lab-kits/empty-states.ts` so it can be reused across tabs (Inventory, Orders & Shipments, Archive).

---

## Empty State Types

### 1. True Empty - No Kits Ever Added

**Context:** User has never added any lab kits to this study

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                      🧪 Welcome!                             │
│                                                              │
│         Get started with lab kit management                  │
│                                                              │
│   Track inventory, prevent shortages, and ship with         │
│   confidence. Here's how to begin:                          │
│                                                              │
│   1️⃣  Add Lab Kits                                          │
│      Record kits you've received from vendors               │
│                                                              │
│   2️⃣  Create Shipments                                      │
│      Send kits to subjects for sample collection            │
│                                                              │
│   3️⃣  Stay Ahead                                            │
│      Get alerts before you run out                          │
│                                                              │
│   [📚 Quick Start Guide]  [+ Add Your First Kit]            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateFirstTime = {
  icon: "🧪",
  title: "Welcome!",
  subtitle: "Get started with lab kit management",
  description: "Track inventory, prevent shortages, and ship with confidence. Here's how to begin:",
  steps: [
    {
      number: "1️⃣",
      title: "Add Lab Kits",
      description: "Record kits you've received from vendors"
    },
    {
      number: "2️⃣",
      title: "Create Shipments",
      description: "Send kits to subjects for sample collection"
    },
    {
      number: "3️⃣",
      title: "Stay Ahead",
      description: "Get alerts before you run out"
    }
  ],
  actions: [
    {
      label: "Quick Start Guide",
      icon: "📚",
      variant: "secondary",
      type: 'open-quickstart'
    },
    {
      label: "Add Your First Kit",
      icon: "+",
      variant: "primary",
      type: 'open-add-kit'
    }
  ]
}
```

---

### 2. Study-Specific Empty - No Kits for This Study

**Context:** User has kits in other studies, but none for the currently selected study

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│           📦 No kits for Study PROTO-001 yet                 │
│                                                              │
│      This study uses the following lab kit types:           │
│                                                              │
│      • Serum Collection Kit                                 │
│      • Urine Sample Container                               │
│      • Saliva Swab Kit                                      │
│                                                              │
│      Add kits as you receive them from vendors              │
│                                                              │
│      [+ Add Inventory]  [Bulk Import CSV]                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateStudySpecific = {
  icon: "📦",
  title: (protocolNumber: string) => `No kits for Study ${protocolNumber} yet`,
  kitTypes: (types: string[]) => ({
    label: "This study uses the following lab kit types:",
    list: types
  }),
  subtitle: "Add kits as you receive them from vendors",
  actions: [
    {
      label: "Add Inventory",
      icon: "+",
      variant: "primary",
      type: 'open-add-kit'
    },
    {
      label: "Bulk Import CSV",
      icon: "📄",
      variant: "secondary",
      type: 'open-bulk-import'
    }
  ]
}
```

---

### 3. Filtered Empty - Kits Exist But Hidden by Filters

**Context:** User has kits, but current search/filter criteria hide them all

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  🔍 No kits match your filters               │
│                                                              │
│        Current filters:                                      │
│        • Status: Expired                                    │
│        • Search: "SCK-999"                                  │
│                                                              │
│        Try adjusting your filters or search term            │
│                                                              │
│        [Clear All Filters]  [View All Kits]                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateFiltered = {
  icon: "🔍",
  title: "No kits match your filters",
  filters: (activeFilters: Filter[]) => ({
    label: "Current filters:",
    list: activeFilters.map(f => `${f.label}: ${f.value}`)
  }),
  subtitle: "Try adjusting your filters or search term",
  actions: [
    {
      label: "Clear All Filters",
      variant: "secondary",
      type: 'clear-filters'
    },
    {
      label: "View All Kits",
      variant: "primary",
      type: 'reset-filters'
    }
  ]
}
```

---

### 4. Expiring Only Filter - No Expiring Kits

**Context:** User clicked "Expiring" summary card but no kits are expiring soon

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  ✅ No kits expiring soon                     │
│                                                              │
│        All your kits have expiration dates beyond 30        │
│        days or no expiration date set.                      │
│                                                              │
│        You're good to go!                                   │
│                                                              │
│        [View All Inventory]                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoExpiring = {
  icon: "✅",
  title: "No kits expiring soon",
  description: "All your kits have expiration dates beyond 30 days or no expiration date set.",
  subtitle: "You're good to go!",
  actions: [
    {
      label: "View All Inventory",
      variant: "primary",
      type: 'reset-expiring-filter'
    }
  ]
}
```

---

### 5. No Expired Kits

**Context:** User navigated to "Expired" tab but no kits have expired

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  ✨ No expired kits                          │
│                                                              │
│        Great job! You don't have any expired kits to        │
│        archive or manage.                                   │
│                                                              │
│        [View Active Inventory]                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoExpired = {
  icon: "✨",
  title: "No expired kits",
  description: "Great job! You don't have any expired kits to archive or manage.",
  actions: [
    {
      label: "View Active Inventory",
      variant: "primary",
      type: 'go-inventory'
    }
  ]
}
```

---

### 6. No Shipments

**Context:** User navigated to "Shipments" tab but hasn't created any shipments

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  📮 No shipments yet                         │
│                                                              │
│        Ready to send kits to subjects?                      │
│                                                              │
│        Create a shipment to track kits as they travel       │
│        to subjects for sample collection.                   │
│                                                              │
│        [Create Shipment]  [Learn About Shipments]           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoShipments = {
  icon: "📮",
  title: "No shipments yet",
  subtitle: "Ready to send kits to the central lab?",
  description: "Create a shipment to track kits as they travel to the central lab for processing.",
  actions: [
    {
      label: "Create Shipment",
      icon: "+",
      variant: "primary",
      type: 'open-create-shipment'
    },
    {
      label: "Learn About Shipments",
      icon: "📚",
      variant: "secondary",
      type: 'open-shipments-guide'
    }
  ]
}
```

---

### 7. No Pending Orders

**Context:** User navigated to "Orders" tab but hasn't placed any orders

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  📋 No pending orders                        │
│                                                              │
│        Place orders to track vendor shipments and           │
│        get notified when it's time to restock.              │
│                                                              │
│        The system will forecast when you need more          │
│        kits based on upcoming visits.                       │
│                                                              │
│        [Plan Order]  [View Forecast]                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoOrders = {
  icon: "📋",
  title: "No pending orders",
  description: "Place orders to track vendor shipments and get notified when it's time to restock.",
  subtitle: "The system will forecast when you need more kits based on upcoming visits.",
  actions: [
    {
      label: "Plan Order",
      icon: "+",
      variant: "primary",
      type: 'open-order-modal'
    },
    {
      label: "View Forecast",
      icon: "📊",
      variant: "secondary",
      type: 'go-forecast'
    }
  ]
}
```

---

### 8. No Alerts (Good News!)

**Context:** User navigated to "Alerts" tab but everything is healthy

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  🎉 All clear!                               │
│                                                              │
│        No alerts right now. Your lab kit inventory          │
│        looks healthy.                                       │
│                                                              │
│        • Sufficient kits for upcoming visits               │
│        • No kits expiring soon                             │
│        • All orders and shipments on track                 │
│                                                              │
│        [View Inventory]  [View Forecast Details]            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoAlerts = {
  icon: "🎉",
  title: "All clear!",
  description: "No alerts right now. Your lab kit inventory looks healthy.",
  checkmarks: [
    "Sufficient kits for upcoming visits",
    "No kits expiring soon",
    "All orders and shipments on track"
  ],
  actions: [
    {
      label: "View Inventory",
      variant: "primary",
      type: 'go-inventory'
    },
    {
      label: "View Forecast Details",
      variant: "secondary",
      type: 'go-forecast'
    }
  ]
}
```

---

### 9. No Archive Items

**Context:** User navigated to "Archive" tab but nothing has been archived

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  📂 Archive is empty                         │
│                                                              │
│        No expired, destroyed, or historical kits yet.       │
│                                                              │
│        Kits that are no longer active will appear here      │
│        for record-keeping and audit purposes.               │
│                                                              │
│        [View Active Inventory]                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateNoArchive = {
  icon: "📂",
  title: "Archive is empty",
  description: "No expired, destroyed, or historical kits yet.",
  subtitle: "Kits that are no longer active will appear here for record-keeping and audit purposes.",
  actions: [
    {
      label: "View Active Inventory",
      variant: "primary",
      type: 'go-inventory'
    }
  ]
}
```

---

### 10. All Studies View - Permission Required

**Context:** User selected "All Studies" but doesn't have permission to view multi-study data

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                  🔒 Select a study to continue               │
│                                                              │
│        Choose a specific study from the dropdown above      │
│        to view and manage lab kits.                         │
│                                                              │
│        [Select Study ▾]                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Copy:**
```typescript
const EmptyStateSelectStudy = {
  icon: "🔒",
  title: "Select a study to continue",
  description: "Choose a specific study from the dropdown above to view and manage lab kits.",
  actions: [
    {
      label: "Select Study",
      variant: "primary",
      type: 'select-study'
    }
  ]
}
```

---

## Implementation Guidelines

### Component Structure

```tsx
interface EmptyStateProps {
  type: 'first-time' | 'study-specific' | 'filtered' | 'no-expiring' |
        'no-expired' | 'no-shipments' | 'no-orders' | 'no-alerts' |
        'no-archive' | 'select-study'
  context?: {
    protocolNumber?: string
    kitTypes?: string[]
    activeFilters?: Filter[]
    [key: string]: any
  }
  onAction?: (actionType: string) => void
}

interface EmptyStateAction {
  label: string
  variant: 'primary' | 'secondary'
  icon?: string
  type?: string
  onClick?: () => void
}

const EmptyState: React.FC<EmptyStateProps> = ({ type, context, onAction }) => {
  const config = getEmptyStateConfig(type, context)

  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">{config.icon}</div>
      <h3 className="empty-state-title">{config.title}</h3>
      {config.subtitle && (
        <p className="empty-state-subtitle">{config.subtitle}</p>
      )}
      {config.description && (
        <p className="empty-state-description">{config.description}</p>
      )}
      {config.steps && (
        <ol className="empty-state-steps">
          {config.steps.map((step, idx) => (
            <li key={idx}>
              <span className="step-number">{step.number}</span>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      )}
      {config.checkmarks && (
        <ul className="empty-state-checkmarks">
          {config.checkmarks.map((item, idx) => (
            <li key={idx}>
              <span className="checkmark">•</span> {item}
            </li>
          ))}
        </ul>
      )}
      <div className="empty-state-actions">
        {config.actions.map((action: EmptyStateAction, idx: number) => (
          <button
            key={idx}
            className={`btn btn-${action.variant}`}
            onClick={() => {
              if (typeof action.onClick === 'function') {
                action.onClick()
              } else if (action.type) {
                onAction?.(action.type)
              }
            }}
          >
            {action.icon && <span className="btn-icon">{action.icon}</span>}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

> Implementation note: Use the shared `onAction` dispatcher to map `action.type` values (e.g., `open-add-kit`, `go-inventory`) to concrete handlers in the host view. Reserve the optional `action.onClick` only for bespoke callbacks that should bypass the shared dispatcher.

### Styling Guidelines

```css
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}

.empty-state-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  opacity: 0.9;
}

.empty-state-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.empty-state-subtitle {
  font-size: 1.125rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.empty-state-description {
  font-size: 1rem;
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.empty-state-steps {
  text-align: left;
  margin: 2rem 0;
  padding-left: 0;
  list-style: none;
}

.empty-state-steps li {
  margin-bottom: 1.5rem;
  padding-left: 2.5rem;
  position: relative;
}

.step-number {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 1.5rem;
}

.empty-state-checkmarks {
  text-align: left;
  margin: 1.5rem 0;
  padding-left: 1rem;
  list-style: none;
}

.empty-state-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}
```

---

## Testing Checklist

### Visual Testing
- [ ] All empty states render correctly on desktop (1920px)
- [ ] All empty states render correctly on tablet (768px)
- [ ] All empty states render correctly on mobile (375px)
- [ ] Icons display properly (no broken emoji on old browsers)
- [ ] Text is readable with sufficient contrast
- [ ] Actions are clickable and have hover states

### Functional Testing
- [ ] "Add Your First Kit" opens add modal
- [ ] "Quick Start Guide" opens guide in new tab/modal
- [ ] "Clear All Filters" resets filters and shows kits
- [ ] "View All Kits" navigates to inventory with no filters
- [ ] "Create Shipment" opens shipment modal
- [ ] "Plan Order" opens order modal
- [ ] Contextual info (study name, kit types) displays correctly

### Content Testing
- [ ] Copy is clear and actionable
- [ ] No jargon or abbreviations without explanation
- [ ] Tone is encouraging, not scolding
- [ ] Links/buttons have clear labels (no "Click here")

---

## A/B Testing Opportunities

### Test 1: Icon vs. Illustration
- **A:** Emoji icons (🧪, 📦, etc.)
- **B:** Custom SVG illustrations
- **Metric:** Time to first action (add kit, create shipment, etc.)

### Test 2: Single vs. Multiple CTAs
- **A:** One primary button ("Add Your First Kit")
- **B:** Two buttons ("Quick Start Guide" + "Add Your First Kit")
- **Metric:** Click-through rate on primary action

### Test 3: Steps vs. Simple Message
- **A:** Numbered steps (1️⃣ 2️⃣ 3️⃣)
- **B:** Single message ("Add kits to get started")
- **Metric:** Engagement rate, time to completion

---

**Ready for Implementation:** All copy has been reviewed and approved for clarity, tone, and actionability.

*Last updated: September 2025 | Version 1.0*
