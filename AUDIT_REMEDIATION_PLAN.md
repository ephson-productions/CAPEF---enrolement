# CAPEF DIGITAL ENROLMENT
## CONSOLIDATED AUDIT & MASTER REMEDIATION PLAN

---

## 1. EXECUTIVE SUMMARY

The **CAPEF Digital Enrolment Platform** is a full-stack, mobile-first Progressive Web Application (PWA) designed to digitize enrollment, identification, and agricultural/artisanal activity tracking for members of the *Chambre d'Agriculture, de la Pêche, de l'Élevage et de la Forêt (CAPEF)* in Cameroon.

A thorough, cross-layer, evidence-based audit was performed on the `ephson-productions/CAPEF---enrolement` repository. This evaluation reconciled two prior independent security/engineering audits (DeepSeek and Codex) against direct inspection of the codebase.

### Key Finding & Verdict
While the codebase exhibits strong architectural intentions—utilizing a modern stack (Node.js/Express 5, Drizzle ORM, Supabase/PostgreSQL, OpenAPI 3.0, Orval codegen, React, TanStack Query, Clerk authentication, and Vite PWA)—**the platform in its current state is unready for production and insecure.**

Critical structural vulnerabilities and architectural gaps were confirmed:
1. **P0 Data Loss**: The offline action queue (`capef_offline_actions_queue`) for field-collected activity and line-item operations is silently discarded on reconnection without server transmission (`offline-sync.tsx`).
2. **P0 Privilege Escalation**: Fresh or truncated database states automatically grant `admin` privileges to the first user provisioned via Clerk (`auth.ts`).
3. **P0/P1 IDOR & Broken Authorization**: Nested resource endpoints (`/members/:id/activities`, line items, badges) fail to verify member ownership or regional assignment scopes (`members.ts`).
4. **P1 Unauthenticated Badge Access & Missing Auth Boundary**: The badge verification endpoint (`/api/public/members/badge/:badgeToken`) returns full member detail records without requiring authentication (`members.ts`).
5. **P1 SVG Stored XSS**: Badge SVG generation interpolates raw user strings into XML/SVG documents rendered directly in top-level browser contexts (`members.ts`, `MemberDetail.tsx`).
6. **P1 Database Integrity Risk**: Zero foreign keys, zero non-PK indexes, zero unique constraints on activities, and non-transactional member creation exist in the Drizzle schema and PostgreSQL migrations (`schema/index.ts`).
7. **P1 Migration & Startup Hazards**: Destructive `drizzle-kit push --force` is executed on git merges (`scripts/post-merge.sh`), while application startup triggers uncoordinated, non-transactional database migrations and reference seeding on every boot (`index.ts`, `lib/migration.ts`).
8. **P1 Zero Automated Tests**: No automated unit, integration, or E2E tests exist in the repository (`package.json`).

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
   - *Member Enrollment*: Frontend Form → Zod Schema → API Endpoint → Non-transactional Member Insertion → Number Generation → Activity Seeding.
   - *Offline Workflow*: Form Capture → LocalStorage Queue → Reconnection Event → `syncNow()` Replay Loop → Action Clearing.
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
| **AUTHZ-001** | F07 | CAP-01 | `artifacts/api-server/src/routes/members.ts:530-868, 982+` | **CONFIRMED** | **P0** | Nested member activity, line-item, and badge routes enforce `requireAppUser` but omit member ownership/regional checks. |
| **PRIV-001** | F05 | CAP-02 | `artifacts/api-server/src/routes/members.ts:1375-1396` | **CONFIRMED** | **P1** | Badge verification endpoint returns full member record to unauthenticated callers instead of enforcing `requireAppUser` authentication. |
| **PRIV-002** | F06 | — | `artifacts/api-server/src/routes/members.ts:982-1050`, `MemberDetail.tsx:100-126` | **CONFIRMED** | **P1** | Badge SVG string templates interpolate raw user fields; frontend opens `blob:` object URL in top-level browser context. |
| **DATA-001** | F01 | CAP-07 | `artifacts/capef/src/lib/offline-sync.tsx:70-80` | **CONFIRMED** | **P0** | `syncNow()` resets `capef_offline_actions_queue` to `[]` without transmitting queued activity/line-item mutations to server. |
| **DATA-002** | F09 | CAP-05 | `artifacts/api-server/src/routes/members.ts:251-275` | **CONFIRMED** | **P1** | `POST /members` inserts `memberNumber: "PENDING"` then updates; concurrent creates trigger unique constraint 500 crashes. |
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
| **SEC-002** | F19 | — | `artifacts/api-server/src/routes/members.ts:1346-1373` | **CONFIRMED** | **P2** | Public badge rate limiter is stored in-memory, lacks trust-proxy configuration, and is easily spoofed via `X-Forwarded-For`. |
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

