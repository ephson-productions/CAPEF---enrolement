# CAPEF DIGITAL ENROLMENT
## CONSOLIDATED AUDIT & MASTER REMEDIATION PLAN

---

## 1. EXECUTIVE SUMMARY

The **CAPEF Digital Enrolment Platform** is a full-stack, mobile-first Progressive Web Application (PWA) designed to digitize enrollment, identification, and agricultural/artisanal activity tracking for members of the *Chambre d'Agriculture, de la Pêche, de l'Élevage et de la Forêt (CAPEF)* in Cameroon.

A thorough, cross-layer, evidence-based audit was performed on the `ephson-productions/CAPEF---enrolement` repository. This evaluation reconciled two prior independent security/engineering audits (DeepSeek and Codex) against direct inspection of the codebase, incorporating Correction 01 (Authorization Separation), Correction 03 (Production-Grade Offline Synchronization Protocol), and Correction 04 (Transactional Member Enrollment & Safe Member Number Generation).

### Key Finding & Verdict
While the codebase exhibits strong architectural intentions—utilizing a modern stack (Node.js/Express 5, Drizzle ORM, Supabase/PostgreSQL, OpenAPI 3.0, Orval codegen, React, TanStack Query, Clerk authentication, and Vite PWA)—**the platform in its current state is unready for production and insecure.**

Critical structural vulnerabilities and architectural gaps were confirmed:
1. **P0 Data Loss & Retry Risk**: The offline action queue (`capef_offline_actions_queue`) for field-collected activity and line-item operations is silently discarded on reconnection without server transmission (`offline-sync.tsx`), lacking client operation IDs (`clientOperationId`) and server-side idempotency tracking to prevent data loss or duplicate writes.
2. **P0 Privilege Escalation**: Fresh or truncated database states automatically grant `admin` privileges to the first user provisioned via Clerk (`auth.ts`).
3. **P0 IDOR & Missing Resource Authorization**: Nested member activity and line-item endpoints fail to verify creator ownership or regional assignment scopes (`members.ts`).
4. **P1 Unauthenticated Badge Access & Missing Auth Boundary**: The badge verification endpoint (`/api/public/members/badge/:badgeToken`) returns full member detail records without requiring authentication (`members.ts`).
5. **P1 SVG Stored XSS**: Badge SVG generation interpolates raw user strings into XML/SVG documents rendered directly in top-level browser contexts (`members.ts`, `MemberDetail.tsx`).
6. **P1 Non-Transactional Enrollment & Member Number Races**: Member creation uses an anti-pattern inserting `memberNumber: "PENDING"` then updating in a separate statement, risking concurrent unique constraint crashes, orphan rows, and partial writes.
7. **P1 Database Integrity Risk**: Zero foreign keys, zero non-PK indexes, zero unique constraints on activities exist in the Drizzle schema and PostgreSQL migrations (`schema/index.ts`).
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
   - *Offline Workflow*: Form Capture → LocalStorage Durable Queue → clientOperationId Generation → Network Reconnection → Idempotent Server Replay → Server Acknowledgement → Local Queue Purge.
   - *Badge Generation & Verification*: Member Fetch → SVG String Formatting → Base64 Object URL → Authenticated Token Verification Route (`requireAppUser`).
   - *Database Evolution*: Drizzle Schema → Migration Files → `drizzle.config.ts` → Deployment Scripts (`post-merge.sh`).
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
| **DATA-001** | F01 | CAP-07 | `artifacts/capef/src/lib/offline-sync.tsx:70-80` | **CONFIRMED** | **P0** | `syncNow()` resets `capef_offline_actions_queue` to `[]` without transmitting mutations, lacking `clientOperationId` and server-side idempotency tracking (`processed_operations`), risking silent data loss and duplicate writes. |
| **DATA-002** | F09 | CAP-05 | `artifacts/api-server/src/routes/members.ts:251-275` | **CONFIRMED** | **P1** | Member creation inserts `"PENDING"` then updates, causing concurrency unique crashes and orphan rows. Must use database-native sequence allocation (`seq_member_number`) inside a single atomic transaction. |
| **DATA-003** | F16 | CAP-04 | `artifacts/api-server/src/routes/members.ts:262-276, 497-507` | **CONFIRMED** | **P2** | Member create/update routes pass empty strings (`""`) to double/integer columns instead of coercing to `null`. |
| **DB-001** | F04 | CAP-05 | `lib/db/src/schema/index.ts`, `lib/db/drizzle/0000_brief_timeslip.sql` | **CONFIRMED** | **P1** | Zero foreign keys, zero non-PK indexes, and zero unique activity constraints exist across the PostgreSQL schema. |
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
  Furthermore, the queued operations lack client operation IDs (`clientOperationId`) and the backend lacks idempotency tracking (`processed_operations` table), meaning simple retries after network timeouts would create duplicate activities or line items.
