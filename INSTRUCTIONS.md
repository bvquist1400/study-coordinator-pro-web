# Study Coordinator Pro - Development Instructions

## Project Overview
Study Coordinator Pro is a comprehensive clinical research management platform built with Next.js 15.5.2, TypeScript, and Supabase. The application helps clinical research coordinators manage studies, subjects, visits, compliance tracking, and monitor actions.

## Recent Updates & Completed Features

### ✅ Visit Date Unification + API Adjustments
- All UI surfaces now use `visit_date` (no `scheduled_date`).
- Removed `actual_date` from UI and server logic; completion and window calc derive from `visit_date`.
- API changes:
  - `GET /api/subject-visits`: orders/filters by `visit_date`; removed `scheduled_date` alias.
  - `POST /api/subject-visits`: requires `visit_date` and writes only `visit_date`.
  - `PUT /api/subject-visits/[id]`: upsert requires `visit_date`; window calc uses anchor + visit_day with `visit_date` as actual.
  - Files: `src/app/api/subject-visits/route.ts`, `src/app/api/subject-visits/[id]/route.ts`.

### ✅ Multi-bottle IP Compliance in VisitCard
- Added dynamic rows for multiple bottles (ip_id, dispensed, returned) with add/remove.
- On save: inserts/updates `drug_compliance` rows; computes `expected_taken` from days between dispense and return times dosing factor (QD/BID/TID/QID/weekly).
- File: `src/components/visits/VisitCard.tsx`.

### ✅ IP Terminology
- Replaced user-facing “tablet/pill” with “IP/Investigational Product” across UI and calculator text.
- Files: `src/lib/compliance-calculator.ts`, `src/components/visits/VisitDetailModal.tsx`, `src/components/visits/VisitCard.tsx`, dashboard snapshot label.

### ✅ Studies Page Enhancements
- Card cleanup: dosing labels spelled out, visit windows shown as variable with dynamic per-study summary.
- Actions: working “View Details” modal (with window range, copy info, copy protocol, relative updated time) and “Edit” modal (close out, delete, inline validation).
- Support `protocol_version` in types, API, and forms; added to cards and details.
- Files: `src/app/studies/page.tsx`, `src/components/studies/StudyDetailsModal.tsx`, `src/components/studies/EditStudyForm.tsx`, `src/components/studies/AddStudyForm.tsx`, `src/app/api/studies/route.ts`, `src/types/database.ts`.

### ✅ Dashboard Redesign (Phase 1–3)
- Summary metrics wired: studies, subjects, upcoming (7d), overdue, recent activity, alerts.
- Compliance Snapshot: visit timing (30d) and IP compliance (30d average).
- Calendar strip: next 7 days with visit counts and quick links to `/visits?date=YYYY-MM-DD`.
- Quick Actions moved to top of dashboard for immediate access to primary functions.
- Lab Kit Inventory Alerts integrated showing cross-study supply issues.
- File: `src/app/dashboard/page.tsx`.

### ✅ Visits UX Improvements
- Default to List view; remembers last view (per user) and selected study (per user + site).
- Calendar honors `?date=` to open that month (no extra highlight).
- Reduced loading animations for a calmer UI.
- Files: `src/app/visits/page.tsx`, `src/components/visits/VisitCalendarView.tsx`, `src/components/visits/VisitSummaryCards.tsx`, `src/components/visits/VisitListView.tsx`.

### ✅ Lab Kit Management System
- Comprehensive inventory management with visit assignment tracking and grouping.
- Bulk import functionality with Excel-like interface for adding multiple kits.
- Multi-select operations with bulk edit, archive, and delete capabilities.
- Expired kit management with auto-expiration logic and disposal tracking.
- Predictive inventory forecasting system with cross-study shortage alerts.
- Smart supply management: critical (shortage), warning (low stock/expiring), ok (adequate).
- Integration with Schedule of Events for visit-specific kit requirements.
- Files: `src/app/lab-kits/`, `src/components/lab-kits/`, `src/app/api/lab-kits/`, `src/app/api/inventory-forecast/`.

### ✅ Enhanced Subject Management (Phase 1-2)
- **Phase 1**: Enhanced subject cards with visit progress metrics and compliance indicators.
- **Phase 2**: Comprehensive subject detail modal with tabbed interface:
  - Visit Timeline: Complete chronological view with status indicators and overdue alerts
  - Compliance Analytics: Visual progress tracking and timing compliance metrics
  - Notes & History: Subject notes display and key milestone dates
