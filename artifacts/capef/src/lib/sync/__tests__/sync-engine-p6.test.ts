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

describe('Phase P6 — Unified Sync Engine Integration Tests', () => {
  const userId = 'test_user_p6';

  beforeEach(async () => {
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    vi.clearAllMocks();

    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);
  });

  it('1. Partial network failure leaves completed items synced and retains failed item in queue', async () => {
    const op1 = await offlineRepository.enqueue('create_member', { name: 'Member 1', localId: 'local_m1', _local: { localId: 'local_m1' } }, userId);
    const op2 = await offlineRepository.enqueue('create_member', { name: 'Member 2', localId: 'local_m2', _local: { localId: 'local_m2' } }, userId);

    (customFetch as any)
      .mockResolvedValueOnce({ id: 101, memberNumber: 'CAPEF-001' }) // op1 succeeds
      .mockRejectedValueOnce({ status: 500, message: 'Internal Server Error' }); // op2 fails

    const res = await syncEngine.syncNow(userId);

    expect(res.successCount).toBe(1);
    expect(res.hasError).toBe(true);

    const pendingAfter = await offlineRepository.getPending(userId);
    expect(pendingAfter.length).toBe(1);
    expect(pendingAfter[0].id).toBe(op2.id);

    const mapping = await db.entityMappings.where({ localId: 'local_m1', entityType: 'member' }).first();
    expect(mapping?.serverId).toBe(101);
  });

  it('2. Parent in waiting / pending => child activity stays in "waiting" until parent receives serverId', async () => {
    const parentLocalId = 'parent_local_999';
    const childLocalId = 'child_activity_888';

    // Enqueue member then child activity
    await offlineRepository.enqueue('create_member', { name: 'Parent Member', localId: parentLocalId, _local: { localId: parentLocalId } }, userId);
    await offlineRepository.enqueue('create_activity', { memberRef: { kind: 'local', localId: parentLocalId }, data: { activityType: 'agriculteur' }, _local: { localId: childLocalId, memberLocalId: parentLocalId } }, userId);

    // Mock parent creation failure
    (customFetch as any).mockRejectedValueOnce({ status: 500, message: 'Server down' });

    await syncEngine.syncNow(userId);

    const pending = await offlineRepository.getPending(userId);
    const childOp = pending.find((op) => op.payload?._local?.localId === childLocalId);
    expect(childOp).toBeDefined();

    // Now parent succeeds on next sync
    (customFetch as any)
      .mockResolvedValueOnce({ id: 999, memberNumber: 'CAPEF-999', activities: [{ id: 888, isPrimary: true }] })
      .mockResolvedValueOnce({ id: 888, activityType: 'agriculteur' });

    const res2 = await syncEngine.syncNow(userId);
    expect(res2.successCount).toBeGreaterThan(0);

    const remaining = await offlineRepository.getPending(userId);
    expect(remaining.length).toBe(0);
  });

  it('3. Retain stable X-Client-Operation-ID across retries', async () => {
    const op = await offlineRepository.enqueue('create_member', { name: 'Stable Op Member', localId: 'local_stable', _local: { localId: 'local_stable' } }, userId);
    const initialOpId = op.clientOperationId;

    (customFetch as any).mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' });

    await syncEngine.syncNow(userId);

    const pending = await offlineRepository.getPending(userId);
    expect(pending[0].clientOperationId).toBe(initialOpId);

    // Replay succeeds
    (customFetch as any).mockResolvedValueOnce({ id: 777, memberNumber: 'CAPEF-777' });
    await syncEngine.syncNow(userId);

    expect(customFetch).toHaveBeenLastCalledWith(
      '/api/members',
      expect.objectContaining({
        headers: { 'X-Client-Operation-ID': initialOpId },
      })
    );
  });

  it('4. App crash / close during in_progress resets status to pending on startup without duplication', async () => {
    await db.operations.put({
      operationId: 'op_crash_1',
      clientOperationId: 'uuid_crash_1',
      userId,
      operationType: 'create_member',
      payload: { name: 'Crash Member', localId: 'local_crash' },
      status: 'processing',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    await syncEngine.resetOrphanOperations();

    const opAfter = await db.operations.where('operationId').equals('op_crash_1').first();
    expect(opAfter?.status).toBe('pending');
  });

  it('5. Offline member creation + update before online sync resolves correctly to a single server member', async () => {
    const localId = 'local_member_create_update';

    // 1. Create local member
    await memberRepository.saveLocalMember(userId, {
      localId,
      memberType: 'physique',
      category: 'agriculteur',
      village: 'Original Village',
    });
    await offlineRepository.enqueue('create_member', { memberType: 'physique', category: 'agriculteur', village: 'Original Village', localId, _local: { localId } }, userId);

    // 2. Update local member
    await memberRepository.updateLocalMember(localId, userId, { village: 'Updated Village' });
    await offlineRepository.enqueue('update_member', { serverId: 0, updates: { village: 'Updated Village' }, version: 1, _local: { localId } }, userId);

    (customFetch as any)
      .mockResolvedValueOnce({ id: 500, memberNumber: 'CAPEF-500', version: 1 }) // create_member
      .mockResolvedValueOnce({ id: 500, village: 'Updated Village', version: 2 }); // update_member

    const res = await syncEngine.syncNow(userId);

    expect(res.successCount).toBe(2);

    const memberAfter = await memberRepository.getMemberById(localId, userId);
    expect(memberAfter?.serverId).toBe(500);
    expect(memberAfter?.village).toBe('Updated Village');
    expect(memberAfter?.syncStatus).toBe('synced');
  });
});
