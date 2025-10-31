# Lab Kit Management: Coordinator Quick Start Guide

**Version:** 3.0  
**Date:** January 2026  
**Audience:** Study coordinators & site staff  
**Estimated time:** 10 minutes

---

## 1. Know Your Surfaces

| Surface | When to use it | How to get there |
|---------|----------------|------------------|
| **Lab Kit Dashboard** (default at `/lab-kits`) | Daily triage: see risk, shipments in motion, and pending orders in one place. | Sidebar → **Lab Kits** |
| **Lab Kit Management Workspace** (tabbed UI) | Deep edits: bulk inventory updates, buffer tuning, archive searches. | From any dashboard quick action → **Open tabbed workspace** |

You can jump between studies in either view using the study selector at the top. The dashboard remembers your selection when you open the workspace.

---

## 2. Dashboard Tour

1. **Snapshot metrics** – Total kits, forecast horizon, active issues, and logistics (kits pending arrival + shipments in transit).
2. **Critical & monitor lists** – Each forecast row shows coverage, upcoming visits, and a **Plan order** button. Quantities are pre-filled from the forecast math.
3. **Pending orders** – Every pending order displays a **Mark as received** button. Clicking it hands you to the workspace, automatically marks the order received, and opens Add Inventory prefilled with the kit type/quantity.
4. **Shipments in motion** – Track airway bill, carrier, ETA, and status without leaving the dashboard.

Hot buttons in the header:
- **Refresh data** – Pulls a fresh forecast/orders snapshot.
- **Open tabbed workspace** – Switches to the detailed management UI (keeps your study selection).
- **Command center** – Opens the all-study executive view when you need portfolio-level triage.

---

## 3. Forecast → Plan Order Workflow

1. From the dashboard or the workspace **Forecast** tab, press **Plan order** on any kit row.
2. The Lab Kit Management workspace opens with the order modal already populated:
   - Kit type locked to the row you selected.
   - Quantity set to the recommended amount (deficit + buffer).
   - Deficit summary shown in the sidebar.
3. Add/edit vendor, delivery date, and notes. Submit to create the order.
4. The dashboard refreshes automatically the next time you open it, moving the kit into “pending coverage”.

### Tip
If you open the workspace first and press **Plan Order** in the header while on the **Forecast** tab, the modal uses the top remaining recommendation.

---

## 4. Pending Orders → Received Inventory

1. On the dashboard, locate the order in **Pending orders** and click **Mark as received**.
2. Behind the scenes the order is updated to `received` and the workspace opens with **Add Inventory** prefilled (kit type, quantity, received date).
3. Confirm details, optionally add expiry/batch info, then save. The inventory list updates and the order disappears from the pending queue.

This flow works from the Orders & Shipments tab too—use the **Mark Received** button in the table if you’re already inside the workspace.

---

## 5. Working Inside the Tabbed Workspace

```
Inventory | Forecast | Orders & Shipments | Archive | Alerts | Settings
```

- **Inventory** – Grouped/table views, bulk status updates, archive/restore kits. Summary cards mirror the dashboard counts.
- **Forecast** – Same severity buckets as the dashboard with expandable visit detail AND per-row **Plan order** buttons.
- **Orders & Shipments** – Full order history, edit/cancel actions, shipment creation, and audit trails.
- **Archive** – Read-only view of expired/destroyed kits with export options.
- **Alerts** – Historical list with snooze/restore controls.
- **Settings** – Study-specific buffers, delivery defaults, kit overrides, and recompute trigger. Only available when a single study is selected.

Use the **Open tabbed workspace** link in the dashboard header to revisit these tabs whenever you need bulk edits or advanced filters.

---

## 6. Settings & Buffers Quick Reference

1. Select a specific study (not “All”).
2. Open **Settings**:
   - Adjust **inventory buffer days**, **visit-window buffer**, or **default delivery time**.
   - Set **kit-level overrides** (min on-hand, custom delivery time).
   - Trigger **Recompute recommendations** after large configuration changes.
   - Review the change log for buffer updates.

Changes sync immediately to both the forecast and dashboard views.

---

## 7. Tips & Troubleshooting

- **Need to see everything at once?** Stay on the dashboard—it rolls up forecast, orders, and shipments for the chosen study.
- **Tracking vendor delays** – Record realistic expected arrival dates; the forecast callouts will adjust “coverage after pending orders”.
- **Buffer warnings without demand** – The system only warns when buffers are unmet and there is real demand/in-flight activity.
- **Bulk inventory edits** – Use the workspace Inventory tab; group-select kits to archive, change status, or update metadata in one pass.
- **Restoring alerts** – In the workspace Alerts tab, press **Restore hidden** to bring back snoozed warnings.
- **No kits yet?** Dashboard will show an empty state with links to add kits or configure settings—follow those prompts to bootstrap your study.

Keep this guide nearby when onboarding new coordinators or rolling the tool out to additional sites. Happy coordinating!

