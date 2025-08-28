# Study Coordinator Pro - Development Project Instructions (Revised)

## Project Overview
You are helping develop "Study Coordinator Pro," a **web-first application** designed as a personal productivity tool for clinical research coordinators. This is a **completely new project** built from scratch to optimize coordinator workflows, while maintaining the ability to reference patterns from an existing IP Accountability System.

## Strategic Development Approach

### Fresh Start Architecture
- **Clean slate development** - New repository and codebase optimized for coordinators from day one
- **Reference existing IP system** - Extract specific algorithms and patterns as needed without inheriting complexity
- **Coordinator-focused design** - Every feature built specifically for coordinator workflows
- **Separate project maintainability** - Keep IP Accountability System intact for future use

### Web-First Strategy (Updated from Mobile-First)
- **Primary platform**: Responsive web application with mobile-first design
- **Progressive Web App (PWA)** capabilities for app-like experience
- **Cross-platform by default** - Works on phones, tablets, desktops without separate development
- **Future native apps** only if market validation justifies the investment

## Target User
**Primary User**: Clinical Research Coordinators at pharmaceutical research sites
- Manage 2-8 active clinical studies simultaneously
- Responsible for patient visits, compliance tracking, deviation management, and monitor interactions
- Currently use paper logs, Excel spreadsheets, and basic clinical software
- Looking for personal productivity tools to save 1-2 hours per week
- **Device usage**: Mix of desktop work (detailed data entry), tablet use (patient visits), and mobile access (quick updates)

## Core Value Proposition
"The Swiss Army knife for clinical research coordinators" - a comprehensive personal productivity tool that organizes daily clinical research tasks without replacing regulatory record-keeping systems.

## Technical Foundation (Revised)
- **Technology Stack**: Next.js 15.5.2 + Supabase + TypeScript + Tailwind CSS + Turbopack
- **Architecture**: Web-first SaaS with mobile-responsive design
- **Database**: Fresh Supabase schema designed specifically for coordinator workflows
- **Component Strategy**: Extract and adapt specific components/logic from existing IP system as needed
- **Deployment**: Web application with PWA capabilities

## Development Timeline (Revised to Web-First)

### Week 1-2: Foundation (COMPLETED)
- ✅ Fresh Next.js project setup with modern toolchain
- ✅ Supabase database with coordinator-focused schema
- ✅ Basic authentication and user management
- ✅ Core UI component library with clinical research theming
- ✅ Dark theme design system with glass morphism effects
- ✅ Responsive dashboard layout with navigation
- ✅ Deployed to Vercel with CI/CD pipeline
- ✅ Local development environment setup

### Week 3-4: Core Infrastructure (MOSTLY COMPLETE)
- ✅ Study management with Add Study form and full validation
- 🔄 Schedule of Events builder for visit configuration (next priority)
- ✅ Data models and database schema implemented and deployed
- ✅ Mobile-responsive navigation and layouts
- ✅ Complete CRUD foundation for studies with Supabase integration
- 📝 Subject management (pending SoE completion)
- 📝 Visit scheduling foundation (pending SoE completion)

### Week 5-6: Compliance Calculator Module (Highest Value Feature)
- Core compliance calculation algorithms (adapted from IP system)
- Multiple dosing frequency support (QD, BID, TID, QID)
- Visual status indicators and trending
- Mobile-optimized data entry forms

### Week 7-8: Visit Planning Dashboard
- Calendar integration and visit window tracking
- Required actions checklists
- Integration with compliance status
- Beta testing preparation

### Week 9-12: Additional Features & Market Launch
- Monitor action item tracker
- Deviation log management
- PWA capabilities implementation
- Beta user acquisition and feedback integration

## Core Features (MVP)

### 1. Compliance Calculator Module (Week 5-6 Priority)
- Calculate drug compliance percentages based on dosing frequency
- Support for multiple dosing schedules (once daily, twice daily, etc.)
- 80% compliance threshold alerts and visual indicators
- Patient-specific compliance tracking and trending
- Export compliance summaries for regulatory purposes
- **Leverage**: Existing IP system compliance algorithms

### 2. Visit Planning Dashboard (Week 7-8 Priority)
- Calendar view of upcoming patient visits across all studies
- Visit window tracking (± allowed days)
- Required actions checklist for each visit type
- Integration with compliance status and action items
- Smart scheduling recommendations

### 3. Monitor Action Item Tracker (Week 9-10)
- Log and track action items from CRA (Clinical Research Associate) visits
- Priority classification and due date management
- Status updates (open, in progress, completed)
- Photo attachments for documentation
- Automated reminders for approaching deadlines

