# CAPEF DIGITAL ENROLMENT
## CONSOLIDATED AUDIT & MASTER REMEDIATION PLAN

---

## 1. EXECUTIVE SUMMARY

The **CAPEF Digital Enrolment Platform** is a full-stack, mobile-first Progressive Web Application (PWA) designed to digitize enrollment, identification, and agricultural/artisanal activity tracking for members of the *Chambre d'Agriculture, de la Pêche, de l'Élevage et de la Forêt (CAPEF)* in Cameroon.

A thorough, cross-layer, evidence-based audit was performed on the `ephson-productions/CAPEF---enrolement` repository. This evaluation reconciled two prior independent security/engineering audits (DeepSeek and Codex) against direct inspection of the codebase, incorporating Correction 01 (Authorization Separation), Correction 03 (Production-Grade Offline Synchronization Protocol), Correction 04 (Transactional Member Enrollment), Correction 05 (Business-Driven Relational Integrity), and Correction 06 (Production-Grade Definition of Done & Quality Gates).

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

*(Unchanged)*

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

## 11. DATABASE & DATA INTEGRITY ASSESSMENT (CORRECTION 04 & 05)

*(Unchanged)*

---

## 12. API / OPENAPI / ZOD ASSESSMENT

*(Unchanged)*

---

## 13. OFFLINE ARCHITECTURE ASSESSMENT (CORRECTION 03)

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

*(Unchanged)*

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

*(Unchanged)*

---

## 22. EXECUTION PLAN FOR JULES/CLAUDE

*(Unchanged)*

---

## 23. DEFINITION OF DONE (CORRECTION 06)

A remediation item or phase is **NOT** considered complete merely because TypeScript compiles or code looks visually correct. CAPEF production readiness is governed by 9 strict, testable quality gates:

### 1. SECURITY GATE
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

### 2. DATA INTEGRITY GATE
- Member creation executed as ONE atomic transaction (`db.transaction()`):
  - Sequence member number allocation (`seq_member_number`) + base Member row + primary Activity row + initial Line Items commit or rollback together.
- Under **10 concurrent member creation requests**:
  - Exactly 10 successful valid members created.
  - Exactly 10 unique sequential member numbers assigned.
  - **0 `"PENDING"` member numbers.**
  - **0 orphan primary activities.**
  - **0 orphan line items.**
  - **0 duplicate member numbers.**

### 3. OFFLINE DATA GATE
- Every offline operation is assigned an immutable `clientOperationId` UUID.
- Offline operations survive page reloads and browser restarts in local storage.
- Reconnecting sequentially replays queued operations.
- Operations are deleted from local storage ONLY after confirmed server HTTP 200/201 acknowledgement or terminal validation error response.
- Network failures (HTTP 5xx / timeout) retain operations in local storage for retry.
- Replaying the same `clientOperationId` multiple times returns cached result with HTTP 200 and creates NO duplicate database records.

### 4. DATABASE GATE
- All foreign keys declared in Drizzle schema with explicit business delete policies:
  - `users` -> `members` (`ON DELETE RESTRICT` to preserve historical member records).
  - `regions`/`departments`/`arrondissements` -> `members` (`ON DELETE RESTRICT`).
  - `members` -> `member_activities` (`ON DELETE CASCADE`).
  - `member_activities` -> `activity_line_items` (`ON DELETE CASCADE`).
- PostgreSQL partial unique index enforced for single primary activity (`WHERE is_primary = true`).
- PostgreSQL CHECK constraints enforced for statuses, categories, and non-negative numbers.
- Preflight legacy data audit script (`preflight-check.ts`) executes and passes before running migration `0002_*.sql`.
- Destructive `drizzle-kit push --force` permanently removed from deployment scripts.

### 5. API CONTRACT GATE
- Contract pipeline enforced: `OpenAPI -> Orval -> Zod -> Express validation middleware`.
- Request bodies, params, and queries parsed and validated by generated Zod schemas before reaching route logic.
- All API responses return documented status codes with stable `{ error, code }` payloads.
- Raw PostgreSQL exception details (`constraint`, `table`, SQL queries) are masked from clients.
- Generated code directories (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`) are NEVER manually modified.

### 6. STORAGE GATE
- Member identity photos, CNI documents, and signatures uploaded to private Supabase Object Storage (`member-documents` bucket).
- Only immutable cloud URLs (`https://.../bucket/path.jpg`) stored in database columns (JSONB bloat eliminated).
- MIME types and magic bytes validated; max file size capped (5MB).
- Local ephemeral disk file writes (`/uploads`) eliminated.

### 7. MIGRATION GATE
- Express process startup (`artifacts/api-server/src/index.ts`) decoupled from database migrations and reference seeding.
- Migrations executed explicitly via versioned CLI scripts (`pnpm db:migrate`) using `DIRECT_URL`.

### 8. TEST GATE
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

### 9. DEPLOYMENT GATE
- Build & Verification pipeline executes cleanly without errors:
  - `pnpm install`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm --filter @workspace/api-spec run codegen`
- Environment variables audited for production targets (Render, Supabase, Clerk).
- CORS allowlist restricted to exact configured origin URLs.

---

## 24. FINAL DEVELOPMENT DECISION

### **🔴 STOP FEATURE DEVELOPMENT — STABILIZATION REQUIRED**

**Engineering Justification**:
The CAPEF Digital Enrolment platform contains **3 P0 Blockers** (silent offline data loss & duplicate write risk, unauthenticated admin takeover, and universal IDOR authorization bypasses) and **8 P1 Critical Defects** (including unauthenticated badge access, SVG stored XSS, non-transactional writes & enrollment race conditions, total lack of database referential integrity & unconstrained schema, destructive force-push deployments, and zero automated tests). Continuing feature development on this foundation introduces compound risk, multiplies technical debt, and threatens the security of citizen identity data. Feature development must remain paused until the Master Remediation Plan (Phases 0 and 1) is executed and verified.