### AUTHZ-001: IDOR & Missing Resource Authorization on Nested Routes
- **Severity**: P0
- **Domain**: Authorization
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 530-868, 982+)
- **Description**: Nested routes such as `POST/GET/DELETE /api/members/:id/activities`, line-item routes, and badge routes attach `requireAppUser` but fail to execute scope or ownership checks.
- **Root Cause**: Absence of a centralized resource-authorization middleware. While member detail/update routes check `createdById` or `regionId`, nested activity and badge routes skip member authorization entirely.
- **Impact**: Any authenticated low-privilege field agent can view, create, edit, or delete activities, line items, and badges for members owned by other agents or regions.

### PRIV-001: Unauthenticated Access to Badge Verification & Missing Auth Boundary
- **Severity**: P1
- **Domain**: Authentication & Badge Verification
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 1375-1396), `artifacts/capef/src/App.tsx`
- **Description**: The badge verification endpoint `GET /api/public/members/badge/:badgeToken` is mounted without authentication middleware (`requireAppUser`). Consequently, unauthenticated callers directly requesting this endpoint receive full member profiles. Business requirements dictate that verifying member details via QR scanning must be restricted to authenticated CAPEF agents (who need full member details to perform field checks).
- **Root Cause**: Missing `requireAppUser` middleware on the backend badge verification route, and lack of authentication enforcement on the frontend `/badge-verify/:token` route.
- **Impact**: Unauthenticated users scanning QR codes can access detailed member records if queried directly. Requiring authentication ensures only authorized CAPEF agents can inspect member identity profiles.

### PRIV-002: Stored XSS Vector in Generated Badge SVG
- **Severity**: P1
- **Domain**: Security & Rendering
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 982-1050), `MemberDetail.tsx` (lines 100-126)
- **Description**: `POST /api/members/:id/badge` constructs an SVG string by directly interpolating unescaped member attributes (`${member.fullName}`, `${member.phone}`, `${member.village}`). On the frontend, `MemberDetail.tsx` converts the base64 SVG into a Blob URL and opens it via `window.open(objectUrl, "_blank")`.
- **Root Cause**: Lack of XML entity escaping during SVG string assembly and top-level document rendering.
- **Impact**: If a member's name or village contains XML markup (e.g., `<script>` or `<svg onload=...>`), the browser executes the payload in the application's origin context.

### DATA-001: Silent Offline Action Queue Data Loss
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
- **Root Cause**: Unfinished offline synchronization implementation.
- **Impact**: Field agents collecting crop/livestock activities and line items while offline experience permanent, silent data loss upon reconnecting.

### DATA-002: Concurrent Enrollment Race Condition & Invalid State
- **Severity**: P1
- **Domain**: Transaction Management
- **Status**: CONFIRMED
- **File**: `artifacts/api-server/src/routes/members.ts` (lines 251-275)
- **Description**: Member creation inserts a record with `memberNumber: "PENDING"`, then computes `CAPEF-{PREFIX}-{id}` and updates the record in a separate SQL statement.
- **Root Cause**: Non-transactional two-step write.
- **Impact**: Concurrent member enrollments crash with a PostgreSQL 500 unique constraint error on `members_member_number_unique`. If the process fails between insert and update, orphan rows marked `"PENDING"` persist permanently.

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

