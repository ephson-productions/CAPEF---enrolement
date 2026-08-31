# CAPEF DIGITAL ENROLMENT
## CONSOLIDATED AUDIT & MASTER REMEDIATION PLAN

---

## 1. EXECUTIVE SUMMARY

The **CAPEF Digital Enrolment Platform** is a full-stack, mobile-first Progressive Web Application (PWA) designed to digitize enrollment, identification, and agricultural/artisanal activity tracking for members of the *Chambre d'Agriculture, de la Pêche, de l'Élevage et de la Forêt (CAPEF)* in Cameroon.

A thorough, cross-layer, evidence-based audit was performed on the `ephson-productions/CAPEF---enrolement` repository. This evaluation reconciled two prior independent security/engineering audits (DeepSeek and Codex) against direct inspection of the codebase, incorporating Correction 01 (Authorization Separation), Correction 03 (Production-Grade Offline Synchronization Protocol), Correction 04 (Transactional Member Enrollment), and Correction 05 (Business-Driven Relational Integrity).

### Key Finding & Verdict
While the codebase exhibits strong architectural intentions—utilizing a modern stack (Node.js/Express 5, Drizzle ORM, Supabase/PostgreSQL, OpenAPI 3.0, Orval codegen, React, TanStack Query, Clerk authentication, and Vite PWA)—**the platform in its current state is unready for production and insecure.**

Critical structural vulnerabilities and architectural gaps were confirmed:
1. **P0 Data Loss & Retry Risk**: The offline action queue (`capef_offline_actions_queue`) for field-collected activity and line-item operations is silently discarded on reconnection without server transmission (`offline-sync.tsx`), lacking client operation IDs (`clientOperationId`) and server-side idempotency tracking to prevent data loss or duplicate writes.
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
   - *Offline Workflow*: Form Capture → LocalStorage Durable Queue → clientOperationId Generation → Network Reconnection → Idempotent Server Replay → Server Acknowledgement → Local Queue Purge.
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
| **DATA-001** | F01 | CAP-07 | `artifacts/capef/src/lib/offline-sync.tsx:70-80` | **CONFIRMED** | **P0** | `syncNow()` resets `capef_offline_actions_queue` to `[]` without transmitting mutations, lacking `clientOperationId` and server-side idempotency tracking (`processed_operations`), risking silent data loss and duplicate writes. |
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
*(Unchanged)*

### AUTH-002: Broken Agent Invitation & Identity Lifecycle
*(Unchanged)*

### AUTHZ-001: IDOR & Missing Resource Authorization on Nested Activity Routes
*(Unchanged)*

### PRIV-001: Unauthenticated Access to Badge Verification & Missing Auth Boundary
*(Unchanged)*

### PRIV-002: Stored XSS Vector in Generated Badge SVG
*(Unchanged)*

### DATA-001: Silent Offline Queue Data Loss & Retry Duplicate Write Hazard
*(Unchanged)*

### DATA-002: Non-Transactional Member Enrollment & Member Number Race Conditions
*(Unchanged)*

### DATA-003: Numeric Input Serialization Failures
*(Unchanged)*

### DB-001: Absence of Relational Foreign Keys, Delete Policies & Business Constraints
- **Severity**: P1
- **Domain**: Database Schema & Business Integrity
- **Status**: CONFIRMED
- **File**: `lib/db/src/schema/index.ts`, `lib/db/drizzle/0000_brief_timeslip.sql`
- **Description**: Across all 7 database tables (`users`, `members`, `member_activities`, `activity_line_items`, `regions`, `departments`, `arrondissements`), there are **zero foreign key constraints**, **zero delete policies**, **zero non-primary-key indexes**, **zero partial unique primary activity constraints**, and **zero CHECK constraints** enforcing business enums or non-negative numeric ranges.
- **Root Cause**: Schema relies entirely on application discipline without database-level integrity enforcement or preflight data migration checks.
- **Impact**: Deleting a user can corrupt or destroy historical member records, orphan records accumulate silently, multiple primary activities can be assigned to a member, and invalid enum/numeric values reach SQL storage.

---

## 5. P0 BLOCKERS

1. **DATA-001**: Production-grade offline sync protocol with `clientOperationId` and server idempotency (`offline-sync.tsx`, `processed_operations`).
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

*(Unchanged)*

---

## 8. P3 CLEANUP

*(Unchanged)*

---

## 9. SECURITY ARCHITECTURE ASSESSMENT

*(Unchanged)*

---

## 10. AUTHENTICATION & AUTHORIZATION ASSESSMENT

*(Unchanged)*

---

## 11. DATABASE & DATA INTEGRITY ASSESSMENT (CORRECTION 05)

### Business-Driven Relational Integrity & Migration Safety

Database integrity must be enforced as the final boundary without blindly adding `ON DELETE CASCADE` everywhere or risking production migration crashes due to invalid legacy rows.

```
[ Application / Frontend Validation ]
               │
               ▼
   [ Express / Zod Contract ]
               │
               ▼
[ Business Authorization Policy ]
               │
               ▼
 [ PostgreSQL Relational Integrity ] ──► (FKs, CASCADE vs RESTRICT, Partial Unique, CHECKs)
```

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

#### 2. Business Constraints & Enum Rules

- **Single Primary Activity Enforcement**:
  A member can operate multiple activities across categories (e.g. `agriculteur` and `eleveur`), but exactly ONE activity may be marked as primary (`is_primary = true`). This is enforced via a PostgreSQL **partial unique index**:
  ```sql
  CREATE UNIQUE INDEX idx_single_primary_activity
  ON member_activities(member_id)
  WHERE is_primary = TRUE;
  ```
