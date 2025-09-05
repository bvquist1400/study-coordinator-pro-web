# Study Coordinator Pro — Development Instructions (Updated)

This top section is the concise, current guide for developers. Older, product-marketing content remains below under “Archived Reference”.

## Quick Start
- Read `README.md` for environment variables and run commands.
- Tests use Jest 30 + `next/jest` (no `ts-jest`). See `TESTING.md` for patterns.
- Prefer `src/lib/logger.ts` over `console.log` (ESLint warns). Logs redact by default.

## Key Conventions
- Route params: `export async function GET(req, { params }: { params: { id: string } })` (no `await params`).
- Auth: use `authenticateUser(request)` and `verifyStudyMembership(studyId, user.id)` in API routes.
- Supabase: define typed DTOs for `.insert/.update`. Avoid `as unknown as never`.
- Dates: use `src/lib/date-utils.ts` for UTC‑safe parse/format.
- Errors: return `NextResponse.json({ error }, { status })` using consistent status codes.

## Logging & Redaction
- Env toggles: `LOG_REDACT`, `LOG_TO_SERVICE`, `LOG_SAMPLE_RATE`, `LOG_MAX_PAYLOAD`.
- Client logs can POST to `/api/logs` (authenticated). External forwarding is disabled unless toggled on.
- Do not log tokens, emails, subject numbers, accession numbers, or IP IDs.

## Testing Tips
- Components: mock `@/lib/supabase/client` and stub `fetch` as needed.
- API routes: if `next/server` Request/Response globals conflict with Node env, mock:
  ```ts
  jest.mock('next/server', () => ({
    NextResponse: { json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }) },
  }))
  ```

## Recent Changes (what’s new)
- Added `LOG_TO_SERVICE` + `LOG_SAMPLE_RATE`; client-only service logging; payload redaction preserved.
- ESLint `no-console` (warn; allows warn/error) to encourage structured logging.
- API tests stabilized by mocking `next/server` in Node env.
- Schedule of Events tests updated (session + fetch mocks; fewer brittle assertions).
- Clarified we use `next/jest`; removed reliance on `ts-jest`.

---
## Archived Reference
The previous long-form background has been moved to `docs/ARCHIVE.md` to keep this guide concise.

<!-- Archived content was here; see docs/ARCHIVE.md if needed. -->

## Project Overview
**Web-first SaaS application** for clinical research coordinators - a productivity tool built from scratch to optimize daily workflows.

Study Coordinator Pro is a comprehensive clinical research management platform built with Next.js 15.5.2, TypeScript, and Supabase. The application helps clinical research coordinators manage studies, subjects, visits, compliance tracking, and lab kit inventory with predictive forecasting capabilities.

**Current Status**: Production-ready foundation (9/10 scalability score) with comprehensive database schema, authentication, complete study management, lab kit inventory system with predictive forecasting, and advanced analytics dashboard.

## Architecture & Stack
- **Next.js 15.5.2** + Supabase + TypeScript + Tailwind CSS
- **Scalable foundation** ready for hundreds to thousands of users
- **PWA capabilities** for app-like experience across devices
- **Row-level security** for multi-tenant data isolation
- **API-first architecture** with server-side database operations

## Target User
**Clinical Research Coordinators** managing 2-8 active studies with mix of desktop/tablet/mobile usage patterns.

## Value Proposition
Personal productivity tool for clinical research coordinators - organizes daily tasks without replacing regulatory systems. Features predictive inventory management to prevent kit shortages and optimize study operations.

## Development Status & Priorities

### ✅ Completed Foundation (Phase 1)
- Authentication & user management with JWT tokens
- Comprehensive database schema with RLS policies
- Study management with protocol version tracking
- Responsive dashboard and navigation
- Production deployment on Vercel
- **Comprehensive testing framework** (Jest + React Testing Library + CI/CD)
- **Professional Schedule of Events Builder** - Clinical research-grade SoE grid interface
- **Production error handling** - Error boundaries and comprehensive logging system
- **Compliance Calculator Module** - Advanced drug and visit compliance tracking with visual indicators

