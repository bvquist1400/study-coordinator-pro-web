# Study Coordinator Pro - Development Action Plan
## Comprehensive Coding Agent To-Do List

---

## 🎯 IMMEDIATE PRIORITIES (Complete First)

### 1. **Fix Critical UI/UX Issues** ⚠️ HIGHEST PRIORITY
These are blocking user workflows and need immediate attention:

#### A. **Schedule Visit Modal - Scrolling Issue** (Task: schedule-visit-modal) ✅
- **Problem**: Long forms in the scheduling modal overflow the viewport on tablet/mobile and the content cannot be scrolled.
- **Action**: 
  ```typescript
  // Make modal content scrollable on smaller viewports
  - Add `max-h-[80vh] sm:max-h-[85vh]` (or similar) to the modal container in src/components/visits/ScheduleVisitModal.tsx
  - Wrap the scrollable content section with `overflow-y-auto` while keeping the action bar pinned
  - Verify focus trapping & backdrop layering still work after the style change
  - Manually QA on mobile breakpoints to confirm touch scrolling works end-to-end
  ```
- **Files to modify**: 
  - `src/components/visits/ScheduleVisitModal.tsx`
- **Implementation notes**: max-height and flex layout added around the modal shell so the header/footer remain fixed while the form body scrolls; tested on desktop + touch for regression.

#### B. **Anchor Dates Out-of-Window Bug** (Task: anchor-dates-oow) ✅
- **Problem**: Completing visits after a subject switches sections reuses the *current* anchor instead of the visit’s stored section anchor, flagging baseline visits as OOW.
- **Action**:
  ```typescript
  // Ensure window calculations use the correct anchor
  - In src/app/api/subject-visits/[id]/route.ts select `subject_section_id` when loading the visit
  - When computing `targetDate`, prefer the visit's own section anchor before falling back to the active assignment
  - Add a regression test or manual checklist that updates a historical visit after a section transition and verifies `is_within_window`
  - Confirm timeline components use the API-calculated flags (no extra client overrides)
  ```
- **Files to modify**:
  - `src/app/api/subject-visits/[id]/route.ts`
  - `src/components/subjects/SubjectVisitTimelineTable.tsx` (verify display logic only, adjust if needed)
- **Implementation notes**: Timeline prefill now treats `scheduled_date` as UTC to avoid TZ drift, the modal normalizes Day 1 baselines to the anchor date, and the PUT route reuses the visit's historical anchor with matching window offsets.

#### C. **Unscheduled Visit Support** (Task: unscheduled-visit-support) ✅
- **Problem**: Study teams need a way to log ad-hoc visits outside the protocol SOE.
- **Action**:
  ```typescript
  // Enable ad-hoc visit creation
  - Add a "Custom / Unscheduled" option to ScheduleVisitModal with template presets + required reason
  - Flag custom visits via `is_unscheduled` and `unscheduled_reason` when posting to /api/subject-visits
  - Surface an "Add Unscheduled Visit" entry point + badge + reason display on the Subject visit timeline
  ```
- **Files modified**:
  - `src/components/visits/ScheduleVisitModal.tsx`
  - `src/components/subjects/SubjectVisitTimelineTable.tsx`
  - `src/app/api/subject-visits/[id]/route.ts`
  - `src/types/database.ts`
- **Follow-up**: Apply Supabase alter for `subject_visits.is_unscheduled` / `unscheduled_reason` and sync structure files once confirmed.

---

## 📊 PHASE 1: Core Feature Fixes (Week 1-2)

### 2. **Lab Kit Management System Integration**
Multiple issues need resolution in the lab kit workflow:

#### A. **Lab Kit Linking Issue** (Priority: LOW) ✅
- **Problem**: Shipping updates are surfaced in `/lab-kits` and `/shipments` independently, and the latest status is not always reflected in both views.
- **Actions**:
  ```typescript
  // Keep lab kit and shipment UIs in sync
  - Reuse lab_kit_shipments when enriching `/api/lab-kits` responses with latest shipment metadata
  - Ensure `/api/shipments` returns study + lab kit context so ShipmentsList can deep-link into inventory
  - Surface assigned subject/visit details in both LabKitInventory and ShipmentsList panes for at-a-glance reconciliation
  - Add optimistic UI updates when marking shipments delivered so both pages refresh consistently
  ```
- **Status**: Completed — shipment APIs now return kit + subject context via a shared helper, the lab kit inventory UI surfaces subject and shipment columns, the shipments page groups kits by airway bill with expandable rows, and Locate Kit deep-links back to inventory (forcing `status=all`) with optimistic delivery handling.
- **Supabase Notes**:
  - Relationships already exist via `lab_kit_shipments`; evaluate if we need a materialized view or denormalized fields after wiring the APIs.

