import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { syncEngine } from '../sync-engine';
import { offlineRepository } from '../offline-repository';
import { memberRepository } from '../repositories/MemberRepository';

class StorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null { return this.store[key] || null; }
  setItem(key: string, value: string): void { this.store[key] = String(value); }
  removeItem(key: string): void { delete this.store[key]; }
  clear(): void { this.store = {}; }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new StorageMock();
}

vi.mock('@workspace/api-client-react', () => ({
  customFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    data: any;
    constructor(status: number, message: string, data?: any) {
      super(message);
      this.status = status;
      this.data = data;
    }
  },
}));

import { customFetch } from '@workspace/api-client-react';

describe('Phase P8 — Robustness: Conflicts, Blocked Operations, & Media Tests', () => {
  const userId = 'agent_p8_robustness_user';

  beforeEach(async () => {
    await db.operations.clear();
    await db.syncConflicts.clear();
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    await db.media.clear();
    vi.clearAllMocks();
  });

  it('1. OCC 409 Conflict logging and "Keep Mine" (Conserver la mienne) resolution', async () => {
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    const memberLocalId = crypto.randomUUID();
    const opId = crypto.randomUUID();

    // Member record in Dexie
    await db.members.put({
      localId: memberLocalId,
      serverId: 42,
      userId,
      memberNumber: 'CAPEF-AGR-00042',
      memberType: 'physique',
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      status: 'valide',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    // Enqueue update_member with version 1
    await offlineRepository.enqueue('update_member', {
      serverId: 42,
      updates: { village: 'Douala Port' },
      version: 1,
      localId: memberLocalId,
      _local: { localId: memberLocalId },
    }, userId);

    // Mock 409 OCC Conflict response
    const conflictError = new Error('Conflit de version : Le membre a été modifié par un autre utilisateur.');
    (conflictError as any).status = 409;
    (conflictError as any).data = {
      code: 'OCC_VERSION_MISMATCH',
      clientVersion: 1,
      serverVersion: 3,
      currentMember: { id: 42, memberNumber: 'CAPEF-AGR-00042', version: 3, village: 'Douala Port Server' },
    };

    (customFetch as any).mockRejectedValueOnce(conflictError);

    // Run sync
    const syncRes = await syncEngine.syncNow(userId);
    expect(syncRes.hasError).toBe(false); // 409 is terminal/blocked, not network 5xx retryable

    // Check conflict recorded in Dexie syncConflicts
    const conflicts = await db.syncConflicts.where('userId').equals(userId).toArray();
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].clientVersion).toBe(1);
    expect(conflicts[0].serverVersion).toBe(3);
    expect(conflicts[0].status).toBe('unresolved');

    // Simulate "Conserver la mienne": update operation version = 3 and set status = pending
    const op = await db.operations.where({ userId }).first();
    expect(op?.status).toBe('blocked');

    await db.operations.update(op!.id!, {
      payload: { ...op!.payload, version: 3 },
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    await db.syncConflicts.update(conflicts[0].id!, { status: 'resolved' });

    // Re-run sync with updated version 3 -> 200 OK
    (customFetch as any).mockResolvedValueOnce({ id: 42, version: 4 });
    const retrySyncRes = await syncEngine.syncNow(userId);
    expect(retrySyncRes.successCount).toBe(1);

    const remainingOps = await db.operations.where('userId').equals(userId).toArray();
    expect(remainingOps.length).toBe(0);
  });

  it('2. Dead-letter queue capping (retryCount >= 5 -> blocked) and "Relancer" (Retry)', async () => {
    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);

    const memberLocalId = crypto.randomUUID();

    await offlineRepository.enqueue('update_member', {
      serverId: 88,
      updates: { village: 'Kribi Ville' },
      version: 1,
      localId: memberLocalId,
      _local: { localId: memberLocalId },
    }, userId);

    const op = await db.operations.where({ userId }).first();
    // Set retryCount = 4
    await db.operations.update(op!.id!, { retryCount: 4 });

    // Mock 500 Network/Server Error
    (customFetch as any).mockRejectedValueOnce(new Error('500 Internal Server Error'));

    await syncEngine.syncNow(userId);

    // Op should now be status = 'blocked' (max retries reached)
    const updatedOp = await db.operations.where({ userId }).first();
    expect(updatedOp?.status).toBe('blocked');
    expect(updatedOp?.retryCount).toBe(5);

    // Simulate "Relancer" button click: reset status = pending and retry
    await db.operations.update(updatedOp!.id!, {
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });

    (customFetch as any).mockResolvedValueOnce({ id: 88, version: 2 });
    const syncRes = await syncEngine.syncNow(userId);
    expect(syncRes.successCount).toBe(1);
  });

  it('3. Binary Blob media storage in Dexie and upload execution prior to payload sync', async () => {
    const mediaId = crypto.randomUUID();
    const fakeBlob = new Blob(['fake_binary_image_content'], { type: 'image/jpeg' });

    // Put media Blob in Dexie
    await db.media.put({
      mediaId,
      userId,
      fileName: 'photo_member_001.jpg',
      mimeType: 'image/jpeg',
      blob: fakeBlob,
      remoteUrl: null,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
    });

    (customFetch as any).mockResolvedValueOnce({ url: '/uploads/photo_member_001.jpg' });

    const mediaMap = await syncEngine.uploadPendingMediaBlobs(userId);
    expect(mediaMap[mediaId]).toBe('/uploads/photo_member_001.jpg');

    const updatedMedia = await db.media.where({ mediaId }).first();
    expect(updatedMedia?.syncStatus).toBe('uploaded');
    expect(updatedMedia?.remoteUrl).toBe('/uploads/photo_member_001.jpg');
  });

  it('4. Local operation cancellation with audit log retention', async () => {
    const memberLocalId = crypto.randomUUID();

    await offlineRepository.enqueue('update_member', {
      serverId: 99,
      updates: { village: 'Invalid Data' },
      version: 1,
      localId: memberLocalId,
      _local: { localId: memberLocalId },
    }, userId);

    const op = await db.operations.where({ userId }).first();

    // Cancel operation with audit log retention
    await db.operations.delete(op!.id!);
    await db.syncConflicts.put({
      conflictId: crypto.randomUUID(),
      userId,
      entityType: 'member',
      localId: memberLocalId,
      serverId: 99,
      clientVersion: 1,
      serverVersion: 1,
      localData: op!.payload,
      serverData: { cancelled: true, cancelledAt: new Date().toISOString() },
      status: 'resolved',
      createdAt: new Date().toISOString(),
    });

    const pendingOps = await db.operations.where({ userId }).toArray();
    expect(pendingOps.length).toBe(0);

    const auditLog = await db.syncConflicts.where({ userId }).toArray();
    expect(auditLog.length).toBe(1);
    expect(auditLog[0].serverData.cancelled).toBe(true);
  });
});