### 4. Deviation Log Tracker (Week 11-12)
- Quick entry forms for protocol deviations
- Severity classification (minor, major, critical)
- Root cause analysis tracking
- Corrective action planning and follow-up
- Integration with sponsor reporting requirements

## Key Design Principles (Updated)

### Web-First User Experience
- **Mobile-responsive design** - Works seamlessly on phones, tablets, and desktops
- **Progressive Web App features** - Offline capability, add to home screen, push notifications
- **One-handed operation** optimization for mobile usage
- **Quick data entry** with smart defaults and autocomplete
- **Visual status indicators** (red/yellow/green) for quick assessment
- **Cross-device sync** - Start on desktop, continue on mobile

### Technical Excellence
- **Clean, modern codebase** built specifically for coordinator workflows
- **Selective component reuse** from proven IP Accountability System
- **Mobile-first responsive design** using Tailwind CSS
- **TypeScript throughout** for maintainability and developer experience
- **Component-driven architecture** for reusability and testing

### Regulatory Positioning (Unchanged)
- **Personal productivity tool** - NOT a replacement for official regulatory records
- **Workflow optimization** - helps organize daily tasks more efficiently  
- **Supplemental system** - works alongside existing site procedures
- **Clear disclaimers** - "For workflow optimization only, does not replace regulatory requirements"

## Business Model (Updated Timeline)
- **Freemium SaaS**: 30-day free trial, then $12.99/month individual or $9.99/month team plans
- **Faster validation**: Web-first approach enables quicker user acquisition and testing
- **Revenue goal**: $500 MRR within 3 months, $1,000 MRR within 6 months, $5,000 MRR within 12 months
- **Lower customer acquisition cost** - No app store barriers, easier sharing and trials

## Component Extraction Strategy from IP System

### What TO Extract and Adapt
- **Compliance calculation algorithms** - Core mathematical logic for drug compliance
- **Authentication patterns** - User login/logout flows and session management concepts
- **Database schema patterns** - Audit trails, user roles, clinical data modeling approaches
- **UI component patterns** - Status indicators, form layouts, clinical workflow designs
- **Validation logic** - Clinical data validation rules and error handling

### What NOT to Bring Over
- **Full inventory management complexity** - Coordinators don't need full IP tracking
- **Complex integrations** - Start simple, add integrations later if needed
- **Legacy technical debt** - Clean slate allows modern best practices
- **Unused features** - Many IP features aren't relevant to coordinator productivity
- **Outdated dependencies** - Fresh project uses latest versions of everything

## Development Approach (Updated)

### Iterative Web Development
- **2-week development sprints** with working features each iteration
- **Progressive enhancement** - Core web functionality first, PWA features second
- **Component-first development** - Build reusable UI components for clinical workflows
- **Real coordinator testing** - Beta test with actual coordinators from week 8 onward

### Reference-Based Development
- **Keep IP system running** - No changes to existing production system
- **Extract specific components** when building similar features
- **Adapt rather than copy** - Optimize extracted logic for coordinator-specific needs
- **Document extraction decisions** - Track what was reused vs rebuilt for future reference

## Success Metrics (Updated Timeline)
- **Week 8**: Functional MVP with compliance calculator and visit planning
- **Week 12**: Beta users actively testing with feedback integration
- **Month 4**: 50+ active trial users, 25% trial-to-paid conversion rate
- **Month 6**: $1,000 MRR, 60% monthly retention rate
- **Month 12**: $5,000 MRR, feature expansion based on user feedback

## Strategic Tasks & Research (Outstanding)

### ❌ **Pending Research & Validation Tasks**
- **IP Accountability System Audit**: Complete code audit and component extraction plan for proven compliance algorithms
- **Coordinator User Research**: Survey 10-15 clinical coordinators on web vs native app preference to validate approach
- **Feature Priority Validation**: Validate feature priorities with existing Guthrie coordinators for real-world needs
- **Testing Framework Setup**: Configure comprehensive testing framework (Jest, React Testing Library, Playwright)

### 📊 **Foundation Checklist Progress**
- ✅ Create fresh GitHub repository: "study-coordinator-pro-web"
- ✅ Initialize Next.js 15.5.2 + Supabase + TypeScript + Tailwind CSS project
- ✅ Configure Turbopack for faster development builds
- ✅ Set up development environment (separate from IP system)
- ✅ Document reusable authentication, database schemas, and compliance logic
- 🔄 Configure ESLint, Prettier, and testing framework (ESLint ✅, Testing ❌)
- ❌ Complete IP Accountability System code audit and component extraction plan
- ❌ Survey 10-15 clinical coordinators on web vs native app preference
- ❌ Validate feature priorities with existing Guthrie coordinators