- Enhanced subjects API with optional metrics calculation (SOE-based total visits).
- Card-based responsive grid layout replacing table view.
- Real-time visit progress tracking against Schedule of Events.
- Files: `src/components/subjects/SubjectCard.tsx`, `src/components/subjects/SubjectDetailModal.tsx`, `src/components/subjects/SubjectList.tsx`, `src/app/subjects/page.tsx`, `src/app/api/subjects/route.ts`.

## Current Architecture

### Tech Stack
- **Framework**: Next.js 15.5.2 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Authentication**: Supabase Auth with JWT tokens

### Key Patterns
1. **API-First Approach**: All database operations go through authenticated API routes to avoid RLS policy violations
2. **Form Validation**: Comprehensive client-side and server-side validation
3. **Refresh Mechanisms**: Components use refresh keys to reload data after mutations
4. **Error Handling**: Proper error boundaries and user feedback throughout
5. **HIPAA Compliance**: No PHI fields stored or displayed

### File Structure
```
src/
├── app/
│   ├── api/                  # API routes with authentication
│   ├── subjects/            # Subject management pages
│   └── studies/             # Study management pages
├── components/
│   ├── subjects/           # Subject-related components
│   ├── studies/            # Study-related components
│   └── dashboard/          # Layout components
├── lib/
│   ├── supabase/          # Database client configuration
│   ├── api/               # API utilities and auth helpers
│   └── visit-calculator.ts # Visit date calculation utilities
└── types/
    └── database.ts        # Complete TypeScript database types
```

## Pending Features

### 🔄 Next Priority Items
1. **Dashboard Analytics and Reporting Features**
   - Study enrollment metrics and charts
   - Subject status summaries
   - Compliance rate reporting

2. **Data Export Functionality**
   - CSV export for subject data
   - PDF report generation
   - Customizable data exports

3. **Notification System**
   - Visit reminder notifications
   - Compliance alerts
   - Action item due date reminders

4. **Mobile-Responsive Design Improvements**
   - Optimize forms for mobile devices
   - Improve navigation on smaller screens
   - Touch-friendly interactions

### 🎯 Future Enhancements
- Calendar strip deep-linking filters (optional list filter chip)
- Adverse event reporting
- Protocol deviation tracking
- IP accountability analytics and exports
- Monitor action items management

## Development Guidelines

### Code Standards
- Use TypeScript for all new code
- Follow existing component patterns and naming conventions
- Implement proper error handling and user feedback
- Use Tailwind CSS for styling consistency
- Maintain HIPAA compliance (no PHI data)

### Database Operations
- Always use authenticated API routes (not direct Supabase calls from components)
- Implement proper RLS policies for data security
- Use TypeScript database types from `src/types/database.ts`
- Handle unique constraint violations gracefully

### Form Patterns
- Implement client-side validation with real-time error clearing
- Use consistent loading states and disabled states
- Provide clear success/error feedback to users
- Support refresh mechanisms for data updates

### Testing Considerations
- Test all form validation scenarios
- Verify proper authentication and authorization
- Test data refresh after mutations
- Validate visit date calculations with different anchor day settings

## Known Issues & Considerations

### Resolved Issues
- ✅ Schedule of Events Builder timing field ambiguity
- ✅ RLS policy violations in visit schedule saving
- ✅ Data persistence issues in Schedule of Events Builder
- ✅ Subject form saving with incorrect field names
- ✅ Missing edit functionality for subjects

### Current Limitations
- Visit scheduling system not yet implemented
- No file upload/attachment system
- Limited reporting and analytics features
- Basic notification system needed

## Recent Changes Summary
Key improvements delivered:
1. Unified visit date handling and removed legacy fields in API/UI.
2. Implemented multi-bottle IP compliance with dosing-aware expected_taken.
3. Overhauled Studies page (details/edit modals, protocol version, labels, window summaries).
4. Dashboard slices: metrics, activity, alerts, compliance snapshot, and 7‑day calendar strip.
5. Visits page UX: default List view, persistent preferences/filters, calm loaders, calendar deep link.
6. **Lab Kit Management System**: Full inventory lifecycle management with predictive forecasting, bulk operations, visit assignment tracking, and cross-study shortage alerts integrated into dashboard.
7. **Dashboard Reorganization**: Quick Actions moved to top, metric cards removed, compact inventory alerts added for streamlined action-focused interface.
8. **Enhanced Subject Management**: Complete overhaul from table to card-based layout with rich visit progress metrics, comprehensive subject detail modal with timeline view, compliance analytics, and real-time tracking against Schedule of Events.
