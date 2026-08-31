# CAPEF DIGITAL ENROLMENT
## CONSOLIDATED AUDIT & MASTER REMEDIATION PLAN

---

## 1. EXECUTIVE SUMMARY

The **CAPEF Digital Enrolment Platform** is a full-stack, mobile-first Progressive Web Application (PWA) designed to digitize enrollment, identification, and agricultural/artisanal activity tracking for members of the *Chambre d'Agriculture, de la Pêche, de l'Élevage et de la Forêt (CAPEF)* in Cameroon.

A thorough, cross-layer, evidence-based audit was performed on the `ephson-productions/CAPEF---enrolement` repository. This evaluation reconciled two prior independent security/engineering audits (DeepSeek and Codex) against direct inspection of the codebase, incorporating Correction 01 (Authorization Separation), Correction 03 (Production-Grade Offline Synchronization Protocol), Correction 04 (Transactional Member Enrollment), Correction 05 (Business-Driven Relational Integrity), Correction 06 (Production-Grade Definition of Done & Quality Gates), and Correction 07 (Durable Offline Storage Architecture & Repository Pattern).

### Key Finding & Verdict
While the codebase exhibits strong architectural intentions—utilizing a modern stack (Node.js/Express 5, Drizzle ORM, Supabase/PostgreSQL, OpenAPI 3.0, Orval codegen, React, TanStack Query, Clerk authentication, and Vite PWA)—**the platform in its current state is unready for production and insecure.**

Critical structural vulnerabilities and architectural gaps were confirmed:
1. **P0 Data Loss & Retry Risk**: The offline action queue (`capef_offline_actions_queue`) for field-collected activity and line-item operations is silently discarded on reconnection without server transmission (`offline-sync.tsx`), lacking client operation IDs (`clientOperationId`), an abstract `OfflineQueueRepository` storage boundary (preparing for IndexedDB migration), structured item metadata (`id`, `clientOperationId`, `operationType`, `payload`, `createdAt`, `retryCount`, `status`, `lastError`), and server-side idempotency tracking (`processed_operations`).
2. **P0 Privilege Escalation**: Fresh or truncated database states automatically grant `admin` privileges to the first user provisioned via Clerk (`auth.ts`).
3. **P0 IDOR & Missing Resource Authorization**: Nested member activity and line-item endpoints fail to verify creator ownership or regional assignment scopes (`members.ts`).
4. **P1 Unauthenticated Badge Access & Missing Auth Boundary**: The badge verification endpoint (`/api/public/members/badge/:badgeToken`) returns full member detail records without requiring authentication (`members.ts`).
5. **P1 SVG Stored XSS**: Badge SVG generation interpolates raw user strings into XML/SVG documents rendered directly in top-level browser contexts (`members.ts`, `MemberDetail.tsx`).
6. **P1 Non-Transactional Enrollment & Member Number Races**: Member creation uses an anti-pattern inserting `memberNumber: "PENDING"` then updating in a separate statement, risking concurrent unique constraint crashes, orphan rows, and partial writes.
7. **P1 Database Integrity & Unconstrained Schema Risk**: Zero foreign keys, zero non-PK indexes, zero unique constraints, and zero CHECK constraints exist across the PostgreSQL schema. Must implement business-driven relational integrity (`ON DELETE RESTRICT` for users/geography, `ON DELETE CASCADE` for child activities/line items, partial unique index for single primary activity, and preflight migration safety).
8. **P1 Migration & Startup Hazards**: Destructive `drizzle-kit push --force` is executed on git merges (`scripts/post-merge.sh`), while application startup triggers uncoordinated, non-transactional database migrations and reference seeding on every boot (`index.ts`, `lib/migration.ts`).
9. **P1 Zero Automated Tests**: No automated unit, integration, or E2E tests exist in the repository (`package.json`).

### Master Development Decision
**🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**
Feature development must be halted immediately until Phase 0 (Containment) and Phase 1 (Stabilization) of the Master Remediation Plan are executed, verified, and locked behind a regression test suite.

---

## 2. AUDIT METHODOLOGY

The audit was conducted using a zero-trust, static inspection process across all repository layers:

1. **Prior Audit Inputs**: DeepSeek findings (F01–F24) and Codex findings (CAP-01–CAP-11) were treated strictly as hypotheses.
2. **Repository Source of Truth**: Every claim was cross-checked against actual code execution paths, schema definitions, API routes, frontend components, and deployment scripts in `ephson-productions/CAPEF---enrolement`.
3. **Trace Analysis**: Multi-layer tracing was executed for critical flows:
   - *Identity & Onboarding*: Clerk Webhook / Provisioning → App User Creation → Role Assignment → Session Authorization.
   - *Member Enrollment*: Frontend Form → Zod Schema → API Endpoint → Database-Native Sequence Number Allocation (`seq_member_number`) → Atomic `db.transaction()` (Member + Primary Activity + Line Items) → Commit / Rollback.
   - *Offline Workflow*: Form Capture → OfflineQueueRepository Abstraction Layer → clientOperationId Generation → Local Storage / IndexedDB Persistence → Network Reconnection → Idempotent Server Replay → Server Acknowledgement → Queue Item Purge.
   - *Badge Generation & Verification*: Member Fetch → SVG String Formatting → Base64 Object URL → Authenticated Token Verification Route (`requireAppUser`).
   - *Database Evolution*: Drizzle Schema → Preflight Legacy Data Audit → Migration Files (`0002_*.sql`) → `drizzle.config.ts` → Deployment Scripts (`post-merge.sh`).
4. **Limitations**: Dynamic execution (e.g., `pnpm test`, `pnpm typecheck`) was restricted to static analysis because `node_modules` was not pre-installed in the environment, and installing dependencies would modify the repository state.

---

## 3. AUDIT RECONCILIATION

The following matrix reconciles DeepSeek and Codex findings with current repository evidence into canonical identifiers (`AUTH`, `AUTHZ`, `PRIV`, `DATA`, `DB`, `MIG`, `API`, `STOR`, `SEC`, `PERF`, `QUAL`, `UX`, `REP`). Duplicate symptoms are merged into single root causes.

| Canonical ID | DeepSeek Ref | Codex Ref | Repository Code Verification | Final Status | Severity | Root Cause Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-001** | F02 | — | `artifacts/api-server/src/routes/auth.ts:90-106` | **CONFIRMED** | **P0** | `isFirstUser = !count` assigns `admin` role to first provisioned Clerk user without bootstrap validation. |
| **AUTH-002** | F03 | CAP-03 | `artifacts/api-server/src/routes/users.ts:56-85` | **CONFIRMED** | **P1** | `POST /users` assigns `pending_<ts>` Clerk ID without issuing real Clerk invitation; initial login conflicts on unique email. |
| **AUTHZ-001** | F07 | CAP-01 | `artifacts/api-server/src/routes/members.ts:530-868` | **CONFIRMED** | **P0** | Nested member activity and line-item routes enforce `requireAppUser` but omit member ownership/regional checks (`authorizeMemberResourceAccess`). |
| **PRIV-001** | F05 | CAP-02 | `artifacts/api-server/src/routes/members.ts:1375-1396` | **CONFIRMED** | **P1** | Badge verification endpoint lacks `requireAppUser` middleware, allowing unauthenticated callers to query member data (`authorizeBadgeVerification`). |
| **PRIV-002** | F06 | — | `artifacts/api-server/src/routes/members.ts:982-1050`, `MemberDetail.tsx:100-126` | **CONFIRMED** | **P1** | Badge SVG string templates interpolate raw user fields; frontend opens `blob:` object URL in top-level browser context. |
| **DATA-001** | F01 | CAP-07 | `artifacts/capef/src/lib/offline-sync.tsx:70-80` | **CONFIRMED** | **P0** | `syncNow()` resets `capef_offline_actions_queue` to `[]` without transmitting mutations. Lacks `OfflineQueueRepository` abstraction layer preparing IndexedDB migration, structured item metadata (`clientOperationId`, `retryCount`, `status`, `lastError`), and server-side idempotency tracking (`processed_operations`), risking silent data loss and duplicate writes. |
| **DATA-002** | F09 | CAP-05 | `artifacts/api-server/src/routes/members.ts:251-275` | **CONFIRMED** | **P1** | Member creation inserts `"PENDING"` then updates, causing concurrency unique crashes and orphan rows. Must use database-native sequence allocation (`seq_member_number`) inside a single atomic transaction. |
| **DATA-003** | F16 | CAP-04 | `artifacts/api-server/src/routes/members.ts:262-276, 497-507` | **CONFIRMED** | **P2** | Member create/update routes pass empty strings (`""`) to double/integer columns instead of coercing to `null`. |
| **DB-001** | F04 | CAP-05 | `lib/db/src/schema/index.ts`, `lib/db/drizzle/0000_brief_timeslip.sql` | **CONFIRMED** | **P1** | Zero foreign keys, zero non-PK indexes, zero unique activity constraints, and zero CHECK constraints across PostgreSQL schema. Must implement business-driven relational integrity with preflight data safety. |
| **DB-002** | F20 | CAP-05 | `artifacts/api-server/src/routes/members.ts:511-527` | **CONFIRMED** | **P2** | `DELETE /members/:id` deletes member record but leaves orphaned `member_activities` and `activity_line_items`. |
| **MIG-001** | F08 | CAP-06 | `artifacts/api-server/src/index.ts:8-15`, `lib/migration.ts` | **CONFIRMED** | **P1** | Application startup executes uncoordinated, non-transactional member-to-activity migration and geographic seeding on boot. |
| **MIG-002** | F17 | — | `scripts/post-merge.sh:4` | **CONFIRMED** | **P1** | Merge script executes `pnpm --filter db push` (`drizzle-kit push --force`), bypassing versioned migration control. |
| **API-001** | F11 | CAP-04 | `artifacts/api-server/src/routes/*.ts` (except `health.ts`) | **CONFIRMED** | **P2** | Generated Zod schemas are dead code on the backend; routes manually destructure raw `req.body` without validation. |
| **API-002** | F18 | CAP-04 | `lib/api-spec/openapi.yaml` | **CONFIRMED** | **P2** | OpenAPI specification lacks `securitySchemes`; contains dead schemas (`ExportResult`) and drifted property definitions. |
| **API-003** | F12 | CAP-04 | `artifacts/api-server/src/routes/members.ts`, `reference.ts` | **CONFIRMED** | **P2** | DB exceptions leak raw PostgreSQL internal error details (`detail`, `constraint`, `table`) directly to HTTP clients. |
| **API-004** | F21 | — | `artifacts/api-server/src/routes/members.ts:456` | **CONFIRMED** | **P3** | Non-numeric path parameters (`/members/abc`) evaluate to `NaN` and crash with HTTP 500 instead of HTTP 400. |
| **STOR-001** | F14 | CAP-08 | `artifacts/api-server/src/routes/uploads.ts`, `MemberForm.tsx` | **CONFIRMED** | **P2** | Images stored as multi-hundred-KB base64 strings in JSONB columns; local `/uploads` disk writes are dead/ephemeral. |
| **SEC-001** | F13 | CAP-09 | `artifacts/api-server/src/app.ts:31-63` | **CONFIRMED** | **P2** | CORS configuration uses permissive suffix matching (`.endsWith(".vercel.app")`) with `credentials: true`. |
| **SEC-002** | F19 | — | `artifacts/api-server/src/routes/members.ts:1346-1373` | **CONFIRMED** | **P2** | Public rate limiter is stored in-memory, lacks trust-proxy configuration, and is easily spoofed via `X-Forwarded-For`. |
| **PERF-001** | F15 | CAP-10 | `artifacts/api-server/src/routes/members.ts`, `dashboard.ts` | **CONFIRMED** | **P2** | Widespread N+1 query patterns in member formatting and unbounded sequential queries in XLSX/CSV export routes. |
| **QUAL-001** | F10 | CAP-11 | `package.json` (all workspace packages) | **CONFIRMED** | **P1** | Zero automated tests (unit, integration, contract, E2E) exist across the entire monorepo. |
| **UX-001** | F22 | CAP-07 | `artifacts/capef/src/components/members/ActivityWizard.tsx` | **CONFIRMED** | **P3** | UI text promises automatic offline synchronization while the underlying action queue silently discards data. |
| **REP-001** | F23 | — | `artifacts/api-server/src/routes/dashboard.ts:24` | **CONFIRMED** | **P3** | Dashboard activity counts aggregate over `members.category` rather than the multi-activity `member_activities` table. |