### ✅ Enhanced Subject Management (Phase 2) - COMPLETED
- **Phase 1**: Enhanced subject cards with visit progress metrics and compliance indicators
- **Phase 2**: Comprehensive subject detail modal with tabbed interface:
  - Visit Timeline: Complete chronological view with status indicators and overdue alerts
  - Compliance Analytics: Visual progress tracking and timing compliance metrics
  - Notes & History: Subject notes display and key milestone dates
- Enhanced subjects API with optional metrics calculation (SOE-based total visits)
- Card-based responsive grid layout replacing table view
- Real-time visit progress tracking against Schedule of Events
- **Fixed timezone handling** for proper date display

### ✅ Lab Kit Management System (Phase 3) - COMPLETED
- **Comprehensive Inventory Management**:
  - Full lifecycle tracking: received → available → assigned → shipped → completed → expired → destroyed
  - Bulk import functionality with Excel-like interface for adding multiple kits
  - Multi-select operations with bulk edit, archive, and delete capabilities
  - Automated expiration tracking and disposal workflow

- **Predictive Inventory Forecasting System** (CORE FEATURE):
  - **Automatic Kit Assignment**: No manual kit selection during visit scheduling
  - **Predictive Analytics**: AI-powered forecasting based on upcoming visits
  - **Cross-Study Shortage Alerts**: Dashboard integration with real-time inventory status
  - **Smart Supply Management**: Critical (shortage), warning (low stock/expiring), ok (adequate)
  - **Visit-Type Specific Tracking**: Different kit requirements per visit type
  - **Proactive Reorder Alerts**: Prevents stockouts before they impact studies

- **Integration Points**:
  - Schedule of Events integration for visit-specific kit requirements
  - Dashboard inventory alerts with color-coded status indicators
  - Visit management integration with automatic kit availability verification
  - Cross-study inventory visibility for multi-study coordinators

### ✅ Dashboard Analytics and Reporting (Phase 4) - COMPLETED
- **Comprehensive Analytics Suite**:
  - **Enrollment Analytics**: Monthly trends, study comparisons, enrollment velocity
  - **Compliance Analytics**: Visit timing compliance, drug compliance with radar charts
  - **Visit Performance**: Completion rates, overdue tracking, window adherence
  - **Study Comparisons**: Cross-study performance metrics and benchmarking

- **Interactive Dashboards**:
  - Real-time metrics with drill-down capabilities
  - Recharts integration for professional visualizations
  - Tabbed interface for different analytics views
  - Export-ready charts and data tables

- **Dashboard Integration**:
  - Summary metrics: studies, subjects, upcoming visits, overdue alerts
  - Compliance snapshot: 30-day visit timing and IP compliance averages
  - Calendar strip: 7-day view with visit counts and deep-linking
  - Lab Kit inventory alerts with cross-study visibility
  - Quick Actions repositioned for immediate access

### ✅ Visit Management Enhancement (Phase 5) - COMPLETED
- **Enhanced Visit Interface**:
  - **Improved Window Display**: Shows actual date ranges instead of confusing day offsets
  - **Auto-Complete Lab Kit Entry**: Type-ahead functionality for accession numbers
  - **Simplified Visit Completion**: Required fields automatically visible when needed
  - **Backfill Capability**: Support for completing visits with past dates

- **IP Accountability System Overhaul**:
  - **Renamed Fields**: `actual_start_date` → `ip_start_date` for clarity
  - **Enhanced Tracking**: Added `ip_last_dose_date`, `ip_dispensed`, `ip_returned`, `ip_id`, `return_ip_id` fields
  - **Structured Data Entry**:
    - "Dispense at this visit": First dose date, bottle/kit number (text input), dispensed count
    - "Returns from previous visit": Last dose date, bottle/kit number (dropdown selection), returned count
  - **Separated IP ID Fields**: Resolved field conflict where dispensing and returns sections mirrored each other
    - `ip_id`: For new dispensing at current visit (text input)
    - `return_ip_id`: For returns from previous visit (dropdown showing previously dispensed IPs)
  - **Proper Compliance Calculation**: Uses actual dispensing dates for accurate expected doses
  - **Automatic Lab Kit Status Updates**: Lab kits automatically transition from "available" to "used" when associated with completed visits

