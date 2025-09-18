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

#### A. **Lab Kit Linking Issue** (Priority: LOW)
- **Problem**: Shipping updates are surfaced in `/lab-kits` and `/shipments` independently, and the latest status is not always reflected in both views.
- **Actions**:
  ```typescript
  // Keep lab kit and shipment UIs in sync
  - Reuse lab_kit_shipments when enriching `/api/lab-kits` responses with latest shipment metadata
  - Ensure `/api/shipments` returns study + lab kit context so ShipmentsList can deep-link into inventory
  - Surface assigned subject/visit details in both LabKitInventory and ShipmentsList panes for at-a-glance reconciliation
  - Add optimistic UI updates when marking shipments delivered so both pages refresh consistently
  ```
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

#### D. **Adjustable Buffer** (Priority: LOW)
- **Problem**: Need configurable buffer for inventory predictions
- **Actions**:
  ```typescript
  // Add buffer configuration
  - Add buffer_days field to study settings
  - Create UI control for buffer adjustment
  - Update prediction calculations to include buffer
  ```

---

## 🗓️ PHASE 2: Visit Management Enhancements (Week 2-3)

### 3. **Unscheduled Visit Support** (Priority: MEDIUM)
- **Problem**: Cannot schedule unscheduled/ad-hoc visits
- **Actions**:
  ```typescript
  // Add unscheduled visit functionality
  - Create "Add Unscheduled Visit" button
  - Template system for common unscheduled visit types
  - Include lab accession and drug accountability fields
  - Allow custom visit naming
  ```
- **Supabase Changes**:
  ```sql
  ALTER TABLE visits 
  ADD COLUMN is_unscheduled BOOLEAN DEFAULT FALSE,
  ADD COLUMN unscheduled_reason TEXT;
  ```

### 4. **Visit Rescheduling Feature** (Priority: MEDIUM)
- **Problem**: No ability to reschedule visits
- **Actions**:
  ```typescript
  // Implement rescheduling workflow
  - Add "Reschedule" action to visit cards and timeline
  - Date picker with window validation
  - Cascade updates to dependent visits
  - Audit trail for schedule changes
  ```
- **Components to create**:
  - `/components/visits/RescheduleModal.tsx`
  - `/lib/visits/rescheduleLogic.ts`

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
5. ⬜ Implement visit rescheduling
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

-- 2. Unscheduled Visits Support
ALTER TABLE visits 
ADD COLUMN is_unscheduled BOOLEAN DEFAULT FALSE,
ADD COLUMN unscheduled_reason TEXT,
ADD COLUMN original_scheduled_date DATE;

-- 3. Visit Reschedule Audit
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