---

## 4. CANONICAL FINDINGS

*(Detailed structural inventory of all 23 canonical findings with complete technical context)*

### AUTH-001: Unauthenticated Admin Bootstrap Escalation
- **Severity**: P0
- **Domain**: Authentication & Provisioning
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/auth.ts` (lines 90-106)
- **Description**: In `/api/auth/provision`, the backend executes `const [count] = await db.select().from(usersTable); const isFirstUser = !count;` and assigns `role: isFirstUser ? "admin" : "agent"`.
- **Root Cause**: Reliance on runtime table row count as an authorization boundary. On a fresh database, truncated table, or environment reset, the very first user who signs up via Clerk automatically receives super-administrator privileges.
- **Impact**: Privilege escalation and unauthorized administrative takeover of production environment.

### AUTH-002: Broken Agent Invitation & Identity Lifecycle
- **Severity**: P1
- **Domain**: Identity Management
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/users.ts` (lines 56-85), `auth.ts`
- **Description**: Admin user creation inserts an application user record with `clerkUserId: pending_<timestamp>` and executes `console.log(...)` instead of invoking the Clerk Invitation API (`clerkClient.invitations.createInvitation`).
- **Root Cause**: Disconnection between local database user creation and Clerk identity provisioning. When the invited user subsequently registers on Clerk, `/api/auth/provision` searches for `clerkUserId` (which fails to match `pending_<timestamp>`) and attempts an `INSERT` using their email. This triggers a unique constraint violation (`users_email_unique`) on PostgreSQL, permanently locking the agent out and stripping their assigned role.
- **Impact**: Complete breakdown of agent/supervisor onboarding.

### AUTHZ-001: IDOR & Missing Resource Authorization on Nested Activity Routes
- **Severity**: P0
- **Domain**: Authorization
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 530-868)
- **Description**: Nested routes such as `POST/GET/DELETE /api/members/:id/activities` and line-item routes attach `requireAppUser` but fail to execute creator or regional scope checks.
- **Root Cause**: Absence of a centralized member resource authorization middleware (`authorizeMemberResourceAccess`). While member update/delete routes check `createdById` or `regionId`, nested activity and production line-item routes skip member authorization entirely.
- **Impact**: Any authenticated field agent can view, create, edit, or delete activities and line items for members owned by other agents or regions.

### PRIV-001: Unauthenticated Access to Badge Verification & Missing Auth Boundary
- **Severity**: P1
- **Domain**: Authentication & Badge Verification
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 1375-1396), `artifacts/capef/src/App.tsx`
- **Description**: The badge verification endpoint `GET /api/public/members/badge/:badgeToken` is mounted without authentication middleware (`requireAppUser`). Consequently, unauthenticated callers directly requesting this endpoint can query member data. Per CAPEF business rules, verifying member badges is a global function available to ANY authenticated CAPEF user, but MUST NOT be exposed anonymously.
- **Root Cause**: Missing `requireAppUser` middleware on the backend badge verification route (`authorizeBadgeVerification`), and lack of authentication enforcement on the frontend `/badge-verify/:token` route.
- **Impact**: Unauthenticated users scanning QR codes can access detailed member records if queried directly. Requiring authentication ensures only authorized CAPEF agents can inspect member identity profiles.

### PRIV-002: Stored XSS Vector in Generated Badge SVG
- **Severity**: P1
- **Domain**: Security & Rendering
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 982-1050), `MemberDetail.tsx` (lines 100-126)
- **Description**: `POST /api/members/:id/badge` constructs an SVG string by directly interpolating unescaped member attributes (`${member.fullName}`, `${member.phone}`, `${member.village}`). On the frontend, `MemberDetail.tsx` converts the base64 SVG into a Blob URL and opens it via `window.open(objectUrl, "_blank")`.
- **Root Cause**: Lack of XML entity escaping during SVG string assembly and top-level document rendering.
- **Impact**: If a member's name or village contains XML markup (e.g., `<script>` or `<svg onload=...>`), the browser executes the payload in the application's origin context.

### DATA-001: Silent Offline Queue Data Loss & Retry Duplicate Write Hazard
- **Severity**: P0
- **Domain**: Data Integrity & Offline Engine
- **Status**: CONFIRMED
- **File**: `artifacts/capef/src/lib/offline-sync.tsx` (lines 70-80)
- **Description**: The PWA client exposes `enqueueActivityAction` to queue offline activity and line-item actions in `capef_offline_actions_queue`. However, inside `syncNow()`, the queue is cleared without transmitting data:
  ```typescript
  if (actionsQueue.length > 0) {
    localStorage.setItem('capef_offline_actions_queue', JSON.stringify([]));
  }
  ```
  Furthermore, raw `localStorage` calls are scattered directly across components instead of being abstracted behind an `OfflineQueueRepository` interface, lacking structured item metadata (`id`, `clientOperationId`, `operationType`, `payload`, `createdAt`, `retryCount`, `status`, `lastError`), preparing for IndexedDB migration, and missing server-side idempotency tracking (`processed_operations`).
- **Root Cause**: Unfinished offline synchronization implementation lacking durable queue repository abstraction, client operation identifiers, error classification, and server-side idempotency tracking.
- **Impact**: Field agents collecting crop/livestock activities while offline experience permanent data loss or duplicate production records upon reconnecting.

### DATA-002: Non-Transactional Member Enrollment & Member Number Race Conditions
- **Severity**: P1
- **Domain**: Transaction Management & Concurrency
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 251-275)
- **Description**: Member creation currently executes an unsafe two-step write pattern:
  1. `INSERT` member record with `memberNumber: "PENDING"`.
  2. Compute `memberNumber = generateMemberNumber(category, id)`.
  3. `UPDATE` member record with generated number.
  4. `INSERT` primary activity in a separate SQL statement outside any transaction.
- **Root Cause**: Application-level "insert then update" logic without a PostgreSQL sequence or atomic transaction boundary.
- **Impact**: Concurrent member creation requests crash with HTTP 500 unique constraint violations on `"PENDING"`. Network or process failures midway leave permanently `"PENDING"` members, orphan primary activities, or partial enrollment records.

### DATA-003: Numeric Input Serialization Failures
- **Severity**: P2
- **Domain**: Payload Validation
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 262-276, 497-507)
- **Description**: Member create/update routes do not sanitize empty string values (`""`) for numeric database columns (e.g., `regionId`, `departmentId`, `arrondissementId`, `gpsLat`, `gpsLng`).
- **Root Cause**: Omission of input coercion middleware on member endpoints.
- **Impact**: Frontend requests sending `""` for empty form inputs crash PostgreSQL with double precision or integer type errors (HTTP 500).

### DB-001: Absence of Relational Foreign Keys, Delete Policies & Business Constraints
- **Severity**: P1
- **Domain**: Database Schema & Business Integrity
- **Status**: CONFIRMED
- **File**: `lib/db/src/schema/index.ts`, `lib/db/drizzle/0000_brief_timeslip.sql`
- **Description**: Across all 7 database tables (`users`, `members`, `member_activities`, `activity_line_items`, `regions`, `departments`, `arrondissements`), there are **zero foreign key constraints**, **zero delete policies**, **zero non-primary-key indexes**, **zero partial unique primary activity constraints**, and **zero CHECK constraints** enforcing business enums or non-negative numeric ranges.
- **Root Cause**: Schema relies entirely on application discipline without database-level integrity enforcement or preflight data migration checks.
- **Impact**: Deleting a user can corrupt or destroy historical member records, orphan records accumulate silently, multiple primary activities can be assigned to a member, and invalid enum/numeric values reach SQL storage.

### DB-002: Orphan Activity & Line-Item Accumulation on Member Deletion
- **Severity**: P2
- **Domain**: Referential Integrity
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 511-527)
- **Description**: `DELETE /api/members/:id` deletes the member row from `membersTable` but omits cascading deletion of related rows in `member_activities` and `activity_line_items`.
- **Root Cause**: Absence of database-level `ON DELETE CASCADE` foreign keys and application-level cascading logic.
- **Impact**: Orphan activity and line-item records accumulate silently in the database, causing orphaned references in reporting queries.

### MIG-001: Startup Execution of Uncoordinated Migrations & Reference Seeding
- **Severity**: P1
- **Domain**: Process Lifecycle & Deployment Safety
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/index.ts` (lines 8-15), `lib/migration.ts`
- **Description**: Server startup asynchronously triggers `seedDatabaseIfNeeded()` and `migrateExistingMembersToActivities()` during Express boot.
- **Root Cause**: Coupling database schema and data migration execution directly to application process startup.
- **Impact**: Multi-instance deployments and serverless cold starts trigger concurrent full-table scans, non-transactional inserts, database lock contention, and server startup delays.

### MIG-002: Destructive Force-Push Schema Execution in Deployment Script
- **Severity**: P1
- **Domain**: DevOps & Deployment Safety
- **Status**: CONFIRMED
- **File**: `scripts/post-merge.sh` (line 4)
- **Description**: CI/CD deployment script executes `pnpm --filter db push` (which runs `drizzle-kit push --force`).
- **Root Cause**: Replacing controlled versioned migration execution (`drizzle-kit migrate`) with direct, force-push schema synchronization.
- **Impact**: Unreviewed schema changes are forcibly applied to production databases, risking silent column dropping and irreversible data loss.

### API-001: Express Route Handlers Bypass Generated Zod Validation Schemas
- **Severity**: P2
- **Domain**: API Contract & Payload Validation
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/*.ts` (except `health.ts`)
- **Description**: Generated Zod schemas in `@workspace/api-zod` are completely unused by Express route handlers (only `health.ts` imports them).
- **Root Cause**: Express routes manually destructure raw `req.body` without schema validation middleware.
- **Impact**: Contract drift, invalid enum values, missing required fields, and unexpected data shapes reach SQL queries unvalidated.

### API-002: OpenAPI Contract Specification Drift & Dead Schemas
- **Severity**: P2
- **Domain**: API Contract
- **Status**: CONFIRMED
- **File**: `lib/api-spec/openapi.yaml`
- **Description**: The OpenAPI contract lacks `securitySchemes` definitions, contains dead response schemas (`ExportResult`), and advertises properties on `GetMeResponse` that `/api/auth/me` does not return.
- **Root Cause**: Unsynchronized manual editing of `openapi.yaml`.
- **Impact**: Generated client types promise properties that do not exist at runtime, causing TypeScript type misalignments on the frontend.