- **Root Cause**: Unfinished offline synchronization implementation lacking durable queue semantics, client operation identifiers, error classification, and server-side idempotency tracking.
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

### DB-001: Complete Absence of Foreign Keys, Non-PK Indexes & Constraints
- **Severity**: P1
- **Domain**: Database Schema & Integrity
- **Status**: CONFIRMED
- **File**: `lib/db/src/schema/index.ts`, `lib/db/drizzle/0000_brief_timeslip.sql`
- **Description**: Across all 7 database tables (`users`, `members`, `member_activities`, `activity_line_items`, `regions`, `departments`, `arrondissements`), there are **zero foreign key constraints**, **zero non-primary-key indexes**, and **zero unique constraints** on activities.
- **Root Cause**: Foreign keys were defined only as code comments (`// references membersTable.id`) rather than Drizzle `.references()` constraints.
- **Impact**: Database referential integrity is completely unenforced at the engine level, allowing orphan records, invalid IDs, duplicate primary activities, and linear table scans.

### DB-002: Orphan Activity & Line-Item Generation on Member Deletion
- **Severity**: P2
- **Domain**: Referential Integrity
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 511-527)
- **Description**: `DELETE /api/members/:id` executes `db.delete(membersTable).where(eq(membersTable.id, id))`.
- **Root Cause**: Absence of database-level `ON DELETE CASCADE` foreign keys and missing application-level cascade logic.
- **Impact**: Deleting a member leaves orphaned child records in `member_activities` and `activity_line_items`.

### MIG-001: Uncoordinated Startup Data Migrations & Reference Seeding
- **Severity**: P1
- **Domain**: Deployment & Process Lifecycle
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/index.ts` (lines 8-15), `lib/migration.ts`, `lib/seed.ts`
- **Description**: On server startup, `index.ts` asynchronously invokes `seedDatabaseIfNeeded()` and `migrateExistingMembersToActivities()`.
- **Root Cause**: Coupling database migrations to application process startup.
- **Impact**: Multi-instance deployments (e.g., Render autoscaling, Vercel serverless cold starts) trigger concurrent full-table scans and non-transactional migrations, causing race conditions, duplicate activities, and server boot delays.

### MIG-002: Destructive Merge-Time Schema Execution
- **Severity**: P1
- **Domain**: DevOps & Migration Safety
- **Status**: CONFIRMED
- **File**: `scripts/post-merge.sh` (line 4)
- **Description**: CI/CD deployment script executes `pnpm --filter db push` (which runs `drizzle-kit push --force`).
- **Root Cause**: Replacing versioned migrations (`drizzle-kit migrate`) with force-push schema synchronization.
- **Impact**: Unreviewed database schema changes are forcibly applied to production, risking silent column dropping and catastrophic data loss.

### API-001: Backend Bypasses OpenAPI / Generated Zod Validation
- **Severity**: P2
- **Domain**: API Contract & Input Validation
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/*.ts` (except `health.ts`)
- **Description**: Generated Zod schemas in `@workspace/api-zod` are completely unused by Express route handlers (only `health.ts` imports them).
- **Root Cause**: Express routes manually destructure raw `req.body` without schema parsing middleware.
- **Impact**: Contract drift, invalid enums, missing required fields, and unexpected data shapes reach SQL queries unvalidated.

### API-002: OpenAPI Specification Drift & Dead Schemas
- **Severity**: P2
- **Domain**: API Contract
- **Status**: CONFIRMED
- **File**: `lib/api-spec/openapi.yaml`
- **Description**: The OpenAPI specification lacks a `securitySchemes` definition, contains dead response schemas (`ExportResult`), and advertises fields on `GetMeResponse` that `/api/auth/me` does not return.
- **Root Cause**: Unsynchronized manual spec editing.
- **Impact**: Generated client types promise properties that do not exist at runtime, leading to frontend TypeScript misalignments.

