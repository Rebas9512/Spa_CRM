# Spa CRM — Multi-Store Client Management System

> A production-grade iPad-first PWA that digitizes client intake, health screening, visit tracking, and therapist workflows for massage therapy clinics. Currently deployed and in active use.

**Live Production**: [spa.rebasllm.com](https://spa.rebasllm.com) &nbsp;|&nbsp; **Status**: Production (active testing phase)

---

## Why This Project Exists

A massage therapy chain was running entirely on paper forms — every client filled out the same health questionnaire on every visit, across every location. Forms got lost, health alerts were missed, and there was no way to look up a returning client's history.

I conducted stakeholder interviews, mapped the existing paper workflow, and identified the core pain points:

| Problem | Impact |
|---------|--------|
| Repeat paperwork on every visit | 5-10 min wasted per returning client |
| No cross-store client records | Clients re-explain medical history at each location |
| Paper consent forms | Compliance risk, storage burden |
| No therapist signature tracking | Service records incomplete, no audit trail |
| Manual visit counting | Unable to identify loyal clients or track trends |

This system eliminates all five problems with a single iPad at the front desk.

---

## Screenshots

### PIN-Based Authentication
Numeric keypad optimized for iPad touch input. Staff and admin access controlled through separate PINs — no passwords to type on a shared device.

<p align="center"><img src="docs/screenshots/01-pin-entry.png" width="720" /></p>

### Staff Dashboard — Operational Hub
Real-time phone search with numpad input. Pending signature banner keeps therapist queue visible. One-tap access to check-in, customer list, and store management.

<p align="center"><img src="docs/screenshots/02-staff-main.png" width="720" /></p>

### Customer Lookup — Instant Recognition
Phone number search returns customer profile with visit count, last visit date, and health status badge. Staff sees at a glance whether the client has any health alerts.

<p align="center"><img src="docs/screenshots/03-customer-found.png" width="720" /></p>

### Multi-Step Intake Form
4-step wizard (Personal Info → Health Screening → Preferences → Consent & Signature) with field validation, autosave to localStorage, and conditional fields (e.g., minor status triggers guardian signature).

<p align="center"><img src="docs/screenshots/04-intake-step1.png" width="720" /></p>

### Form Validation
Real-time validation with clear error messaging. Required fields highlighted in red with contextual help text.

<p align="center"><img src="docs/screenshots/05-form-validation.png" width="720" /></p>

### E-Signature & Legal Consent
Full consent text displayed before signature. Touch-optimized canvas captures finger signatures at 2x resolution. Signed forms generate downloadable PDF documents for compliance.

<p align="center"><img src="docs/screenshots/06-consent-signature.png" width="720" /></p>

### Returning Client Check-In
Health summary displayed before service — high blood pressure, allergies, areas to avoid are surfaced immediately. Staff can confirm check-in or update health form if conditions have changed.

<p align="center"><img src="docs/screenshots/07-return-checkin.png" width="720" /></p>

### Customer Profile — Complete Record
Contact info, health form summary with color-coded badges, editable staff notes, and full visit history with status tracking (Active / Completed / Cancelled).

<p align="center"><img src="docs/screenshots/08-customer-profile.png" width="720" /></p>

### Therapist Signature Queue
After each service, therapists sign off from a prioritized queue. Position counter (1/3, 2/3) keeps orientation during batch signing. Health alerts shown before each signature to reinforce safety.

<p align="center"><img src="docs/screenshots/09-therapist-queue.png" width="720" /></p>

### Therapist Record — Health-Alert-First Design
Health warnings (high blood pressure, areas to avoid) displayed prominently above the signature area. Therapists record technique used and body parts treated before signing.

<p align="center"><img src="docs/screenshots/11-therapist-record.png" width="720" /></p>

### Store Management — Data & Export
Tabbed admin interface with customer directory, visit log, date-range filtering, pagination, and CSV export for external analysis.

<p align="center"><img src="docs/screenshots/12-store-management.png" width="720" /></p>

---

## Key Features

- **iPad-First PWA** — Installable on iPad home screen, all interactions designed for touch
- **Dual-Layer Authentication** — Admin accounts (JWT, 30-day) for ownership; Store PINs (staff/admin) for daily operations
- **Three-Level Access Control** — `staff` → `customer` → `admin` state machine governs device handoff between roles on a single shared iPad
- **Multi-Step Intake** — 4-step health questionnaire with Zod validation (shared frontend/backend), autosave, and draft restoration
- **E-Signature & PDF** — Canvas-based finger signature capture; client-side PDF generation for legal consent documents
- **Health Alert System** — Color-coded badges (allergies, blood pressure, pregnancy) surfaced at every touchpoint
- **Therapist Queue** — Pending signature workflow with position tracking and batch signing
- **Multi-Store, Multi-Device** — One admin manages multiple locations; multiple iPads per store with automatic session sync
- **Returning Client Flow** — Phone lookup → prefilled health form → one-tap check-in with diff highlighting for changes
- **Data Export** — CSV export of customer and visit data with date-range filtering
- **i18n** — English and Chinese (Simplified) with runtime language switching
- **Zero-Ops Deployment** — Entire stack on Cloudflare (Workers + D1 + Pages), no servers to maintain

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  iPad / Browser (PWA)                           │
│  React + TypeScript + TailwindCSS               │
│  Zustand (state) + TanStack Query (cache)       │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
                       v
┌──────────────────────────────────────────────────┐
│  Cloudflare Workers — API (Hono)                 │
│  JWT auth · Zod validation · PBKDF2 hashing      │
└──────────────────────┬───────────────────────────┘
                       │ D1 binding
                       v
┌──────────────────────────────────────────────────┐
│  Cloudflare D1 — SQLite                          │
│  7 tables · FK constraints · auto-updated_at     │
└──────────────────────────────────────────────────┘
```

### Data Model (7 Tables)

```
admins ──< stores ──< store_sessions
                  ──< visits >── customers ──< intake_forms
invite_codes
```

- **Customers are cross-store** — shared by phone number, accessible from any location
- **One intake form per customer** — updated in place with version tracking
- **Visits link customer × store** — each visit records service type, therapist, technique, and signature
- **Store sessions** — open/close cycle independent of calendar dates; all devices share one active session

---

## Business Analysis Highlights

### Requirements Engineering
- Conducted on-site observation of paper-based workflow at multiple spa locations
- Mapped as-is process (paper forms, manual lookup, no cross-store data) to to-be digital workflow
- Identified 7 distinct user stories spanning 3 actor types (Client, Staff, Admin)
- Prioritized features using MoSCoW method across 5 development phases
- Phased delivery: Project skeleton → Backend API → Core frontend → Admin panel → Production deployment, each phase with CI test scripts

### Process Design

**Device Handoff Protocol** — A single shared iPad transitions securely between three roles without logging out:

```
accessLevel = staff (default, persistent)
    │
    ├── "New Client" / "Update Health Form"
    │       → accessLevel = customer (temporary, iPad handed to client)
    │       → client fills form → submits → Thank You page
    │       → staff enters PIN → back to staff
    │
    ├── [Manage 🔒] → admin PIN
    │       → accessLevel = admin (temporary)
    │       → leave /manage/* route → auto-fallback to staff
    │
    └── Close Out → PIN confirm → store session closed → all devices notified
```

**Session Lifecycle** — Business hours decoupled from calendar dates. A "shift" is simply open-to-close:

| Scenario | Behavior |
|----------|----------|
| First iPad arrives, enters PIN | No active session → create one |
| Second iPad arrives | Active session exists → join without PIN |
| Any device initiates Close Out | Checks store-wide pending signatures first |
| Close Out succeeds | Session closed, all devices receive HTTP 410 within 30s → auto-exit |
| Forgot to close out, next day | Session still active → staff closes out first, then reopens |

**Multi-Device Coordination** — No device registration required. Typical deployment:

| Device | Primary Role | Location |
|--------|-------------|----------|
| iPad A | Staff operations | Front desk |
| iPad B | Client form filling | Waiting area |
| iPad C | Therapist signatures | Staff area |
| Phone/laptop | Admin dashboard | Anywhere |

Coordination relies on DB constraints + idempotent API design + 30s polling — no WebSocket complexity needed for a 2-4 device environment.

### Data Architecture
- Normalized 7-table schema with cross-store customer deduplication (phone as natural key)
- Customers have no `store_id` — belonging is derived through visit records, enabling seamless cross-store sharing
- Health data stored as structured JSON, computed into real-time risk badges at every touchpoint
- One intake form per customer (updated in place), draft saved client-side (localStorage), only finalized data hits the DB
- Visit history enables frequency analysis, therapist utilization, and service mix reporting
- CSV export designed for downstream analysis in Excel/Tableau/Power BI

### Concurrency Design
Rather than distributed locks or optimistic concurrency, the system uses DB constraints + idempotent endpoints + friendly error handling — appropriate for the low-concurrency retail environment:

| Race Condition | Resolution |
|----------------|------------|
| Two devices create same customer | `phone UNIQUE` constraint → second request returns `{ existing: true }` |
| Two devices sign same therapist record | `therapist_signed_at IS NULL` precondition → second PATCH returns 409 |
| Two devices close out simultaneously | First succeeds, second receives 410 (session already closed) |
| Client submitting form during close out | Client gets 410 → draft preserved in localStorage → restored after reopen |

### i18n Strategy
Language is determined by **route territory**, not user preference:
- Staff/Admin pages → Chinese (operators are native Chinese speakers)
- Client intake pages → English (clients are English speakers)
- Switching happens automatically when the iPad transitions between `staff` and `customer` access levels

### Compliance & Risk
- Digital consent workflow with full legal text (4 paragraphs), acknowledgment checkbox, and captured signature
- Client-side PDF generation preserves signed consent documents with timestamps
- Health alert system ensures therapists review medical conditions before every service
- Visit cancellation leaves an audit trail (soft delete with `cancelled_at` timestamp)

### API Design
35+ RESTful endpoints across 4 authentication levels:

| Auth Layer | Middleware | Example Endpoints |
|-----------|-----------|-------------------|
| Public | None | Register, Login, Store PIN, Store Join |
| Store Staff | Store JWT | Customer search, Intake CRUD, Visit create, Therapist sign |
| Store Admin | Store JWT + `role=store_admin` | Customer/visit queries, CSV export |
| Account Admin | Admin JWT | Multi-store CRUD, PIN management, data export |

Key design: `POST /api/customers` creates customer + intake form + visit in a single atomic transaction (D1 batch). Therapist signature endpoint returns `nextPendingVisitId` to enable seamless queue flow.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18, TypeScript, Vite | Component-based UI with type safety |
| Styling | TailwindCSS | Rapid prototyping, touch-friendly sizing |
| State | Zustand + TanStack Query | Local state + server cache separation |
| Forms | React Hook Form + Zod | Multi-step form with shared validation schema |
| Signature | react-signature-canvas | Touch-optimized canvas drawing |
| PDF | @react-pdf/renderer | Client-side compliance document generation |
| API | Hono on Cloudflare Workers | Edge-deployed, <50ms cold start |
| Database | Cloudflare D1 (SQLite) | Zero-config, auto-replicated |
| Auth | JWT + PBKDF2 | Stateless tokens, secure PIN hashing |
| Hosting | Cloudflare Pages + Workers | Global CDN, zero-ops, free tier viable |
| i18n | Custom implementation | English + Chinese runtime switching |

---

## Project Structure

```
spa-crm/
├── frontend/           # React PWA
│   ├── src/
│   │   ├── components/     # Reusable UI (SignaturePad, NumPad, HealthAlertBadge...)
│   │   ├── pages/          # Route-level pages (admin/, store/, public/)
│   │   ├── store/          # Zustand global state
│   │   ├── lib/            # API client with 401/410 handling
│   │   └── i18n/           # Locale files (en, zh)
│   └── dist/           # Built PWA assets
├── backend/            # Cloudflare Worker
│   └── src/
│       ├── routes/         # API endpoints (auth, customers, intake, visits...)
│       ├── middleware/     # JWT verification, role guards, FK enforcement
│       ├── lib/            # Crypto, ID generation, CSV builder
│       └── db/             # Schema & seed SQL
├── shared/             # Cross-boundary types & Zod schemas
└── tests/              # Acceptance test specs
```

---

## Local Development

```bash
# Prerequisites: Node.js 18+, npm

# Install dependencies
npm install

# Start API (Cloudflare Workers local dev)
npm run dev:api     # http://localhost:8787

# Start frontend (Vite dev server)
npm run dev:web     # http://localhost:5173
```

Create `backend/.dev.vars` for local secrets:
```
JWT_SECRET=your-dev-secret-here
```

---

## Deployment

The entire application runs on Cloudflare's edge network:

- **Frontend**: Cloudflare Pages (auto-deploy from build)
- **API**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (managed SQLite)
- **Secrets**: `wrangler secret` for production JWT_SECRET

Zero server management. Zero monthly cost at current scale.

---

## License

Source code is shared for viewing, educational, and portfolio review purposes only. Not licensed for commercial use or redistribution. See [LICENSE](LICENSE) for details.