- **Category Uniqueness per Member**:
  A member cannot have two activity rows for the same category:
  ```sql
  ALTER TABLE member_activities
  ADD CONSTRAINT unique_member_activity_type UNIQUE(member_id, activity_type);
  ```
- **Enum CHECK Constraints**:
  - `members.status IN ('incomplet', 'en_attente', 'valide', 'desactive', 'bloque')`
  - `members.member_type IN ('physique', 'morale')`
  - `members.category IN ('agriculteur', 'pecheur', 'eleveur', 'forestier', 'artisan')`
- **Numeric Range CHECK Constraints**:
  - `activity_line_items.superficie_ha >= 0`
  - `activity_line_items.production_quantity >= 0`
  - `activity_line_items.production_fcfa >= 0`
  - *(Note: Specific upper bounds on yield or production values mark as `REQUIRES BUSINESS CONFIRMATION` before applying hard caps).*

#### 3. Data Preflight & Migration Safety Procedure

Before applying migration `0002_*.sql` in production, a preflight SQL audit script MUST execute to detect invalid existing rows:

```sql
-- 1. Preflight Check: Detect orphan activities referencing missing members
SELECT id, member_id FROM member_activities
WHERE member_id NOT IN (SELECT id FROM members);

-- 2. Preflight Check: Detect members with multiple primary activities
SELECT member_id, COUNT(*) FROM member_activities
WHERE is_primary = TRUE GROUP BY member_id HAVING COUNT(*) > 1;

-- 3. Preflight Remediation: If invalid rows exist, log and clean before adding FK/index
-- (Executed via script before ALTER TABLE statement)
```

#### 4. Supporting Performance Indexes
- `CREATE INDEX idx_members_created_by ON members(created_by_id);`
- `CREATE INDEX idx_members_region ON members(region_id);`
- `CREATE INDEX idx_members_badge_token ON members(badge_token);`
- `CREATE INDEX idx_member_activities_member_id ON member_activities(member_id);`
- `CREATE INDEX idx_activity_line_items_activity_id ON activity_line_items(activity_id);`

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
| **Offline Sync & Idempotency**| Vitest / Supertest | `offline-sync.tsx`, `routes/members.ts` | Action survives reload; retry on network failure retains queue; replaying same `clientOperationId` creates NO duplicate records. |
| **Relational Integrity & Deletes**| Vitest / Supertest | `lib/db/src/schema/`, `routes/users.ts` | Attempting to delete a user with members fails with `ON DELETE RESTRICT`; deleting a member cascades to delete activities/line items; adding second primary activity fails partial unique constraint. |
| **Concurrent Member Enrollment**| Vitest / Supertest | `routes/members.ts` | **10 concurrent member creation requests** -> 10 successful valid members, 10 unique `memberNumber`s, 0 `"PENDING"` members, 0 orphan primary activities. |

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
| **5** | **DB-001** | **P1** | Zero foreign keys & constraints in schema. | Omitted `.references()` in Drizzle. | Create Drizzle migration `0002_*.sql` with `RESTRICT` for users/geography, `CASCADE` for child activities/line items, partial unique index for single primary activity, CHECK constraints & preflight data checks. | None | `lib/db/src/schema/*.ts`, `lib/db/drizzle/` | `pnpm --filter @workspace/db run build` |
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
*(Unchanged)*

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
       `extraConfig: (table) => [ uniqueIndex("idx_single_primary_activity").on(table.memberId).where(sql\`is_primary = true\`) ]`
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
*(Unchanged)*

### Task REM-PRIV-002: Escape XML Entities in SVG Badge Templates
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
   - [ ] Database schema enforces business-driven relational integrity: `ON DELETE RESTRICT` for users/geography, `ON DELETE CASCADE` for child activities/line items, partial unique index for single primary activity, and CHECK constraints.
   - [ ] Badge verification routes enforce `requireAppUser` authentication (`authorizeBadgeVerification`), allowing ANY authenticated CAPEF agent to verify ANY valid member badge (HTTP 200 with full profile), while blocking unauthenticated access (HTTP 401 / sign-in redirect).
   - [ ] SVG badge generator escapes all user input strings, neutralizing stored XSS vectors.
3. **Database Integrity Locked**:
   - [ ] Legacy data preflight checks execute successfully before applying migration `0002_*.sql`.
   - [ ] Destructive `drizzle-kit push --force` is permanently removed from deployment scripts.
   - [ ] Database migrations are decoupled from application startup.
4. **Test & Pipeline Validation**:
   - [ ] An automated integration test suite exists and passes 100% of auth, member resource authorization, badge verification, offline sync & idempotency, relational delete policies, and concurrent member enrollment test cases.
   - [ ] `pnpm typecheck` and `pnpm build` execute cleanly across all workspace packages without TypeScript errors.

---

## 24. FINAL DEVELOPMENT DECISION

### **🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**

**Engineering Justification**:
The CAPEF Digital Enrolment platform contains **3 P0 Blockers** (silent offline data loss & duplicate write risk, unauthenticated admin takeover, and universal IDOR authorization bypasses) and **8 P1 Critical Defects** (including unauthenticated badge access, SVG stored XSS, non-transactional writes & enrollment race conditions, total lack of database referential integrity & unconstrained schema, destructive force-push deployments, and zero automated tests). Continuing feature development on this foundation introduces compound risk, multiplies technical debt, and threatens the security of citizen identity data. Feature development must remain paused until the Master Remediation Plan (Phases 0 and 1) is executed and verified.