### API-003: Inconsistent Error Formats & Information Disclosure
- **Severity**: P2
- **Domain**: Error Handling & Diagnostics
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts`, `reference.ts`
- **Description**: Exception handlers return raw PostgreSQL error objects (`{ message, detail, constraint, table }`) or stringified errors (`{ details: String(error) }`). No central error middleware exists in `app.ts`.
- **Root Cause**: Ad-hoc route-level `try/catch` blocks.
- **Impact**: Database schema details, table names, and internal constraint names are exposed to clients.

### API-004: HTTP 500 Unhandled Exceptions on Malformed Path Parameters
- **Severity**: P3
- **Domain**: Request Handling
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (line 456)
- **Description**: Requesting `/api/members/abc` executes `parseInt("abc", 10)` resulting in `NaN`, which is passed directly to SQL queries, causing unhandled 500 errors.
- **Root Cause**: Missing path parameter integer validation middleware.
- **Impact**: Unnecessary server exception logging and poor API quality.

### STOR-001: Bloated Base64 Storage & Ephemeral Local Disk Writes
- **Severity**: P2
- **Domain**: Asset Storage Architecture
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/uploads.ts`, `MemberForm.tsx`
- **Description**: Member photos, CNI documents, and signatures are converted to multi-hundred-KB base64 data-URLs and stored directly inside JSONB columns (`physique_data`, `morale_data`). Concurrently, `/api/uploads` writes files to a local `uploads/` disk directory that is never read and is wiped on container restarts.
- **Root Cause**: Lack of cloud object storage integration (e.g., Supabase Storage / S3).
- **Impact**: Massive database bloat, slow query serialization, and ephemeral disk space leakage.

### SEC-001: Overly Permissive Wildcard CORS Configuration
- **Severity**: P2
- **Domain**: Web Security
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/app.ts` (lines 31-63)
- **Description**: CORS middleware approves origins matching `.endsWith(".vercel.app")` and `.endsWith("-ephson-productions-projects.vercel.app")` with `credentials: true`.
- **Root Cause**: Permissive origin regex evaluation intended for preview deployments.
- **Impact**: Any site hosted on Vercel can issue credentialed cross-origin requests to the API server if user session cookies are present.

### SEC-002: In-Memory & Spoofable Public Verification Rate Limiter
- **Severity**: P2
- **Domain**: Rate Limiting & Protection
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 1346-1373)
- **Description**: The public rate limiter uses an in-memory `Map`, evaluates `req.ip` without Express `trust proxy` configuration, and resets on process restart.
- **Root Cause**: Naive in-memory rate limiting implementation.
- **Impact**: Attackers can bypass rate limits via `X-Forwarded-For` header spoofing or distributed requests across serverless/multi-instance deployments.

### PERF-001: Severe N+1 Query Patterns & Unbounded Export Performance
- **Severity**: P2
- **Domain**: Query Efficiency & Scalability
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts`, `dashboard.ts`
- **Description**: `formatMember` executes 5+ sequential database queries per member (region, department, arrondissement, creator, activities, line items). The Excel/CSV export endpoint iterates through all members in memory without pagination or stream batching.
- **Root Cause**: Iterative row formatting instead of SQL relational `JOIN` queries or batched prefetching.
- **Impact**: High database connection pool starvation, severe latency, and HTTP request timeouts when member records scale beyond a few hundred rows.

### QUAL-001: Complete Absence of Automated Test Suite
- **Severity**: P1
- **Domain**: Quality Assurance
- **Status**: CONFIRMED
- **File**: `package.json` (all workspace packages)
- **Description**: No unit tests, integration tests, contract tests, or Playwright E2E tests exist anywhere in the repository.
- **Root Cause**: Testing framework was never initialized.
- **Impact**: Regressions continuously reach production undetected.

### UX-001: Misleading Offline Synchronization UX
- **Severity**: P3
- **Domain**: User Experience
- **Status**: CONFIRMED
- **File**: `artifacts/capef/src/components/members/ActivityWizard.tsx`, `offline-sync.tsx`
- **Description**: UI banners state "Les activités seront automatiquement synchronisées", but offline activity mutations are silently discarded on reconnect.
- **Root Cause**: Frontend notification copy out of sync with offline engine state.
- **Impact**: Field operators falsely believe offline data has been safely preserved.

### REP-001: Inaccurate Category Aggregation in Dashboard Metrics
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

1. **DATA-001**: Production-grade offline sync protocol with `clientOperationId` and server idempotency (`offline-sync.tsx`, `processed_operations`).
2. **AUTH-001**: Unauthenticated admin takeover on empty user table during bootstrap (`auth.ts`).
3. **AUTHZ-001**: Broken member resource authorization / IDOR across nested activity and line-item routes (`members.ts`).

