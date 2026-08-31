# CAPEF DIGITAL ENROLMENT
## MASTER REMEDIATION PLAN — TASK EXECUTION PROMPTS

This document contains detailed, self-contained, copy-pasteable engineering prompts for every task in the **CAPEF Digital Enrolment Master Remediation Plan** (`AUDIT_REMEDIATION_PLAN.md`). Each prompt is structured so that any AI coding agent (e.g., Jules, Claude, Cursor) or software engineer can execute the task autonomously with complete context, technical requirements, acceptance criteria, and verification commands, enforcing the strict production quality gates defined in Correction 06.

---

## TABLE OF CONTENTS

### PHASE 0: IMMEDIATE CONTAINMENT (P0 BLOCKERS)
1. [PROMPT REM-DATA-001: Production-Grade Offline Synchronization Protocol](#prompt-rem-data-001-production-grade-offline-synchronization-protocol)
2. [PROMPT REM-AUTH-001: Remove Implicit First-User Admin Bootstrap](#prompt-rem-auth-001-remove-implicit-first-user-admin-bootstrap)
3. [PROMPT REM-AUTHZ-001: Implement Centralized Member Resource Authorization Policy](#prompt-rem-authz-001-implement-centralized-member-resource-authorization-policy)

### PHASE 1: CRITICAL STABILIZATION (P1 HIGH PRIORITY)
4. [PROMPT REM-DATA-002: Implement Transactional Enrollment & Sequence-Based Member Number Allocation](#prompt-rem-data-002-implement-transactional-enrollment--sequence-based-member-number-allocation)
5. [PROMPT REM-DB-001: Implement Business-Driven Relational Integrity & Preflight Data Safety](#prompt-rem-db-001-implement-business-driven-relational-integrity--preflight-data-safety)
6. [PROMPT REM-PRIV-001: Implement Badge Verification Authorization & Require Sign-In](#prompt-rem-priv-001-implement-badge-verification-authorization--require-sign-in)
7. [PROMPT REM-PRIV-002: Escape XML Entities in SVG Badge Templates](#prompt-rem-priv-002-escape-xml-entities-in-svg-badge-templates)
8. [PROMPT REM-AUTH-002: Repair Clerk Agent Invitation & Identity Lifecycle](#prompt-rem-auth-002-repair-clerk-agent-invitation--identity-lifecycle)
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

### PROMPT REM-DATA-001: Production-Grade Offline Synchronization Protocol
*(Unchanged)*

### PROMPT REM-AUTH-001: Remove Implicit First-User Admin Bootstrap
*(Unchanged)*

### PROMPT REM-AUTHZ-001: Implement Centralized Member Resource Authorization Policy
*(Unchanged)*

---

## PHASE 1: CRITICAL STABILIZATION (P1 HIGH PRIORITY)

### PROMPT REM-DATA-002: Implement Transactional Enrollment & Sequence-Based Member Number Allocation
*(Unchanged)*

### PROMPT REM-DB-001: Implement Business-Driven Relational Integrity & Preflight Data Safety
*(Unchanged)*

### PROMPT REM-PRIV-001: Implement Badge Verification Authorization & Require Sign-In
*(Unchanged)*

### PROMPT REM-PRIV-002: Escape XML Entities in SVG Badge Templates
*(Unchanged)*

### PROMPT REM-AUTH-002: Repair Clerk Agent Invitation & Identity Lifecycle
*(Unchanged)*

### PROMPT REM-MIG-001: Decouple Migration Execution from Server Startup
*(Unchanged)*

### PROMPT REM-MIG-002: Replace Destructive Schema Push with Versioned Migrations
*(Unchanged)*

### PROMPT REM-QUAL-001: Establish Automated Test Suite (Aligned with Quality Gates)

```markdown
# TASK SPECIFICATION: REM-QUAL-001
**Title**: Initialize Automated Integration Test Suite Enforcing CAPEF Production Quality Gates
**Severity**: P1 Critical
**Domain**: Testing, Quality Assurance & Security Regression
**Affected Files**:
- Root `package.json`
- `artifacts/api-server/package.json`
- Create `artifacts/api-server/src/__tests__/auth.test.ts`
- Create `artifacts/api-server/src/__tests__/members.test.ts`
- Create `artifacts/api-server/src/__tests__/authorization.test.ts`
- Create `artifacts/api-server/src/__tests__/offline.test.ts`
- Create `artifacts/api-server/src/__tests__/enrollment-concurrency.test.ts`
- Create `artifacts/api-server/src/__tests__/relational-integrity.test.ts`

---

### OBJECTIVE
Introduce an automated integration test suite using **Vitest** and **Supertest** enforcing the 9 CAPEF Production Quality Gates specified in Correction 06.

---

### REQUIRED REGRESSION SUITES & TEST CASES
1. **Security & Authorization Gate (`authorization.test.ts`)**:
   - `Agent A -> Member B activity mutation -> 403 Forbidden`
   - `Agent A -> Member B line item mutation -> 403 Forbidden`
   - `Agent A -> Member B badge verification -> 200 OK + full member profile`
   - `Anonymous -> badge verification API -> 401 Unauthorized`
   - `Anonymous -> protected member endpoint -> 401 Unauthorized`
2. **Authentication Gate (`auth.test.ts`)**:
   - `First user signup on empty table without INITIAL_ADMIN_EMAIL -> role: agent (NOT admin)`
3. **Data Integrity & Concurrency Gate (`enrollment-concurrency.test.ts`)**:
   - `10 concurrent POST /api/members creation requests` -> 10 successful members, 10 unique sequential numbers (`CAPEF-AGR-000001`...), 0 `"PENDING"` members, 0 orphan primary activities.
4. **Offline Sync & Idempotency Gate (`offline.test.ts`)**:
   - Replaying identical `clientOperationId` multiple times -> returns cached HTTP 200 result with 0 duplicate DB records.
   - HTTP 500 response -> retains action in local storage for retry.
   - HTTP 400 validation error -> moves action to error log without infinite retry loop.
5. **Database Relational Integrity Gate (`relational-integrity.test.ts`)**:
   - Attempting to delete a user with assigned members -> fails with `ON DELETE RESTRICT` error.
   - Deleting a member -> `ON DELETE CASCADE` automatically deletes associated activities and line items.

---

### ACCEPTANCE CRITERIA
- [ ] `pnpm test` executes Vitest and passes 100% of integration test cases.
- [ ] Mandatory security regression tests pass cleanly.
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
*(Unchanged)*

### PROMPT REM-API-003: Mask Internal Database Exception Details in Error Responses
*(Unchanged)*

### PROMPT REM-DATA-003: Coerce Empty Strings to Null for Double/Integer DB Columns
*(Unchanged)*

### PROMPT REM-SEC-001: Restrict CORS Allowlist to Strict Environment Variables
*(Unchanged)*

### PROMPT REM-SEC-002: Configure Express Trust Proxy & Persistent Rate Limiting
*(Unchanged)*

### PROMPT REM-STOR-001: Integrate Supabase Cloud Object Storage for Identity Documents & Photos
*(Unchanged)*

### PROMPT REM-PERF-001: Eliminate N+1 Query Loops & Stream Excel Exports
*(Unchanged)*

### PROMPT REM-API-002: Synchronize OpenAPI Contract & Re-run Codegen
*(Unchanged)*

---

## PHASE 3: CLEANUP & OPTIMIZATION (P3 LOW PRIORITY)

### PROMPT REM-UX-001 / REP-001: Path Validation, Offline Banners & Dashboard Aggregations
*(Unchanged)*