### ✅ Compliance Analytics System (Phase 6) - COMPLETED
- **Fixed compliance data integration across the application**:
  - **Subjects Page**: Now correctly displays drug compliance percentages (e.g., 97.6%) from the `drug_compliance` table instead of incorrect calculated values (8900%)
  - **Compliance Analytics Page**: Fixed API calls to use proper `/api/analytics/compliance` endpoint with accurate database queries
  - **Dashboard Compliance Widget**: Resolved 0% display issue by implementing proper site-wide compliance aggregation using API endpoints instead of direct database queries that were blocked by RLS policies

- **Database Schema Corrections**:
  - **Fixed API date filtering**: Changed from `updated_at` to `assessment_date` for proper compliance period calculations
  - **Proper compliance calculation**: Uses pre-calculated `compliance_percentage` field from database instead of manual calculations
  - **Site-wide aggregation**: Correctly averages compliance percentages across all accessible studies for dashboard display

- **UI/UX Improvements**:
  - **Visit-specific compliance display**: Shows compliance percentage on the exact visit where bottles were returned
  - **Time period clarity**: Dashboard shows "Visit timing: 30d • Drug compliance: 60d" to indicate data periods
  - **Error resolution**: Fixed all compliance-related "No compliance data available" messages

- **System Integration**:
  - **Unified data flow**: All compliance displays now use the same working API endpoints and database queries
  - **Proper authentication**: Resolved permission issues by using server-side admin queries through API routes
  - **Cross-component consistency**: Subjects, compliance page, and dashboard now all show the same accurate compliance data

### ✅ Enhanced Visit Timeline System (Phase 7) - COMPLETED
- **Excel-Style Timeline Interface**:
  - **Sticky column headers** for easy navigation through long visit lists
  - **Comprehensive visit data** in table format with expandable rows for detailed information
  - **Professional spreadsheet feel** optimized for clinical research coordinators
  
- **Improved Visit Timeline Structure**:
  - **Complete Schedule of Events integration** - Shows all planned visits from SOE automatically
  - **Correct anchor date calculations** - Fixed critical error where timeline used enrollment date instead of randomization date
  - **Enhanced data columns**: Visit name, study day, target date, actual date, visit window, activities, IP compliance, status, and quick actions
  - **Activity pills visualization** with color-coded procedure indicators (🧪 Labs, 💊 IP, 🩺 Vitals, etc.)

- **IP Compliance Integration**:
  - **Moved detailed IP data to expandable sections** - Dispensed/returned counts hidden in expanded view for cleaner main interface
  - **IP Compliance percentage column** - Shows overall bottle compliance with color coding (Green ≥90%, Yellow 75-89%, Red <75%)
  - **Complete bottle tracking** - Bottle ID, dispensed count, returned count, and calculated taken amount in detailed view
  - **Multiple bottle support** - Framework ready for complex multi-bottle scenarios per visit

- **User Experience Improvements**:
  - **Expandable rows** - Click arrow to see full visit details, notes, and IP accountability information
  - **Visual status indicators** - Color-coded visit status (Completed, Scheduled, Overdue, etc.)
  - **Quick action buttons** - Schedule, Complete, Reschedule directly from table rows
  - **Window compliance visualization** - Clear indicators when visits completed outside acceptable windows

- **Critical Bug Fixes**:
  - **Fixed anchor date calculations** - All visit dates now properly calculated from randomization_date (anchor) instead of enrollment_date
  - **Proper API integration** - Uses working API endpoints instead of direct Supabase queries blocked by RLS
  - **Enhanced warning system** - Shows clear message when using enrollment date as fallback when randomization date not set

### 🔄 Current Status
**All major features completed**. System is production-ready with comprehensive functionality for clinical research coordinators. **Recent compliance system fixes and enhanced visit timeline ensure accurate data display across all components** with proper database integration, correct anchor date calculations, and user-friendly Excel-style interfaces optimized for daily clinical research workflows.

## Required Conventions (to keep CI green)

These conventions prevent recurring type-check failures with Next.js 15 + Supabase + strict TypeScript.

- Next.js 15 dynamic routes: params are a Promise
  - Handlers must use: `export async function GET(req, { params }: { params: Promise<{ id: string }> }) { const { id } = await params }`