---

## 6. P1 CRITICAL STABILIZATION

1. **DATA-002**: Atomic member enrollment transaction (`db.transaction`) with database-native sequence allocation (`seq_member_number`), completely eliminating `"PENDING"` updates (`members.ts`).
2. **AUTH-002**: Broken Clerk agent invitation lifecycle and email collision (`users.ts`).
3. **PRIV-001**: Require `requireAppUser` authentication for badge verification routes so only logged-in CAPEF agents can inspect full member details (`members.ts`, `App.tsx`).
4. **PRIV-002**: Stored XSS vulnerability in generated SVG member badge templates (`members.ts`).
5. **DB-001**: Total lack of foreign keys, cascades, non-PK indexes, and unique constraints in schema (`schema/index.ts`).
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

*(Unchanged)*

---

## 10. AUTHENTICATION & AUTHORIZATION ASSESSMENT

*(Unchanged)*

---

## 11. DATABASE & DATA INTEGRITY ASSESSMENT (CORRECTION 04)

### Transactional Enrollment & Safe Member Numbering Architecture

To resolve `DATA-002` permanently, member creation MUST NOT insert a placeholder string (`"PENDING"`) followed by a separate SQL update. Instead, enrollment is structured as ONE atomic database transaction backed by a PostgreSQL sequence.

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
[ Fetch Next Sequence Value ] ──► SELECT nextval('seq_member_number');
         │                        (e.g., 42)
         ▼
[ Format Member Number ]      ──► CAPEF-AGR-000042
         │                        (Preserves CAPEF business format)
         ▼
[ tx.insert(membersTable) ]   ──► Insert Member Row with Final member_number
         │                        (No "PENDING" placeholder, unique constraint enforced)
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
                (0 orphan members, 0 orphan activities, HTTP 400/409 error)
