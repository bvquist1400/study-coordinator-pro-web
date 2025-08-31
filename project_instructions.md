# Study Coordinator Pro - Development Instructions

## Project Overview
**Web-first SaaS application** for clinical research coordinators - a productivity tool built from scratch to optimize daily workflows.

**Current Status**: Production-ready foundation (8.5/10 scalability score) with comprehensive database schema, authentication, and basic study management.

## Architecture & Stack
- **Next.js 15.5.2** + Supabase + TypeScript + Tailwind CSS
- **Scalable foundation** ready for hundreds to thousands of users
- **PWA capabilities** for app-like experience across devices
- **Row-level security** for multi-tenant data isolation

## Target User
**Clinical Research Coordinators** managing 2-8 active studies with mix of desktop/tablet/mobile usage patterns.

## Value Proposition
Personal productivity tool for clinical research coordinators - organizes daily tasks without replacing regulatory systems.

## Development Status & Priorities

### ✅ Completed Foundation
- Authentication & user management
- Comprehensive database schema with RLS policies
- Study management with validation
- Responsive dashboard and navigation
- Production deployment on Vercel
- **Comprehensive testing framework** (Jest + React Testing Library + CI/CD)
- **Professional Schedule of Events Builder** - Clinical research-grade SoE grid interface
- **Production error handling** - Error boundaries and comprehensive logging system
- **Compliance Calculator Module** - Advanced drug and visit compliance tracking with visual indicators

### 🔄 Current Priority
**Subject Enrollment and Management** - Complete patient tracking system with visit scheduling

### 📋 Next Features (Priority Order)
1. **Subject Management** - Patient enrollment, tracking, and visit scheduling
2. **Dashboard Analytics** - Study metrics and compliance reporting
3. **Data Export** - CSV and PDF report generation
4. **Notification System** - Visit reminders and compliance alerts
5. **Mobile Optimization** - Enhanced responsive design

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

### ✅ Visit Card System Integration
- **VisitCard component** for accountability tracking:
  - Lab Kit tracking (accession numbers, airway bill tracking)
  - Drug accountability (dispense dates, tablet counts, compliance calculation)
  - Local labs completion tracking
- **Automatic compliance calculation** based on tablets dispensed/returned and time periods
- **Real-time compliance indicators** (color-coded percentages)

## API Infrastructure Features

### ✅ Production-Ready Server-Side Operations
- **Comprehensive REST API** with full CRUD operations for studies, visit schedules, and subject visits
- **Server-side Supabase client** with service role for secure database operations
- **JWT authentication** on all endpoints with user session validation
- **Row-level security enforcement** ensuring users only access their own data

### ✅ API Endpoints
- **Studies API** (`/api/studies`) - Study management operations
- **Visit Schedules API** (`/api/visit-schedules`) - Schedule of Events persistence
- **Subject Visits API** (`/api/subject-visits`) - Visit card accountability data
- **Individual resource routes** (`/api/[resource]/[id]`) - Specific record operations

### ✅ Security & Performance Benefits
- **Reduced client bundle size** - Less database code on frontend
- **Enhanced security** - Sensitive operations protected by server-side auth
- **Better error handling** - Consistent API responses with proper HTTP status codes
- **Scalable architecture** - Ready for caching, rate limiting, and monitoring
- **Request validation** - Data type conversion and field validation

## Compliance Calculator Module

### ✅ Advanced Compliance Analysis Engine
- **Drug Compliance Calculations:**
  - Tablet accountability tracking (dispensed vs returned)
  - Multiple dosing frequencies (QD, BID, TID, QID)
  - Over/under-compliance detection with automatic alerts
  - Protocol deviation flagging with severity levels
- **Visit Timing Compliance:**
  - Visit window adherence monitoring
  - Early/late visit detection with protocol window validation
  - Missed visit identification and tracking
- **Overall Compliance Scoring:**
  - Weighted compliance averages (drug 70%, visit 30%)
  - Color-coded status indicators (excellent/good/acceptable/poor)
  - Configurable thresholds per study

### ✅ Visual Components & UI
- **ComplianceDashboard** - Full-featured monitoring interface with filtering
- **ComplianceWidget** - Embeddable status displays with details
- **ComplianceIndicator** - Status dots and progress bars
- **VisitCard Integration** - Real-time compliance feedback during data entry
- **Dedicated /compliance page** - Study-wide and subject-specific analysis

### ✅ Technical Features
- **Comprehensive test suite** - 11+ test cases covering edge cases
- **Dark theme integration** - Consistent with app design
- **Responsive design** - Works across desktop/tablet/mobile
- **Real-time calculations** - Instant compliance updates
- **Robust error handling** - Graceful fallbacks and validation

## Scalability Assessment (9.5/10)

### ✅ Strong Foundation
- **Modern stack** with Next.js 15 + Supabase + TypeScript
- **Scalable database** with proper indexing and RLS
- **Production-ready** architecture for hundreds-thousands of users
- **Clean codebase** with component-driven design

### 📈 Scaling Recommendations

**Immediate (1-2 months):**
- ✅ **API routes for server-side database operations** - COMPLETED
- **Error boundaries and logging** - IN PROGRESS
- **State management solution** (Zustand/Redux)

**Medium-term (2-6 months):**
- **Caching layer** (React Query/TanStack Query) 
- **Performance monitoring** and analytics
- **Advanced authentication** (2FA, SSO)

**Long-term (6+ months):**
- **Advanced caching strategies** (Redis, CDN)
- **Microservices consideration** for high-scale operations
- **Real-time features** (WebSocket connections)

## Technical Excellence
- **TypeScript throughout** for type safety and maintainability
- **Component-driven architecture** for reusability
- **Mobile-first responsive design** with Tailwind CSS
- **Production-ready API infrastructure** with server-side operations
- **Comprehensive security** - JWT auth, RLS, input validation
- **Real-time validation** and error handling
- **Comprehensive testing** with Jest and React Testing Library

## Regulatory Compliance
- **Personal productivity tool** - NOT regulatory record replacement
- **Supplemental system** working alongside existing procedures
- **Clear disclaimers** about regulatory limitations

## Business Model
**SaaS**: $12.99/month individual, $9.99/month team plans with 30-day trials

## Development Approach
**2-week sprints** with component-first development and progressive enhancement.

## Immediate Next Steps
1. **Testing framework** setup (Jest, React Testing Library)
2. **API routes** for server-side operations
3. **Error boundaries** and logging implementation
4. **Schedule of Events** builder completion
5. **State management** solution (Zustand recommended)

## Outstanding Research
- IP system compliance algorithm extraction
- Coordinator user research and validation
- Feature priority validation with real users

## Key Architectural Decisions
- **Cross-device support** via responsive web design
- **Server-side operations** through API routes for better performance
- **Component reusability** with TypeScript interfaces
- **Progressive Web App** features for offline capability

Approach all development through the lens of creating a scalable, maintainable tool that coordinators will use daily across multiple devices.