#### B. **Multi-Kit Support** (Priority: MEDIUM)
- **Problem**: Studies may use multiple kits per visit or kits across multiple visits
- **Actions**:
  ```typescript
  // Implement many-to-many relationships
  - Create junction table: visit_kit_requirements
  - Update UI to support kit selection checkboxes
  - Modify inventory prediction algorithm
  ```
- **Supabase Changes**:
  ```sql
  CREATE TABLE visit_kit_requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_id UUID REFERENCES studies(id),
    visit_type_id UUID REFERENCES visit_types(id),
    kit_type_id UUID REFERENCES kit_types(id),
    quantity INTEGER DEFAULT 1,
    is_optional BOOLEAN DEFAULT FALSE
  );
  ```
- **Progress**: Added a dedicated `visit_kit_requirements` table, exposed CRUD APIs, surfaced requirements on visit schedule reads, and introduced a “Manage Kit Requirements” editor inside the Schedule of Events builder (with optimistic syncing to the new API). Inventory forecasting now rolls up kit demand per shared kit type, Add Lab Kit / bulk edit / bulk import use the shared catalog with SOE-driven recommendations, and coordinators can leave kits unassigned for multi-visit usage. **Next follow-up**: introduce adjustable safety buffers in forecasting and tighten the inventory alert UX (collapsible groups, dismissals).

#### C. **Inventory Forecast UI** (Priority: LOW)
- **Problem**: Alerts overwhelming on Lab Kit management page
- **Actions**:
  ```typescript
  // Consolidate alert display
  - Group alerts by severity (critical/warning/info)
  - Create collapsible alert sections
  - Add summary view with expandable details
  - Implement alert dismissal with persistence
  ```
- **Status**: In progress — severity taxonomy + alert grouping hook drafted; collapsible panel UX prototype ready for review.
- **Implementation Plan**:
  - Reuse `useForecastAlerts` to emit `{ severity, items[] }` buckets and cached counts for the summary pills.
  - Ship `AlertGroupPanel` (client component) with keyboard-accessible toggle, virtualization for >50 alerts, and lazy-mounted detail rows.
  - Stand up `/api/lab-kits/alerts/dismissals` backed by new `lab_kit_alert_dismissals` table (per user + alert hash) so dismissals persist across sessions.
  - Audit websocket pushes to ensure grouped state replays without double inserts; fall back to polling if latency spikes.
- **Acceptance Criteria**:
  - Default view shows <=3 summary chips (Critical, Warning, Info) with badge counts and a single "Expand all" control.
  - Dismissed alerts never reappear for the same user unless re-triggered server-side; manual refresh respects stored dismissals.
  - Screen reader announces severity, count, and expanded/collapsed state; focus management stays within the panel when toggling groups.
- **Risks & Mitigations**:
  - Large alert payloads (>500 rows) could regress initial render → add server pagination + client-side skeleton fallback if response >750 ms.
  - Persisted dismissals require GDPR audit → document retention (30-day TTL) and include admin tooling to purge on request.
- **Implementation Breakdown**:
  - **Backend**: Add `severity` enum to forecast alert serializer, implement grouped response contract (`/api/lab-kits/forecast-alerts`) returning summary counts + paginated detail payloads; create `lab_kit_alert_dismissals` table with RLS enforcing user ownership and TTL cleanup job; extend websocket broadcaster to emit `alerts.grouped` events.
  - **Frontend**: Introduce `useForecastAlertGroups` hook backed by SWR with stale-while-revalidate, build `ForecastAlertSummary` (summary chips) and `AlertGroupPanel` (collapsible list) components, integrate into Lab Kit dashboard with responsive layout; wire dismiss buttons to optimistic local removal + POST to dismissals endpoint.
  - **QA & Monitoring**: Add Jest tests for grouping reducer + dismissal hooks, Playwright smoke test covering expand/dismiss flows, Lighthouse/axe audit for the new panel, and ship Datadog dashboard charting alert counts + dismissals per day.
  - **Rollout**: Behind `labKitsGroupedAlerts` feature flag; enable on staging, run coordinator feedback session, then gradually roll out to 25% → 100% of studies while monitoring API p95 and dismissal error rate <1%.