```

### Guarantees & Rollback Semantics
1. **Database-Native Concurrency Safety**: PostgreSQL sequence allocation (`nextval('seq_member_number')`) is atomic and thread-safe. Concurrent enrollment requests receive distinct sequence values without relying on application-level "check-then-insert" logic.
2. **Strict Single Transaction Boundary**: The enrollment transaction encompasses:
   - Base Member record creation (with final `memberNumber`).
   - Primary `member_activities` record creation (`isPrimary: true`).
   - Any initial `activity_line_items` provided during enrollment.
3. **Rollback Integrity**: If primary activity or line-item creation fails, PostgreSQL rolls back the ENTIRE transaction. No partially created members or `"PENDING"` records can ever persist.
4. **Error Masking**: Database constraint conflicts (e.g. duplicate member number or CNI collision) are caught and formatted as HTTP 400 Bad Request or HTTP 409 Conflict without leaking raw SQL details.

---

## 12. API / OPENAPI / ZOD ASSESSMENT

*(Unchanged)*

---

## 13. OFFLINE ARCHITECTURE ASSESSMENT

*(Unchanged)*

---

## 14. UPLOAD / STORAGE ASSESSMENT

*(Unchanged)*

---

## 15. FRONTEND ASSESSMENT

*(Unchanged)*

---

## 16. PRODUCTION / DEPLOYMENT ASSESSMENT

*(Unchanged)*

---

## 17. PERFORMANCE ASSESSMENT

*(Unchanged)*

---

## 18. TESTING & CI ASSESSMENT

### Required Minimum Test Coverage Matrix

| Test Suite | Framework | Target Files | Key Scenarios Covered |
| :--- | :--- | :--- | :--- |
| **Auth Integration** | Vitest / Supertest | `routes/auth.ts`, `routes/users.ts` | Bootstrap admin escalation prevention, Clerk invitation link, role preservation. |
| **Member Resource Authorization**| Vitest / Supertest | `routes/members.ts` | Cross-agent member modification blocked (HTTP 403), supervisor region scope isolation. |
| **Badge Verification Auth** | Vitest / Supertest | `routes/members.ts`, `App.tsx` | Rejection of unauthenticated badge requests (HTTP 401); successful full profile verification for ANY authenticated agent (HTTP 200). |
| **Offline Sync & Idempotency**| Vitest / Supertest | `offline-sync.tsx`, `routes/members.ts` | Action survives reload; retry on network failure retains queue; replaying same `clientOperationId` creates NO duplicate records; HTTP 500 retains queue; terminal HTTP 400 stops retry loop; queue clears ONLY on acknowledgement. |
| **Concurrent Member Enrollment**| Vitest / Supertest | `routes/members.ts` | **10 concurrent member creation requests** -> 10 successful valid members, 10 unique `memberNumber`s, 0 `"PENDING"` members, 0 orphan primary activities, 0 partial enrollments. Failed transaction produces HTTP 400/409 without raw SQL leaks. |

---

## 19. CROSS-LAYER ROOT CAUSES

*(Unchanged)*

---

## 20. MASTER REMEDIATION PLAN

The following ordered plan details the exact remediation sequence required to achieve full platform stabilization.

| Order | Canonical ID | Severity | Problem | Root Cause | Architectural Fix | Dependencies | Affected Files | Verification Command |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **DATA-001** | **P0** | Silent offline queue data loss & duplicate write risk. | Queue cleared without transmission; no idempotency. | Attach immutable `clientOperationId`; track server `processed_operations`; purge local items only on HTTP 200/201. | None | `artifacts/capef/src/lib/offline-sync.tsx`, `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **2** | **AUTH-001** | **P0** | First user becomes admin automatically. | `!count` check in JIT provision. | Seed initial admin via CLI or ENV bootstrap (`INITIAL_ADMIN_EMAIL`); reject implicit escalation. | None | `artifacts/api-server/src/routes/auth.ts` | `pnpm typecheck` |
| **3** | **AUTHZ-001** | **P0** | IDOR on nested activities/line items. | Missing resource ownership check. | Create `authorizeMemberResourceAccess` middleware checking `createdById` / `regionId`. | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **4** | **DATA-002** | **P1** | Non-transactional member creation & "PENDING" race. | Two-step write pattern. | Allocate `seq_member_number` sequence value and insert Member + Primary Activity + Line Items in single atomic `db.transaction()`. | DB-001 | `artifacts/api-server/src/routes/members.ts`, `lib/db/src/schema/members.ts` | `pnpm typecheck` |
| **5** | **PRIV-001** | **P1** | Unauthenticated badge verification. | Missing `requireAppUser` middleware. | Require `requireAppUser` on badge verification route (`authorizeBadgeVerification`); redirect unauthenticated scanners to sign in before returning full member details. | None | `artifacts/api-server/src/routes/members.ts`, `artifacts/capef/src/App.tsx` | `pnpm typecheck` |
| **6** | **PRIV-002** | **P1** | Stored XSS in badge SVG. | Raw string interpolation in SVG. | Escape XML entities in string fields (`he.encode` / XML escape helper). | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **7** | **AUTH-002** | **P1** | Broken Clerk agent invitation. | Fake `pending_<ts>` Clerk ID used. | Integrate `@clerk/express` `createInvitation`; link `clerkUserId` dynamically on webhook/provision. | AUTH-001 | `artifacts/api-server/src/routes/users.ts`, `auth.ts` | `pnpm typecheck` |
| **8** | **DB-001** | **P1** | Zero foreign keys & indexes in schema. | Omitted `.references()` in Drizzle. | Create Drizzle migration `0002_add_foreign_keys_and_indexes.sql` with FKs, cascades & indexes. | None | `lib/db/src/schema/*.ts`, `lib/db/drizzle/` | `pnpm --filter @workspace/db run build` |
| **9** | **MIG-001** | **P1** | Startup runs migrations on boot. | Uncoordinated calls in `index.ts`. | Move migration & seed scripts to standalone CLI scripts (`pnpm db:migrate`). | DB-001 | `artifacts/api-server/src/index.ts`, `lib/migration.ts` | `pnpm typecheck` |
| **10** | **MIG-002** | **P1** | Destructive `drizzle-kit push --force`. | `post-merge.sh` calls push. | Replace `pnpm --filter db push` with `pnpm --filter @workspace/db run migrate`. | DB-001 | `scripts/post-merge.sh` | `bash scripts/post-merge.sh` |
| **11** | **QUAL-001** | **P1** | Zero automated tests. | No test runner configured. | Install Vitest + Supertest; create unit & API integration test suites covering critical routes. | AUTHZ-001, DATA-001, DATA-002 | `package.json`, `artifacts/api-server/src/__tests__/` | `pnpm test` |
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
[ DB-001: FKs & Indexes ] ────────────► [ MIG-001: Standalone Migrate ] ──► [ MIG-002: Safe Merge Script ]
          │                                         │
          ▼                                         │