**Progress: 5/9 Complete (56%), 1/9 In Progress (11%), 3/9 Outstanding (33%)**

## Current Development Status (Updated)
- ✅ **Repository created**: `study-coordinator-pro-web`
- ✅ **Next.js 15.5.2 setup**: With TypeScript, Tailwind, Turbopack
- ✅ **Supabase project**: Database and authentication configured
- ✅ **Environment configuration**: API keys and connection testing complete
- ✅ **Database schema design**: Coordinator-focused data models implemented
- ✅ **Basic authentication flow**: User registration and login working
- ✅ **Dark theme design system**: Comprehensive CSS variables and component styles
- ✅ **Dashboard foundation**: Navigation, routing, and responsive layout
- ✅ **Studies page**: Complete with status management and empty states
- ✅ **Vercel deployment**: Live application with CI/CD pipeline
- ✅ **Local development**: Hot reload and debugging setup
- ✅ **Study management CRUD**: Add Study form with full validation and database integration
- ✅ **Database schema**: Applied to Supabase with proper RLS policies
- 🔄 **Schedule of Events builder**: Grid-based visit configuration (next priority)

## Current Sprint: Schedule of Events Builder
- **Completed**: ✅ Add Study form with comprehensive validation and database integration
- **Primary Goal**: Schedule of Events (SoE) builder with Excel-like grid interface
- **Secondary Goal**: Drug Dispensing and Lab Kit activity tracking integration
- **Database Status**: ✅ Updated study schema deployed to Supabase
- **Next Features**: Visit scheduling, SoE configuration, and subject enrollment workflows

## Recommended Next Steps (Priority Order)
1. **🏗️ Technical**: Complete testing framework setup (Jest, React Testing Library)
2. **🔬 Research**: IP Accountability System audit for compliance algorithm extraction
3. **👥 Validation**: Survey clinical coordinators for feature priority validation
4. **⚡ Features**: Continue with Schedule of Events builder or Compliance Calculator
5. **🧪 Quality**: Comprehensive testing suite for existing study management features

### Recently Completed (Week 3-4)
- **✅ Add Study Form**: Complete modal form with all clinical research fields
- **✅ Database Integration**: Full Supabase CRUD with Row Level Security
- **✅ Form Validation**: Real-time validation with user-friendly error handling
- **✅ Study Status Management**: Clinical research lifecycle (Enrolling → Active → Closed → Completed)
- **✅ Responsive Design**: Mobile-first approach with dark theme consistency

## Communication Style (Updated)
When discussing this project:
- **Assume coordinator workflow expertise** but focus on web-first solutions
- **Reference IP system** as inspiration, not as a constraint
- **Prioritize web/PWA features** over native app complexity initially  
- **Consider cross-device usage** - coordinators switch between desktop, tablet, mobile
- **Emphasize clean development** - fresh start allows modern best practices
- **Balance feature extraction** - reuse proven logic but avoid inheriting complexity

## Key Questions for Web-First Approach
- How can we make the web interface as fast and responsive as a native app?
- What PWA features would provide the most value for coordinators?
- How do we optimize for both desktop data entry and mobile quick access?
- Which IP system components provide the most value when adapted for coordinators?
- How do we ensure offline functionality works for poor connectivity sites?
- What would make coordinators choose a web app over requesting a native app?

## Outstanding Strategic Decisions
1. **IP System Integration**: Should we audit existing IP system for compliance algorithms before building from scratch?
2. **User Research Priority**: How critical is coordinator feedback before continuing feature development?
3. **Testing vs Features**: Should we implement comprehensive testing before adding more features?
4. **Feature Sequencing**: Schedule of Events vs Compliance Calculator vs Subject Management - which delivers most value first?

## Context for Technical Decisions (Updated)
- **Cross-device flexibility** - Web-first supports coordinator workflow across multiple devices
- **IT policy friendly** - Web apps typically easier to deploy in clinical research sites
- **Faster iteration** - Web deployment allows rapid feature updates and user feedback
- **Component reusability** - Extract proven patterns from IP system while building clean architecture
- **Progressive enhancement** - Start with core web functionality, add PWA features for app-like experience

You should approach all development decisions through the lens of creating a web-first tool that clinical research coordinators would actually use daily, while strategically leveraging proven components from the existing IP Accountability System to accelerate development.