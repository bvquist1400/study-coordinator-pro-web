# Lab Kit Management: Coordinator Quick Start Guide

**Version:** 1.0
**Date:** September 2025
**For:** Study Coordinators & Site Staff
**Estimated Reading Time:** 10 minutes

---

## Welcome! 👋

This guide will help you master lab kit management in Study Coordinator Pro. You'll learn how to track inventory, handle shipments, and prevent shortages—all in one place.

---

## Table of Contents

1. [Overview: What Lab Kit Management Does](#overview)
2. [Getting Started: Your First Lab Kit](#getting-started)
3. [Daily Tasks: Managing Inventory](#daily-tasks)
4. [Ordering & Receiving: Keeping Stock Fresh](#ordering-receiving)
5. [Shipments: Tracking Kits to Subjects](#shipments)
6. [Alerts: Staying Ahead of Problems](#alerts)
7. [Tips & Troubleshooting](#tips-troubleshooting)

---

## Overview: What Lab Kit Management Does {#overview}

Lab Kit Management helps you:

✅ **Track every kit** - From receipt to subject to lab
✅ **Prevent shortages** - Forecasts tell you when to order
✅ **Monitor expiration** - Never waste kits or miss visits
✅ **Ship with confidence** - Track kits sent to subjects
✅ **Stay organized** - All studies in one dashboard

### What's a "Lab Kit"?

A lab kit is any collection device your study uses:
- Serum collection tubes
- Urine sample containers
- Saliva swabs
- Specialty assay kits

Each kit has an **accession number** (like a barcode) that you track through the system.

---

## Getting Started: Your First Lab Kit {#getting-started}

### Step 1: Navigate to Lab Kits

```
Dashboard → Lab Kit Management
```

You'll see this header:
```
┌─────────────────────────────────────────────────────┐
│ Lab Kit Management                                   │
│ Manage inventory, ordering, and shipment tracking    │
└─────────────────────────────────────────────────────┘
```

### Step 2: Select Your Study

Click on your study's protocol number (e.g., `PROTO-001`) in the studies filter.

**Tip:** If you manage multiple studies, you can view "All Studies" for a combined view.

### Step 3: Add Your First Kit

**Two Options:**

#### Option A: Single Kit Entry
1. Click **[+ Add Inventory]** button (top right)
2. Fill in:
   - **Accession Number:** The kit's unique ID (e.g., `SCK-0001`)
   - **Kit Type:** Select from dropdown (Serum, Urine, etc.)
   - **Received Date:** When it arrived at your site
   - **Expiration Date:** (optional) When kit expires
   - **Lot Number:** (optional) Manufacturer batch number
3. Click **Add Kit**

#### Option B: Bulk Import (for many kits)
1. Click **[+ Add Inventory]** → **Bulk Import**
2. Download the CSV template
3. Fill in your kits:
   ```csv
   accession_number,kit_type,received_date,expiration_date,lot_number
   SCK-0001,Serum Collection Kit,2025-09-15,2026-09-15,LOT-12345
   SCK-0002,Serum Collection Kit,2025-09-15,2026-09-15,LOT-12345
   ```
4. Upload the file
5. Review and confirm

**You did it!** Your first kit is now tracked in the system.

---

## Daily Tasks: Managing Inventory {#daily-tasks}

### Viewing Your Inventory

The **Inventory** tab shows all active kits:

```
┌──────────────────────────────────────────────────────────┐
│ Search: [________]  Status: [Available ▾]  [Refresh]    │
├──────────────────────────────────────────────────────────┤
│ Accession   │ Kit Type  │ Status    │ Expiry   │ Actions│
├──────────────────────────────────────────────────────────┤
│ SCK-0001    │ Serum     │ Available │ 2026-09  │ [Edit] │
│ SCK-0002    │ Serum     │ In Use    │ 2026-09  │ [View] │
│ UCK-0045    │ Urine     │ Shipped   │ 2026-01  │ [Track]│
└──────────────────────────────────────────────────────────┘
```

### Kit Statuses Explained

| Status | Meaning | What It Looks Like |
|--------|---------|-------------------|
| **Available** | Ready to ship | 🟢 Green badge |
| **Pending Shipment** | Queued for shipping | 🟡 Yellow badge |
| **Shipped** | On the way to subject | 🔵 Blue badge |
| **Delivered** | Received by subject | ✅ Check mark |
| **Used** | Sample collected | ✅ Completed |
| **Expired** | Past expiration date | 🔴 Red badge |
| **Destroyed** | Discarded/damaged | ❌ Crossed out |

### Common Tasks

#### Find a Specific Kit
1. Use the **Search** box (top of table)
2. Type accession number (e.g., `SCK-0001`)
3. Kit will filter instantly

#### Check Expiring Kits
1. Click the **Expiring** card in the summary
2. View all kits expiring in next 30 days
3. Plan replacements or use them first

#### Edit Kit Details
1. Click **[Edit]** on any kit row
2. Update fields (status, notes, etc.)
3. Click **Save**

#### Archive Expired Kits
1. Go to **Expired** tab
2. Select kits to archive
3. Click **[Archive Selected]**
4. Kits move to Archive (for audit trail)

---

## Ordering & Receiving: Keeping Stock Fresh {#ordering-receiving}

### When to Order: Using Forecasts

The system tells you **exactly when** you'll run out of kits.

#### Reading a Forecast Alert

```
┌───────────────────────────────────────────────────────┐
│ ⚠️  Supply Deficit: Serum Collection Kit              │
│                                                        │
│ Available: 15 kits                                    │
│ Required: 23 kits (by Dec 15 for 8 upcoming visits)  │
│ Deficit: 8 kits                                       │
│                                                        │
│ [Order 8 Kits] [View Forecast Details]               │
└───────────────────────────────────────────────────────┘
```

**What this means:**
- You have 15 kits now
- You need 23 total for visits scheduled through Dec 15
- **Order 8 more** to avoid shortages

### Placing an Order

1. Click **[Plan Order]** button (top right)
2. Fill in order details:
   - **Kit Type:** Select what you need
   - **Quantity:** How many to order
   - **Vendor:** Where you're ordering from (e.g., LabCorp, Quest)
   - **Expected Arrival:** When vendor says it'll arrive
3. Click **Submit Order**

**What happens next:**
- Order appears in **Orders** tab as "Pending"
- Forecast updates to show "Coverage pending"
- You get reminded if order ages without updates

### Receiving an Order

When kits arrive at your site:

1. Go to **Orders** tab
2. Find your order in "Pending Orders" section
3. Click **[Mark Received]**
4. System opens **Add Inventory** modal pre-filled with:
   - Kit type (from order)
   - Received date (today)
   - Quantity (from order)
5. Add accession numbers:
   - Enter each kit's unique ID
   - Or bulk import via CSV
6. Click **Add Kits**

**You're done!** Inventory is updated, forecast recalculates, and alerts refresh.

---

## Shipments: Tracking Kits to Subjects {#shipments}

### Creating a Shipment

When you send a kit to a subject:

1. Go to **Shipments** tab
2. Click **[Create Shipment]**
3. Fill in:
   - **Subject:** Select from dropdown or enter ID
   - **Visit:** Which visit this kit is for
   - **Accession Number:** The kit you're shipping
   - **Shipped Date:** When it left your site
   - **Tracking Number:** (optional) Carrier tracking ID
   - **Carrier:** FedEx, UPS, USPS, etc.
4. Click **Create Shipment**

**What happens:**
- Kit status changes to "Shipped"
- Shipment appears in "In-Transit" section
- Subject's visit record links to shipment

### Tracking a Shipment

```
┌──────────────────────────────────────────────────────┐
│ 🚚 In-Transit Shipments                              │
├──────────────────────────────────────────────────────┤
│ Accession: SCK-0150 → Subject 12345                  │
│ Shipped: Nov 20 • Tracking: 1Z999AA1234567890       │
│ [Mark Delivered] [View Details] [Track Package]     │
└──────────────────────────────────────────────────────┘
```

**Actions:**
- **Track Package** - Opens carrier website
- **Mark Delivered** - Updates status when subject confirms receipt
- **View Details** - See full shipment history

### Delivery Confirmation

When subject confirms receipt:

1. Click **[Mark Delivered]** on shipment
2. Enter delivery date (if different from today)
3. Click **Confirm**

Kit status changes to "Delivered" → ready for subject to collect sample.

---

## Alerts: Staying Ahead of Problems {#alerts}

### Alert Types

The system watches for six alert categories today:

#### 🔴 Critical Alert (Act Now)

**Supply Deficit**
- **What:** Not enough kits for upcoming visits
- **Action:** Order more kits immediately
- **Example:** "Need 8 serum kits by Dec 5"

#### 🟡 Operational Alerts (Monitor)

**Pending Orders Aging**
- **What:** Order placed but no update in 7+ days
- **Action:** Check order status with vendor
- **Example:** "Order from LabCorp, 9 days old"

**Shipments Stuck**
- **What:** Kit shipped to subject but not delivered in 5+ days
- **Action:** Contact subject or carrier
- **Example:** "Kit shipped Nov 15, still in transit"

#### 🔵 Warning Alerts (Plan Ahead)

**Expiring Soon**
- **What:** Kits expire in next 30 days
- **Action:** Use them first or plan replacement
- **Example:** "8 kits expire Nov 30"

**Low Buffer**
- **What:** Inventory below recommended safety buffer
- **Action:** Consider ordering proactively
- **Example:** "Only 5 days of coverage remaining"

#### ⚪ Housekeeping Alert

**Expired Kits**
- **What:** Kits already past expiration
- **Action:** Archive or destroy as required
- **Example:** "5 kits expired Oct 31"

### Managing Alerts

#### Dismissing an Alert

If you're already handling an issue:

1. Click **[Dismiss]** on the alert
2. The alert stays hidden until you restore it manually

> Heads-up: The current release does not auto-restore dismissed alerts. Keep an eye on any situations you hide, especially supply deficits.

#### Restoring Dismissed Alerts

Use the **Restore hidden** link at the top of the panel to bring every dismissed section back into view. There is no single-alert restore yet, so plan to clear the entire list if you need another look.

---

## Tips & Troubleshooting {#tips-troubleshooting}

### 💡 Pro Tips

#### 1. Set Up Buffer Days
In Study Settings → Lab Kits, configure:
- **Inventory Buffer:** Extra days of kits to keep (e.g., 7 days)
- **Visit Window:** How far ahead to forecast (e.g., 30 days)

This helps you order proactively, not reactively.

#### 2. Use Bulk Import for Vendor Shipments
When you receive 50 kits from a vendor:
1. Download CSV template
2. Fill in all accession numbers + shared fields (kit type, received date, lot, expiry)
3. Upload once
4. Saves 10+ minutes vs. manual entry

#### 3. Track Everything
Even if kits don't have barcodes:
- Create your own accession numbers: `STUDY-KITTYPE-0001`
- Example: `PROTO001-SERUM-0045`
- Consistency helps with audits

#### 4. Check Alerts Weekly
Set a calendar reminder:
- Every Monday: Review Alerts tab
- Address critical alerts same-day
- Dismiss operational alerts if already handling

#### 5. Archive Regularly
Monthly cleanup:
- Go to **Expired** tab
- Select all expired/destroyed kits from last month
- Click **[Archive Selected]**
- Keeps active inventory list clean

### 🔧 Troubleshooting

#### Problem: "I added a kit but forecast still shows deficit"

**Solution:**
1. Check kit status is "Available" (not "Pending Shipment" or other)
2. Verify kit type matches visit requirements
3. Click **[Refresh]** button to recalculate forecast
4. If still wrong, contact support with accession number

#### Problem: "I can't find a kit I added yesterday"

**Solution:**
1. Check **Status** filter - might be set to "Available" but kit is "Shipped"
2. Use **Search** box with full accession number
3. Try switching to **All Studies** view (might be in different study)
4. Check **Archive** tab (might have been archived accidentally)

#### Problem: "I dismissed an alert and now can't find it"

**Solution:**
1. Click **Restore hidden** at the top of the Alerts panel
2. All sections you previously dismissed will re-open
3. Review and take action before dismissing again if needed

#### Problem: "Forecast says I need kits but visits aren't scheduled yet"

**Reason:** Forecast uses visit schedule templates (not subject visits)

**Explanation:**
- If your study plans 10 subjects with Visit 3 at Week 6
- Forecast assumes all 10 subjects will need kits at Week 6
- Even if only 5 subjects enrolled so far

**Solution:** This is expected behavior - forecasting helps you prepare for full enrollment

#### Problem: "Bulk import failed with errors"

**Common Issues:**
1. **Duplicate accession numbers** - Each must be unique per study
2. **Invalid kit type** - Must match exactly with configured types
3. **Wrong date format** - Use `YYYY-MM-DD` (e.g., `2025-09-15`)
4. **Missing required fields** - `accession_number` and `kit_type` are mandatory

**Solution:**
1. Download error report (shows which rows failed)
2. Fix issues in CSV
3. Re-upload only failed rows

---

## Quick Reference Card

### Common Actions Cheat Sheet

| I want to... | Go here | Click this |
|--------------|---------|------------|
| Add one kit | Inventory tab | [+ Add Inventory] |
| Add many kits | Inventory tab | [+ Add Inventory] → Bulk Import |
| Check what to order | Alerts tab | View "Supply Deficit" alerts |
| Place an order | Any tab | [Plan Order] (top right) |
| Mark order received | Orders tab | [Mark Received] on order |
| Ship kit to subject | Shipments tab | [Create Shipment] |
| Confirm subject got kit | Shipments tab | [Mark Delivered] on shipment |
| See expiring kits | Inventory tab | Click "Expiring" summary card |
| Archive old kits | Expired tab | Select kits → [Archive Selected] |
| Find a kit | Inventory tab | Search box (top) |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search inventory | `/` then type |
| Refresh data | `Cmd/Ctrl + R` |
| Open Add Kit modal | `A` |
| Focus study selector | `S` |

---

## Need More Help?

### Resources
- **Video Tutorials:** [Link to training videos]
- **FAQ:** [Link to FAQ page]
- **Support:** support@studycoordinatorpro.com
- **Office Hours:** Tuesdays 2-4 PM ET (Zoom link in app)

### Feedback
Found a bug or have a suggestion? Click the **Feedback** button in the app header or email us.

---

**You're ready to go!** Start by adding your first kit and exploring the alerts. The system will guide you from there.

**Happy coordinating! 🎉**

---

*Last updated: September 2025 | Version 1.0*