[ DATA-002: Transactional Enrollment ]              │
  (seq_member_number & Atomic Tx)                   │
          │                                         │
          ▼                                         ▼
[ AUTHZ-001: Resource Auth Policy ] ──► [ QUAL-001: Test Suite ]
  (authorizeMemberResourceAccess)                   │
                                                    │
[ PRIV-001: Badge Verification Auth ] ──────────────┤
  (authorizeBadgeVerification)                      │
                                                    │
[ DATA-001: Production Offline Sync ] ──────────────┤
  (clientOperationId & Idempotency)                 │
                                                    │
[ API-001: Generated Zod Validation ] ──────────────┼──► [ API-003: Error Masking ]
                                                    │
[ STOR-001: Supabase Cloud Storage ] ───────────────┘
```

---

## 22. EXECUTION PLAN FOR JULES/CLAUDE

### Task REM-DATA-001: Implement Production-Grade Offline Synchronization Protocol
*(Unchanged)*

### Task REM-AUTH-001: Remove Implicit First-User Admin Bootstrap
*(Unchanged)*

### Task REM-AUTHZ-001: Implement Centralized Member Resource Authorization Policy
*(Unchanged)*

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

       // 4. Insert any initial line items if present inside tx
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

### Task REM-PRIV-001: Implement Badge Verification Authorization & Require Sign-In
*(Unchanged)*

### Task REM-PRIV-002: Escape XML Entities in SVG Badge Templates
*(Unchanged)*

### Task REM-DB-001: Add Foreign Keys, Cascades & Performance Indexes
*(Unchanged)*

### Task REM-MIG-001: Decouple Migration Execution from Server Startup
*(Unchanged)*

---

## 23. DEFINITION OF DONE

Feature development on CAPEF Digital Enrolment may resume **ONLY** when all of the following conditions are met and confirmed:

1. **P0 Containment Verified**:
   - [ ] Offline action queue in `offline-sync.tsx` attaches `clientOperationId` UUIDs, replays sequentially, and purges local storage ONLY upon server HTTP 200/201 acknowledgement.
   - [ ] Server tracks `processed_operations` to guarantee that duplicate retries with the same `clientOperationId` do NOT create duplicate database records.
   - [ ] Unauthenticated admin bootstrap in `auth.ts` is replaced with explicit environment-seeded admin evaluation.
   - [ ] All member resource CRUD and nested activity routes enforce resource-level authorization checks (`authorizeMemberResourceAccess`, returning HTTP 403 on scope mismatch).
2. **Data & Privacy Hardened**:
   - [ ] Member enrollment executes inside an atomic `db.transaction()`, allocating sequence numbers (`seq_member_number`) atomically with zero `"PENDING"` placeholders or concurrent unique constraint crashes.
   - [ ] Badge verification routes enforce `requireAppUser` authentication (`authorizeBadgeVerification`), allowing ANY authenticated CAPEF agent to verify ANY valid member badge (HTTP 200 with full profile), while blocking unauthenticated access (HTTP 401 / sign-in redirect).
   - [ ] SVG badge generator escapes all user input strings, neutralizing stored XSS vectors.
3. **Database Integrity Locked**:
   - [ ] Drizzle schema defines explicit foreign keys, cascades, non-PK indexes, and unique constraints.
   - [ ] Destructive `drizzle-kit push --force` is permanently removed from deployment scripts.
   - [ ] Database migrations are decoupled from application startup.
4. **Test & Pipeline Validation**:
   - [ ] An automated integration test suite exists and passes 100% of auth, member resource authorization, badge verification, offline sync & idempotency, and concurrent member enrollment test cases.
   - [ ] `pnpm typecheck` and `pnpm build` execute cleanly across all workspace packages without TypeScript errors.

---

## 24. FINAL DEVELOPMENT DECISION

### **🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**

**Engineering Justification**:
The CAPEF Digital Enrolment platform contains **3 P0 Blockers** (silent offline data loss & duplicate write risk, unauthenticated admin takeover, and universal IDOR authorization bypasses) and **8 P1 Critical Defects** (including unauthenticated badge access, SVG stored XSS, non-transactional writes & enrollment race conditions, total lack of database referential integrity, destructive force-push deployments, and zero automated tests). Continuing feature development on this foundation introduces compound risk, multiplies technical debt, and threatens the security of citizen identity data. Feature development must remain paused until the Master Remediation Plan (Phases 0 and 1) is executed and verified.
