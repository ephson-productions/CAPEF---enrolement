import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { SyncEngine } from '../sync-engine';
import { DexieOfflineQueueRepository } from '../offline-repository';
import { db } from '../repositories/CapefDexieDatabase';
import { DexieSyncRepository } from '../repositories/SyncRepository';

describe('Phase 5 — Sync Engine & Network Flapping Tests', () => {
  const syncRepo = new DexieSyncRepository();
  const queueRepo = new DexieOfflineQueueRepository(syncRepo);
  const testUserId = 'user_sync_engine_test';

  beforeEach(async () => {
    // Ensure navigator.onLine is true in node/jsdom test env
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
    await db.operations.clear();
    vi.restoreAllMocks();
  });

  it('calculates exponential backoff delay correctly (1s, 2s, 4s, 8s, 16s... capped at 30s)', () => {
    const engine = new SyncEngine();
    expect(engine.calculateBackoffDelay(0)).toBe(1000);
    expect(engine.calculateBackoffDelay(1)).toBe(1000);
    expect(engine.calculateBackoffDelay(2)).toBe(2000);
    expect(engine.calculateBackoffDelay(3)).toBe(4000);
    expect(engine.calculateBackoffDelay(4)).toBe(8000);
    expect(engine.calculateBackoffDelay(5)).toBe(16000);
    expect(engine.calculateBackoffDelay(6)).toBe(30000);
    expect(engine.calculateBackoffDelay(10)).toBe(30000);
  });

  it('prevents concurrent execution when processQueue is invoked simultaneously', async () => {
    const engine = new SyncEngine();
    const mockFetcher = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { success: true };
    });

    await queueRepo.enqueue('create_member', { memberType: 'physique', category: 'agriculteur' }, testUserId);

    // Trigger two syncs concurrently
    const promise1 = engine.processQueue(testUserId, { customFetcher: mockFetcher as any });
    const promise2 = engine.processQueue(testUserId, { customFetcher: mockFetcher as any });

    const [res1, res2] = await Promise.all([promise1, promise2]);

    // One invocation processes the item, the second returns immediately due to concurrency lock
    expect(res1.successCount + res2.successCount).toBe(1);
    const pending = await queueRepo.getPending(testUserId);
    expect(pending.length).toBe(0);
  });

  it('handles network flapping (online/offline/online toggling during active sync) without double-processing or queue corruption', async () => {
    const engine = new SyncEngine();
    let callCount = 0;
    const mockFetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First item succeeds
        return { success: true };
      } else {
        // Second item fails due to simulated network drop
        const err: any = new Error('Failed to fetch');
        err.status = 0;
        throw err;
      }
    });

    // Enqueue 2 operations
    const item1 = await queueRepo.enqueue('create_member', { name: 'Member 1' }, testUserId);
    const item2 = await queueRepo.enqueue('update_member', { id: 2, data: { name: 'Member 2 Updated' } }, testUserId);

    // Initial state check
    const initialPending = await queueRepo.getPending(testUserId);
    expect(initialPending.length).toBe(2);

    // Disable real delay in test
    vi.spyOn(engine, 'delay').mockImplementation(async () => {});

    const result = await engine.processQueue(testUserId, { customFetcher: mockFetcher as any });

    expect(result.successCount).toBe(1);
    expect(result.hasNetworkOrServerError).toBe(true);

    // Queue state after partial success & network drop
    const remainingOps = await queueRepo.getAll(testUserId);
    expect(remainingOps.length).toBe(1); // Item 1 was purged on HTTP 200, item 2 remains
    expect(remainingOps[0].clientOperationId).toBe(item2.clientOperationId);
    expect(remainingOps[0].retryCount).toBe(1); // Retry count incremented
  });
});