#### D. **Adjustable Buffer** (Priority: LOW)
- **Problem**: Need configurable buffer for inventory predictions
- **Actions**:
  ```typescript
  // Add buffer configuration
  - Add buffer_days field to study settings
  - Create UI control for buffer adjustment
  - Update prediction calculations to include buffer
  ```
- **Status**: Completed — study settings now manage inventory and visit buffer days; forecasts extend the lookahead and pad kit demand using the configurable buffer targets.

#### F. **Predictive Lab Kit Recommendations & Settings** (Priority: MEDIUM)
- **Problem**: Coordinators lack a single place to tune inventory behaviour or review proactive reorder guidance.
- **Actions (in flight)**:
  ```typescript
  // Centralised Lab Kit Settings
  - Add `inventory_buffer_kits` to studies + per-kit overrides table (min kits, buffer days, auto-order flag, vendor lead time)
  - Expose GET/PUT /api/lab-kit-settings returning study defaults + per-kit overrides with validation
  - Build Lab Kits → Settings page with study defaults card, per-kit grid, bulk edit, and guidance copy

  // Recommendation Engine
  - Extend inventory forecast to emit recommendedOrders[] with reasoning (buffer breach, upcoming surge, expiry risk)
  - Include vendor lead-time heuristics (user-supplied or estimated) to project latest safe order date
  - Persist recommendation decisions (new/dismissed/ordered) for audit + feedback loops

  // UX Integrations
  - Add "Recommended Orders" widget on Lab Kits dashboard with CTA to open prefilled order modal
  - Link forecast alert rows and orders tab to settings for quick buffer adjustments
  - Allow coordinators to capture dismissal reasons (already covered, vendor delay, etc.)
  ```
- **Status**: Discovery complete, backend scaffolding underway — schema PR open, API contract validated against existing Lab Kits dashboard consumers.
- **Backend To-Dos**:
  - Finalize `lab_kit_settings` table (`study_id`, `kit_type_id`, `min_on_hand`, `buffer_days`, `lead_time_days`, `auto_order_enabled`, `notes`, timestamps) plus history table for audit.
  - Extend forecast job to hydrate `recommended_orders` with `{ kitTypeId, reason, windowStart, windowEnd, latestOrderDate, confidence }` and write to `lab_kit_recommendations`.
  - Implement PATCH semantics on `/api/lab-kit-settings` to support partial updates + optimistic concurrency (etag via `updated_at`).
  - Schedule nightly Supabase cron to recompute recommendations; expose manual recompute endpoint guarded by admin role.
- **Frontend To-Dos**:
  - Build Settings page cards (Study Defaults, Kit Overrides, Recommendation History) using shared `DataList` patterns.
  - Wire recommendation widget to new API, with "Accept" → prefilled order modal, "Dismiss" → capture reason + expire recommendation.
  - Add inline education tooltips referencing buffer/lead-time logic; ensure mobile layout collapses cards into accordions.
  - Instrument analytics (`lab_kits.settings.save`, `lab_kits.recommendation.accept`) and document dashboards needed in Looker.
- **Validation & Rollout**:
  - Seed staging with varied lead times + buffer scenarios; run forecast sims to compare recommended order dates vs historical orders.
  - Draft playbook for Ops (how recommendations flow into vendor ordering) and add doc to `docs/ops-handbook.md` once feature ships.
  - Pilot with two studies before GA; capture coordinator feedback on usefulness/accuracy and iterate thresholds accordingly.
- **Implementation Breakdown**:
  - **Database & Services**: Merge schema PR adding `lab_kit_settings`, `lab_kit_settings_history`, and `lab_kit_recommendations`; craft migrations + Supabase RLS policies; extend nightly forecast worker to upsert recommendations with lead-time logic and respect per-kit overrides; expose `/api/lab-kit-settings` (GET/PATCH) and `/api/lab-kit-recommendations` (GET/POST dismiss/accept) with input validation + audit logging.
  - **Frontend**: Create Lab Kit Settings route section with cards for Study Defaults, Kit Overrides table (editable grid with inline validation), Recommendation History timeline, and Recommended Orders widget; integrate accept/dismiss flows with optimistic updates and error toasts; add contextual education tooltips and mobile accordion behaviour.
  - **Testing**: Unit tests for recommendation engine thresholds, contract tests for new APIs, integration tests covering settings save + recommendation accept flows; manual QA script ensuring lead-time adjustments alter suggested order dates; performance test to confirm forecast worker completes within 5 min for 10k kits.
  - **Rollout & Change Management**: Document Ops workflow updates, update coordinator training deck, run staged rollout (internal team → pilot studies → full org) with telemetry guardrails (e.g., alert if accepted recommendations <10% or API errors >2%).