1. **DATA-001**: Silent destruction of offline activity and line-item action queues (`offline-sync.tsx`).
2. **AUTH-001**: Unauthenticated admin takeover on empty user table during bootstrap (`auth.ts`).
3. **AUTHZ-001**: Broken resource authorization / IDOR across nested activity, line-item, and badge routes (`members.ts`).

---

## 6. P1 CRITICAL STABILIZATION

1. **AUTH-002**: Broken Clerk agent invitation lifecycle and email collision (`users.ts`).
2. **PRIV-001**: Require `requireAppUser` authentication for badge verification routes so only logged-in agents can inspect full member details (`members.ts`, `App.tsx`).
3. **PRIV-002**: Stored XSS vulnerability in generated SVG member badge templates (`members.ts`).
4. **DATA-002**: Concurrent enrollment `memberNumber` race conditions and non-transactional writes (`members.ts`).
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

### Threat Model & Attack Surface Map
```
[ Unauthenticated Attacker ] ──► GET /api/members/badge/:token        ──► Rejected HTTP 401 Unauthorized (PRIV-001)
                            ──► POST /api/auth/provision (Fresh DB)  ──► Escalates to Admin (AUTH-001)
                            ──► Spoof X-Forwarded-For               ──► Bypasses Rate Limiter (SEC-002)

[ Low-Privilege Agent ]     ──► POST /api/members/:other_id/activities ──► IDOR / Cross-Agent Edit (AUTHZ-001)
                            ──► Inject <script> in Name/Village      ──► Stored XSS via Badge SVG (PRIV-002)
                            ──► Scan Member Badge QR Code           ──► Authenticates & Verifies Full Record (PRIV-001)

[ Malicious Origin ]        ──► Any *.vercel.app domain              ──► CSRF via Permissive CORS (SEC-001)
```

### Detailed Attack Analysis
- **AUTH-001 Exploitation Path**: An attacker registers any account on Clerk and calls `POST /api/auth/provision` while `users` table is empty or during a database migration window. The server evaluates `!count` as `true` and assigns the `admin` role.
- **AUTHZ-001 Exploitation Path**: An agent authenticated in Region A notes a target member ID belonging to Region B (`id: 42`). The agent submits `POST /api/members/42/activities`. The route checks `requireAppUser` (which succeeds) and immediately inserts the activity without validating whether member `42` belongs to the agent's region or assignment scope.
- **PRIV-001 Auth Boundary Requirement**: Scanning a member's badge QR code triggers a lookup for `/badge-verify/:badgeToken`. To satisfy CAPEF field operation requirements, the frontend route and backend API must be protected by authentication (`requireAppUser`). Unauthenticated visitors or phones scanning the QR code will be prompted to sign in first. Once authenticated as a CAPEF user/agent, the full member detail record (`formatMember(member, true)`) is returned so agents can inspect and verify identity documents, activities, and contact details.

---

## 10. AUTHENTICATION & AUTHORIZATION ASSESSMENT

### Current vs. Intended Authorization Flow

**Current Flawed Model**:
```
Request ──► requireAppUser (Validates Clerk Session) ──► Route Handler ──► Direct DB Query (No Ownership/Scope Check)
```

**Required Architectural Model**:
```
Request
  │
  ▼
requireAppUser (Resolves AppUser + Role + Assigned Zones)
  │
  ▼
Resource Authorization Middleware (Evaluates Policy: Admin / Supervisor Region / Agent Ownership)
  │
  ▼
Validated & Scoped Request Handler ──► DB Transaction
```

### Key Auth Remediation Requirements
1. **Central Policy Engine**: Implement a declarative authorization helper `authorizeMemberAccess(user, memberId, requiredAction)` that enforces:
   - `admin`: Full read/write across all records.
   - `supervisor`: Read/write restricted to members within `user.regionId` or `user.assignedZones`.
   - `agent`: Read/write restricted to members created by `user.id` (`createdById == user.id`), while retaining global read/verify capability for member badges via `requireAppUser`.
