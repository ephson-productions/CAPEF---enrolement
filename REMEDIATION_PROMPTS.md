# CAPEF DIGITAL ENROLMENT
## MASTER REMEDIATION PLAN — TASK EXECUTION PROMPTS

This document contains detailed, self-contained, copy-pasteable engineering prompts for every task in the **CAPEF Digital Enrolment Master Remediation Plan** (`AUDIT_REMEDIATION_PLAN.md`). Each prompt is structured so that any AI coding agent (e.g., Jules, Claude, Cursor) or software engineer can execute the task autonomously with complete context, technical requirements, acceptance criteria, and verification commands.

---

## TABLE OF CONTENTS

### PHASE 0: IMMEDIATE CONTAINMENT (P0 BLOCKERS)
1. [PROMPT REM-DATA-001: Offline Action Queue Transmit & Clear Fix](#prompt-rem-data-001-offline-action-queue-transmit--clear-fix)
2. [PROMPT REM-AUTH-001: Remove Implicit First-User Admin Bootstrap](#prompt-rem-auth-001-remove-implicit-first-user-admin-bootstrap)
3. [PROMPT REM-AUTHZ-001: Implement Centralized Resource Authorization Policy](#prompt-rem-authz-001-implement-centralized-resource-authorization-policy)

### PHASE 1: CRITICAL STABILIZATION (P1 HIGH PRIORITY)
4. [PROMPT REM-PRIV-001: Require Authentication for Badge Verification & Return Full Member Profile](#prompt-rem-priv-001-require-authentication-for-badge-verification--return-full-member-profile)
5. [PROMPT REM-PRIV-002: Escape XML Entities in SVG Badge Templates](#prompt-rem-priv-002-escape-xml-entities-in-svg-badge-templates)
6. [PROMPT REM-AUTH-002: Repair Clerk Agent Invitation & Identity Lifecycle](#prompt-rem-auth-002-repair-clerk-agent-invitation--identity-lifecycle)
7. [PROMPT REM-DATA-002: Enforce Atomic Member Creation Transactions](#prompt-rem-data-002-enforce-atomic-member-creation-transactions)
8. [PROMPT REM-DB-001: Declare Foreign Keys, Cascades & Performance Indexes](#prompt-rem-db-001-declare-foreign-keys-cascades--performance-indexes)
9. [PROMPT REM-MIG-001: Decouple Migration Execution from Server Startup](#prompt-rem-mig-001-decouple-migration-execution-from-server-startup)
10. [PROMPT REM-MIG-002: Replace Destructive Schema Push with Versioned Migrations](#prompt-rem-mig-002-replace-destructive-schema-push-with-versioned-migrations)
11. [PROMPT REM-QUAL-001: Establish Automated Test Suite](#prompt-rem-qual-001-establish-automated-test-suite)

### PHASE 2: SYSTEM HARDENING (P2 MEDIUM PRIORITY)
12. [PROMPT REM-API-001: Enforce Generated Zod Schemas on Express Body Parsing](#prompt-rem-api-001-enforce-generated-zod-schemas-on-express-body-parsing)
13. [PROMPT REM-API-003: Mask Internal Database Exception Details in Error Responses](#prompt-rem-api-003-mask-internal-database-exception-details-in-error-responses)
14. [PROMPT REM-DATA-003: Coerce Empty Strings to Null for Double/Integer DB Columns](#prompt-rem-data-003-coerce-empty-strings-to-null-for-doubleinteger-db-columns)
15. [PROMPT REM-SEC-001: Restrict CORS Allowlist to Strict Environment Variables](#prompt-rem-sec-001-restrict-cors-allowlist-to-strict-environment-variables)
16. [PROMPT REM-SEC-002: Configure Express Trust Proxy & Persistent Rate Limiting](#prompt-rem-sec-002-configure-express-trust-proxy--persistent-rate-limiting)
17. [PROMPT REM-STOR-001: Integrate Supabase Cloud Object Storage for Identity Documents & Photos](#prompt-rem-stor-001-integrate-supabase-cloud-object-storage-for-identity-documents--photos)
18. [PROMPT REM-PERF-001: Eliminate N+1 Query Loops & Stream Excel Exports](#prompt-rem-perf-001-eliminate-n1-query-loops--stream-excel-exports)
19. [PROMPT REM-API-002: Synchronize OpenAPI Contract & Re-run Codegen](#prompt-rem-api-002-synchronize-openapi-contract--re-run-codegen)

### PHASE 3: CLEANUP & OPTIMIZATION (P3 LOW PRIORITY)
20. [PROMPT REM-UX-001 / REP-001: Path Validation, Offline Banners & Dashboard Aggregations](#prompt-rem-ux-001--rep-001-path-validation-offline-banners--dashboard-aggregations)

---

## PHASE 0: IMMEDIATE CONTAINMENT (P0 BLOCKERS)

### PROMPT REM-DATA-001: Offline Action Queue Transmit & Clear Fix

```markdown
# TASK SPECIFICATION: REM-DATA-001
**Title**: Fix Offline Action Queue Synchronization to Transmit Mutations Before Clearing Local Storage
**Severity**: P0 Blocker
**Domain**: Offline Engine & Data Integrity
**Affected Files**: `artifacts/capef/src/lib/offline-sync.tsx`

---

### OBJECTIVE
Fix a critical data loss bug in `artifacts/capef/src/lib/offline-sync.tsx`. Currently, when `syncNow()` executes upon reconnection, the offline action queue (`capef_offline_actions_queue`) containing field-collected crop/livestock activities and line items is cleared (`localStorage.setItem('capef_offline_actions_queue', JSON.stringify([]))`) WITHOUT ever sending the queued requests to the backend API. Replay each queued action sequentially, sending the HTTP mutation to the backend server, and purge items from local storage ONLY after receiving a successful HTTP response.

---

### BACKGROUND & TECHNICAL CONTEXT
- In CAPEF Digital Enrolment, field agents enroll members and add agricultural/artisanal activities offline.
- `enqueueActivityAction` adds action objects to `localStorage.getItem('capef_offline_actions_queue')`.
- Actions have shapes like:
  - `{ type: 'create_activity', memberId: number, data: ActivityInput }`
  - `{ type: 'create_line_item', memberId: number, activityId: number, data: LineItemInput }`
  - `{ type: 'delete_line_item', memberId: number, activityId: number, itemId: number }`
- In `offline-sync.tsx:70-80`, `syncNow()` currently contains:
  ```typescript
  if (actionsQueue.length > 0) {
    localStorage.setItem('capef_offline_actions_queue', JSON.stringify([]));
  }
  ```
  This immediately destroys all offline activity and line-item mutations!

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/capef/src/lib/offline-sync.tsx`.
2. Locate the `syncNow` function inside `OfflineQueueProvider`.
3. Refactor `syncNow` to handle `actionsQueue` properly:
   - Iterate through `actionsQueue` sequentially using a `for...of` loop.
   - For each action item:
     - If `action.type === 'create_activity'`, call the generated API client or issue a `POST /api/members/${action.memberId}/activities` request with `action.data`.
     - If `action.type === 'create_line_item'`, issue a `POST /api/members/${action.memberId}/activities/${action.activityId}/line-items` request with `action.data`.
     - If `action.type === 'delete_line_item'`, issue a `DELETE /api/members/${action.memberId}/activities/${action.activityId}/line-items/${action.itemId}` request.
   - If an individual request succeeds (HTTP 200/201/204):
     - Remove that specific item from the local array and update `localStorage.setItem('capef_offline_actions_queue', JSON.stringify(remainingActions))`.
   - If a request fails due to network error or server 500:
     - Log the error via `console.error`, retain the remaining actions in `capef_offline_actions_queue`, show an error toast, and break out of the sync loop so retries happen on the next reconnect.
4. Ensure `updateQueueCount()` accurately sums `capef_offline_queue` and `capef_offline_actions_queue`.

---

### ACCEPTANCE CRITERIA
- [ ] Field activity/line-item actions queued while offline persist in `localStorage`.
- [ ] Upon reconnecting, `syncNow()` sequentially transmits each action to the Express backend API.
- [ ] Items are removed from `capef_offline_actions_queue` ONLY after a successful HTTP response.
- [ ] If the server returns an error or connection drops mid-sync, remaining actions are preserved for future retry.
- [ ] `pnpm --filter capef run build` or `pnpm typecheck` compiles cleanly with no TypeScript errors.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
pnpm --filter capef run build
```
```

---

### PROMPT REM-AUTH-001: Remove Implicit First-User Admin Bootstrap

```markdown
# TASK SPECIFICATION: REM-AUTH-001
**Title**: Remove Implicit First-User Admin Escalation in JIT Provisioning
**Severity**: P0 Blocker
**Domain**: Authentication & Provisioning Security
**Affected Files**: `artifacts/api-server/src/routes/auth.ts`

---

### OBJECTIVE
Eliminate the privilege escalation vulnerability in `POST /api/auth/provision` where any new user signing up via Clerk automatically receives `admin` super-user privileges whenever the `users` table is empty (`isFirstUser = !count`). Replace this with explicit environment variable evaluation (`INITIAL_ADMIN_EMAIL`), defaulting all unseeded provisioned accounts to `role: "agent"`.

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/routes/auth.ts:90-106`:
  ```typescript
  const [count] = await db.select().from(usersTable);
  const isFirstUser = !count;
  const [newUser] = await db.insert(usersTable).values({
    clerkUserId,
    email,
    name,
    role: isFirstUser ? "admin" : "agent",
  });
  ```
- If the database is fresh, truncated, or reset during migration, the first person who registers an account on Clerk takes over the platform as `admin`.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/auth.ts`.
2. Locate the `/auth/provision` route handler (`router.post("/auth/provision", ...)`).
3. Remove the query `const [count] = await db.select().from(usersTable)` and `const isFirstUser = !count`.
4. Define admin email evaluation logic:
   ```typescript
   const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
   const userEmail = email.trim().toLowerCase();
   const assignedRole = initialAdminEmail && userEmail === initialAdminEmail ? "admin" : "agent";
   ```
5. Pass `role: assignedRole` to the `db.insert(usersTable).values({...})` query.
6. Add logging via `logger.info`:
   - Log when a user is provisioned, explicitly noting their email and assigned role.

---

### ACCEPTANCE CRITERIA
- [ ] Registering a new account on Clerk when the `users` table is empty assigns `role: "agent"` by default.
- [ ] `role: "admin"` is assigned ONLY if the registering user's email matches `process.env.INITIAL_ADMIN_EMAIL`.
- [ ] No arbitrary user can obtain `admin` rights via sign-up timing or table state.
- [ ] `pnpm typecheck` passes without errors.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-AUTHZ-001: Implement Centralized Resource Authorization Policy

```markdown
# TASK SPECIFICATION: REM-AUTHZ-001
**Title**: Implement Centralized Resource Authorization Policy on All Nested Member Routes
**Severity**: P0 Blocker
**Domain**: Resource Authorization & IDOR Protection
**Affected Files**:
- Create `artifacts/api-server/src/middlewares/authorizeMember.ts`
- Modify `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Eliminate Insecure Direct Object Reference (IDOR) vulnerabilities across all nested member routes (`/api/members/:id/activities`, line items, and badges). Create a centralized Express authorization middleware `authorizeMemberAccess` that verifies whether the authenticated user has permission to read or modify the target member record based on role, creator ownership (`createdById`), and regional scope (`regionId`).

---

### BACKGROUND & TECHNICAL CONTEXT
- Currently, routes like `POST /api/members/:id/activities`, `PUT /api/members/:id/activities/:actId/line-items`, and `POST /api/members/:id/badge` attach `requireAppUser`, which verifies that a valid Clerk session exists.
- However, they fail to verify if the authenticated agent actually created the member (`createdById === appUser.id`) or if a supervisor is assigned to the member's region (`regionId === appUser.regionId`).
- Low-privilege field agents can read, modify, or delete activities and line items on member records belonging to other agents or regions.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Create a new middleware file `artifacts/api-server/src/middlewares/authorizeMember.ts`.
2. Define `authorizeMemberAccess(action: 'read' | 'write')`:
   - Parse `memberId` from `req.params.id` or `req.params.memberId`. Return HTTP 400 if invalid integer.
   - Query `membersTable` by ID. If member does not exist, return HTTP 404 `{ error: "Membre introuvable" }`.
   - Retrieve `appUser = (req as any).appUser`.
   - Evaluate authorization policy rules:
     - **Admin (`appUser.role === 'admin'`)**: Granted full `'read'` and `'write'` access.
     - **Supervisor (`appUser.role === 'supervisor'`)**: Granted access if `member.regionId === appUser.regionId` or if `member.regionId` is included in `appUser.assignedZones`.
     - **Agent (`appUser.role === 'agent'`)**:
       - For `'write'` actions: Granted access ONLY if `member.createdById === appUser.id`.
       - For `'read'` actions: Granted access if `member.createdById === appUser.id`, OR if verifying badges via `requireAppUser`.
   - If authorization fails, log a warning via `logger.warn` and return HTTP 403 Forbidden:
     `res.status(403).json({ error: "Accès non autorisé à ce dossier membre" });`
   - If authorization succeeds, attach `(req as any).member = member;` and call `next()`.
3. Open `artifacts/api-server/src/routes/members.ts`.
4. Attach `authorizeMemberAccess('read')` to all GET nested member endpoints.
5. Attach `authorizeMemberAccess('write')` to all POST, PUT, and DELETE nested member endpoints (activities, line-items, status changes, badge generation).

---

### ACCEPTANCE CRITERIA
- [ ] Agents attempting to create, update, or delete activities/line items on members created by other agents receive HTTP 403 Forbidden.
- [ ] Supervisors can modify members only within their assigned region/zones.
- [ ] Admins retain unrestricted read/write access across all members.
- [ ] All nested routes reuse the centralized policy middleware instead of ad-hoc ownership checks.
- [ ] `pnpm typecheck` compiles cleanly.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

## PHASE 1: CRITICAL STABILIZATION (P1 HIGH PRIORITY)

### PROMPT REM-PRIV-001: Require Authentication for Badge Verification & Return Full Member Profile

```markdown
# TASK SPECIFICATION: REM-PRIV-001
**Title**: Protect Badge Verification Route with Authentication and Return Full Member Details for Agents
**Severity**: P1 Critical
**Domain**: Authentication & Member Verification
**Affected Files**:
- `artifacts/api-server/src/routes/members.ts`
- `artifacts/capef/src/App.tsx`
- `artifacts/capef/src/pages/members/BadgeVerify.tsx`

---

### OBJECTIVE
Update the badge verification flow so that scanning a member's badge QR code requires authentication (`requireAppUser`). Unauthenticated scanners must be redirected to log in first. Once authenticated as a CAPEF user/agent, the backend route returns the full member detail record (`formatMember(member, true)`), allowing official agents to verify identity documents, activities, and contact details in the field.

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/routes/members.ts:1375-1396`, `GET /api/public/members/badge/:badgeToken` is currently unauthenticated.
- Per CAPEF business rules, badge verification is an official task performed by authenticated field agents equipped with the PWA. Unauthenticated visitors scanning the QR code must be prompted to sign in before accessing the verification page. Once signed in, the agent gets complete member details to confirm identity.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/members.ts`.
2. Refactor the badge verification endpoint route:
   - Change path from `/api/public/members/badge/:badgeToken` to `/api/members/badge/:badgeToken` (or retain legacy path alias for backwards compatibility).
   - Attach `requireAppUser` middleware.
   - If user is not authenticated, Express returns HTTP 401 Unauthorized.
   - When authenticated, query `membersTable` by `badgeToken`. Return HTTP 404 if not found.
   - Call `formatMember(member, true)` and return the full member profile JSON.
3. Open `artifacts/capef/src/App.tsx`.
4. Move `<Route path="/badge-verify/:token" component={BadgeVerify} />` inside the protected route switch wrapper (`<ProtectedRoutes />` or wrapped with `<Show when="signed-in">`), so unauthenticated visitors scanning the QR code are automatically redirected to `${basePath}/sign-in`.
5. Open `artifacts/capef/src/pages/members/BadgeVerify.tsx`.
6. Ensure `BadgeVerify` correctly fetches member details using the authenticated client hook and renders the complete member identity and activity breakdown.

---

### ACCEPTANCE CRITERIA
- [ ] Unauthenticated requests to `/api/members/badge/:token` return HTTP 401 Unauthorized.
- [ ] Scanning a badge QR code in an unauthenticated browser redirects to the sign-in page.
- [ ] Authenticated CAPEF agents scanning the QR code successfully load the full member profile (`BadgeVerify.tsx`).
- [ ] `pnpm typecheck` and `pnpm --filter capef run build` compile cleanly.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
pnpm --filter capef run build
```
```

---

### PROMPT REM-PRIV-002: Escape XML Entities in SVG Badge Templates

```markdown
# TASK SPECIFICATION: REM-PRIV-002
**Title**: Escape XML Entities in SVG Member Badge Generator to Eliminate Stored XSS
**Severity**: P1 Critical
**Domain**: Application Security & Rendering
**Affected Files**: `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Eliminate the Stored Cross-Site Scripting (XSS) vulnerability in `POST /api/members/:id/badge`. Unescaped member attributes (`fullName`, `phone`, `village`, `category`) are currently interpolated directly into SVG XML string templates. Implement an explicit XML entity escaping helper and wrap all dynamic user fields before SVG string assembly.

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/routes/members.ts:982-1050`, the badge generator builds an SVG document:
  ```typescript
  const svg = `<svg ...><text>${member.fullName}</text><text>${member.village}</text></svg>`;
  ```
- If a member record contains malicious strings like `<script>alert(1)</script>` or `<svg onload=fetch(...)>`, the generated SVG string includes raw XML markup.
- When the frontend opens the badge blob URL via `window.open(objectUrl, "_blank")`, the browser parses it as an `image/svg+xml` document and executes embedded JavaScript within the application's origin context.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/members.ts`.
2. Create a helper function `escapeXml`:
   ```typescript
   function escapeXml(str: string | null | undefined): string {
     if (!str) return "";
     return String(str).replace(/[<>&'"]/g, (c) => {
       switch (c) {
         case '<': return '&lt;';
         case '>': return '&gt;';
         case '&': return '&amp;';
         case "'": return '&apos;';
         case '"': return '&quot;';
         default: return c;
       }
     });
   }
   ```
3. Locate the SVG string generation template in the badge route handler.
4. Wrap every interpolated dynamic variable in `escapeXml()`:
   - `escapeXml(member.fullName)`
   - `escapeXml(member.memberNumber)`
   - `escapeXml(member.phone)`
   - `escapeXml(member.village)`
   - `escapeXml(regionName)`
   - `escapeXml(departmentName)`
   - `escapeXml(arrondissementName)`
5. Verify that `photoUrl` and `qrCodeUrl` base64 data URIs are properly formatted and sanitized.

---

### ACCEPTANCE CRITERIA
- [ ] Member attributes containing `<`, `>`, `&`, `'`, or `"` are properly encoded into XML entities (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`).
- [ ] Injecting `<script>alert('xss')</script>` into a member's name renders literal text on the SVG card without executing JavaScript.
- [ ] SVG document structure remains valid and visually rendered.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-AUTH-002: Repair Clerk Agent Invitation & Identity Lifecycle

```markdown
# TASK SPECIFICATION: REM-AUTH-002
**Title**: Integrate Real Clerk Invitation API and Fix Agent Identity Linkage
**Severity**: P1 Critical
**Domain**: Identity Lifecycle & User Management
**Affected Files**:
- `artifacts/api-server/src/routes/users.ts`
- `artifacts/api-server/src/routes/auth.ts`

---

### OBJECTIVE
Fix the broken user onboarding workflow in `POST /api/users`. Replace the mock `clerkUserId: pending_<timestamp>` implementation with a real Clerk Invitation creation call using `@clerk/express` / Clerk SDK. Update `/api/auth/provision` so that when invited agents register and log in for the first time, their Clerk user ID is dynamically linked to their pre-created database user record without email collision errors.

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/routes/users.ts:51-85`, when an admin creates a user (agent/supervisor), the server generates `clerkUserId: pending_<timestamp>` and logs `[CLERK INVITATION FLOW]` to stdout instead of calling Clerk.
- When the invited user signs up via Clerk and hits `POST /api/auth/provision`, `auth.ts` queries `where(eq(usersTable.clerkUserId, clerkUserId))`.
- Because `pending_<timestamp>` does NOT match the real Clerk ID (`user_2...`), `auth.ts` attempts to `INSERT` a new user row using the agent's email. This triggers a PostgreSQL `users_email_unique` 500 constraint violation, locking the agent out permanently.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/users.ts`.
2. Import `clerkClient` from `@clerk/express` (or initialize `createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })`).
3. In `POST /api/users`:
   - Issue a real Clerk invitation:
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
   - Insert into `usersTable` with `clerkUserId: invitationId || pending_${Date.now()}`.
4. Open `artifacts/api-server/src/routes/auth.ts`.
5. In `POST /api/auth/provision`:
   - First search by `clerkUserId`.
   - If not found by `clerkUserId`, search by `email` (`where(eq(usersTable.email, email))`).
   - If found by `email` with a `pending_` or invitation ID in `clerkUserId`:
     - Update the existing record: set `clerkUserId = actualClerkUserId` and preserve the pre-assigned `role`, `regionId`, and `assignedZones`!
     - Return the updated user record.
   - If not found by `email`, insert new user record with default `agent` role.

---

### ACCEPTANCE CRITERIA
- [ ] Creating an agent via `POST /api/users` issues a real Clerk invitation email.
- [ ] On first sign-in, `/api/auth/provision` matches the existing pre-created user by email and updates `clerkUserId`.
- [ ] No unique email constraint violations (`users_email_unique`) occur on first sign-in.
- [ ] The role (`agent` or `supervisor`) and regional assignments set by the admin are preserved.
- [ ] `pnpm typecheck` compiles cleanly.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-DATA-002: Enforce Atomic Member Creation Transactions

```markdown
# TASK SPECIFICATION: REM-DATA-002
**Title**: Wrap Member Creation, Sequential Member Numbering & Activity Seeding in PostgreSQL Transaction
**Severity**: P1 Critical
**Domain**: Transaction Management & Data Integrity
**Affected Files**: `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Eliminate race conditions and partial write failures in `POST /api/members`. Replace the non-transactional two-step creation flow (which inserts `"PENDING"` then updates `CAPEF-{PREFIX}-{id}`) with an atomic Drizzle database transaction (`db.transaction`).

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/routes/members.ts:251-275`:
  1. `POST /api/members` executes `db.insert(membersTable).values({ memberNumber: "PENDING", ... })`.
  2. It generates `memberNumber = generateMemberNumber(category, newId)`.
  3. It executes `db.update(membersTable).set({ memberNumber }).where(...)`.
- If two enrollments happen concurrently, both insert `"PENDING"`, causing a PostgreSQL 500 unique constraint crash on `members_member_number_unique`.
- If process crashes between insert and update, orphan rows with `"PENDING"` persist permanently.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/members.ts`.
2. Refactor `POST /api/members` to execute inside `db.transaction(async (tx) => { ... })`.
3. Inside the transaction:
   - Query the next sequence number or maximum ID using PostgreSQL `SELECT MAX(id)` or sequence generator.
   - Alternatively, insert member record without `memberNumber`, or generate a temporary deterministic number based on timestamp + random hash if needed, BUT execute the entire flow inside `tx`.
   - Recommended pattern:
     ```typescript
     const newMember = await db.transaction(async (tx) => {
       // Insert base member
       const [inserted] = await tx.insert(membersTable).values({
         ...memberValues,
         memberNumber: `TMP-${crypto.randomUUID()}`, // Avoid collisions during initial insert
       }).returning();

       const memberNumber = generateMemberNumber(category, inserted.id);

       const [updated] = await tx.update(membersTable)
         .set({ memberNumber })
         .where(eq(membersTable.id, inserted.id))
         .returning();

       // Seed primary activity inside same transaction tx
       await tx.insert(memberActivitiesTable).values({
         memberId: updated.id,
         activityType: category,
         isPrimary: true,
         ...
       });

       return updated;
     });
     ```
4. If any sub-operation fails inside `tx`, Drizzle automatically rolls back the entire transaction.

---

### ACCEPTANCE CRITERIA
- [ ] Member creation, member number generation, and primary activity seeding execute inside a single atomic transaction.
- [ ] Concurrent member enrollments complete successfully without unique constraint 500 errors on `"PENDING"`.
- [ ] If activity seeding fails, the member insertion is completely rolled back leaving no orphan rows.
- [ ] `pnpm typecheck` compiles cleanly.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-DB-001: Declare Foreign Keys, Cascades & Performance Indexes

```markdown
# TASK SPECIFICATION: REM-DB-001
**Title**: Add Foreign Keys, Cascade Deletions and Indexes to Drizzle Schema and Create Versioned Migration
**Severity**: P1 Critical
**Domain**: Database Schema & Integrity
**Affected Files**:
- `lib/db/src/schema/members.ts`
- `lib/db/src/schema/users.ts`
- `lib/db/src/schema/index.ts`
- Run migration generator to create `lib/db/drizzle/0002_*.sql`

---

### OBJECTIVE
Enforce database-level referential integrity across all tables by adding explicit Drizzle `.references()` foreign key constraints with `onDelete: 'cascade'` or `'restrict'`, unique activity constraints, and non-primary-key performance indexes. Generate a new versioned migration script (`0002_*.sql`).

---

### BACKGROUND & TECHNICAL CONTEXT
- Currently, `lib/db/src/schema/members.ts` and `users.ts` define foreign key relationships as plain `integer()` columns accompanied by code comments (e.g., `memberId: integer("member_id") // references membersTable.id`).
- PostgreSQL schema snapshots (`0000_brief_timeslip.sql`) show ZERO foreign keys and ZERO non-PK indexes across all 7 tables.
- Deleting a member leaves orphan records in `member_activities` and `activity_line_items`. Joins are slow due to missing indexes on `created_by_id` and `region_id`.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `lib/db/src/schema/members.ts`.
2. Add `.references(() => usersTable.id, { onDelete: 'restrict' })` to `membersTable.createdById`.
3. Add `.references(() => regionsTable.id, { onDelete: 'restrict' })` to `membersTable.regionId`.
4. Add `.references(() => departmentsTable.id, { onDelete: 'restrict' })` to `membersTable.departmentId`.
5. Add `.references(() => arrondissementsTable.id, { onDelete: 'restrict' })` to `membersTable.arrondissementId`.
6. Add `.references(() => membersTable.id, { onDelete: 'cascade' })` to `memberActivitiesTable.memberId`.
7. Add `.references(() => memberActivitiesTable.id, { onDelete: 'cascade' })` to `activityLineItemsTable.activityId`.
8. Add performance indexes:
   - `index("idx_members_created_by").on(membersTable.createdById)`
   - `index("idx_members_region").on(membersTable.regionId)`
   - `index("idx_member_activities_member_id").on(memberActivitiesTable.memberId)`
   - `index("idx_activity_line_items_activity_id").on(activityLineItemsTable.activityId)`
9. Add unique constraint to `memberActivitiesTable`: `unique("unique_member_activity").on(memberActivitiesTable.memberId, memberActivitiesTable.activityType)`.
10. Run `pnpm --filter @workspace/db run generate` (or root `pnpm db:generate`) to produce the versioned migration `lib/db/drizzle/0002_*.sql`.

---

### ACCEPTANCE CRITERIA
- [ ] All entity relationships in Drizzle schema possess explicit `.references()` constraints.
- [ ] Deleting a member automatically cascades to delete associated `member_activities` and `activity_line_items`.
- [ ] Performance indexes exist on `created_by_id`, `region_id`, `member_id`, and `activity_id`.
- [ ] A new versioned SQL migration file `0002_*.sql` is generated under `lib/db/drizzle/`.
- [ ] `pnpm --filter @workspace/db run build` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm --filter @workspace/db run build
```
```

---

### PROMPT REM-MIG-001: Decouple Migration Execution from Server Startup

```markdown
# TASK SPECIFICATION: REM-MIG-001
**Title**: Decouple Database Migration and Reference Seeding from Application Startup
**Severity**: P1 Critical
**Domain**: Process Lifecycle & Deployment Safety
**Affected Files**:
- `artifacts/api-server/src/index.ts`
- `lib/migration.ts` (or `@workspace/db`)

---

### OBJECTIVE
Remove uncoordinated database migrations (`migrateExistingMembersToActivities()`) and reference data seeding (`seedDatabaseIfNeeded()`) from Express server process boot in `artifacts/api-server/src/index.ts`. Move migration and seeding operations to standalone CLI scripts executed during build/release phases.

---

### BACKGROUND & TECHNICAL CONTEXT
- In `artifacts/api-server/src/index.ts:8-15`, server startup fires asynchronous migration and seed functions before calling `app.listen()`.
- On Vercel serverless cold starts or Render multi-instance scaling, multiple instances simultaneously run full-table scans and non-transactional inserts, causing duplicate activities, database locks, and slow boot times.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/index.ts`.
2. Remove calls to `seedDatabaseIfNeeded()` and `migrateExistingMembersToActivities()`.
3. Ensure `index.ts` focuses strictly on starting the HTTP server:
   ```typescript
   app.listen(PORT, () => {
     logger.info(`API Server running on port ${PORT}`);
   });
   ```
4. Create a standalone CLI script `lib/db/src/standalone-migrate.ts` in `@workspace/db`:
   - Include versioned migration execution (`migrate(db, { migrationsFolder: '...' })`).
   - Include idempotent reference seeding (`seedRegions()`).
5. Add script to `package.json`: `"db:migrate": "node dist/standalone-migrate.js"`.

---

### ACCEPTANCE CRITERIA
- [ ] Launching `node dist/index.mjs` starts listening on `PORT` immediately without running full table migrations or reference seeding.
- [ ] Multi-instance deployments start cleanly without database lock contention.
- [ ] Database migrations are triggered explicitly via `pnpm db:migrate` during deployment release phase.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-MIG-002: Replace Destructive Schema Push with Versioned Migrations

```markdown
# TASK SPECIFICATION: REM-MIG-002
**Title**: Replace Destructive drizzle-kit push in CI/CD Deploy Script with Versioned Migrations
**Severity**: P1 Critical
**Domain**: DevOps & Migration Safety
**Affected Files**: `scripts/post-merge.sh`

---

### OBJECTIVE
Fix the deployment script `scripts/post-merge.sh`. Replace the dangerous `pnpm --filter db push` command (which runs `drizzle-kit push --force` and risks dropping production columns) with controlled, versioned migration execution (`pnpm --filter @workspace/db run migrate`).

---

### BACKGROUND & TECHNICAL CONTEXT
- `scripts/post-merge.sh` currently contains:
  ```bash
  #!/bin/bash
  set -e
  pnpm install --frozen-lockfile
  pnpm --filter db push
  ```
- `drizzle-kit push --force` synchronizes schema by inspecting tables directly and applying aggressive DDL changes without reviewed migration files. This is unsafe for production databases.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `scripts/post-merge.sh`.
2. Replace `pnpm --filter db push` with:
   ```bash
   pnpm --filter @workspace/db run migrate
   ```
3. Ensure `@workspace/db` `package.json` contains:
   ```json
   "scripts": {
     "migrate": "node dist/migrate.js"
   }
   ```
4. Verify `lib/db/src/migrate.ts` uses `DIRECT_URL` environment variable for migration execution.

---

### ACCEPTANCE CRITERIA
- [ ] `scripts/post-merge.sh` executes versioned migrations via `pnpm --filter @workspace/db run migrate`.
- [ ] `drizzle-kit push --force` is no longer called in deployment scripts.
- [ ] Schema changes are applied predictably from versioned SQL files in `lib/db/drizzle/`.

---

### VERIFICATION COMMANDS
```bash
bash scripts/post-merge.sh --dry-run # or inspect script
```
```

---

### PROMPT REM-QUAL-001: Establish Automated Test Suite

```markdown
# TASK SPECIFICATION: REM-QUAL-001
**Title**: Initialize Automated Integration Test Suite with Vitest and Supertest
**Severity**: P1 Critical
**Domain**: Testing & Quality Assurance
**Affected Files**:
- Root `package.json`
- `artifacts/api-server/package.json`
- Create `artifacts/api-server/src/__tests__/auth.test.ts`
- Create `artifacts/api-server/src/__tests__/members.test.ts`
- Create `artifacts/api-server/src/__tests__/authorization.test.ts`

---

### OBJECTIVE
Introduce an automated integration test suite using **Vitest** and **Supertest**. Create core regression tests covering authentication provisioning, resource authorization policy (IDOR prevention), transactional member creation, offline sync replay, and badge verification auth boundaries.

---

### BACKGROUND & TECHNICAL CONTEXT
- Currently, ZERO test files (*.test.ts) exist anywhere in the monorepo.
- Regressions have repeatedly been introduced and merged undetected.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Install testing dependencies in `artifacts/api-server`:
   `pnpm --filter @workspace/api-server add -D vitest supertest @types/supertest`
2. Add test script to `package.json`: `"test": "vitest run"`.
3. Create `artifacts/api-server/src/__tests__/auth.test.ts`:
   - Test that `/api/auth/provision` on an empty table assigns `role: "agent"` unless email matches `INITIAL_ADMIN_EMAIL`.
4. Create `artifacts/api-server/src/__tests__/authorization.test.ts`:
   - Test that an agent attempting to modify an activity on a member owned by another agent receives HTTP 403 Forbidden.
   - Test that an unauthenticated GET request to `/api/members/badge/:token` receives HTTP 401 Unauthorized.
5. Create `artifacts/api-server/src/__tests__/members.test.ts`:
   - Test member creation returns HTTP 201 with generated `CAPEF-{PREFIX}-{id}` member number.

---

### ACCEPTANCE CRITERIA
- [ ] `pnpm test` executes Vitest and passes 100% of integration test cases.
- [ ] Core auth, authorization, member creation, and badge verification routes are protected by automated tests.
- [ ] Test suite runs cleanly in CI environment.

---

### VERIFICATION COMMANDS
```bash
pnpm --filter @workspace/api-server run test
```
```

---

## PHASE 2: SYSTEM HARDENING (P2 MEDIUM PRIORITY)

### PROMPT REM-API-001: Enforce Generated Zod Schemas on Express Body Parsing

```markdown
# TASK SPECIFICATION: REM-API-001
**Title**: Enforce Generated Zod Request Validation Middleware on Express Routes
**Severity**: P2 Medium
**Domain**: API Validation & Contract Enforcement
**Affected Files**:
- Create `artifacts/api-server/src/middlewares/validateBody.ts`
- Modify `artifacts/api-server/src/routes/members.ts`
- Modify `artifacts/api-server/src/routes/users.ts`

---

### OBJECTIVE
Bridge the gap between OpenAPI generated Zod schemas (`@workspace/api-zod`) and Express route handlers. Create a generic `validateBody(schema)` middleware and attach it to member and user creation/update endpoints.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Create `artifacts/api-server/src/middlewares/validateBody.ts`:
   ```typescript
   import { Request, Response, NextFunction } from "express";
   import { z } from "zod";

   export function validateBody<T>(schema: z.ZodSchema<T>) {
     return (req: Request, res: Response, next: NextFunction) => {
       const result = schema.safeParse(req.body);
       if (!result.success) {
         res.status(400).json({
           error: "Payload de requête invalide",
           details: result.error.format(),
         });
         return;
       }
       req.body = result.data;
       next();
     };
   }
   ```
2. Import generated Zod schemas from `@workspace/api-zod` into route files.
3. Attach `validateBody(CreateUserBody)` to `POST /api/users`.
4. Attach `validateBody(CreateMemberBody)` to `POST /api/members`.

---

### ACCEPTANCE CRITERIA
- [ ] Requests sending invalid data types or missing required fields return HTTP 400 Bad Request with formatted Zod error details.
- [ ] Backend route handlers receive fully parsed and typed `req.body` objects.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-API-003: Mask Internal Database Exception Details in Error Responses

```markdown
# TASK SPECIFICATION: REM-API-003
**Title**: Implement Centralized Express Error Handling Middleware to Mask Database Internals
**Severity**: P2 Medium
**Domain**: Error Handling & Information Security
**Affected Files**:
- Create `artifacts/api-server/src/middlewares/errorHandler.ts`
- Modify `artifacts/api-server/src/app.ts`

---

### OBJECTIVE
Prevent information disclosure vulnerabilities where raw PostgreSQL exception objects (`{ message, detail, constraint, table }`) are returned to HTTP clients. Implement a centralized Express error handling middleware that logs detailed error diagnostics internally via Pino while returning standardized, safe error responses to clients.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Create `artifacts/api-server/src/middlewares/errorHandler.ts`:
   ```typescript
   import { Request, Response, NextFunction } from "express";
   import { logger } from "../lib/logger";

   export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
     logger.error({ err, reqId: (req as any).id, url: req.url }, "Unhandled server error");

     const statusCode = err.status || err.statusCode || 500;
     const message = statusCode === 500 ? "Une erreur interne du serveur est survenue" : err.message;

     res.status(statusCode).json({
       error: message,
       code: err.code || "INTERNAL_ERROR",
     });
   }
   ```
2. Open `artifacts/api-server/src/app.ts`.
3. Mount `app.use(errorHandler)` as the LAST middleware after all routes.

---

### ACCEPTANCE CRITERIA
- [ ] Database exception details (`constraint`, `table`, raw SQL queries) are never exposed in HTTP responses.
- [ ] All unhandled route errors return standardized JSON `{ error, code }`.
- [ ] Full error stacks and database details are logged securely via Pino logger.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-DATA-003: Coerce Empty Strings to Null for Double/Integer DB Columns

```markdown
# TASK SPECIFICATION: REM-DATA-003
**Title**: Add Input Coercion Middleware to Coerce Empty Strings to Null for Numeric Database Columns
**Severity**: P2 Medium
**Domain**: Data Normalization & Validation
**Affected Files**: `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Prevent PostgreSQL HTTP 500 type serialization crashes when frontend forms send empty strings (`""`) for numeric fields (e.g., `regionId`, `departmentId`, `gpsLat`, `gpsLng`). Implement a normalization helper that maps `""` or `undefined` to `null`.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/members.ts`.
2. Create a normalization utility function `coerceNumericFields`:
   ```typescript
   function coerceNumeric(val: any): number | null {
     if (val === "" || val === undefined || val === null) return null;
     const num = Number(val);
     return isNaN(num) ? null : num;
   }
   ```
3. Apply `coerceNumeric` to all numeric payload fields in `POST /api/members` and `PUT /api/members/:id`:
   - `regionId = coerceNumeric(req.body.regionId)`
   - `departmentId = coerceNumeric(req.body.departmentId)`
   - `arrondissementId = coerceNumeric(req.body.arrondissementId)`
   - `gpsLat = coerceNumeric(req.body.gpsLat)`
   - `gpsLng = coerceNumeric(req.body.gpsLng)`

---

### ACCEPTANCE CRITERIA
- [ ] Submitting empty strings (`""`) for numeric fields converts them to `null` before inserting into PostgreSQL.
- [ ] PostgreSQL double precision and integer columns update smoothly without HTTP 500 type error crashes.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-SEC-001: Restrict CORS Allowlist to Strict Environment Variables

```markdown
# TASK SPECIFICATION: REM-SEC-001
**Title**: Replace Wildcard Suffix Matching in CORS Middleware with Strict Allowed Origins List
**Severity**: P2 Medium
**Domain**: Web Security & CORS Configuration
**Affected Files**: `artifacts/api-server/src/app.ts`

---

### OBJECTIVE
Eliminate overly broad CORS origin matching (`origin.endsWith(".vercel.app")`). Restrict CORS origin approval strictly to exact matches specified in `FRONTEND_URL` and `FRONTEND_URLS` environment variables.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/app.ts`.
2. Locate the CORS middleware configuration `cors({ origin: (origin, callback) => ... })`.
3. Remove suffix matching regexes (`.endsWith(".vercel.app")` and `-ephson-productions-projects.vercel.app`).
4. Construct origin allowlist strictly from environment variables and explicit localhost development ports:
   ```typescript
   const allowedOrigins = new Set([
     process.env.FRONTEND_URL,
     ...(process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(",") : []),
     "http://localhost:3000",
     "http://localhost:5173",
   ].filter(Boolean));
   ```
5. Log rejected origin attempts at `warn` level.

---

### ACCEPTANCE CRITERIA
- [ ] Unauthorized origins (including arbitrary `*.vercel.app` domains) are blocked from making credentialed cross-origin API calls.
- [ ] Configured production and local development origins function normally.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-SEC-002: Configure Express Trust Proxy & Persistent Rate Limiting

```markdown
# TASK SPECIFICATION: REM-SEC-002
**Title**: Configure Express Trust Proxy and Persistent Rate Limiting for Public Endpoints
**Severity**: P2 Medium
**Domain**: Rate Limiting & Protection
**Affected Files**:
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Fix spoofable in-memory rate limiting on public endpoints. Configure `app.set("trust proxy", 1)` in Express to correctly evaluate client IP addresses behind reverse proxies (Render / Cloudflare), and back public rate limiting with persistent DB or sliding-window stores.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/app.ts`.
2. Add `app.set("trust proxy", 1)` before routing middleware.
3. Open `artifacts/api-server/src/routes/members.ts`.
4. Refactor public rate limiter to evaluate true client IP and enforce sliding-window rate limits (e.g., max 30 requests per minute per IP).

---

### ACCEPTANCE CRITERIA
- [ ] `req.ip` reflects the true client IP address behind reverse proxies.
- [ ] Header spoofing via `X-Forwarded-For` is neutralized.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-STOR-001: Integrate Supabase Cloud Object Storage for Identity Documents & Photos

```markdown
# TASK SPECIFICATION: REM-STOR-001
**Title**: Replace Base64 JSONB Storage and Local Disk Uploads with Supabase Storage Integration
**Severity**: P2 Medium
**Domain**: Storage Architecture & Performance
**Affected Files**:
- `artifacts/api-server/src/routes/uploads.ts`
- `artifacts/capef/src/pages/members/MemberForm.tsx`

---

### OBJECTIVE
Eliminate database bloat caused by storing multi-hundred-KB base64 strings in JSONB columns (`physique_data`, `morale_data`). Integrate Supabase Storage API for uploading CNI documents, member photos, and signatures, storing immutable cloud URLs in PostgreSQL instead of base64 data URLs.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Configure a private Supabase Storage bucket `member-documents`.
2. Refactor `POST /api/uploads` in `artifacts/api-server/src/routes/uploads.ts`:
   - Validate file MIME type (`image/jpeg`, `image/png`, `application/pdf`) and magic bytes.
   - Enforce max file size limit (5MB).
   - Upload file buffer to Supabase Storage bucket via `@supabase/supabase-js`.
   - Return public/signed object URL `{ url: "https://.../member-documents/photo_123.jpg" }`.
3. Update `MemberForm.tsx` to upload files via `/api/uploads` and store returned URLs in member payload fields.

---

### ACCEPTANCE CRITERIA
- [ ] Member photos, CNI documents, and signatures are stored as cloud object URLs in PostgreSQL.
- [ ] JSONB column sizes remain small (< 10KB per member).
- [ ] Local disk file writes are eliminated.
- [ ] `pnpm typecheck` and `pnpm --filter capef run build` succeed.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
pnpm --filter capef run build
```
```

---

### PROMPT REM-PERF-001: Eliminate N+1 Query Loops & Stream Excel Exports

```markdown
# TASK SPECIFICATION: REM-PERF-001
**Title**: Refactor Member Formatting to Relational JOINs and Stream Excel Exports in Cursor Batches
**Severity**: P2 Medium
**Domain**: Performance & Database Scalability
**Affected Files**: `artifacts/api-server/src/routes/members.ts`

---

### OBJECTIVE
Eliminate severe N+1 query patterns in `formatMember` (which executes 5+ queries per member). Refactor `GET /api/members/export` to fetch member records in cursor batches of 500 using relational SQL `JOIN`s, streaming the generated Excel workbook directly to the HTTP response stream.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `artifacts/api-server/src/routes/members.ts`.
2. Refactor `formatMember` to accept pre-joined SQL records containing region, department, and arrondissement names.
3. Refactor `GET /api/members/export`:
   - Replace unbounded `db.select().from(membersTable)` loop with batch pagination (`LIMIT 500 OFFSET offset`).
   - Use ExcelJS streaming workbook writer (`new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res })`).
   - Pipe rows continuously to HTTP response output.

---

### ACCEPTANCE CRITERIA
- [ ] Member listing and formatting queries execute via single relational SQL `JOIN` queries.
- [ ] Member export handles tens of thousands of records without memory spikes or connection pool exhaustion.
- [ ] `pnpm typecheck` succeeds.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
```
```

---

### PROMPT REM-API-002: Synchronize OpenAPI Contract & Re-run Codegen

```markdown
# TASK SPECIFICATION: REM-API-002
**Title**: Synchronize OpenAPI Contract, Add Security Schemes, and Re-run Orval Codegen
**Severity**: P2 Medium
**Domain**: API Contract & Toolchain
**Affected Files**: `lib/api-spec/openapi.yaml`

---

### OBJECTIVE
Eliminate contract drift in `lib/api-spec/openapi.yaml`. Add missing `securitySchemes` (Bearer / Clerk auth), remove dead response schemas (`ExportResult`), align property definitions with Express runtime responses, and re-run Orval codegen.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. Open `lib/api-spec/openapi.yaml`.
2. Add `securitySchemes` section under `components`:
   ```yaml
   components:
     securitySchemes:
       bearerAuth:
         type: http
         scheme: bearer
         bearerFormat: JWT
   ```
3. Attach `security: - bearerAuth: []` to protected endpoints.
4. Remove dead schemas and synchronize property types.
5. Run API codegen: `pnpm --filter @workspace/api-spec run codegen`.

---

### ACCEPTANCE CRITERIA
- [ ] `openapi.yaml` contains complete security schemes and accurate schemas.
- [ ] Generated Zod schemas and React client hooks are regenerated cleanly.
- [ ] `pnpm --filter @workspace/api-spec run codegen` completes without errors.

---

### VERIFICATION COMMANDS
```bash
pnpm --filter @workspace/api-spec run codegen
pnpm typecheck
```
```

---

## PHASE 3: CLEANUP & OPTIMIZATION (P3 LOW PRIORITY)

### PROMPT REM-UX-001 / REP-001: Path Validation, Offline Banners & Dashboard Aggregations

```markdown
# TASK SPECIFICATION: REM-UX-001 / REP-001
**Title**: Path Parameter Integer Validation, Offline UI Banner Updates & Dashboard Metric Aggregation
**Severity**: P3 Low
**Domain**: API Hygiene, UX & Reporting Metrics
**Affected Files**:
- `artifacts/api-server/src/routes/members.ts`
- `artifacts/api-server/src/routes/dashboard.ts`
- `artifacts/capef/src/components/members/ActivityWizard.tsx`

---

### OBJECTIVE
Fix minor API hygiene issues and UI copy misalignments:
1. Validate integer path parameters (`/members/:id`) to return HTTP 400 Bad Request on `NaN` instead of HTTP 500 crashes.
2. Update offline UI banners in `ActivityWizard.tsx` to accurately state queue sync status.
3. Refactor dashboard activity sector counts in `dashboard.ts` to aggregate over the multi-activity `member_activities` table.

---

### STEP-BY-STEP IMPLEMENTATION REQUIREMENTS
1. In `artifacts/api-server/src/routes/members.ts`:
   - Validate `const id = parseInt(req.params.id, 10); if (isNaN(id)) return res.status(400).json({ error: "ID membre invalide" });`.
2. In `artifacts/capef/src/components/members/ActivityWizard.tsx`:
   - Update toast/banner notifications to state: "Activité sauvegardée localement. Elle sera transmise lors de la reconnexion."
3. In `artifacts/api-server/src/routes/dashboard.ts`:
   - Query activity counts by joining `memberActivitiesTable` instead of grouping by `membersTable.category`.

---

### ACCEPTANCE CRITERIA
- [ ] Non-numeric IDs (`/api/members/abc`) return HTTP 400 Bad Request.
- [ ] Offline UI copy accurately reflects real synchronization engine behavior.
- [ ] Dashboard sector statistics reflect multi-activity member distributions.
- [ ] `pnpm typecheck` and `pnpm --filter capef run build` succeed.

---

### VERIFICATION COMMANDS
```bash
pnpm typecheck
pnpm --filter capef run build
```
```