- **Notes**: Start rule-based; collect telemetry to inform future ML/auto-ordering. Vendor lead times become editable metadata on the new settings page so predictions can convert risk windows into concrete order-by dates.

#### E. **Dedicated Kit Orders Workspace** (Priority: MEDIUM) ✅
- **Problem**: Ordering was reactive and scattered across alerts.
- **Actions**:
  ```typescript
  // Provide proactive ordering tools
  - Expose GET /api/lab-kit-orders with study/all-studies scopes, kit metadata, and creator info
  - Add LabKitOrdersSection with filtering, search, and status actions in the Lab Kits page
  - Reuse LabKitOrderModal for create/edit flows with inline validation
  - Surface pending orders in Inventory Forecast and Alerts, highlighting when coverage exists
  - Auto-prefill Add Inventory when marking orders received (study/kit/date)
  ```
- **Status**: Completed — users can review, edit, and close orders from the new Orders tab; deficit alerts and the forecast acknowledge pending coverage; received orders jump directly into prefilled inventory entry. All-studies view now aggregates orders across the coordinator's accessible studies.

---

## 🗓️ PHASE 2: Visit Management Enhancements (Week 2-3)

### 3. **Unscheduled Visit Support** (Priority: MEDIUM) ✅
- **Current state**: Timeline now exposes an "Add Unscheduled Visit" entry, ScheduleVisitModal supports custom/unscheduled mode with templates + mandatory reason, and subject_visits stores `is_unscheduled` / `unscheduled_reason`.
- **Follow-up checks**:
  - QA: schedule a protocol visit, then create an unscheduled entry and confirm badges + reason display.
  - Supabase: ensure the columns exist in `subject_visits` (already applied via migration).

### 4. **Visit Rescheduling Feature** (Priority: MEDIUM) ✅
- **Current state**: Users can reschedule from the timeline via the new `RescheduleModal`, which captures the new date + optional reason, recalculates timing, and logs changes in `visit_schedule_history`.
- **Implementation highlights**:
  ```typescript
  // SubjectVisitTimelineTable
  - Launch dedicated RescheduleModal with window context
  - Refresh timeline after successful PUT /api/subject-visits/[id]

  // API
  - Accept `reschedule_reason` alongside `visit_date`
  - Insert audit rows into `visit_schedule_history`
  - Preserve timing calculations for completed visits
  ```
- **Supabase**: Created `visit_schedule_history` (audit trail) — run the SQL snippet below if not already applied.
- **Follow-up**: Cascading adjustments for dependent visits remain a future enhancement (backlog).

---

## 📦 PHASE 3: Shipment & Tracking (Week 3-4)

### 5. **Accession Number Population** (Priority: MEDIUM)
- **Problem**: Accession numbers not showing on shipment management
- **Actions**:
  ```typescript
  // Fix data flow for accession numbers
  - Verify database field exists and is populated
  - Update query to include accession_number field
  - Add to shipment list display columns
  ```

### 6. **UPS API Integration** (Priority: MEDIUM)
- **Problem**: UPS tracking not wired up
- **Actions**:
  ```typescript
  // Implement UPS tracking
  - Set up UPS API credentials in environment variables
  - Create API route: /api/tracking/ups
  - Implement webhook for status updates
  - Add real-time tracking display
  ```
- **Environment variables needed**:
  ```env
  UPS_API_KEY=
  UPS_API_SECRET=
  UPS_ACCOUNT_NUMBER=
  ```

---

## 📈 PHASE 4: Analytics & Compliance (Week 4-5)

### 7. **Drug Compliance Tracking Tab Cleanup** (Priority: MEDIUM)
- **Problem**: Patient-specific compliance tab needs UI improvements
- **Actions**:
  ```typescript
  // Enhance compliance display
  - Clean up data table formatting
  - Add visual compliance indicators (progress bars)
  - Implement trend charts
  - Add export functionality
  ```

### 8. **Visit Timing Compliance Analytics** (Priority: LOW)
- **Problem**: Visit timing in analytics needs improvement
- **Actions**:
  ```typescript
  // Enhance visit timing analytics
  - Calculate and display visit window adherence
  - Create heat map for timing patterns
  - Add predictive alerts for potential OOW visits
  ```

---

## 🔧 DEVELOPMENT EXECUTION ORDER

### **Week 1: Critical Fixes & Foundation**
1. ✅ Harden Schedule Visit modal responsiveness (Task `schedule-visit-modal`)
2. ✅ Correct anchor-date OOW calculations (Task `anchor-dates-oow`)
3. ✅ Ensure lab kit ↔ shipment enrichment stays in sync in both dashboards