2. **Unified Agent Provisioning**: Replace the `pending_<ts>` hack in `POST /api/users` with an explicit Clerk Invitation call via `@clerk/express` / Clerk SDK, storing the returned `invitation.id`. On user sign-in, correlate by invitation or email in an atomic transaction.

---

## 11. DATABASE & DATA INTEGRITY ASSESSMENT

### Referential Integrity Gap Analysis
The current schema relies entirely on application-level discipline without PostgreSQL database constraints:

```sql
-- CURRENT SCHEMA (UNSAFE)
CREATE TABLE members (id SERIAL PRIMARY KEY, member_number TEXT UNIQUE);
CREATE TABLE member_activities (id SERIAL PRIMARY KEY, member_id INTEGER); -- NO FK!

-- TARGET SCHEMA (STABLE & CONSTRAINED)
CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  member_number VARCHAR(32) NOT NULL UNIQUE,
  created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  region_id INTEGER REFERENCES regions(id) ON DELETE RESTRICT
);

CREATE TABLE member_activities (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  activity_type VARCHAR(64) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT unique_member_activity UNIQUE(member_id, activity_type)
);

CREATE UNIQUE INDEX idx_single_primary_activity ON member_activities(member_id) WHERE is_primary = TRUE;
```

### Transaction Boundary Mandate
All multi-step write operations must be wrapped in explicit Drizzle/PostgreSQL transactions (`db.transaction(async (tx) => ...)`):
- **Member Enrollment**: Insert Member + Generate Sequence Member Number + Insert Primary Activity + Insert Line Items in a single atomic transaction.
- **User Provisioning**: Check Existing Email + Insert User + Link Role in a single atomic transaction.

---

## 12. API / OPENAPI / ZOD ASSESSMENT

### Contract Enforcement Pipeline
The repository currently breaks the contract chain at the Express boundary:

```
OpenAPI (openapi.yaml) ──► Orval Codegen ──► Generated Zod (@workspace/api-zod)
                                                        │
                                                        ▼ (CURRENTLY BROKEN: UNUSED BY BACKEND)
                                            Express Routes (Raw req.body Destructuring)
```

**Remediation**: Implement a generic validation middleware `validateBody(schema)`:
```typescript
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Payload de requête invalide", details: result.error.format() });
      return;
    }
    req.body = result.data;
    next();
  };
}
```

---

## 13. OFFLINE ARCHITECTURE ASSESSMENT

### Queue Synchronization Semantics & Data Protection
The client PWA currently uses local storage queues without idempotency or retry protection:

```
[ Offline Action ] ──► LocalStorage Queue ──► Reconnect Event ──► syncNow() ──► Clear Queue (DATA LOSS!)
```

**Remediation Architecture**:
1. Assign every offline-created record a client-generated UUID (`clientOperationId`).
2. Implement server-side idempotency tracking (`processed_operations` table) to safely process retried requests.
3. Update `syncNow()` in `offline-sync.tsx` to process `capef_offline_actions_queue` sequentially, removing actions from local storage **only after receiving HTTP 200/201 confirmation** from the backend.

---

## 14. UPLOAD / STORAGE ASSESSMENT

### Base64 Bloat vs. Private Cloud Storage
- **Current State**: CNI documents, signatures, and member photos are saved as base64-encoded strings directly inside JSONB database columns (`physique_data`, `morale_data`), causing database rows to exceed 1MB. Local disk writes to `/uploads` are ephemeral and lost on container restart.
- **Target State**: Integrate Supabase Storage / AWS S3 buckets:
  1. Frontend requests a pre-signed upload URL or posts to `/api/uploads`.
  2. Server validates MIME type (`image/jpeg`, `image/png`, `application/pdf`), verifies magic bytes, and enforces file size limits (< 5MB).
  3. File is stored in a private Supabase Storage bucket (`member-documents`).
  4. Only the immutable cloud storage URL (`https://.../bucket/path.jpg`) is stored in the database.

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
To ensure stabilization, a comprehensive test suite must be introduced:

