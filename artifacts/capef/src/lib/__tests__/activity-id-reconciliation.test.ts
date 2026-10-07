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
});
