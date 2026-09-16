import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { DexieOfflineQueueRepository } from '../offline-repository';
import { db } from '../repositories/CapefDexieDatabase';
import { DexieSyncRepository } from '../repositories/SyncRepository';
import { DexieMemberRepository } from '../repositories/MemberRepository';

describe('Offline Member Edit & Queue Enqueue Unit Tests', () => {
  const syncRepo = new DexieSyncRepository();
  const queueRepo = new DexieOfflineQueueRepository(syncRepo);
  const memberRepo = new DexieMemberRepository();
  const testUserId = 'user_agent_test_update_offline';

  beforeEach(async () => {
    await db.operations.clear();
    await db.members.clear();
  });

  it('enqueues update_member operation with clientOperationId and updates local Dexie member record', async () => {
    // Seed initial member in Dexie DB
    const initialMember = {
      id: 101,
      localId: 'local_101',
      userId: testUserId,
      memberNumber: 'CAPEF-AGR-000101',
      memberType: 'physique',
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      status: 'en_attente',
      regionId: 1,
      departmentId: 1,
      arrondissementId: 1,
      createdById: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
      physiqueData: { nom: 'FOKOU', prenom: 'Paul' },
    };
    await memberRepo.saveMember(initialMember as any);

    // Perform offline update
    const updatePayload = {
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      regionId: 1,
      departmentId: 1,
      arrondissementId: 1,
      village: 'Village Nord',
      physiqueData: { nom: 'FOKOU', prenom: 'Paul Modified' },
    };

    const queueItem = await queueRepo.enqueue('update_member', { id: 101, data: updatePayload }, testUserId);

    expect(queueItem).toBeDefined();
    expect(queueItem.operationType).toBe('update_member');
    expect(queueItem.clientOperationId).toBeDefined();
    expect(queueItem.clientOperationId.length).toBeGreaterThan(10);
    expect(queueItem.payload).toEqual({ id: 101, data: updatePayload });

    // Update local Dexie record to simulate optimistic update
    await memberRepo.saveMember({
      ...initialMember,
      ...updatePayload,
      id: 101,
      updatedAt: new Date().toISOString(),
    } as any);

    // Verify member in Dexie DB reflects the optimistic offline update
    const updatedLocal = await memberRepo.getMemberByLocalId('local_101', testUserId);
    expect(updatedLocal).toBeDefined();
    expect(updatedLocal?.village).toBe('Village Nord');
    expect((updatedLocal?.physiqueData as any)?.prenom).toBe('Paul Modified');

    // Verify pending queue count
    const pending = await queueRepo.getPending(testUserId);
    expect(pending.length).toBe(1);
    expect(pending[0].clientOperationId).toBe(queueItem.clientOperationId);
  });
});
