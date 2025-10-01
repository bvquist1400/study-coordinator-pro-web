# Lab Kit Management: Coordinator Quick Start Guide

**Version:** 2.0
**Date:** October 2025
**For:** Study Coordinators & Site Staff
**Estimated Reading Time:** 10 minutes

---

## Welcome! 👋

This quick start shows you how to work inside the refreshed Lab Kit workspace (Inventory • Forecast • Orders & Shipments • Archive • Alerts • Settings). Follow the sections below the first time you land in each tab.

---

## Table of Contents

1. [Workspace Overview](#workspace-overview)
2. [Add & Track Inventory](#add-track-inventory)
3. [Forecast & Stay Ahead](#forecast-stay-ahead)
4. [Orders & Shipments](#orders-shipments)
5. [Archive & Audits](#archive-audits)
6. [Alerts & Severity Buckets](#alerts)
7. [Settings & Buffers](#settings)
8. [Tips & Troubleshooting](#tips)

---

## Workspace Overview {#workspace-overview}

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Inventory | Forecast | Orders & Shipments | Archive | Alerts | Settings │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Inventory (default):** Daily operations, summary cards, inline alerts, add/plan buttons
- **Forecast:** Severity-grouped supply view for upcoming demand
- **Orders & Shipments:** Pending orders, in-transit shipments, recent deliveries
- **Archive:** Read-only history of expired, destroyed, cancelled items
- **Alerts:** Dedicated triage list sharing the same severity buckets as Forecast
- **Settings:** Buffer days, kit overrides, manual recommendation recompute

Use the study filter (All, PROTO-001, etc.) at the top to jump between studies.

---

## Add & Track Inventory {#add-track-inventory}

### Step 1: Add Kits

1. Go to **Inventory** (default tab)
2. Click **[+ Add Inventory]** in the header
3. Choose **Single Kit** or **Bulk Import**
   - *Single Kit*: enter accession number, kit type, received date, optional expiry/lot
   - *Bulk Import*: download the CSV template, fill in multiple rows, upload, confirm

### Step 2: Understand the Summary Cards

Cards show Available, Expiring Soon, In Use, Ordered, and Alerts. Click any card to filter the table instantly.

### Step 3: Use Filters & Views

- Search by accession, kit type, or note
- Status filter toggles between Available, In Use, Shipped, etc.
- "Expiring only" applies the 30-day filter
- Toggle between **Grouped** (by kit type) and **Table** views depending on volume

### Quick Actions

- **Edit kit** → update status, add notes, correct dates
- **Locate kit** → auto-switch to Inventory with filters applied
- **Archive kit** → move expired/destroyed kits into Archive without deleting history

---

## Forecast & Stay Ahead {#forecast-stay-ahead}

The Forecast tab highlights supply risk for the next 30 days (or custom range).

### How to Read the Page

```
Inventory Forecast (Only Issues [✓])  Critical • Warnings • Stable chips
└─ 🔴 Critical (expanded)
└─ 🟡 Warnings (collapsible)
└─ 🔵 Stable (collapsed by default)
```

- **Critical** rows always expand and cannot be dismissed
- **Warnings** can be collapsed/expanded and dismissed temporarily
- **Stable** rows stay hidden unless you uncheck "Only Issues"

### Drill Into a Row

Click a row to view:
- Visit requirements (which visits drive demand)
- Upcoming visits list (subject, visit name, date)
- Buffer source (kit-specific, study default, none)
- Pending order coverage (pending quantity vs deficit)

### Act from Forecast

- **Order Kits** shortcuts to the order modal (prefilled quantity)
- **Open Inventory** takes you back to the filtered Inventory table
- **Open Settings** jumps to buffers when low-buffer warnings appear

---

## Orders & Shipments {#orders-shipments}

This tab merges ordering and logistics in one view.

### Pending Orders Panel
- Shows study, kit type, quantity, vendor, expected arrival, deficit coverage
- Actions: Edit order, Mark Received, Cancel
- "Mark Received" opens Add Inventory prefilled with study, kit type, received date

### Shipments Panel
- Create shipments (to subjects/sites) via **[Create Shipment]**
- Track carrier, tracking number, status, aging warnings
- Recent deliveries list helps confirm inventory updates

### Tips
- Use "Locate kit" from a shipment to jump back to Inventory with the accession number prefilled
- Pending/overdue badges remind you to follow up with vendors

---

## Archive & Audits {#archive-audits}

Archive keeps a clean audit trail for expired/destroyed/cancelled kits.

- Filters: status checkboxes, date range, search
- Export options: CSV export, PDF report (if enabled)
- All rows are read-only; edits happen in Inventory before archiving

Use Archive for monitoring compliance, preparing disposal reports, and audits.

---

## Alerts & Severity Buckets {#alerts}

The **Alerts** tab mirrors the severity groups from Forecast and Inventory callouts.

- **Critical:** non-dismissible, always open
- **Warnings:** dismissible, will auto-return in future once smart dismissal ships
- **Stable:** informational, collapsed by default
- "Restore Dismissed" brings back snoozed alerts

Inline callouts inside Inventory/Forecast offer quick actions (Order Kits, View Expiring Kits, Open Settings) without leaving the main flows.

---

## Settings & Buffers {#settings}

Settings is only available when a specific study (not "All Studies") is selected.

Use it to:
- Adjust inventory buffer days and visit window buffer
- Set kit-specific overrides (min count, custom buffer days)
- Trigger manual "Recompute Recommendations"
- Review recent history of changes

### When to Update Buffers
- Seasonality (e.g., holidays) causing shipping delays
- Sponsor-provided minimum stock requirements
- Newly activated study sites with different lead times

---

## Tips & Troubleshooting {#tips}

- **Bulk updates:** Use the Inventory bulk actions to archive or change status for multiple kits at once
- **Expiring kits:** Click Expiring card → adjust plan or mark for priority use
- **Vendor delays:** Record realistic expected arrival dates; Forecast adjusts coverage messaging
- **Alerts stuck on:** Check the Alerts tab, use "Restore Dismissed" to bring back anything snoozed
- **Need onboarding help?** Use the Quick Start Guide link from Inventory empty states (once implemented) or contact support

---

Happy coordinating! Keep this guide handy for new team members or when onboarding additional sites.
