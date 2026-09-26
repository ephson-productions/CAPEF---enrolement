# Offline Activity Questionnaire Architecture & Synchronization Design

## 1. Overview & Objectives
This document specifies the durable offline-first architecture for CAPEF Activity Forms and Member Enrollments.
An agent operating without a network connection can:
1. Enroll a new member offline.
2. Complete the full activity questionnaire (including primary and secondary activities, associated parcel crops, and multi-product rows).
3. View the recap (Step 3) and close/relaunch the application.
4. Seamlessly synchronize all enqueued operations upon reconnecting without data loss, user context leakage, or duplicates.

---

## 2. Local Data Model & Entity Reference Format
Every client-side entity generated offline receives a UUID `localId`:
- **Local Member**: `localId` (e.g., `member_uuid_123`)
- **Local Activity**: `localId` (e.g., `activity_uuid_456`)
- **Local Line Item**: `localId` (e.g., `item_uuid_789`)

### Entity Reference Representation
Payloads targeting parent entities express references as polymorphic discriminators:
```typescript
export type EntityRef =
  | { kind: 'server'; id: number }
  | { kind: 'local'; localId: string };
```
For example, a child line item associated with a principal parcel crop references its parent as:
```json
{
  "parentLineItemRef": { "kind": "local", "localId": "principal_crop_uuid_101" }
}
```

---

## 3. User Isolation & Queue Scoping
- All queue reads and writes (`enqueue`, `getPending`, `syncNow`) strictly scope operations by the current Clerk `userId`.
- If Clerk authentication is unhydrated offline, `localStorage` caches the `lastKnownUserId` as a fallback.
- `anonymous_user` operations are automatically migrated to the first authenticated user's scope upon initial load.
- When an agent signs out with unsynced local queue items (`pendingCount > 0`), a blocking confirmation modal warns that unsynced items remain associated with their account on the device.

---

## 4. Replay Algorithm & Reference Resolution
Operations in Dexie IndexedDB `operations` store are sorted by `id` ascending (FIFO).

### Replay Lifecycle
1. **Reference Resolution**:
   - `resolveRef(type, ref)` checks Dexie `entityMappings` (`localId` -> `serverId`).
   - If `ref.kind === 'local'` and `entityMappings` lacks an entry (e.g., because parent failed), replay throws `UnresolvedDependencyError`. The operation is marked as `failed` with `lastError: 'dependency_failed'` without issuing an HTTP network request.
2. **Idempotent HTTP Execution**:
   - Headers include `X-Client-Operation-ID: <clientOperationId>`.
3. **Atomic Post-Sync Transaction**:
   - Upon receiving HTTP 200/201 response, inside a single Dexie transaction:
     - Map `localId` -> `serverId` in `entityMappings`. For `create_member`, also extract `_local.primaryActivityLocalId` from payload and map to `response.activities.find(a => a.isPrimary).id`.
     - Remove the completed operation from `operations` queue.
4. **Server-Side Idempotency Check**:
   - Replaying a pre-processed `clientOperationId` returns the cached response. `resolveRef` updates `entityMappings` safely without duplicate DB records.

---

## 5. Queue Compaction & Failure Matrix

### Queue Compaction
When an agent deletes a local activity or line item that has not yet synced to the server (still has `kind: 'local'`), the client removes the pending local creation operations from the Dexie queue directly instead of enqueueing a `delete` action.

### Failure Handling Matrix
| Status / Scenario | Action |
| :--- | :--- |
| **Network Error / HTTP 5xx** | Pause replay loop, increment `retryCount`, schedule exponential backoff. Retain queue items. |
| **HTTP 401 / 403** | Auth error. Pause sync until re-authenticated. |
| **HTTP 400 Terminal Error** | Mark operation as `failed`. Automatically cascade `dependency_failed` to all child operations. |
| **HTTP 409 Conflict** | Mark operation as `failed` with conflict context for manual resolution. |

---

## 6. Dexie Schema Versioning Plan
Existing Dexie Database Version: `v2`
Version `v3` Schema:
```typescript
this.version(3).stores({
  members: '++id, memberNumber, createdById, status',
  regions: 'id, name',
  departments: 'id, regionId, name',
  arrondissements: 'id, departmentId, name',
  operations: '++id, clientOperationId, userId, status, createdAt',
  entityMappings: 'localId, entityType, serverId, createdAt',
});
```

---

## 7. Target File Perimeter
- `docs/offline-activities-design.md`
- `artifacts/capef/src/lib/offline-repository.ts`
- `artifacts/capef/src/lib/offline-sync.tsx`
- `artifacts/capef/src/lib/sync-engine.ts`
- `artifacts/capef/src/lib/id-reconciliation-service.ts`
- `artifacts/capef/src/lib/offline-activity-service.ts`
- `artifacts/capef/src/lib/repositories/CapefDexieDatabase.ts`
- `artifacts/capef/src/pages/members/MemberNew.tsx`
- `artifacts/capef/src/components/members/ActivityWizard.tsx`
- `artifacts/api-server/src/routes/members.ts`
- `artifacts/capef/src/lib/offline/__tests__/offline-activity-sync.test.ts`