- Logger usage and typing
  - Always pass Errors to `logger.error`: `catch (error) { logger.error('Message', error as any) }`
  - Import default logger: `import logger from '@/lib/logger'`; keep `export default logger` in `src/lib/logger.ts`.
  - Use `console.warn`/`console.error` only in app code (no `console.log/info`). Rich console UI is allowed only in `src/lib/logger.ts`.

- Supabase mutations: avoid `never` inference on insert/update/upsert
  - Reads: `const { data, error } = await supabase.from('table').select('*')`
  - Writes: `await (supabase as any).from('table').insert(payload as TableInsert).select()`
  - Updates: `await (supabase as any).from('table').update(update as TableUpdate).eq('id', id).select()`
  - Upserts: `await (supabase as any).from('table').upsert(row as TableInsert).select()`

- Joined selects and aliases must be typed locally
  - When using aliases (e.g., `sites:site_id (...)`), declare a local row type and cast before accessing nested fields.
    ```ts
    type MemberRow = { site_id: string; role: 'owner'|'coordinator'|'pi'|'monitor'; sites?: { id: string; name: string } | null }
    const { data } = await supabase
      .from('site_members')
      .select('site_id, role, sites:site_id ( id, name )')
    const rows = (data || []) as MemberRow[]
    rows.map(r => r.sites?.id ?? r.site_id)
    ```
  - Alternatively, use `returns<RowType[]>()` on the select if supported by your client version.

- Prefer explicit result shapes for reducers/maps
  - Convert untyped arrays to typed ones before `reduce`/`map` to avoid `never` inference.

- Avoid deprecated Supabase Admin APIs in routes
  - Use table lookups (e.g., `user_profiles`) instead of `auth.admin.getUserByEmail`.

- Lint settings (already configured)
  - `no-console` is warn and allows only `warn`/`error` by default; `src/lib/logger.ts` has an override for grouping/table.
  - Unused variables prefixed with `_` are ignored. Use `_` prefix for intentionally unused params.

## Predictive Lab Kit Process - DETAILED DOCUMENTATION

### Overview
The Predictive Lab Kit System eliminates manual kit assignment during visit scheduling by automatically forecasting kit needs based on upcoming visits. This prevents stockouts while reducing coordinator workload.

### Core Components

#### 1. Inventory Forecast API (`/api/inventory-forecast`)
**Purpose**: Calculates kit availability vs upcoming visit needs

**Input Parameters**:
- `study_id`: Target study ID
- `days`: Forecast horizon (default: 30 days)

**Process Flow**:
1. **Query Upcoming Visits**:
   ```sql
   SELECT visit_name, visit_date, subject_number 
   FROM subject_visits 
   WHERE study_id = ? AND status = 'scheduled' 
   AND visit_date BETWEEN today AND (today + ?days)
   ```

2. **Query Available Kits**:
   ```sql
   SELECT kit_type, status, expiration_date, visit_schedules.visit_name
   FROM lab_kits 
   LEFT JOIN visit_schedules ON visit_assignment
   WHERE study_id = ? AND status IN ('available', 'assigned')
   ```

3. **Group and Calculate**:
   - Group visits by `visit_name` (Visit 1, Visit 2, etc.)
   - Group kits by `visit_assignment` from Schedule of Events
   - Calculate: `deficit = visits_scheduled - kits_available`

4. **Status Determination**:
   - `critical`: deficit > 0 (shortage will occur)
   - `warning`: available - scheduled ≤ 2 OR kits expiring soon
   - `ok`: adequate supply

#### 2. Visit Scheduling Integration
**Key Feature**: No accession number selection required

**Previous Flow** (Manual):
```
Schedule Visit → Select Specific Kit → Assign Kit → Complete
```

**New Flow** (Predictive):
```
Schedule Visit → System Forecasts Needs → Auto-Alert if Shortage → Complete
```

**Implementation Details**:
- `ScheduleVisitModal.tsx`: Lab kit selection UI completely hidden
- Informational notice explains automatic management
- Visit scheduling purely date/procedure focused
- Kit assignment happens at fulfillment time, not scheduling time

#### 3. Inventory Status Dashboard Integration
**Location**: Main dashboard, top section

**Display Format**:
- **Critical**: Red alert with count of affected visit types
- **Warning**: Yellow indicator with low stock/expiring counts
- **OK**: Green or no indicator (adequate supply)