### **Week 2: Visit Management**
4. ✅ Add unscheduled visit support
5. ✅ Implement visit rescheduling
6. ⬜ Fix accession number display

### **Week 3: Lab Kit Enhancements**
7. ⬜ Implement multi-kit per visit support
8. ⬜ Consolidate inventory forecast UI
9. ⬜ Add adjustable buffer configuration

### **Week 4: Integrations & Polish**
10. ⬜ Wire up UPS API tracking
11. ⬜ Clean up compliance tracking tab
12. ⬜ Enhance visit timing analytics

---

## 📊 SUPABASE SCHEMA UPDATES REQUIRED

### Immediate Updates:
```sql
-- 1. Visit Kit Requirements (Many-to-Many)
CREATE TABLE visit_kit_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id UUID REFERENCES studies(id),
  visit_type_id UUID REFERENCES visit_types(id),
  kit_type_id UUID REFERENCES kit_types(id),
  quantity INTEGER DEFAULT 1,
  is_optional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Unscheduled Visits Support ✅ (applied)
ALTER TABLE subject_visits 
ADD COLUMN is_unscheduled BOOLEAN DEFAULT FALSE,
ADD COLUMN unscheduled_reason TEXT;

-- 3. Visit Reschedule Audit ✅ (applied)
CREATE TABLE visit_schedule_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID REFERENCES visits(id),
  old_date DATE,
  new_date DATE,
  reason TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Study Buffer Settings
ALTER TABLE studies
ADD COLUMN inventory_buffer_days INTEGER DEFAULT 14,
ADD COLUMN visit_window_buffer_days INTEGER DEFAULT 0;

-- 5. Shipment Tracking Enhancements
ALTER TABLE lab_kit_shipments
ADD COLUMN ups_tracking_payload JSONB,
ADD COLUMN last_tracking_update TIMESTAMP WITH TIME ZONE;
```

---

## 🚀 CODING AGENT INSTRUCTIONS

### For Each Task:
1. **Test current functionality** to understand the exact issue
2. **Create feature branch** named after the task (e.g., `fix/visit-modal-scrolling`)
3. **Write tests** for the fix/feature before implementation
4. **Implement solution** following existing code patterns
5. **Test across devices** (desktop, tablet, mobile)
6. **Update documentation** if behavior changes
7. **Create pull request** with clear description

### Code Quality Standards:
- TypeScript strict mode compliance
- Mobile-first responsive design
- Accessibility (WCAG 2.1 AA)
- Performance (Core Web Vitals)
- Error handling with user-friendly messages
- Loading states for all async operations
- Optimistic updates where appropriate

### Testing Requirements:
- Unit tests for business logic
- Integration tests for API routes
- E2E tests for critical user flows
- Manual testing on actual mobile devices

---

## 📝 NOTES FOR DEVELOPMENT

### Design Patterns to Follow:
- **Server Components** by default (Next.js 15)
- **Client Components** only when needed for interactivity
- **Parallel data fetching** to reduce waterfalls
- **Optimistic UI updates** for better perceived performance
- **Progressive enhancement** for PWA features

### Performance Optimizations:
- Implement virtual scrolling for long lists
- Use React.memo for expensive components
- Lazy load non-critical features
- Implement proper caching strategies
- Use Turbopack for faster development builds

### Mobile-First Considerations:
- Touch-friendly tap targets (min 44x44px)
- Swipe gestures for common actions
- Offline-first data synchronization
- Reduced motion for accessibility
- Portrait and landscape orientation support

---

## 🎯 SUCCESS METRICS

### Technical Metrics:
- [ ] All critical bugs fixed (Week 1)
- [ ] Page load time < 2 seconds
- [ ] Time to Interactive < 3 seconds
- [ ] 100% mobile responsive
- [ ] Offline functionality working

### User Experience Metrics:
- [ ] Visit scheduling time reduced by 50%
- [ ] Lab kit tracking accuracy 100%
- [ ] Compliance calculations accurate
- [ ] Zero data loss incidents
- [ ] User satisfaction > 4.5/5

---

## 🔄 CONTINUOUS IMPROVEMENT

After initial fixes are complete:
1. Gather user feedback through beta testing
2. Monitor error logs and performance metrics
3. Iterate on UI/UX based on usage patterns
4. Add requested features to backlog
5. Plan for native app development if validated

---

*Last Updated: September 2025*
*Version: 1.0*
*Project: Study Coordinator Pro - Web Development*
