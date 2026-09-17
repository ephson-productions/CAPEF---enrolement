import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { SyncEngine } from '../sync-engine';
import { DexieOfflineQueueRepository } from '../offline-repository';
import { db } from '../repositories/CapefDexieDatabase';
import { DexieSyncRepository } from '../repositories/SyncRepository';
import { idReconciliationService } from '../id-reconciliation-service';

describe('Phase 6 — Entity Mapping ID Reconciliation & App Crash Recovery Tests', () => {
  const syncRepo = new DexieSyncRepository();
  const queueRepo = new DexieOfflineQueueRepository(syncRepo);
  const testUserId = 'user_id_reconciliation_test';

  beforeEach(async () => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
    await db.operations.clear();
    await db.entityMappings.clear();
    vi.restoreAllMocks();
  });

  it('persists member localId to serverId mapping in IndexedDB and resolves child activity and line item during crash recovery', async () => {
    const localMemberUuid = 'local_member_uuid_999';
    const localActivityUuid = 'local_activity_uuid_888';
    const localLineItemUuid = 'local_line_item_uuid_777';

    // 1. Offline Creation: Enqueue Member, Activity, Line Item referencing local UUIDs
    await queueRepo.enqueue('create_member', {
      id: localMemberUuid,
      localId: localMemberUuid,
      memberType: 'physique',
      category: 'agriculteur',
      physiqueData: { nom: 'KOUAM', prenom: 'Jean' },
    }, testUserId);

    await queueRepo.enqueue('create_activity', {
      memberId: localMemberUuid,
      data: {
        id: localActivityUuid,
        localId: localActivityUuid,
        activityType: 'agriculteur',
        isPrimary: true,
      },
    }, testUserId);

    await queueRepo.enqueue('create_line_item', {
      memberId: localMemberUuid,
      activityId: localActivityUuid,
      data: {
        id: localLineItemUuid,
        localId: localLineItemUuid,
        cropCategory: 'Céréales',
        cropName: 'Maïs',
        superficieHa: 5,
      },
    }, testUserId);

    // Initial state: 3 pending queue items
    const initialQueue = await queueRepo.getPending(testUserId);
    expect(initialQueue.length).toBe(3);

    // 2. Process Member ONLY (simulate server response assigning server integer ID 505)
    const engineStep1 = new SyncEngine();
    vi.spyOn(engineStep1, 'delay').mockImplementation(async () => {});

    const mockFetchStep1 = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/members') {
        return {
          id: 505,
          memberNumber: 'CAPEF-AGR-000505',
          memberType: 'physique',
          category: 'agriculteur',
        };
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    // Process first queue item only
    const pendingBeforeStep1 = await queueRepo.getPending(testUserId);
    expect(pendingBeforeStep1[0].operationType).toBe('create_member');

    // Run queue processing for 1 item by mocking processQueue loop or fetcher
    let processedCount = 0;
    const step1Fetcher = vi.fn().mockImplementation(async (url: string) => {
      processedCount++;
      if (processedCount === 1) {
        return { id: 505, memberNumber: 'CAPEF-AGR-000505' };
      } else {
        // Simulate network disconnect after member sync
        const err: any = new Error('Network disconnected');
        err.status = 0;
        throw err;
      }
    });

    await engineStep1.processQueue(testUserId, { customFetcher: step1Fetcher as any });

    // 3. Verify member confirmed, EntityMapping written to IndexedDB, and remaining queue has 2 items
    const mapping = await idReconciliationService.resolveServerId('member', localMemberUuid);
    expect(mapping).toBe(505);

    const mappingsInDb = await idReconciliationService.getAllMappings();
    expect(mappingsInDb.length).toBe(1);
    expect(mappingsInDb[0]).toMatchObject({
      entityType: 'member',
      localId: localMemberUuid,
      serverId: 505,
      syncStatus: 'synced',
    });

    // 4. CRASH & RESTART SIMULATION:
    // Create completely fresh SyncEngine instance and reset all in-memory variables/caches
    const engineAfterCrash = new SyncEngine();
    vi.spyOn(engineAfterCrash, 'delay').mockImplementation(async () => {});

    const calledUrls: string[] = [];
    const mockFetchAfterCrash = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calledUrls.push(url);
      if (url === '/api/members/505/activities') {
        return { id: 707, activityType: 'agriculteur', memberId: 505 };
      }
      if (url === '/api/members/505/activities/707/line-items') {
        return { id: 909, activityId: 707, cropName: 'Maïs' };
      }
      throw new Error(`Unexpected URL called: ${url}`);
    });

    // Resume queue processing after crash
    const crashResumeResult = await engineAfterCrash.processQueue(testUserId, { customFetcher: mockFetchAfterCrash as any });

    expect(crashResumeResult.successCount).toBe(2);
    expect(calledUrls).toEqual([
      '/api/members/505/activities',
      '/api/members/505/activities/707/line-items',
    ]);

    // 5. Final Queue Verification: Queue completely emptied, child activity mapping also recorded
    const finalQueue = await queueRepo.getAll(testUserId);
    expect(finalQueue.length).toBe(0);

    const activityMapping = await idReconciliationService.resolveServerId('activity', localActivityUuid);
    expect(activityMapping).toBe(707);

    const lineItemMapping = await idReconciliationService.resolveServerId('line_item', localLineItemUuid);
    expect(lineItemMapping).toBe(909);
  });
});
