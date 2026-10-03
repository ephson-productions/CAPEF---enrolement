import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../repositories/CapefDexieDatabase';
import { syncEngine } from '../../sync-engine';
import { offlineRepository } from '../../offline-repository';
import { memberRepository } from '../../repositories/MemberRepository';

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

describe('Phase P7 — Offline Activity & Production Workflow Integration Tests', () => {
  const userId = 'agent_p7_offline_user';

  beforeEach(async () => {
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    vi.clearAllMocks();
  });

  it('1. Full Offline CUJ: Create Member -> Create Activity -> Add 2 Productions -> Reload -> Delete 1 Line -> Reconnect -> Exactly 1 Member, 1 Activity, 1 Line Item on Server', async () => {
    // 1. Airplane mode
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(false);

    // 2. Create Member Offline
    const memberLocalId = crypto.randomUUID();
    const { member } = await memberRepository.saveLocalMember(userId, {
      localId: memberLocalId,
      memberType: 'physique',
      category: 'agriculteur',
      physiqueData: { nom: 'Mbida', prenom: 'Samuel' },
      status: 'incomplet',
    });

    await offlineRepository.enqueue(
      'create_member',
      {
        memberType: 'physique',
        category: 'agriculteur',
        physiqueData: { nom: 'Mbida', prenom: 'Samuel' },
        localId: memberLocalId,
        _local: { localId: memberLocalId },
      },
      userId
    );

    // 3. Obtain existing Primary Activity Offline (created by saveLocalMember)
    const existingActs = await db.activities.where('memberLocalId').equals(memberLocalId).toArray();
    const actLocalId = existingActs.length > 0 ? existingActs[0].localId : crypto.randomUUID();

    if (existingActs.length === 0) {
      await db.activities.put({
        localId: actLocalId,
        memberLocalId,
        userId,
        activityType: 'agriculteur',
        isPrimary: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
    }

    await offlineRepository.enqueue(
      'create_activity',
      {
        memberRef: memberLocalId,
        memberId: 0,
        data: { activityType: 'agriculteur', isPrimary: true, localId: actLocalId },
        _local: { memberLocalId, localId: actLocalId },
      },
      userId
    );

    // 4. Add 2 Productions Offline
    const line1LocalId = crypto.randomUUID();
    const line2LocalId = crypto.randomUUID();

    await db.lineItems.put({
      localId: line1LocalId,
      activityLocalId: actLocalId,
      userId,
      cropCategory: 'cereales',
      cropName: 'Maïs',
      superficieHa: 2.5,
      productionQuantity: 50,
      productionUnit: 'sac_50kg',
      productionFcfa: 750000,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    await offlineRepository.enqueue(
      'create_line_item',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        data: {
          cropCategory: 'cereales',
          cropName: 'Maïs',
          superficieHa: 2.5,
          productionQuantity: 50,
          productionUnit: 'sac_50kg',
          productionFcfa: 750000,
          localId: line1LocalId,
        },
        _local: { memberLocalId, activityLocalId: actLocalId, localId: line1LocalId },
      },
      userId
    );

    await db.lineItems.put({
      localId: line2LocalId,
      activityLocalId: actLocalId,
      userId,
      cropCategory: 'legumes',
      cropName: 'Tomate',
      superficieHa: 1.0,
      productionQuantity: 100,
      productionUnit: 'cagette',
      productionFcfa: 500000,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    await offlineRepository.enqueue(
      'create_line_item',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        data: {
          cropCategory: 'legumes',
          cropName: 'Tomate',
          superficieHa: 1.0,
          productionQuantity: 100,
          productionUnit: 'cagette',
          productionFcfa: 500000,
          localId: line2LocalId,
        },
        _local: { memberLocalId, activityLocalId: actLocalId, localId: line2LocalId },
      },
      userId
    );

    // Update local member status incomplet -> en_attente
    await memberRepository.updateLocalMember(memberLocalId, userId, { status: 'en_attente' });

    // 5. Simulate App Reload / Page Rehydration
    const reloadedMember = await memberRepository.getMemberById(memberLocalId, userId);
    expect(reloadedMember).not.toBeNull();
    expect(reloadedMember?.status).toBe('en_attente');
    expect(reloadedMember?.activities.length).toBe(1);
    expect(reloadedMember?.activities[0].lineItems.length).toBe(2);

    // 6. Delete 1 Line Item Offline (line2: Tomate)
    await db.lineItems.where('localId').equals(line2LocalId).delete();
    await offlineRepository.enqueue(
      'delete_line_item',
      {
        memberRef: memberLocalId,
        activityRef: actLocalId,
        itemRef: line2LocalId,
        _local: { memberLocalId, activityLocalId: actLocalId, localId: line2LocalId },
      },
      userId
    );

    const reloadedMemberAfterDelete = await memberRepository.getMemberById(memberLocalId, userId);
    expect(reloadedMemberAfterDelete?.activities[0].lineItems.length).toBe(1);

    // 7. Reconnect Online
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    // Mock server responses
    (customFetch as any)
      .mockResolvedValueOnce({ id: 101, memberNumber: 'CAPEF-AGR-00101' }) // create_member
      .mockResolvedValueOnce({ id: 201, activityType: 'agriculteur' }) // create_activity
      .mockResolvedValueOnce({ id: 301, cropName: 'Maïs', productionFcfa: 750000 }); // create_line_item 1

    // 8. Execute Sync Engine
    const syncResult = await syncEngine.syncNow(userId);

    expect(syncResult.successCount).toBe(3); // member + activity + line1 (line2 create+delete coalesced locally!)

    // Verify Server Calls
    expect(customFetch).toHaveBeenCalledTimes(3);

    // Call 1: POST /api/members
    expect(customFetch).toHaveBeenNthCalledWith(
      1,
      '/api/members',
      expect.objectContaining({ method: 'POST' })
    );

    // Call 2: POST /api/members/101/activities
    expect(customFetch).toHaveBeenNthCalledWith(
      2,
      '/api/members/101/activities',
      expect.objectContaining({ method: 'POST' })
    );

    // Call 3: POST /api/members/101/activities/201/line-items (Maïs)
    expect(customFetch).toHaveBeenNthCalledWith(
      3,
      '/api/members/101/activities/201/line-items',
      expect.objectContaining({ method: 'POST' })
    );

    // 9. Verify Local Dexie State after reconciliation
    const finalMember = await memberRepository.getMemberById(memberLocalId, userId);
    expect(finalMember?.serverId).toBe(101);
    expect(finalMember?.syncStatus).toBe('synced');

    const pendingOps = await offlineRepository.getPending(userId);
    expect(pendingOps.length).toBe(0);
  });
});