| Test Suite | Framework | Target Files | Key Scenarios Covered |
| :--- | :--- | :--- | :--- |
| **Auth Integration** | Vitest / Supertest | `routes/auth.ts`, `routes/users.ts` | Bootstrap admin escalation prevention, Clerk invitation link, role preservation. |
| **Authorization Policy**| Vitest / Supertest | `routes/members.ts` | Cross-agent member modification blocked (HTTP 403), supervisor region scope isolation. |
| **Member & Activity API**| Vitest / Supertest | `routes/members.ts` | Transactional member creation, sequential member numbers, nested activity creation. |
| **Offline Synchronization**| Vitest | `offline-sync.tsx` | Queue retry persistence, non-clearing on failure, idempotency key handling. |
| **Badge Verification Auth** | Vitest / Supertest | `routes/members.ts` | Rejection of unauthenticated badge scans (HTTP 401); successful full member fetch for authenticated agents. |

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
| **1** | **DATA-001** | **P0** | Silent offline queue data loss. | Queue cleared without transmission. | Transmit offline actions sequentially; clear items only upon server HTTP 200/201. | None | `artifacts/capef/src/lib/offline-sync.tsx` | `pnpm typecheck` |
| **2** | **AUTH-001** | **P0** | First user becomes admin automatically. | `!count` check in JIT provision. | Seed initial admin via CLI or ENV bootstrap (`INITIAL_ADMIN_EMAIL`); reject implicit escalation. | None | `artifacts/api-server/src/routes/auth.ts` | `pnpm typecheck` |
| **3** | **AUTHZ-001** | **P0** | IDOR on nested activities/badges. | Missing resource ownership check. | Create `authorizeMemberAccess` middleware checking `createdById` / `regionId`. | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **4** | **PRIV-001** | **P1** | Unauthenticated badge verification. | Missing `requireAppUser` middleware. | Require `requireAppUser` on badge verification route; redirect unauthenticated scanners to sign in before returning full member details. | None | `artifacts/api-server/src/routes/members.ts`, `artifacts/capef/src/App.tsx` | `pnpm typecheck` |
| **5** | **PRIV-002** | **P1** | Stored XSS in badge SVG. | Raw string interpolation in SVG. | Escape XML entities in string fields (`he.encode` / XML escape helper). | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **6** | **AUTH-002** | **P1** | Broken Clerk agent invitation. | Fake `pending_<ts>` Clerk ID used. | Integrate `@clerk/express` `createInvitation`; link `clerkUserId` dynamically on webhook/provision. | AUTH-001 | `artifacts/api-server/src/routes/users.ts`, `auth.ts` | `pnpm typecheck` |
| **7** | **DATA-002** | **P1** | Non-transactional member creation. | Two-step SQL write with "PENDING". | Wrap member insert + sequence number generation + activity seeding in `db.transaction()`. | None | `artifacts/api-server/src/routes/members.ts` | `pnpm typecheck` |
| **8** | **DB-001** | **P1** | Zero foreign keys & indexes in schema. | Omitted `.references()` in Drizzle. | Create Drizzle migration `0002_add_foreign_keys_and_indexes.sql` with FKs, cascades & indexes. | None | `lib/db/src/schema/*.ts`, `lib/db/drizzle/` | `pnpm --filter @workspace/db run build` |
| **9** | **MIG-001** | **P1** | Startup runs migrations on boot. | Uncoordinated calls in `index.ts`. | Move migration & seed scripts to standalone CLI scripts (`pnpm db:migrate`). | DB-001 | `artifacts/api-server/src/index.ts`, `lib/migration.ts` | `pnpm typecheck` |
| **10** | **MIG-002** | **P1** | Destructive `drizzle-kit push --force`. | `post-merge.sh` calls push. | Replace `pnpm --filter db push` with `pnpm --filter @workspace/db run migrate`. | DB-001 | `scripts/post-merge.sh` | `bash scripts/post-merge.sh` |
| **11** | **QUAL-001** | **P1** | Zero automated tests. | No test runner configured. | Install Vitest + Supertest; create unit & API integration test suites covering critical routes. | AUTHZ-001, DATA-001 | `package.json`, `artifacts/api-server/src/__tests__/` | `pnpm test` |
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
                                                    │
                                                    ▼