### API-003: Database Exception Information Disclosure in API Responses
- **Severity**: P2
- **Domain**: Error Handling & Diagnostics
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts`, `reference.ts`
- **Description**: Exception handlers return raw PostgreSQL error objects (`{ message, detail, constraint, table }`) or stringified errors (`{ details: String(error) }`).
- **Root Cause**: Ad-hoc route-level `try/catch` blocks lacking centralized error masking middleware.
- **Impact**: Internal database schema details, table names, and constraint identifiers are exposed to API clients.

### API-004: HTTP 500 Unhandled Exceptions on Malformed Integer Path Parameters
- **Severity**: P3
- **Domain**: Request Handling
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (line 456)
- **Description**: Requesting `/api/members/abc` executes `parseInt("abc", 10)` resulting in `NaN`, which is passed directly to SQL queries, causing unhandled 500 errors.
- **Root Cause**: Missing path parameter integer validation middleware.
- **Impact**: Unnecessary server exception logging and poor API quality.

### STOR-001: Multi-Hundred-KB Base64 JSONB Bloat & Ephemeral Local File Writes
- **Severity**: P2
- **Domain**: Asset Storage Architecture
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/uploads.ts`, `MemberForm.tsx`
- **Description**: Member photos, CNI documents, and signatures are stored as base64-encoded strings directly inside JSONB columns (`physique_data`, `morale_data`). Concurrently, `/api/uploads` writes files to a local `uploads/` disk directory that is wiped on container restarts.
- **Root Cause**: Lack of cloud object storage integration (e.g. Supabase Storage / S3).
- **Impact**: Database bloat (>1MB per member row), slow query serialization, and ephemeral disk space leakage.

### SEC-001: Overly Permissive Wildcard Origin Matching in CORS Middleware
- **Severity**: P2
- **Domain**: Web Security & CORS
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/app.ts` (lines 31-63)
- **Description**: CORS middleware approves origins matching `.endsWith(".vercel.app")` and `.endsWith("-ephson-productions-projects.vercel.app")` with `credentials: true`.
- **Root Cause**: Permissive origin regex evaluation intended for preview deployments.
- **Impact**: Any site hosted on Vercel can issue credentialed cross-origin requests to the API server if user session cookies are present.

### SEC-002: In-Memory & Spoofable Public Rate Limiter
- **Severity**: P2
- **Domain**: Rate Limiting & Protection
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 1346-1373)
- **Description**: The public rate limiter uses an in-memory `Map`, evaluates `req.ip` without Express `trust proxy` configuration, and resets on process restart.
- **Root Cause**: Naive in-memory rate limiting implementation.
- **Impact**: Attackers can bypass rate limits via `X-Forwarded-For` header spoofing or distributed requests across multi-instance deployments.

### PERF-001: Widespread N+1 Query Patterns & Unbounded Export Memory Loading
- **Severity**: P2
- **Domain**: Performance & Database Scalability
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts`, `dashboard.ts`
- **Description**: `formatMember` executes 5+ sequential database queries per member (region, department, arrondissement, creator, activities, line items). The Excel/CSV export endpoint iterates through all members in memory without pagination or stream batching.
- **Root Cause**: Iterative row formatting instead of SQL relational `JOIN` queries or batched prefetching.
- **Impact**: High connection pool starvation, severe latency, and HTTP request timeouts when member records scale beyond a few hundred rows.

### QUAL-001: Complete Absence of Automated Test Suite across Monorepo
- **Severity**: P1
- **Domain**: Quality Assurance & Regression Prevention
- **Status**: CONFIRMED
- **File**: `package.json` (all workspace packages)
- **Description**: No unit tests, integration tests, contract tests, or Playwright E2E tests exist anywhere in the repository.
- **Root Cause**: Testing framework was never initialized.
- **Impact**: Regressions continuously reach production undetected.

### UX-001: Misleading Offline Synchronization UX Copy
- **Severity**: P3
- **Domain**: User Experience
- **Status**: CONFIRMED
- **File**: `artifacts/capef/src/components/members/ActivityWizard.tsx`, `offline-sync.tsx`
- **Description**: UI banners state "Les activités seront automatiquement synchronisées", but offline activity mutations are silently discarded on reconnect.
- **Root Cause**: Frontend notification copy out of sync with offline engine state.
- **Impact**: Field operators falsely believe offline data has been safely preserved.

### REP-001: Inaccurate Primary Category Aggregation in Dashboard Metrics
- **Severity**: P3
- **Domain**: Reporting & Metrics
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/dashboard.ts` (line 24)
- **Description**: Dashboard activity metrics filter over the primary `members.category` column rather than aggregating over the relational `member_activities` table.
- **Root Cause**: Aggregating member primary classification instead of activity line items.
- **Impact**: Members operating secondary activities in distinct sectors are omitted from dashboard sector statistics.

---

## 5. P0 BLOCKERS
*(Issues requiring immediate containment before any further code changes)*

1. **DATA-001**: Production-grade offline sync protocol with `OfflineQueueRepository` abstraction layer (preparing for IndexedDB migration), structured item record schema (`id`, `clientOperationId`, `operationType`, `payload`, `createdAt`, `retryCount`, `status`, `lastError`), and server idempotency (`offline-sync.tsx`, `processed_operations`).
2. **AUTH-001**: Unauthenticated admin takeover on empty user table during bootstrap (`auth.ts`).
3. **AUTHZ-001**: Broken member resource authorization / IDOR across nested activity and line-item routes (`members.ts`).

---

## 6. P1 CRITICAL STABILIZATION

1. **DATA-002**: Atomic member enrollment transaction (`db.transaction`) with database-native sequence allocation (`seq_member_number`), completely eliminating `"PENDING"` updates (`members.ts`).
2. **DB-001**: Business-driven relational integrity migration (`0002_*.sql`): `ON DELETE RESTRICT` for users/geography, `ON DELETE CASCADE` for child activities/line items, partial unique index for single primary activity, CHECK constraints, and preflight legacy data safety procedures (`schema/index.ts`).
3. **AUTH-002**: Broken Clerk agent invitation lifecycle and email collision (`users.ts`).
4. **PRIV-001**: Require `requireAppUser` authentication for badge verification routes so only logged-in CAPEF agents can inspect full member details (`members.ts`, `App.tsx`).
5. **PRIV-002**: Stored XSS vulnerability in generated SVG member badge templates (`members.ts`).
6. **MIG-001**: Application startup execution of uncoordinated schema/data migrations (`index.ts`).
7. **MIG-002**: Destructive `drizzle-kit push --force` execution in CI/CD merge script (`post-merge.sh`).
8. **QUAL-001**: Total lack of automated test suites across monorepo (`package.json`).

---

## 7. P2 HARDENING

1. **DATA-003**: Empty string serialization errors on numeric database columns (`members.ts`).
2. **DB-002**: Accumulated orphan activity/line-item records on member deletion (`members.ts`).
3. **API-001**: Disconnection between Express handlers and generated Zod schemas (`health.ts` vs routes).
4. **API-002**: OpenAPI spec drift, missing security schemes, and dead schemas (`openapi.yaml`).
5. **API-003**: Raw PostgreSQL exception disclosures in API responses (`members.ts`, `reference.ts`).
6. **STOR-001**: Base64 JSONB bloat and ephemeral local disk file writes (`uploads.ts`).
7. **SEC-001**: Overly broad wildcard origin matching in CORS middleware (`app.ts`).
8. **SEC-002**: In-memory, spoofable rate limiting on public endpoints (`members.ts`).
9. **PERF-001**: Severe N+1 query loops and unbounded memory loading in exports (`members.ts`).

---

## 8. P3 CLEANUP

1. **API-004**: Malformed integer path parameters causing HTTP 500 exceptions (`members.ts`).
2. **UX-001**: Misleading UI feedback regarding offline data durability (`ActivityWizard.tsx`).
3. **REP-001**: Dashboard metric aggregation misalignments (`dashboard.ts`).

---

## 9. SECURITY ARCHITECTURE ASSESSMENT

### Threat Model & Attack Surface Map
```
[ Unauthenticated Attacker ] ──► GET /api/members/badge/:token        ──► Rejected HTTP 401 Unauthorized (PRIV-001)
                            ──► POST /api/auth/provision (Fresh DB)  ──► Escalates to Admin (AUTH-001)
                            ──► Spoof X-Forwarded-For               ──► Bypasses Rate Limiter (SEC-002)

[ Low-Privilege Agent A ]   ──► POST /api/members/:memberB_id/activities ──► Rejected HTTP 403 Forbidden (AUTHZ-001)
                            ──► Inject <script> in Name/Village          ──► Stored XSS via Badge SVG (PRIV-002)
                            ──► Scan Member B Badge QR Code             ──► Allowed HTTP 200 Full Verification (PRIV-001)

[ Malicious Origin ]        ──► Any *.vercel.app domain                  ──► CSRF via Permissive CORS (SEC-001)
```

### Detailed Threat Analysis
- **Unauthenticated Endpoint Surface**: Protected member endpoints are secured by `requireAppUser`, but badge verification (`/api/public/members/badge/:badgeToken`) previously leaked PII to unauthenticated callers. Under Correction 01, `requireAppUser` is attached to `GET /api/members/badge/:badgeToken`, forcing unauthenticated scanners to sign in before inspecting member identity profiles.
- **Cross-Agent Resource Manipulation Surface**: Low-privilege agents previously could edit or delete activities and line items for members created by other agents. Task `REM-AUTHZ-001` attaches `authorizeMemberResourceAccess`, restricting agent write actions exclusively to members where `createdById === appUser.id`.
- **Stored Cross-Site Scripting Surface**: Generated SVG badges previously interpolated unescaped member attributes (`${member.fullName}`). Task `REM-PRIV-002` wraps all dynamic text variables in `escapeXml()`, encoding HTML/XML special characters (`<`, `>`, `&`, `'`, `"`) into safe entities.

---

## 10. AUTHENTICATION & AUTHORIZATION ASSESSMENT

### Comprehensive Authorization Matrix

To eliminate confusion between resource ownership and badge verification, the platform enforces two distinct authorization policies:

| User Role | Member CRUD & Activity Mutations (`authorizeMemberResourceAccess`) | Badge Verification Scanning (`authorizeBadgeVerification`) |
| :--- | :--- | :--- |
| **Anonymous / Unauthenticated** | ❌ **DENY** (HTTP 401 Unauthorized) | ❌ **DENY** (HTTP 401 Unauthorized / Redirect to Sign-in) |
| **Agent A** | ✅ **ALLOW** (Only for members created/owned by Agent A)<br>❌ **DENY** (HTTP 403 for members created by Agent B) | ✅ **ALLOW** (Can verify badges for ANY valid member record in the system) |
| **Supervisor** | ✅ **ALLOW** (Only for members within supervisor's assigned region/zones)<br>❌ **DENY** (HTTP 403 for members outside region/zones) | ✅ **ALLOW** (Can verify badges for ANY valid member record in the system) |
| **Admin** | ✅ **ALLOW** (Unrestricted read/write across all members and activities) | ✅ **ALLOW** (Can verify badges for ANY valid member record in the system) |

### Key Auth Remediation Requirements
1. **Member Resource Policy (`authorizeMemberResourceAccess`)**: Implement a declarative authorization middleware for member editing, activities, line items, and status changes:
   - `admin`: Full read/write across all records.
   - `supervisor`: Read/write restricted to members within `user.regionId` or `user.assignedZones`.
   - `agent`: Read/write restricted to members created by `user.id` (`createdById == user.id`).
2. **Badge Verification Policy (`authorizeBadgeVerification`)**: Implement middleware for badge QR verification (`GET /api/members/badge/:badgeToken`):
   - Requires valid CAPEF authentication (`requireAppUser`).
   - Does NOT enforce creator ownership or regional bounds.
   - Returns full member verification profile (`formatMember(member, true)`) for official field inspection.
3. **Unified Agent Provisioning**: Replace the `pending_<ts>` hack in `POST /api/users` with an explicit Clerk Invitation call via `@clerk/express` / Clerk SDK, storing the returned `invitation.id`. On user sign-in, correlate by invitation or email in an atomic transaction.

---

## 11. DATABASE & DATA INTEGRITY ASSESSMENT (CORRECTION 04 & 05)

### Relational Integrity & Sequence Enrollment Architecture

#### 1. Complete Relationship & Delete Policy Matrix

| Parent Table | Child Table | Foreign Key Column | Delete Policy | Business Rationale / Invariant |
| :--- | :--- | :--- | :--- | :--- |
| `users` | `members` | `members.created_by_id` | **`ON DELETE RESTRICT`** | **CRITICAL**: Deleting an agent/supervisor user account MUST NEVER destroy historical citizen enrollment records. |
| `regions` | `members` | `members.region_id` | **`ON DELETE RESTRICT`** | Geographic regions are permanent administrative boundaries; deleting a region must be blocked if members reference it. |
| `departments` | `members` | `members.department_id` | **`ON DELETE RESTRICT`** | Department references are administrative boundaries; deletion blocked if members exist. |
| `arrondissements` | `members` | `members.arrondissement_id` | **`ON DELETE RESTRICT`** | Arrondissement references are administrative boundaries; deletion blocked if members exist. |
| `members` | `member_activities` | `member_activities.member_id` | **`ON DELETE CASCADE`** | Activities are strict child entities of a member. Deleting a member removes their associated activities. |
| `member_activities` | `activity_line_items` | `activity_line_items.activity_id` | **`ON DELETE CASCADE`** | Line items (crops/livestock/crafts) are child entities of an activity. Deleting an activity removes its line items. |
| `users` | `processed_operations` | `processed_operations.user_id` | **`ON DELETE RESTRICT`** | Audit logs for offline idempotency tracking must be preserved for compliance. |

#### 2. Sequence Enrollment & Transaction Architecture

```sql
-- TARGET SCHEMA (STABLE, CONSTRAINED & SEQUENCE-BACKED)
CREATE SEQUENCE seq_member_number START WITH 1 INCREMENT BY 1;

CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  member_number VARCHAR(32) NOT NULL UNIQUE,
  created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  region_id INTEGER REFERENCES regions(id) ON DELETE RESTRICT
);
```

```
[ POST /api/members ]
         │
         ▼
[ Open db.transaction(async (tx) => ...) ]
         │
         ▼
[ Fetch Next Sequence Value ] ──► SELECT nextval('seq_member_number'); (e.g., 42)
         │
         ▼
[ Format Member Number ]      ──► CAPEF-AGR-000042
         │
         ▼
[ tx.insert(membersTable) ]   ──► Insert Member Row with Final member_number (NO "PENDING")
         │
         ▼
[ tx.insert(activitiesTable) ]──► Insert Primary Activity Row inside tx
         │
         ▼
[ tx.insert(lineItemsTable) ] ──► Insert Initial Line Items inside tx
         │
  ┌──────┴──────┐
  ▼             ▼
[ Success ]   [ Exception / Constraint Conflict ]
  │             │
  ▼             ▼
[ COMMIT ]    [ ROLLBACK EVERYTHING ]
```

---

## 12. API / OPENAPI / ZOD ASSESSMENT (CORRECTION O & P)

### 12.1 OpenAPI / Orval Strict Codegen Pipeline (Correction O)
The project utilizes OpenAPI 3.0 (`lib/api-spec/openapi.yaml`) as the single canonical source of truth for API contracts. Orval automatically generates:
1. Server/Validation Zod schemas in `lib/api-zod/src/generated/` (`@workspace/api-zod`).
2. React Query hooks and client fetchers in `lib/api-client-react/src/generated/` (`@workspace/api-client-react`).

#### Strict Generation Rules:
- **`INTERDIT` (STRICTLY FORBIDDEN)**: Manually modifying any file inside `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`. Direct edits to generated artifacts will be overwritten during build/CI codegen steps and introduce silent contract drift.
- **`OBLIGATOIRE` (MANDATORY WORKFLOW)**: Any API request/response shape change, new endpoint, path parameter modification, query filter, or enum update MUST be made directly in `lib/api-spec/openapi.yaml`. After updating `openapi.yaml`, run:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
  Then commit both `openapi.yaml` and the newly generated code in `@workspace/api-zod` / `@workspace/api-client-react`.

```
OpenAPI (lib/api-spec/openapi.yaml) ──► pnpm --filter @workspace/api-spec run codegen
                                                            │
                                  ┌─────────────────────────┴────────────────────────┐
                                  ▼                                                  ▼
                     Generated Zod Schemas                            Generated React Client
                 (lib/api-zod/src/generated/)                   (lib/api-client-react/src/generated/)
                                  │                                                  │
                                  ▼                                                  ▼
                      Express Validation Middleware                        TanStack Query / React Forms
                     (validateBody(schema))
```

### 12.2 Generic Express Validation Middleware
To bridge OpenAPI Zod schemas with Express 5 backend routes, all mutation routes must apply a generic request validation middleware `validateBody(schema)`:

```typescript
import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Payload de requête invalide",
        code: "VALIDATION_ERROR",
        details: result.error.format(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
```

### 12.3 Comprehensive API Validation & Authorization Coverage Matrix (Correction P)
The following matrix defines the contract enforcement, validation middleware, authentication, and authorization policies across all backend API endpoints:

| Endpoint Path | HTTP Method | OpenAPI Schema | Zod Validator Middleware | Auth Required | Authz Policy Middleware | Success Code | Error Codes |
| :--- | :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| `/api/auth/me` | GET | `GetMe` | None (Query) | Yes | `requireAppUser` | 200 | 401, 500 |
| `/api/auth/provision` | POST | `ProvisionUserBody` | `validateBody(ProvisionUserBodySchema)` | Yes | `requireAppUser` | 200 | 400, 401, 500 |
| `/api/users` | GET | `ListUsers` | None (Query params validated) | Yes | `requireAppUser` + `requireRole('admin', 'supervisor')` | 200 | 401, 403, 500 |
| `/api/users` | POST | `CreateUserBody` | `validateBody(CreateUserBodySchema)` | Yes | `requireAppUser` + `requireRole('admin')` | 201 | 400, 401, 403, 409, 500 |
| `/api/users/:id` | PUT | `UpdateUserBody` | `validateBody(UpdateUserBodySchema)` | Yes | `requireAppUser` + `requireRole('admin')` | 200 | 400, 401, 403, 404, 500 |
| `/api/members` | GET | `ListMembers` | None (Query params validated) | Yes | `requireAppUser` (Filtered by agent createdById / supervisor region) | 200 | 401, 500 |
| `/api/members` | POST | `CreateMemberBody` | `validateBody(CreateMemberBodySchema)` | Yes | `requireAppUser` | 201 | 400, 401, 409, 500 |
| `/api/members/:id` | GET | `GetMember` | None (Path param validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('read')` | 200 | 401, 403, 404, 500 |
| `/api/members/:id` | PUT | `UpdateMemberBody` | `validateBody(UpdateMemberBodySchema)` | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 200 | 400, 401, 403, 404, 500 |
| `/api/members/:id` | DELETE | `DeleteMember` | None (Path param validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('delete')` | 200 | 401, 403, 404, 409, 500 |
| `/api/members/:id/status` | PUT | `UpdateMemberStatus` | `validateBody(UpdateMemberStatusSchema)` | Yes | `requireAppUser` + `requireRole('admin', 'supervisor')` + `authorizeMemberResourceAccess('write')` | 200 | 400, 401, 403, 404, 500 |
| `/api/members/:id/activities` | GET | `ListMemberActivities` | None (Path param validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('read')` | 200 | 401, 403, 404, 500 |
| `/api/members/:id/activities` | POST | `CreateActivityBody` | `validateBody(CreateActivityBodySchema)` | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 201 | 400, 401, 403, 404, 409, 500 |
| `/api/members/:id/activities/:activityId` | PUT | `UpdateActivityBody` | `validateBody(UpdateActivityBodySchema)` | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 200 | 400, 401, 403, 404, 500 |
| `/api/members/:id/activities/:activityId` | DELETE | `DeleteActivity` | None (Path params validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 200 | 401, 403, 404, 500 |
| `/api/members/:id/activities/:activityId/line-items` | POST | `CreateLineItemBody` | `validateBody(CreateLineItemBodySchema)` | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 201 | 400, 401, 403, 404, 500 |
| `/api/members/:id/activities/:activityId/line-items/:lineItemId` | PUT | `UpdateLineItemBody` | `validateBody(UpdateLineItemBodySchema)` | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 200 | 400, 401, 403, 404, 500 |
| `/api/members/:id/activities/:activityId/line-items/:lineItemId` | DELETE | `DeleteLineItem` | None (Path params validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('write')` | 200 | 401, 403, 404, 500 |
| `/api/members/:id/badge` | POST | `GenerateBadge` | None (Path param validated) | Yes | `requireAppUser` + `authorizeMemberResourceAccess('read')` | 200 | 401, 403, 404, 500 |
| `/api/public/members/badge/:badgeToken` | GET | `GetPublicBadge` | None (Token path param validated) | **Yes (Correction 01)** | `requireAppUser` + `authorizeBadgeVerification` | 200 | 401, 404, 429, 500 |
| `/api/members/export` | GET | `ExportMembers` | None (Query params validated) | Yes | `requireAppUser` + `requireRole('admin', 'supervisor')` | 200 | 401, 403, 500 |
| `/api/dashboard/stats` | GET | `GetDashboardStats` | None | Yes | `requireAppUser` | 200 | 401, 500 |
| `/api/uploads` | POST | `UploadFileBody` | `validateBody(UploadFileBodySchema)` | Yes | `requireAppUser` | 201 | 400, 401, 413, 500 |
| `/api/reference/*` | GET | `GetReferenceData` | None | Yes | `requireAppUser` | 200 | 401, 500 |


## 13. OFFLINE ARCHITECTURE ASSESSMENT (CORRECTION 03 & 07)

### Production-Grade Offline Synchronization & Durable Storage Architecture

To prevent raw `localStorage.setItem` and `localStorage.getItem` calls from being scattered directly across frontend components, the offline engine MUST encapsulate storage operations behind an abstract **`OfflineQueueRepository`** interface. This abstraction allows immediate usage of local storage while seamlessly preparing the system for an IndexedDB storage provider migration without breaking application UI logic.

```
[ Frontend Component / Activity Wizard ]
                  │
                  ▼
      [ OfflineQueueProvider ]
                  │
                  ▼
     [ OfflineQueueRepository ] (Interface)
        │                       │
        ▼                       ▼
[ LocalStorageProvider ] ──► [ IndexedDBProvider ] (Target Migration)
```

#### 1. Structured Offline Queue Item Record Schema
Every queued offline operation MUST be stored with the following structured metadata schema:

```typescript
export interface OfflineQueueItem<T = any> {
  id: string;                  // Unique queue record ID (UUID v4)
  clientOperationId: string;   // Immutable idempotency key (UUID v4)
  operationType: 'create_activity' | 'create_line_item' | 'delete_line_item' | 'create_member';
  payload: T;                  // Action data payload
  createdAt: string;           // ISO timestamp of offline entry
  retryCount: number;          // Number of sync retry attempts made
  status: 'pending' | 'processing' | 'failed' | 'completed';
  lastError?: string | null;   // Exception diagnostic string from last failure
}
```

#### 2. Abstract Repository Interface
```typescript
export interface IOfflineQueueRepository {
  enqueue<T>(operationType: string, payload: T): Promise<OfflineQueueItem<T>>;
  getAll(): Promise<OfflineQueueItem[]>;
  getPending(): Promise<OfflineQueueItem[]>;
  updateStatus(id: string, status: OfflineQueueItem['status'], error?: string): Promise<void>;
  incrementRetry(id: string, error: string): Promise<void>;
  remove(id: string): Promise<void>;
  clearCompleted(): Promise<void>;
}
```

#### 3. Protocol Rules & Server Idempotency
1. **Never Clear Before Confirmed Server Acknowledgement**: An operation item is removed from `OfflineQueueRepository` ONLY after receiving an explicit HTTP 200/201 response containing `clientOperationId` acknowledgement or confirmation that the item was previously processed.
2. **Server-Side Idempotency (`processed_operations` Table)**: Replaying an operation with an existing `clientOperationId` returns the previously committed result payload with HTTP 200 OK without creating duplicate database rows.
3. **Error Classification**: Network failures/timeouts (HTTP 5xx) increment `retryCount` and retain operations in queue for retry. Terminal validation errors (HTTP 400) set `status: 'failed'` and record `lastError` to prevent infinite retry loops.

---

## 14. UPLOAD / STORAGE ASSESSMENT

### Base64 Bloat vs. Private Cloud Storage
- **Current Defect**: Member photos, CNI documents, and signatures are stored as multi-hundred-KB base64 strings directly inside JSONB columns (`physique_data`, `morale_data`), causing database rows to exceed 1MB. Ephemeral local disk writes (`/uploads`) are wiped on container restart.
- **Target Architecture**: Integrate Supabase Storage API (`member-documents` bucket):
  1. Frontend uploads files via `/api/uploads`.
  2. Server validates MIME type (`image/jpeg`, `image/png`, `application/pdf`), checks magic bytes, and caps file size at 5MB.
  3. Server uploads file buffer to Supabase Storage and returns an immutable cloud URL (`https://.../member-documents/photo_123.jpg`).
  4. Only the cloud URL string is saved in PostgreSQL database columns.

---

## 15. FRONTEND ASSESSMENT

### Form Validation & State Mutation Alignment
- `MemberForm.tsx` implements strict Zod client validation, which is good, but the backend accepts loose payloads.
- **Mutation Invalidation**: The frontend mutation hooks in `ActivityWizard.tsx` and `MemberNew.tsx` must invalidate `['listMembers']` and `['getMember', id]` query keys upon successful submission to prevent stale UI states.
- **Badge Viewing**: Remove unsafe `window.open(objectUrl, "_blank")` calls for SVG badges. Render badges inside a controlled HTML canvas or sanitized embedded `<svg>` component with strict Content Security Policy (CSP).

---

## 16. PRODUCTION / DEPLOYMENT ASSESSMENT

### Runtime Isolation & Database Migration Decoupling
- **Current Defect**: Application startup (`index.ts`) executes database seeding and legacy migration logic asynchronously during boot, causing race conditions in multi-instance or serverless environments.
- **Target Deployment Standard**:
  1. **Build Time**: Compile TypeScript artifacts (`pnpm build`).
  2. **Release Phase / Pre-Deploy**: Run explicit, versioned schema migrations via `pnpm --filter @workspace/db run migrate` using `DIRECT_URL`.
  3. **Runtime Phase**: Launch Express application server (`node dist/index.mjs`) using `DATABASE_URL` transaction pooler without executing data migrations or seeds.

---

## 17. PERFORMANCE ASSESSMENT

### N+1 Elimination & Streaming Exports
- **Query Optimization**: Replace iterative per-member lookups in `formatMember` with relational SQL joins:
  ```sql
  SELECT m.*, r.name as region_name, d.name as department_name, a.name as arrondissement_name
  FROM members m
  LEFT JOIN regions r ON m.region_id = r.id
  LEFT JOIN departments d ON m.department_id = d.id
  LEFT JOIN arrondissements a ON m.arrondissement_id = a.id
  WHERE m.id = $1;
  ```
- **Export Streaming**: Refactor `GET /api/members/export` to fetch records in batches of 500 using cursor pagination, streaming the Excel workbook directly to the response output stream to prevent Node.js heap memory exhaustion.

---

## 18. TESTING & CI ASSESSMENT

### Required Minimum Test Coverage Matrix

| Test Suite | Framework | Target Files | Key Scenarios Covered |
| :--- | :--- | :--- | :--- |
| **Auth Integration** | Vitest / Supertest | `routes/auth.ts`, `routes/users.ts` | Bootstrap admin escalation prevention, Clerk invitation link, role preservation. |
| **Member Resource Authorization**| Vitest / Supertest | `routes/members.ts` | Cross-agent member modification blocked (HTTP 403), supervisor region scope isolation. |
| **Badge Verification Auth** | Vitest / Supertest | `routes/members.ts`, `App.tsx` | Rejection of unauthenticated badge requests (HTTP 401); successful full profile verification for ANY authenticated agent (HTTP 200). |
| **Offline Sync & Idempotency**| Vitest / Supertest | `offline-sync.tsx`, `routes/members.ts` | Action survives reload; retry on network failure retains queue; replaying same `clientOperationId` creates NO duplicate records. |
| **Relational Integrity & Deletes**| Vitest / Supertest | `lib/db/src/schema/`, `routes/users.ts` | Attempting to delete a user with members fails with `ON DELETE RESTRICT`; deleting a member cascades to delete activities/line items; adding second primary activity fails partial unique constraint. |
| **Concurrent Member Enrollment**| Vitest / Supertest | `routes/members.ts` | **10 concurrent member creation requests** -> 10 successful valid members, 10 unique `memberNumber`s, 0 `"PENDING"` members, 0 orphan primary activities. |

---

## 19. CROSS-LAYER ROOT CAUSES

Systemic architectural issues identified across the codebase:
1. **Absence of Server-Side Validation Boundary**: Trusting raw request bodies and relying exclusively on client-side form validation.
2. **Database Integrity Delegated to Application Code**: Failing to define foreign keys, cascades, and unique constraints in PostgreSQL.
3. **Decoupled Identity Lifecycle**: Disconnecting Clerk authentication events from local user role and record creation.
4. **Unsafe Database Schema Evolution**: Using `drizzle-kit push --force` instead of versioned, reviewed migration scripts.
5. **Incomplete Offline Protocol**: Implementing client-side queueing without server replay handlers or atomic acknowledgement logic.

---

## 20. MASTER REMEDIATION PLAN

The following ordered plan details the exact remediation sequence required to achieve full platform stabilization.

| Order | Canonical ID | Severity | Problem | Root Cause | Architectural Fix | Dependencies | Affected Files | Verification Command |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **DATA-001** | **P0** | Silent offline queue data loss & duplicate write risk. | Queue cleared without transmission; raw localStorage scattered. | Encapsulate storage behind `OfflineQueueRepository` (preparing IndexedDB migration); store structured items (`clientOperationId`, `retryCount`, `status`, `lastError`); track server `processed_operations`; purge local items ONLY on HTTP 200/201. | None | `artifacts/capef/src/lib/offline-sync.tsx`, `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **2** | **AUTH-001** | **P0** | First user becomes admin automatically. | `!count` check in JIT provision. | Seed initial admin via CLI or ENV bootstrap (`INITIAL_ADMIN_EMAIL`); reject implicit escalation. | None | `artifacts/api-server/src/routes/auth.ts` | `pnpm typecheck` |
| **3** | **AUTHZ-001** | **P0** | IDOR on nested activities/line items. | Missing resource ownership check. | Create `authorizeMemberResourceAccess` middleware checking `createdById` / `regionId`. | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **4** | **DATA-002** | **P1** | Non-transactional member creation & "PENDING" race. | Two-step write pattern. | Allocate `seq_member_number` sequence value and insert Member + Primary Activity + Line Items in single atomic `db.transaction()`. | DB-001 | `artifacts/api-server/src/routes/members.ts`, `lib/db/src/schema/members.ts` | `pnpm typecheck` |
| **5** | **DB-001** | **P1** | Zero foreign keys & constraints in schema. | Omitted `.references()` in Drizzle. | Create Drizzle migration `0002_*.sql` with `RESTRICT` for users/geography, `CASCADE` for child activities/line items, partial unique index for primary activity, CHECK constraints & preflight data checks. | None | `lib/db/src/schema/*.ts`, `lib/db/drizzle/` | `pnpm --filter @workspace/db run build` |
| **6** | **PRIV-001** | **P1** | Unauthenticated badge verification. | Missing `requireAppUser` middleware. | Require `requireAppUser` on badge verification route (`authorizeBadgeVerification`); redirect unauthenticated scanners to sign in before returning full member details. | None | `artifacts/api-server/src/routes/members.ts`, `artifacts/capef/src/App.tsx` | `pnpm typecheck` |
| **7** | **PRIV-002** | **P1** | Stored XSS in badge SVG. | Raw string interpolation in SVG. | Escape XML entities in string fields (`he.encode` / XML escape helper). | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **8** | **AUTH-002** | **P1** | Broken Clerk agent invitation. | Fake `pending_<ts>` Clerk ID used. | Integrate `@clerk/express` `createInvitation`; link `clerkUserId` dynamically on webhook/provision. | AUTH-001 | `artifacts/api-server/src/routes/users.ts`, `auth.ts` | `pnpm typecheck` |
| **9** | **MIG-001** | **P1** | Startup runs migrations on boot. | Uncoordinated calls in `index.ts`. | Move migration & seed scripts to standalone CLI scripts (`pnpm db:migrate`). | DB-001 | `artifacts/api-server/src/index.ts`, `lib/migration.ts` | `pnpm typecheck` |
| **10** | **MIG-002** | **P1** | Destructive `drizzle-kit push --force`. | `post-merge.sh` calls push. | Replace `pnpm --filter db push` with `pnpm --filter @workspace/db run migrate`. | DB-001 | `scripts/post-merge.sh` | `bash scripts/post-merge.sh` |
| **11** | **QUAL-001** | **P1** | Zero automated tests. | No test runner configured. | Install Vitest + Supertest; create unit & API integration test suites covering critical routes. | AUTHZ-001, DATA-001, DATA-002, DB-001 | `package.json`, `artifacts/api-server/src/__tests__/` | `pnpm test` |
| **12** | **API-001** | **P2** | Backend ignores generated Zod schemas. | Routes manually destructure `req.body`. | Add `validateBody` middleware using generated Zod schemas from `@workspace/api-zod`. | None | `artifacts/api-server/src/routes/*.ts` | `pnpm typecheck` |
| **13** | **API-003** | **P2** | Raw DB error disclosure. | Ad-hoc error catches. | Add central Express error middleware in `app.ts` masking internal database details. | API-001 | `artifacts/api-server/src/app.ts`, `routes/*.ts` | `pnpm typecheck` |
| **14** | **DATA-003** | **P2** | Empty string numeric serialization errors. | Uncoerced empty string inputs. | Add input normalization middleware coercing `""` to `null` for double/integer fields. | API-001 | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **15** | **SEC-001** | **P2** | Wildcard Vercel CORS. | Suffix regex matching in CORS. | Restrict CORS allowlist strictly to `FRONTEND_URL` and `FRONTEND_URLS` environment variables. | None | `artifacts/api-server/src/app.ts` | `pnpm typecheck` |
| **16** | **SEC-002** | **P2** | Spoofable in-memory rate limit. | Unconfigured trust proxy. | Configure `app.set("trust proxy", 1)` and back public rate limiting with Redis/DB pool. | None | `artifacts/api-server/src/app.ts`, `routes/members.ts` | `pnpm typecheck` |
| **17** | **STOR-001** | **P2** | Base64 bloat & ephemeral uploads. | Storage in JSONB and local disk. | Integrate Supabase Storage API; store immutable URLs in DB instead of base64 data URLs. | None | `artifacts/api-server/src/routes/uploads.ts` | `pnpm typecheck` |
| **18** | **PERF-001** | **P2** | N+1 queries & unbounded exports. | Iterative lookups in formatting. | Implement SQL `JOIN` prefetching for member details; stream Excel exports in cursor batches. | DB-001 | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **19** | **API-002** | **P2** | OpenAPI spec drift. | Unsynchronized manual edits. | Update `openapi.yaml` with `securitySchemes` and correct schemas; re-run Orval codegen. | None | `lib/api-spec/openapi.yaml` | `pnpm --filter @workspace/api-spec run codegen` |
| **20** | **UX-001** | **P3** | Misleading offline copy. | Static misleading toast copy. | Update offline UI banners to reflect real queue sync status. | DATA-001 | `artifacts/capef/src/components/members/ActivityWizard.tsx` | `pnpm --filter capef run build` |

---

## 21. DEPENDENCY GRAPH

```
[ AUTH-001: Bootstrap Admin ] ────────► [ AUTH-002: Clerk Invitation ]
                                                    │
[ DB-001: Relational Integrity ] ─────► [ MIG-001: Standalone Migrate ] ──► [ MIG-002: Safe Merge Script ]
  (FKs, RESTRICT/CASCADE,               │
   Partial Unique, CHECKs)              │
          │                             │
          ▼                             │
[ DATA-002: Transactional Enrollment ]  │
  (seq_member_number & Atomic Tx)       │
          │                             │
          ▼                             ▼
[ AUTHZ-001: Resource Auth Policy ] ──► [ QUAL-001: Test Suite ]
  (authorizeMemberResourceAccess)                   │
                                                    │
[ PRIV-001: Badge Verification Auth ] ──────────────┤
  (authorizeBadgeVerification)                      │
                                                    │
[ DATA-001: Production Offline Sync ] ──────────────┤
  (clientOperationId, Repository Pattern            │
   & Idempotency)                                   │
                                                    │
[ API-001: Generated Zod Validation ] ──────────────┼──► [ API-003: Error Masking ]
                                                    │
[ STOR-001: Supabase Cloud Storage ] ───────────────┘
```

---

## 22. EXECUTION PLAN FOR JULES/CLAUDE

### Task REM-DATA-001: Implement Production-Grade Offline Synchronization Protocol & Storage Repository
- **Objective**: Prevent offline data loss AND duplicate writes by implementing an `OfflineQueueRepository` storage abstraction layer (preparing for IndexedDB migration) with structured item records (`id`, `clientOperationId`, `operationType`, `payload`, `createdAt`, `retryCount`, `status`, `lastError`) and server-side idempotency tracking (`processed_operations` table).
- **Files to Modify**:
  - `artifacts/capef/src/lib/offline-sync.tsx`
  - Create `artifacts/capef/src/lib/offline-repository.ts`
  - `lib/db/src/schema/members.ts` (or `users.ts`)
  - `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Define `OfflineQueueItem` interface and `IOfflineQueueRepository` contract in `offline-repository.ts`.
  2. Implement `LocalStorageQueueRepository` conforming to `IOfflineQueueRepository` (preparing clean swap to `IndexedDBQueueRepository`).
  3. Add `processed_operations` table schema in `@workspace/db`: `clientOperationId` (UUID PK), `userId` (FK), `operationType`, `resultPayload`, `processedAt`.
  4. Update `offline-sync.tsx` to consume `OfflineQueueRepository` rather than direct raw `localStorage.setItem` calls.
  5. In `syncNow()`, iterate pending items sequentially, passing `clientOperationId` in payload.
  6. Remove items from repository ONLY upon confirmed server HTTP 200/201 response.
  7. On HTTP 400 terminal validation error, mark item `status: 'failed'` and record `lastError` to avoid infinite retry loops.
  8. In `artifacts/api-server/src/routes/members.ts`, check `processed_operations` by `clientOperationId`. If found, return cached `resultPayload` immediately (HTTP 200 OK). If new, execute mutation and record `clientOperationId` inside the SAME `db.transaction()`.
- **Acceptance Criteria**:
  - Offline action survives page reloads and browser restarts in structured repository storage.
  - Direct `localStorage` calls in components are encapsulated behind `OfflineQueueRepository`.
  - Reconnect sequentially replays queued operations.
  - Retrying an ambiguous request (same `clientOperationId`) creates NO duplicate database rows.
  - Network failures (HTTP 5xx) retain operations in queue for retry.
  - Terminal validation errors (HTTP 400) update item status to `'failed'` without infinite retries.
  - Queue items are purged ONLY after explicit server HTTP 200/201 confirmation.

### Task REM-AUTH-001: Remove Implicit First-User Admin Bootstrap
- **Objective**: Eliminate administrative privilege escalation on empty user tables.
- **Files to Modify**: `artifacts/api-server/src/routes/auth.ts`
- **Instructions**:
  1. In `POST /api/auth/provision`, remove `const isFirstUser = !count;`.
  2. Read `process.env.INITIAL_ADMIN_EMAIL`.
  3. Assign `role: "admin"` **only** if `email === process.env.INITIAL_ADMIN_EMAIL`; default all other provisioned users to `"agent"`.
- **Acceptance Criteria**: Registering a new Clerk account on an empty `users` table assigns `role: "agent"` unless the email matches `INITIAL_ADMIN_EMAIL`.

### Task REM-AUTHZ-001: Implement Centralized Member Resource Authorization Policy
- **Objective**: Block IDOR vulnerabilities on member CRUD, activities, line items, and status changes.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`, create `artifacts/api-server/src/middlewares/authorizeMemberResource.ts`
- **Instructions**:
  1. Create middleware `authorizeMemberResourceAccess(action: 'read' | 'write')`.
  2. Fetch member `createdById` and `regionId`.
  3. Allow access if `user.role === 'admin'`, OR if `user.role === 'supervisor'` and `member.regionId === user.regionId` (or in `assignedZones`), OR if `user.role === 'agent'` and `member.createdById === user.id`.
  4. Return HTTP 403 Forbidden if authorization fails. Attach to all member CRUD and nested `/members/:id/activities` routes.
- **Acceptance Criteria**: Agent A attempting to modify or add activities to a member created by Agent B receives HTTP 403 Forbidden.

### Task REM-DATA-002: Implement Transactional Enrollment & Sequence-Based Member Number Allocation
- **Objective**: Eliminate non-transactional `"PENDING"` updates and race conditions during member creation by introducing a PostgreSQL sequence (`seq_member_number`) and wrapping enrollment inside an atomic `db.transaction()`.
- **Files to Modify**:
  - `lib/db/src/schema/members.ts`
  - `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Add PostgreSQL sequence in `@workspace/db` schema:
     `export const seqMemberNumber = pgSequence("seq_member_number", { startWith: 1, increment: 1 });`
  2. In `POST /api/members`, wrap member creation, number formatting, primary activity seeding, and initial line items inside `db.transaction(async (tx) => { ... })`:
     ```typescript
     const newMember = await db.transaction(async (tx) => {
       // 1. Fetch next sequence value atomically from PostgreSQL
       const [{ seqVal }] = await tx.execute(sql`SELECT nextval('seq_member_number') as "seqVal"`);
       const memberNumber = `CAPEF-${prefix[category] ?? "MBR"}-${String(seqVal).padStart(6, "0")}`;

       // 2. Insert member with final, guaranteed unique memberNumber
       const [inserted] = await tx.insert(membersTable).values({
         ...memberValues,
         memberNumber,
       }).returning();

       // 3. Insert primary activity inside SAME transaction tx
       const [primaryActivity] = await tx.insert(memberActivitiesTable).values({
         memberId: inserted.id,
         activityType: category,
         isPrimary: true,
         ...
       }).returning();

       // 4. Insert initial line items if present inside tx
       if (initialLineItems?.length) {
         await tx.insert(activityLineItemsTable).values(
           initialLineItems.map(item => ({ ...item, activityId: primaryActivity.id }))
         );
       }

       return inserted;
     });
     ```
  3. Wrap error handling to return HTTP 400 Bad Request or HTTP 409 Conflict for business/unique conflicts without exposing raw SQL error stacks.
- **Acceptance Criteria**:
  - Member creation, sequence allocation, primary activity insertion, and initial line-item writes execute in ONE atomic transaction.
  - No `"PENDING"` placeholder strings are ever inserted into the database.
  - 10 concurrent member creation requests succeed cleanly, generating 10 unique sequential member numbers with 0 unique constraint crashes.
  - Failed transactions execute complete rollbacks leaving 0 orphan members or primary activities.

### Task REM-DB-001: Implement Business-Driven Relational Integrity & Migration Preflight Safety
- **Objective**: Add business-driven foreign key delete policies (`ON DELETE RESTRICT` for users/geography, `ON DELETE CASCADE` for child activities/line items), partial unique index for single primary activity, CHECK constraints, and preflight legacy data safety checks.
- **Files to Modify**:
  - `lib/db/src/schema/members.ts`
  - `lib/db/src/schema/users.ts`
  - Create preflight audit script `lib/db/src/preflight-check.ts`
  - Generate migration `lib/db/drizzle/0002_add_business_integrity_constraints.sql`
- **Instructions**:
  1. Create preflight script `lib/db/src/preflight-check.ts`:
     - Query and report orphan `member_activities` (referencing non-existent member IDs).
     - Query and report members with multiple primary activities (`is_primary = true`).
     - Query and report invalid status or category enum strings.
  2. In `lib/db/src/schema/members.ts`:
     - Attach `.references(() => usersTable.id, { onDelete: 'restrict' })` to `createdById` (deleting user MUST NOT delete members).
     - Attach `.references(() => regionsTable.id, { onDelete: 'restrict' })` to `regionId`.
     - Attach `.references(() => departmentsTable.id, { onDelete: 'restrict' })` to `departmentId`.
     - Attach `.references(() => arrondissementsTable.id, { onDelete: 'restrict' })` to `arrondissementId`.
     - Attach `.references(() => membersTable.id, { onDelete: 'cascade' })` to `memberActivitiesTable.memberId`.
     - Attach `.references(() => memberActivitiesTable.id, { onDelete: 'cascade' })` to `activityLineItemsTable.activityId`.
     - Add partial unique index for single primary activity:
       `extraConfig: (table) => [ uniqueIndex("idx_single_primary_activity").on(table.memberId).where(sql`is_primary = true`) ]`
     - Add CHECK constraints for non-negative numbers: `superficie_ha >= 0`, `production_quantity >= 0`, `production_fcfa >= 0`.
  3. Generate migration `0002_*.sql` via `pnpm --filter @workspace/db run generate`.
- **Acceptance Criteria**:
  - Preflight script identifies any legacy orphan or duplicate rows prior to migration.
  - Deleting a user account with assigned members is blocked (`ON DELETE RESTRICT`).
  - Deleting a member cascades to delete associated activities and line items (`ON DELETE CASCADE`).
  - Attempting to insert a second primary activity for a member fails with PostgreSQL unique constraint violation.
  - Negative values for surface area or production quantities are rejected by CHECK constraints.
  - `pnpm --filter @workspace/db run build` succeeds.

### Task REM-PRIV-001: Implement Badge Verification Authorization & Require Sign-In
- **Objective**: Ensure ANY authenticated CAPEF user/agent can scan/verify ANY member badge (returning full member verification profile), while rejecting unauthenticated scans with HTTP 401 / sign-in redirect.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`, `artifacts/capef/src/App.tsx`
- **Instructions**:
  1. Refactor `/api/members/badge/:badgeToken` route to attach `requireAppUser` middleware (`authorizeBadgeVerification`).
  2. Do NOT check creator ownership (`createdById`) or regional bounds for badge verification. Allow ANY valid authenticated CAPEF agent to verify ANY member badge.
  3. When an authenticated agent queries `/api/members/badge/:badgeToken`, execute `formatMember(member, true)` and return the full member verification profile.
  4. Reject unauthenticated badge queries with HTTP 401 Unauthorized.
  5. Update frontend `App.tsx` routing so `/badge-verify/:token` requires authentication; if an unauthenticated user scans the QR code, redirect them to sign in first. Once signed in, render the full `BadgeVerify` page.
- **Acceptance Criteria**:
  - Anonymous badge API request -> HTTP 401 Unauthorized.
  - Unauthenticated browser scanning QR code -> Redirects to sign-in page.
  - Authenticated agent scanning own member's badge -> HTTP 200 with full member profile.
  - Authenticated agent scanning another agent's member badge -> HTTP 200 with full member profile.
  - Authenticated supervisor scanning any badge -> HTTP 200 with full member profile.
  - Authenticated admin scanning any badge -> HTTP 200 with full member profile.
  - Invalid/non-existing badge token -> HTTP 404 Not Found.

### Task REM-PRIV-002: Escape XML Entities in SVG Badge Templates
- **Objective**: Neutralize stored XSS vectors in generated SVG badge markup.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Create an XML entity escaping utility function:
     ```typescript
     function escapeXml(str: string): string {
       return str.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
     }
     ```
  2. Wrap all interpolated member fields (`fullName`, `phone`, `village`, `category`) in `escapeXml()` before SVG string assembly.
- **Acceptance Criteria**: Injecting `<script>alert(1)</script>` into a member's name renders safe literal XML text without executing JavaScript.

### Task REM-AUTH-002: Repair Clerk Agent Invitation & Identity Lifecycle
- **Objective**: Fix the broken user onboarding workflow in `POST /api/users`. Replace the mock `clerkUserId: pending_<timestamp>` implementation with a real Clerk Invitation creation call using `@clerk/express` / Clerk SDK. Update `/api/auth/provision` so that when invited agents register and log in for the first time, their Clerk user ID is dynamically linked to their pre-created database user record without email collision errors.
- **Files to Modify**:
  - `artifacts/api-server/src/routes/users.ts`
  - `artifacts/api-server/src/routes/auth.ts`
- **Instructions**:
  1. Open `artifacts/api-server/src/routes/users.ts`.
  2. Import `clerkClient` from `@clerk/express`.
  3. In `POST /api/users`, issue a real Clerk invitation:
     ```typescript
     let invitationId: string | null = null;
     try {
       const invitation = await clerkClient.invitations.createInvitation({
         emailAddress: email,
         redirectUrl: `${process.env.FRONTEND_URL || ''}/sign-up`,
         publicMetadata: { role, regionId: regionId ?? null, assignedZones: assignedZones ?? [] },
       });
       invitationId = invitation.id;
     } catch (err) {
       logger.error({ err, email }, "Failed to create Clerk invitation");
     }
     ```
     Insert into `usersTable` with `clerkUserId: invitationId || pending_${Date.now()}`.
  4. Open `artifacts/api-server/src/routes/auth.ts`.
  5. In `POST /api/auth/provision`:
     - First search by `clerkUserId`.
     - If not found by `clerkUserId`, search by `email` (`where(eq(usersTable.email, email))`).
     - If found by `email` with a `pending_` or invitation ID in `clerkUserId`, update the existing record: set `clerkUserId = actualClerkUserId` and preserve pre-assigned `role`, `regionId`, and `assignedZones`.
- **Acceptance Criteria**:
  - Creating an agent via `POST /api/users` issues a real Clerk invitation email.
  - On first sign-in, `/api/auth/provision` matches pre-created user by email and updates `clerkUserId`.
  - Zero unique email constraint violations (`users_email_unique`) occur on first sign-in.

### Task REM-MIG-001: Decouple Migration Execution from Server Startup
- **Objective**: Prevent deployment race conditions and cold-start latency by removing asynchronous database migrations and seeding from Express server process boot in `artifacts/api-server/src/index.ts`.
- **Files to Modify**:
  - `artifacts/api-server/src/index.ts`
  - Create `lib/db/src/standalone-migrate.ts`
- **Instructions**:
  1. Remove calls to `seedDatabaseIfNeeded()` and `migrateExistingMembersToActivities()` from `artifacts/api-server/src/index.ts`.
  2. Ensure `index.ts` focuses strictly on starting the HTTP server: `app.listen(PORT, ...)`.
  3. Create a standalone CLI script `lib/db/src/standalone-migrate.ts` in `@workspace/db` containing versioned migration execution (`migrate(db, { migrationsFolder: '...' })`) and reference seeding.
  4. Add script to `package.json`: `"db:migrate": "node dist/standalone-migrate.js"`.
- **Acceptance Criteria**:
  - Launching `node dist/index.mjs` starts listening on `PORT` immediately without querying or mutating existing table structures.
  - Database migrations are triggered explicitly via `pnpm db:migrate` during release phase.

### Task REM-MIG-002: Replace Destructive Schema Push with Versioned Migrations
- **Objective**: Fix the deployment script `scripts/post-merge.sh`. Replace `pnpm --filter db push` (`drizzle-kit push --force`) with controlled, versioned migration execution (`pnpm --filter @workspace/db run migrate`).
- **Files to Modify**: `scripts/post-merge.sh`
- **Instructions**:
  1. Open `scripts/post-merge.sh`.
  2. Replace `pnpm --filter db push` with `pnpm --filter @workspace/db run migrate`.
- **Acceptance Criteria**:
  - `scripts/post-merge.sh` executes versioned migrations via `pnpm --filter @workspace/db run migrate`.
  - `drizzle-kit push --force` is no longer called in deployment scripts.

### Task REM-QUAL-001: Establish Automated Integration Test Suite
- **Objective**: Introduce an automated integration test suite using **Vitest** and **Supertest** enforcing the 9 CAPEF Production Quality Gates specified in Correction 06.
- **Files to Modify**:
  - Root `package.json`
  - `artifacts/api-server/package.json`
  - Create `artifacts/api-server/src/__tests__/auth.test.ts`
  - Create `artifacts/api-server/src/__tests__/members.test.ts`
  - Create `artifacts/api-server/src/__tests__/authorization.test.ts`
  - Create `artifacts/api-server/src/__tests__/offline.test.ts`
  - Create `artifacts/api-server/src/__tests__/enrollment-concurrency.test.ts`
  - Create `artifacts/api-server/src/__tests__/relational-integrity.test.ts`
- **Instructions**:
  1. Install testing dependencies in `artifacts/api-server`: `pnpm --filter @workspace/api-server add -D vitest supertest @types/supertest`.
  2. Add test script to `package.json`: `"test": "vitest run"`.
  3. Create test files covering auth, resource authorization, badge verification auth, offline sync & idempotency, enrollment concurrency, and relational integrity delete policies.
- **Acceptance Criteria**:
  - `pnpm test` executes Vitest and passes 100% of integration test cases.

### Task REM-API-001: Enforce Generated Zod Schemas on Express Body Parsing
- **Objective**: Bridge the gap between OpenAPI generated Zod schemas (`@workspace/api-zod`) and Express route handlers using a generic `validateBody(schema)` middleware.
- **Files to Modify**:
  - Create `artifacts/api-server/src/middlewares/validateBody.ts`
  - Modify `artifacts/api-server/src/routes/members.ts`
  - Modify `artifacts/api-server/src/routes/users.ts`
- **Instructions**:
  1. Implement `validateBody<T>(schema: z.ZodSchema<T>)` middleware.
  2. Attach `validateBody(CreateUserBody)` to `POST /api/users` and `validateBody(CreateMemberBody)` to `POST /api/members`.
- **Acceptance Criteria**:
  - Invalid request bodies return HTTP 400 Bad Request with formatted Zod error details.

### Task REM-API-003: Mask Internal Database Exception Details in Error Responses
- **Objective**: Implement a centralized Express error handling middleware that logs detailed diagnostics internally via Pino while returning standardized, safe `{ error, code }` responses to clients.
- **Files to Modify**:
  - Create `artifacts/api-server/src/middlewares/errorHandler.ts`
  - Modify `artifacts/api-server/src/app.ts`
- **Instructions**:
  1. Implement `errorHandler(err, req, res, next)` middleware masking internal SQL details.
  2. Mount `app.use(errorHandler)` as the LAST middleware in `app.ts`.
- **Acceptance Criteria**:
  - Raw PostgreSQL exception details (`constraint`, `table`, SQL queries) are never exposed in HTTP responses.

### Task REM-DATA-003: Coerce Empty Strings to Null for Double/Integer DB Columns
- **Objective**: Prevent PostgreSQL HTTP 500 type serialization crashes when frontend forms send empty strings (`""`) for numeric fields (`regionId`, `departmentId`, `gpsLat`, `gpsLng`).
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Implement `coerceNumeric(val)` helper mapping `""`, `undefined`, or `null` to `null`.
  2. Apply `coerceNumeric` to all numeric payload fields in member create/update endpoints.
- **Acceptance Criteria**:
  - Submitting `""` for numeric fields converts them to `null` before SQL insertion without 500 crashes.

### Task REM-SEC-001: Restrict CORS Allowlist to Strict Environment Variables
- **Objective**: Replace wildcard origin matching (`.endsWith(".vercel.app")`) in CORS middleware with strict origin checking based on `FRONTEND_URL` and `FRONTEND_URLS`.
- **Files to Modify**: `artifacts/api-server/src/app.ts`
- **Instructions**:
  1. Remove suffix regex matching from CORS configuration.
  2. Construct `allowedOrigins` Set strictly from `FRONTEND_URL`, `FRONTEND_URLS`, and explicit local dev ports (`http://localhost:3000`, `http://localhost:5173`).
- **Acceptance Criteria**:
  - Unauthorized origins are blocked from making credentialed cross-origin API calls.

### Task REM-SEC-002: Configure Express Trust Proxy & Persistent Rate Limiting
- **Objective**: Fix spoofable in-memory rate limiting on public endpoints by configuring `app.set("trust proxy", 1)` and backing public rate limiting with persistent DB or sliding-window stores.
- **Files to Modify**:
  - `artifacts/api-server/src/app.ts`
  - `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Add `app.set("trust proxy", 1)` in `app.ts`.
  2. Refactor rate limiter to evaluate true client IP.
- **Acceptance Criteria**:
  - `req.ip` reflects true client IP behind reverse proxies; header spoofing via `X-Forwarded-For` is neutralized.

### Task REM-STOR-001: Integrate Supabase Cloud Object Storage for Identity Documents & Photos
- **Objective**: Eliminate base64 JSONB bloat and local ephemeral disk writes by uploading photos, CNI documents, and signatures to Supabase Storage (`member-documents` bucket).
- **Files to Modify**:
  - `artifacts/api-server/src/routes/uploads.ts`
  - `artifacts/capef/src/pages/members/MemberForm.tsx`
- **Instructions**:
  1. Refactor `POST /api/uploads` to upload file buffers to Supabase Storage via `@supabase/supabase-js`.
  2. Return immutable cloud URLs and store cloud URL strings in PostgreSQL JSONB fields.
- **Acceptance Criteria**:
  - Member photos and documents stored as cloud URLs; JSONB column sizes remain small (<10KB).

### Task REM-PERF-001: Eliminate N+1 Query Loops & Stream Excel Exports
- **Objective**: Eliminate severe N+1 query patterns in `formatMember` using relational SQL `JOIN`s and refactor `GET /api/members/export` to stream Excel workbooks in cursor batches of 500.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`
- **Instructions**:
  1. Refactor `formatMember` to accept pre-joined SQL records.
  2. Implement cursor batching and pipe ExcelJS streaming workbook writer (`ExcelJS.stream.xlsx.WorkbookWriter`) directly to HTTP response stream.
- **Acceptance Criteria**:
  - Member list queries execute via single relational SQL `JOIN`s; export handles large datasets without memory spikes.

### Task REM-API-002: Synchronize OpenAPI Contract & Re-run Codegen
- **Objective**: Eliminate contract drift in `lib/api-spec/openapi.yaml`. Add missing `securitySchemes`, remove dead response schemas (`ExportResult`), align property definitions, and re-run Orval codegen.
- **Files to Modify**: `lib/api-spec/openapi.yaml`
- **Instructions**:
  1. Add `securitySchemes` (Bearer / JWT) to `openapi.yaml`.
  2. Run `pnpm --filter @workspace/api-spec run codegen`.
- **Acceptance Criteria**:
  - OpenAPI spec contains complete security schemes and accurate schemas; Orval codegen completes cleanly.

### Task REM-UX-001 / REP-001: Path Validation, Offline Banners & Dashboard Aggregations
- **Objective**: Validate integer path parameters (`/members/:id`) to return HTTP 400 on `NaN`, update toast notifications in `ActivityWizard.tsx`, and aggregate dashboard sector metrics over `member_activities`.
- **Files to Modify**:
  - `artifacts/api-server/src/routes/members.ts`
  - `artifacts/api-server/src/routes/dashboard.ts`
  - `artifacts/capef/src/components/members/ActivityWizard.tsx`
- **Instructions**:
  1. Validate `req.params.id` integer parsing.
  2. Update toast notification copy in `ActivityWizard.tsx`.
  3. Query activity counts by joining `memberActivitiesTable` in `dashboard.ts`.
- **Acceptance Criteria**:
  - Malformed path IDs return HTTP 400; dashboard statistics reflect multi-activity member distributions.

---

## 23. DEFINITION OF DONE (CORRECTION 06)

A remediation item or phase is **NOT** considered complete merely because TypeScript compiles or code looks visually correct. CAPEF production readiness is governed by strict, testable quality gates, code quality & implementation rules, and pre-remediation workspace verification commands.

### 23.1 General Implementation Rules for Jules / Claude Developer Agents

#### `INTERDIT` (STRICTLY FORBIDDEN):
1. **NO direct edits to generated files**: Editing anything inside `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/` is strictly prohibited. All contract changes MUST be made in `lib/api-spec/openapi.yaml` and regenerated using `pnpm --filter @workspace/api-spec run codegen`.
2. **NO manual type overrides or escape hatches**: Using `as any`, `@ts-ignore`, `@ts-expect-error`, or `any` type annotations to suppress TypeScript compiler errors is strictly forbidden.
3. **NO non-transactional member creation**: Never insert `memberNumber: "PENDING"` or execute multi-step member/activity/line-item creations outside a single `db.transaction()` block.
4. **NO unvalidated backend request bodies**: Routes MUST NOT raw-destructure `req.body` without passing through the generic `validateBody(schema)` Zod validation middleware.
5. **NO destructive migration commands**: Using `drizzle-kit push --force` or unversioned schema pushes in scripts or CI/CD pipelines is strictly prohibited.
6. **NO anonymous badge verification access**: Unauthenticated access to `/api/public/members/badge/:badgeToken` is forbidden. The route MUST enforce `requireAppUser`.
7. **NO leaking raw PostgreSQL exception details**: Internal database fields (`error.detail`, `error.constraint`, table names, raw SQL queries) MUST NOT be sent in HTTP error responses.
8. **NO silent queue clearing**: Offline operation queues MUST NEVER be purged without server acknowledgement or explicit terminal error classification.

#### `OBLIGATOIRE` (MANDATORY REQUIREMENTS):
1. **OpenAPI-driven contract updates**: Modify `openapi.yaml` first, then run `pnpm --filter @workspace/api-spec run codegen` for any API contract changes.
2. **Strict Zod request parsing**: Apply `validateBody(schema)` using generated Zod schemas on all POST, PUT, and PATCH endpoints.
3. **Centralized authorization policies**: Use `authorizeMemberResourceAccess` for resource-level authorization and `authorizeBadgeVerification` for badge scanning.
4. **Atomic write operations**: Wrap multi-entity writes in a single PostgreSQL `db.transaction()`.
5. **Durable offline operation protocol**: Assign immutable `clientOperationId` UUIDs and track processed operations in `processed_operations` for server-side idempotency.
6. **Private Object Storage for identity media**: Store CNI, photo, and signature documents in private Supabase Storage buckets, saving immutable cloud URLs in database columns.
7. **Versioned migrations & preflight data safety checks**: Write deterministic SQL migrations (`0002_*.sql`) and run `preflight-check.ts` prior to applying schema modifications.

### 23.2 Pre-Remediation & Workspace Verification Commands
Before submitting any task or phase, developer agents MUST execute and pass the following workspace verification pipeline:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Verify TypeScript types across all workspace packages
pnpm typecheck

# 3. Build database package
pnpm --filter @workspace/db run build

# 4. Regenerate API contracts from OpenAPI spec and verify codegen cleanliness
pnpm --filter @workspace/api-spec run codegen

# 5. Execute complete monorepo build
pnpm build

# 6. Verify git diff for forbidden patterns
git diff --check
rg 'as any|@ts-ignore|@ts-expect-error|pending_' --glob '!lib/api-client-react/src/generated/**' --glob '!lib/api-zod/src/generated/**'
```

### 23.3 Production Quality Gates

#### 1. SECURITY GATE
- **Authentication**:
  - Unauthenticated request to protected API endpoint -> HTTP 401 Unauthorized.
  - Authenticated Clerk identity correctly maps to an application user (`appUser`).
  - First user sign-up on empty `users` table assigns `role: "agent"` unless email matches `INITIAL_ADMIN_EMAIL`.
- **Member Resource Authorization (`authorizeMemberResourceAccess`)**:
  - Agent A attempting to read, update, or delete member resources owned by Agent B -> HTTP 403 Forbidden.
  - Supervisor attempting to modify member resources outside assigned region/zones -> HTTP 403 Forbidden.
  - Admin granted unrestricted read/write access across all members.
- **Badge Verification Authorization (`authorizeBadgeVerification`)**:
  - Anonymous QR code scan / API request -> HTTP 401 / redirect to sign-in screen (zero member data exposed).
  - Authenticated Agent A scanning Agent A's member badge -> HTTP 200 + full member verification profile.
  - Authenticated Agent A scanning Agent B's member badge -> HTTP 200 + full member verification profile.
  - Authenticated supervisor scanning any badge -> HTTP 200 + full member verification profile.
  - Authenticated admin scanning any badge -> HTTP 200 + full member verification profile.
  - Invalid/non-existing badge token -> HTTP 404 Not Found.

#### 2. DATA INTEGRITY GATE
- Member creation executed as ONE atomic transaction (`db.transaction()`):
  - Sequence member number allocation (`seq_member_number`) + base Member row + primary Activity row + initial Line Items commit or rollback together.
- Under **10 concurrent member creation requests**:
  - Exactly 10 successful valid members created.
  - Exactly 10 unique sequential member numbers assigned.
  - **0 `"PENDING"` member numbers.**
  - **0 orphan primary activities.**
  - **0 orphan line items.**
  - **0 duplicate member numbers.**

#### 3. OFFLINE DATA GATE
- `OfflineQueueRepository` abstraction layer encapsulates storage operations (preparing for IndexedDB provider migration).
- Structured item metadata schema (`id`, `clientOperationId`, `operationType`, `payload`, `createdAt`, `retryCount`, `status`, `lastError`) stored.
- Every offline operation is assigned an immutable `clientOperationId` UUID.
- Offline operations survive page reloads and browser restarts.
- Reconnecting sequentially replays queued operations.
- Operations are deleted from local storage ONLY after confirmed server HTTP 200/201 acknowledgement or terminal validation error response.
- Network failures (HTTP 5xx / timeout) retain operations in local storage for retry.
- Replaying the same `clientOperationId` multiple times returns cached result with HTTP 200 and creates NO duplicate database records.

#### 4. DATABASE GATE
- All foreign keys declared in Drizzle schema with explicit business delete policies:
  - `users` -> `members` (`ON DELETE RESTRICT` to preserve historical member records).
  - `regions`/`departments`/`arrondissements` -> `members` (`ON DELETE RESTRICT`).
  - `members` -> `member_activities` (`ON DELETE CASCADE`).
  - `member_activities` -> `activity_line_items` (`ON DELETE CASCADE`).
- PostgreSQL partial unique index enforced for single primary activity (`WHERE is_primary = true`).
- PostgreSQL CHECK constraints enforced for statuses, categories, and non-negative numbers.
- Preflight legacy data audit script (`preflight-check.ts`) executes and passes before running migration `0002_*.sql`.
- Destructive `drizzle-kit push --force` permanently removed from deployment scripts.

#### 5. API CONTRACT GATE
- Contract pipeline enforced: `OpenAPI -> Orval -> Zod -> Express validation middleware`.
- Request bodies, params, and queries parsed and validated by generated Zod schemas before reaching route logic.
- All API responses return documented status codes with stable `{ error, code }` payloads.
- Raw PostgreSQL exception details (`constraint`, `table`, SQL queries) are masked from clients.
- Generated code directories (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`) are NEVER manually modified.

#### 6. STORAGE GATE
- Member identity photos, CNI documents, and signatures uploaded to private Supabase Object Storage (`member-documents` bucket).
- Only immutable cloud URLs (`https://.../bucket/path.jpg`) stored in database columns (JSONB bloat eliminated).
- MIME types and magic bytes validated; max file size capped (5MB).
- Local ephemeral disk file writes (`/uploads`) eliminated.

#### 7. MIGRATION GATE
- Express process startup (`artifacts/api-server/src/index.ts`) decoupled from database migrations and reference seeding.
- Migrations executed via standalone CLI scripts (`pnpm db:migrate`) using `DIRECT_URL`.

#### 8. TEST GATE
- Minimum Vitest + Supertest integration regression suite passing 100%:
  - [ ] `Agent A -> Member B activity mutation -> 403`
  - [ ] `Agent A -> Member B line item mutation -> 403`
  - [ ] `Agent A -> Member B badge verification -> 200`
  - [ ] `Anonymous -> badge verification -> 401`
  - [ ] `Anonymous -> protected member endpoint -> 401`
  - [ ] `First user signup without bootstrap email -> role: agent (NOT admin)`
  - [ ] `10 concurrent enrollments -> 10 unique numbers, 0 PENDING, 0 orphans`
  - [ ] `Offline retry with same clientOperationId -> 0 duplicate DB records`
  - [ ] `Deleting user account with members -> 400/409 RESTRICT error`
  - [ ] `Deleting member -> CASCADE deletes activities & line items`

#### 9. DEPLOYMENT GATE
- Build & Verification pipeline executes cleanly without errors:
  - `pnpm install`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm --filter @workspace/api-spec run codegen`
- Environment variables audited for production targets (Render, Supabase, Clerk).
- CORS allowlist restricted to exact configured origin URLs.


## 24. FINAL DEVELOPMENT DECISION

### **🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**

**Engineering Justification**:
The CAPEF Digital Enrolment platform contains **3 P0 Blockers** (silent offline data loss & duplicate write risk, unauthenticated admin takeover, and universal IDOR authorization bypasses) and **8 P1 Critical Defects** (including unauthenticated badge access, SVG stored XSS, non-transactional writes & enrollment race conditions, total lack of database referential integrity & unconstrained schema, destructive force-push deployments, and zero automated tests). Continuing feature development on this foundation introduces compound risk, multiplies technical debt, and threatens the security of citizen identity data. Feature development must remain paused until the Master Remediation Plan (Phases 0 and 1) is executed and verified.