**Real-time Updates**:
- Recalculates on each page load
- Cross-study visibility for coordinators managing multiple studies
- Click-through to detailed inventory management

#### 4. Kit Assignment Workflow
**When Kits Are Actually Assigned**:
1. **During Visit Completion**: Coordinator enters accession number with autocomplete
2. **During Kit Preparation**: Before shipping to sites
3. **During Inventory Review**: Manual assignment for planning

**Autocomplete Enhancement**:
- Type-ahead search through available kits
- Shows kit type, expiration date, and availability status
- Filters by study and visit type automatically

### Database Schema Changes
**New Tables/Fields**:
```sql
-- Enhanced subject_visits table
ALTER TABLE subject_visits ADD COLUMN ip_start_date DATE;
ALTER TABLE subject_visits ADD COLUMN ip_last_dose_date DATE;
ALTER TABLE subject_visits ADD COLUMN ip_dispensed INTEGER;
ALTER TABLE subject_visits ADD COLUMN ip_returned INTEGER;
ALTER TABLE subject_visits ADD COLUMN ip_id TEXT;

-- Enhanced drug_compliance table
ALTER TABLE drug_compliance ADD COLUMN ip_id TEXT;
ALTER TABLE drug_compliance ADD COLUMN dispensing_date DATE;
ALTER TABLE drug_compliance ADD COLUMN ip_last_dose_date DATE;
ALTER TABLE drug_compliance ADD COLUMN expected_taken NUMERIC;
```

**Multi-Dose Compliance System**:
The system automatically calculates compliance based on study-specific dosing frequency:
- **QD (Once Daily)**: 1 dose per day
- **BID (Twice Daily)**: 2 doses per day  
- **TID (Three Times Daily)**: 3 doses per day
- **QID (Four Times Daily)**: 4 doses per day
- **Weekly**: 1 dose per week (1/7 daily)
- **Custom**: Defaults to 1 dose per day (can be extended)

**Compliance Calculation Formula**:
```sql
expected_taken = (last_dose_date - first_dose_date + 1) × doses_per_day
actual_taken = dispensed_count - returned_count  
compliance_percentage = (actual_taken / expected_taken) × 100
```

**IP Return Linkage System**:
The system correctly handles drug accountability when subjects return bottles from previous visits:
- **Returns are linked to previous visits**: When returning a bottle (e.g., "001"), the return is recorded on the original visit where that bottle was dispensed
- **New dispensing creates separate records**: New bottles dispensed at current visit get their own compliance tracking
- **Transactional integrity**: All operations happen in a single database transaction to ensure data consistency
- **Proper audit trail**: Each bottle maintains its complete lifecycle from dispensing to return

**Return Processing Workflow**:
1. User enters return bottle ID (e.g., "001") and return count
2. System finds the previous visit where that bottle was originally dispensed  
3. Updates that previous visit with the return information
4. Updates the drug compliance record for that specific bottle
5. If dispensing new bottle at current visit, creates separate compliance record

### Business Impact

#### Benefits Achieved:
1. **Elimination of Manual Errors**: No more wrong kit assignments during scheduling
2. **Proactive Shortage Prevention**: Alerts appear before stockouts occur
3. **Improved Coordinator Efficiency**: Faster visit scheduling without kit selection
4. **Better Supply Chain Management**: Predictive ordering based on scheduled visits
5. **Cross-Study Visibility**: Multi-study coordinators see consolidated inventory status

#### Key Metrics Tracked:
- Days until potential stockout per visit type
- Kits expiring within 30 days
- Total visits scheduled vs kit availability
- Cross-study kit utilization rates

### API Endpoints

#### Core APIs:
- `GET /api/inventory-forecast?study_id=xxx&days=30` - Forecast calculations
- `GET /api/lab-kits?studyId=xxx&status=available` - Kit availability with autocomplete
- `PUT /api/subject-visits/[id]` - Visit completion with kit assignment
- `PUT /api/lab-kits/[id]` - Kit status updates (assigned/shipped/expired)

## Schedule of Events Builder Features

### ✅ Streamlined Clinical Research Interface
- **Clean, focused layout** for essential study visit planning
- **Editable Visit Configuration:**
  - Visit Numbers (V1, V2, etc.) - fully customizable
  - Visit Names (editable inline)
  - Flexible Visit Windows with separate before/after days (e.g., -4/+6 days)
