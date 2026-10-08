import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { syncEngine } from '../sync-engine';
import { offlineRepository } from '../offline-repository';

vi.mock('@workspace/api-client-react', () => ({
  customFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { customFetch } from '@workspace/api-client-react';

describe('Activity ID Reconciliation & Relational Integrity Tests', () => {
  const userId = 'agent_activity_id_test_user';

  beforeEach(async () => {
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    vi.clearAllMocks();
  });

  it('Test 1 & 2 — Uses PostgreSQL serverId=80 and member serverId=36, never Dexie auto-increment id=12', async () => {
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    const memberLocalId = crypto.randomUUID();
    const actLocalId = crypto.randomUUID();

    // Insert Dexie records where Dexie internal auto-increment id is 12 (or whatever Dexie assigns)
    const dexieActId = await db.activities.put({
      localId: actLocalId,
      memberLocalId,
      userId,
      activityType: 'agriculteur',
      isPrimary: true,
      serverId: 80, // PostgreSQL serverId
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });

    // Enqueue an update activity action
    await offlineRepository.enqueue(
      'update_activity',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        memberId: 36,
        activityId: 80, // Explicit serverId
        data: { village: 'Yaoundé Centre' },
        version: 1,
        _local: { memberLocalId, activityLocalId: actLocalId },
      },
      userId
    );

    // Save mapping for member
    await db.entityMappings.put({
      localId: memberLocalId,
      entityType: 'member',
      serverId: 36,
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    });

    // Save mapping for activity
    await db.entityMappings.put({
      localId: actLocalId,
      entityType: 'activity',
      serverId: 80,
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    });

    (customFetch as any).mockResolvedValueOnce({ id: 80, version: 2 });

    const result = await syncEngine.syncNow(userId);
    expect(result.successCount).toBe(1);

    // Verify PUT request URL uses /api/members/36/activities/80
    expect(customFetch).toHaveBeenCalledWith(
      '/api/members/36/activities/80',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    expect(customFetch).not.toHaveBeenCalledWith(
      expect.stringContaining(`/activities/${dexieActId}`),
      expect.anything()
    );
  });

  it('Test 3 & 4 — Online/Offline Sync reconciliation immediately sets Dexie activity serverId and line item target', async () => {
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    const memberLocalId = crypto.randomUUID();
    const actLocalId = crypto.randomUUID();
    const lineLocalId = crypto.randomUUID();

    // Map member localId -> serverId 36
    await db.entityMappings.put({
      localId: memberLocalId,
      entityType: 'member',
      serverId: 36,
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    });

    // Save pending activity in Dexie
    await db.activities.put({
      localId: actLocalId,
      memberLocalId,
      userId,
      activityType: 'pecheur',
      isPrimary: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Save pending line item in Dexie
    await db.lineItems.put({
      localId: lineLocalId,
      activityLocalId: actLocalId,
      userId,
      speciesPêche: 'Capitaine',
      productionFcfa: 200000,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Enqueue create_activity
    await offlineRepository.enqueue(
      'create_activity',
      {
        memberRef: memberLocalId,
        memberId: 36,
        data: { activityType: 'pecheur', localId: actLocalId },
        _local: { memberLocalId, localId: actLocalId },
      },
      userId
    );

    // Enqueue create_line_item referencing actLocalId
    await offlineRepository.enqueue(
      'create_line_item',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        data: { speciesPêche: 'Capitaine', productionFcfa: 200000, localId: lineLocalId },
        _local: { memberLocalId, activityLocalId: actLocalId, localId: lineLocalId },
      },
      userId
    );

    (customFetch as any)
      .mockResolvedValueOnce({ id: 95, activityType: 'pecheur' }) // create_activity -> serverId 95
      .mockResolvedValueOnce({ id: 501, speciesPêche: 'Capitaine' }); // create_line_item -> serverId 501

    const result = await syncEngine.syncNow(userId);
    expect(result.successCount).toBe(2);

    // Check customFetch calls
    expect(customFetch).toHaveBeenNthCalledWith(
      1,
      '/api/members/36/activities',
      expect.objectContaining({ method: 'POST' })
    );

    expect(customFetch).toHaveBeenNthCalledWith(
      2,
      '/api/members/36/activities/95/line-items',
      expect.objectContaining({ method: 'POST' })
    );

    // Check Dexie records updated
    const actRecord = await db.activities.where({ localId: actLocalId }).first();
    expect(actRecord?.serverId).toBe(95);
    expect(actRecord?.syncStatus).toBe('synced');

    const lineRecord = await db.lineItems.where({ localId: lineLocalId }).first();
    expect(lineRecord?.serverId).toBe(501);
    expect(lineRecord?.syncStatus).toBe('synced');
  });

  it('Test 5 — Offline dependency chain resolves parent mapping without remaining in waiting_for_parent', async () => {
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    const memberLocalId = crypto.randomUUID();
    const actLocalId = crypto.randomUUID();
    const lineLocalId = crypto.randomUUID();

    // Map member localId -> serverId 10
    await db.entityMappings.put({
      localId: memberLocalId,
      entityType: 'member',
      serverId: 10,
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    });

    // Put local activity in Dexie
    await db.activities.put({
      localId: actLocalId,
      memberLocalId,
      userId,
      activityType: 'eleveur',
      isPrimary: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Enqueue create_activity
    await offlineRepository.enqueue(
      'create_activity',
      {
        memberRef: memberLocalId,
        data: { activityType: 'eleveur', localId: actLocalId },
        _local: { memberLocalId, localId: actLocalId },
      },
      userId
    );

    // Enqueue create_line_item
    await offlineRepository.enqueue(
      'create_line_item',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        data: { species: 'Bovins', cheptelSize: 50, localId: lineLocalId },
        _local: { memberLocalId, activityLocalId: actLocalId, localId: lineLocalId },
      },
      userId
    );

    (customFetch as any)
      .mockResolvedValueOnce({ id: 102 })
      .mockResolvedValueOnce({ id: 202 });

    const syncRes = await syncEngine.syncNow(userId);
    expect(syncRes.successCount).toBe(2);

    const pending = await offlineRepository.getPending(userId);
    expect(pending.length).toBe(0);

    const mappedAct = await db.entityMappings.where({ localId: actLocalId }).first();
    expect(mappedAct?.serverId).toBe(102);
  });

  it('Test 6 — Local drafts are isolated per user on shared devices', async () => {
    const memberLocalId = crypto.randomUUID();
    const userADraftActId = crypto.randomUUID();

    // User A creates a member and a local activity draft
    await db.members.put({
      localId: memberLocalId,
      userId: 'user_A',
      memberNumber: 'TMP-001',
      memberType: 'physique',
      category: 'agriculteur',
      displayName: 'Agent A Member',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    await db.activities.put({
      localId: userADraftActId,
      memberLocalId,
      userId: 'user_A',
      activityType: 'agriculteur',
      isPrimary: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Query member by user_B
    const { memberRepository } = await import('../repositories/MemberRepository');
    const memberForUserB = await memberRepository.getMemberById(memberLocalId, 'user_B');

    // User B should not see User A's un-synced draft member
    expect(memberForUserB).toBeNull();

    // User A queries member -> retrieves their draft
    const memberForUserA = await memberRepository.getMemberById(memberLocalId, 'user_A');
    expect(memberForUserA).not.toBeNull();
    expect(memberForUserA?.activities.length).toBe(1);
    expect(memberForUserA?.activities[0].localId).toBe(userADraftActId);
  });

  it('Test 7 — Historical duplicate local activities cleanup merges duplicates cleanly', async () => {
    const memberLocalId = crypto.randomUUID();
    const act1LocalId = crypto.randomUUID();
    const act2LocalId = crypto.randomUUID();

    await db.members.put({
      localId: memberLocalId,
      userId,
      memberNumber: 'TMP-002',
      memberType: 'physique',
      category: 'forestier',
      displayName: 'Duplicate Test Member',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Activity 1: Synced server record
    await db.activities.put({
      localId: act1LocalId,
      memberLocalId,
      userId,
      activityType: 'forestier',
      isPrimary: true,
      serverId: 57,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });

    // Activity 2: Unsynced duplicate local draft created by previous bug
    await db.activities.put({
      localId: act2LocalId,
      memberLocalId,
      userId,
      activityType: 'forestier',
      isPrimary: true,
      serverId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Line item linked to duplicate
    const lineLocalId = crypto.randomUUID();
    await db.lineItems.put({
      localId: lineLocalId,
      activityLocalId: act2LocalId,
      userId,
      essence: 'Ebene',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    const { memberRepository } = await import('../repositories/MemberRepository');
    const cleanedCount = await memberRepository.cleanupDuplicateActivities(userId);

    expect(cleanedCount).toBe(1);

    // Verify only 1 canonical activity remains
    const remainingActs = await db.activities.where('memberLocalId').equals(memberLocalId).toArray();
    expect(remainingActs.length).toBe(1);
    expect(remainingActs[0].localId).toBe(act1LocalId);
    expect(remainingActs[0].serverId).toBe(57);

    // Verify line item was re-linked to canonical act1LocalId
    const relinkedLine = await db.lineItems.where('localId').equals(lineLocalId).first();
    expect(relinkedLine?.activityLocalId).toBe(act1LocalId);
    expect(relinkedLine?.activityServerId).toBe(57);
  });
});