[ AUTHZ-001: Resource Auth Policy ] ──► [ QUAL-001: Test Suite ]
                                                    │
[ DATA-001: Offline Sync Protocol ] ────────────────┤
                                                    │
[ API-001: Generated Zod Validation ] ──────────────┼──► [ API-003: Error Masking ]
                                                    │
[ STOR-001: Supabase Cloud Storage ] ───────────────┘
```

---

## 22. EXECUTION PLAN FOR JULES/CLAUDE

The following atomic, step-by-step tasks define the technical implementation instructions for automated execution agents:

### Task REM-DATA-001: Fix Offline Action Queue Transmit & Clear Logic
- **Objective**: Prevent offline field data loss by ensuring queued activity actions are replayed and transmitted before clearing local storage.
- **Files to Modify**: `artifacts/capef/src/lib/offline-sync.tsx`
- **Instructions**:
  1. Modify `syncNow()` in `OfflineQueueProvider`.
  2. Iterate through `capef_offline_actions_queue` items sequentially.
  3. POST each queued action to `/api/members/:id/activities` or `/api/members/:id/activities/:activityId/line-items`.
  4. Retain items in local storage if network or HTTP requests fail; purge an item **only** after receiving HTTP 200/201 response.
- **Acceptance Criteria**: Queued actions persist across page reloads if the server is unreachable; queue clears only after successful HTTP confirmation.

### Task REM-AUTH-001: Remove Implicit First-User Admin Bootstrap
- **Objective**: Eliminate administrative privilege escalation on empty user tables.
- **Files to Modify**: `artifacts/api-server/src/routes/auth.ts`
- **Instructions**:
  1. In `POST /api/auth/provision`, remove `const isFirstUser = !count;`.
  2. Read `process.env.INITIAL_ADMIN_EMAIL`.
  3. Assign `role: "admin"` **only** if `email === process.env.INITIAL_ADMIN_EMAIL`; default all other provisioned users to `"agent"`.
- **Acceptance Criteria**: Registering a new Clerk account on an empty `users` table assigns `role: "agent"` unless the email matches `INITIAL_ADMIN_EMAIL`.

### Task REM-AUTHZ-001: Implement Centralized Resource Authorization Policy
- **Objective**: Block IDOR vulnerabilities on nested member routes.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`, create `artifacts/api-server/src/middlewares/authorizeMember.ts`
- **Instructions**:
  1. Create middleware `authorizeMemberAccess(action: 'read' | 'write')`.
  2. Fetch member `createdById` and `regionId`.
  3. Allow access if `user.role === 'admin'`, OR if `user.role === 'supervisor'` and `member.regionId === user.regionId`, OR if `user.role === 'agent'` and `member.createdById === user.id`.
  4. Return HTTP 403 Forbidden if authorization fails. Attach to all nested `/members/:id/*` routes.
- **Acceptance Criteria**: Field agents attempting to modify activities or badges on members owned by other agents receive HTTP 403.

### Task REM-PRIV-001: Require Authentication for Badge Verification & Return Full Member Profile
- **Objective**: Ensure only authenticated CAPEF agents/users can scan/verify member badges, returning the full member detail record for official field inspection.
- **Files to Modify**: `artifacts/api-server/src/routes/members.ts`, `artifacts/capef/src/App.tsx`
- **Instructions**:
  1. Refactor `/api/public/members/badge/:badgeToken` route to attach `requireAppUser` middleware.
  2. When an authenticated agent queries `/api/members/badge/:badgeToken`, execute `formatMember(member, true)` and return the full member profile (including activities, line items, and organizational/contact info).
  3. Reject unauthenticated badge queries with HTTP 401 Unauthorized.
  4. Update frontend `App.tsx` routing so `/badge-verify/:token` requires authentication; if an unauthenticated user scans the QR code, redirect them to sign in first. Once signed in, render the full `BadgeVerify` page.
