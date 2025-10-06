# Lab Kit Shipments Guide

**Version:** 1.0
**Date:** October 2025
**Audience:** Study coordinators, logistics specialists

This guide explains how to create, manage, and track shipments within the Orders & Shipments tab of the Lab Kit workspace.

---

## 1. When to Create a Shipment
- Subjects need kits delivered for upcoming visits
- Kits are being transferred between sites or returned to the central lab
- Replacement kits must be sent due to damage or expiry

Before creating a shipment, confirm inventory availability in the **Inventory** tab and verify forecast coverage.

---

## 2. Creating a Shipment
1. Navigate to **Orders & Shipments**
2. Click **[Create Shipment]**
3. Fill in the shipment form:
   - **Study & Site / Subject**
   - **Destination details** (site address or subject shipping info)
   - **Carrier & service level** (FedEx, UPS, courier)
   - **Tracking number** (optional at creation, required once generated)
   - **Planned ship date**
   - **Kits included** (select accession numbers or kit types + quantity)
4. Submit to save. The shipment appears in the **Shipments In Transit** list with status `pending_pickup`.

---

## 3. Managing In-Transit Shipments
- Update tracking information once the carrier label is generated
- Status automatically progresses (`pending_pickup` → `shipped` → `delivered`) when tracking updates run (future UPS webhook) or you manually update
- Use the **Aging badge** to identify shipments stuck beyond 5/10 days
- Click **Locate Kit** from a shipment row to jump back to Inventory filtered by the kit's accession number
- For supported carriers (UPS, FedEx, USPS, DHL, others), use **Refresh Tracking** to pull live status/ETA via EasyPost (`EASYPOST_API_KEY` required)

### Manual Status Updates
Until carrier webhooks are enabled, coordinators should:
1. Open the shipment row menu → **Update Status**
2. Choose `shipped`, `in_transit`, or `delivered`
3. Provide delivery confirmation date if known

---

## 4. Receiving Confirmation & Inventory Sync
When a shipment is marked **Delivered**:
- Review the included kits
- If shipments contained new inventory (e.g., from central depot), click **Mark Received** to open the Add Inventory modal prefilled with kit details
- If kits were outbound to a subject, ensure visit tracking reflects the shipment (subject timeline, IP accountability)

---

## 5. Shipment History & Reporting
- Recent deliveries (last 30 days) are visible at the bottom of Orders & Shipments
- For longer history, use the **Archive** tab; filter by status `delivered` or `cancelled`
- Export shipments by date range via the Archive export tools (CSV/PDF)

---

## 6. Troubleshooting
- **Tracking number missing?** Edit the shipment and add the tracking ID; alerts notify about missing tracking after 24 hours
- **Shipment delayed?** Pending aging alerts appear in Orders & Shipments and the Alerts tab; follow up with carrier and update status/notes
- **Kit mismatch?** Use Locate Kit to confirm the accession number and correct the shipment contents; update the shipment record accordingly
- **Tracking refresh fails?** Confirm the tracking number matches the carrier’s format, and ensure `EASYPOST_API_KEY` is configured

---

## 7. Roadmap Notes
- UPS/FedEx webhook integration (see Forecast enhancement & alerts roadmap) will auto-update statuses
- Shipment templates for recurring site shipments (future)
- Bulk shipment creation/import for large studies (future)

Keep this guide handy for new staff handling lab kit logistics.