- **Core Procedure Categories:**
  - Laboratory (Local Labs, Lab Kit)
  - Investigational Product (Medication Dispensing)

### ✅ Smart Visit Window Management
- **Dual number inputs** for precise before/after day specifications
- **Study-specific flexibility** (e.g., Visit 1: -0/+0 days, Visit 2: -7/+7 days)
- **Calculation-ready data** for automated patient visit scheduling

### ✅ Production Database Integration
- **Full Supabase integration** with visit_schedules table
- **Load/Save functionality** - persists configurations across sessions
- **Smart data mapping** between UI and database formats
- **Error handling** with graceful fallbacks to defaults
- **Visit accountability support** for lab kit and drug tracking

## File Structure
```
src/
├── app/
│   ├── api/                    # API routes with authentication
│   │   ├── analytics/          # Analytics and reporting APIs
│   │   ├── inventory-forecast/ # Predictive lab kit forecasting
│   │   ├── lab-kits/          # Lab kit inventory management
│   │   ├── subject-visits/     # Visit management APIs
│   │   └── studies/           # Study management APIs
│   ├── analytics/             # Analytics dashboard pages
│   ├── lab-kits/             # Lab kit management pages
│   ├── subjects/             # Subject management pages
│   └── visits/               # Visit management pages
├── components/
│   ├── analytics/            # Analytics dashboard components
│   ├── lab-kits/            # Lab kit management components
│   ├── subjects/            # Subject-related components
│   ├── visits/              # Visit management components
│   └── dashboard/           # Layout components
├── lib/
│   ├── supabase/           # Database client configuration
│   ├── api/                # API utilities and auth helpers
│   └── visit-calculator.ts # Visit date calculation utilities
└── types/
    └── database.ts         # Complete TypeScript database types
```

## Current Architecture

### Tech Stack
- **Framework**: Next.js 15.5.2 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Charts**: Recharts for analytics visualization
- **Authentication**: Supabase Auth with JWT tokens

### Key Patterns
1. **API-First Approach**: All database operations go through authenticated API routes
2. **Predictive Analytics**: Forecasting-based inventory management
3. **Form Validation**: Comprehensive client-side and server-side validation
4. **Refresh Mechanisms**: Components use refresh keys to reload data after mutations
5. **Error Handling**: Proper error boundaries and user feedback throughout
6. **HIPAA Compliance**: No PHI fields stored or displayed

## Pending Features (Future Enhancements)

### 🎯 Next Priority Items
1. **PDF Report Generation with Charts**
   - Export analytics charts to PDF format
   - Comprehensive study reports
   - Compliance summary reports

2. **Excel Data Export Capabilities**
   - Subject data exports
   - Visit tracking exports
   - Inventory reports

3. **Advanced Notification System**
   - Email/SMS visit reminders
   - Critical shortage alerts
   - Compliance violation notifications

4. **Mobile-Responsive Optimizations**
   - Enhanced touch interfaces
   - Offline capability improvements
   - Progressive Web App features

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

## Technical Excellence
- **TypeScript throughout** for type safety and maintainability
- **Component-driven architecture** for reusability
- **Mobile-first responsive design** with Tailwind CSS
- **Production-ready API infrastructure** with server-side operations
- **Comprehensive security** - JWT auth, RLS, input validation
- **Real-time validation** and error handling
- **Predictive analytics** for proactive inventory management

## Regulatory Compliance
- **Personal productivity tool** - NOT regulatory record replacement
- **Supplemental system** working alongside existing procedures
- **Clear disclaimers** about regulatory limitations
- **HIPAA compliant** - no PHI data storage

## Business Model
**SaaS**: $12.99/month individual, $9.99/month team plans with 30-day trials

**Value Proposition**:
- Prevents costly study delays due to kit shortages
- Reduces coordinator workload through automation
- Improves compliance tracking and reporting
- Provides actionable insights for study optimization

## Development Approach
**Component-first development** with progressive enhancement, focusing on coordinator workflow optimization and predictive analytics capabilities.

Approach all development through the lens of creating a scalable, maintainable tool that coordinators will use daily across multiple devices, with emphasis on proactive problem prevention rather than reactive problem solving.