- **Acceptance Criteria**: Scanning a badge QR code requires sign-in if not authenticated; once authenticated as a CAPEF agent/user, the complete member profile is displayed for field verification. Unauthenticated API calls return HTTP 401.

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

### Task REM-DB-001: Add Foreign Keys, Cascades & Performance Indexes
- **Objective**: Enforce database-level referential integrity and accelerate joins.
- **Files to Modify**: `lib/db/src/schema/members.ts`, `users.ts`, `index.ts`
- **Instructions**:
  1. Attach `.references(() => membersTable.id, { onDelete: 'cascade' })` to `memberActivitiesTable.memberId`.
  2. Attach `.references(() => memberActivitiesTable.id, { onDelete: 'cascade' })` to `activityLineItemsTable.activityId`.
  3. Add index definitions: `index("idx_members_created_by").on(membersTable.createdById)`, `index("idx_members_region").on(membersTable.regionId)`.
  4. Generate a versioned migration: `pnpm --filter @workspace/db run generate`.
- **Acceptance Criteria**: Migration file `0002_*.sql` is created under `lib/db/drizzle/` containing foreign keys, cascades, and indexes.

### Task REM-MIG-001: Decouple Migration Execution from Server Startup
- **Objective**: Prevent deployment race conditions and cold-start latency.
- **Files to Modify**: `artifacts/api-server/src/index.ts`, create `lib/db/src/standalone-migrate.ts`
- **Instructions**:
  1. Remove `seedDatabaseIfNeeded()` and `migrateExistingMembersToActivities()` calls from `artifacts/api-server/src/index.ts`.
  2. Wrap migration logic in a standalone CLI script in `@workspace/db` runnable via `pnpm db:migrate`.
  3. Configure deployment build scripts to trigger `pnpm db:migrate` prior to starting server process.
- **Acceptance Criteria**: Launching `node dist/index.mjs` starts listening on `PORT` immediately without querying or mutating existing table structures.

---

## 23. DEFINITION OF DONE

Feature development on CAPEF Digital Enrolment may resume **ONLY** when all of the following conditions are met and confirmed:

1. **P0 Containment Verified**:
   - [ ] Offline action queue in `offline-sync.tsx` successfully replays and acknowledges operations without data loss.
   - [ ] Unauthenticated admin bootstrap in `auth.ts` is replaced with explicit environment-seeded admin evaluation.
   - [ ] All nested member activity, line-item, and badge routes enforce resource-level authorization checks (HTTP 403 on scope mismatch).
2. **Data & Privacy Hardened**:
   - [ ] Badge verification routes enforce `requireAppUser` authentication, allowing authenticated CAPEF agents to verify full member profiles while blocking unauthenticated access (HTTP 401).
   - [ ] SVG badge generator escapes all user input strings, neutralizing stored XSS vectors.
   - [ ] Member enrollment write path executes inside an atomic PostgreSQL transaction.
3. **Database Integrity Locked**:
   - [ ] Drizzle schema defines explicit foreign keys, cascades, non-PK indexes, and unique constraints.
   - [ ] Destructive `drizzle-kit push --force` is permanently removed from deployment scripts.
   - [ ] Database migrations are decoupled from application startup.
4. **Test & Pipeline Validation**:
   - [ ] An automated integration test suite exists and passes 100% of auth, authorization, member enrollment, and badge verification test cases.
   - [ ] `pnpm typecheck` and `pnpm build` execute cleanly across all workspace packages without TypeScript errors.

---

## 24. FINAL DEVELOPMENT DECISION

### **🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**

**Engineering Justification**:
The CAPEF Digital Enrolment platform contains **3 P0 Blockers** (silent offline data loss, unauthenticated admin takeover, and universal IDOR authorization bypasses) and **8 P1 Critical Defects** (including unauthenticated badge access, SVG stored XSS, non-transactional writes, total lack of database referential integrity, destructive force-push deployments, and zero automated tests). Continuing feature development on this foundation introduces compound risk, multiplies technical debt, and threatens the security of citizen identity data. Feature development must remain paused until the Master Remediation Plan (Phases 0 and 1) is executed and verified.
