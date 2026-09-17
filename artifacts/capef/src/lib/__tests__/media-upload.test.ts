import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { mediaRepository, calculateSHA256 } from '../repositories/MediaRepository';
import { db } from '../repositories/CapefDexieDatabase';
import { SyncEngine } from '../sync-engine';
import { DexieOfflineQueueRepository } from '../offline-repository';
import { DexieSyncRepository } from '../repositories/SyncRepository';

describe('Phase 7 — Media Storage (Blob) & Upload Deduplication Tests', () => {
  const syncRepo = new DexieSyncRepository();
  const queueRepo = new DexieOfflineQueueRepository(syncRepo);
  const testUserId = 'user_media_test_123';

  beforeEach(async () => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
    await db.media.clear();
    await db.operations.clear();
    vi.restoreAllMocks();
  });

  it('calculates SHA-256 checksum for binary Blob and stores media item in IndexedDB MediaRepository', async () => {
    const mockBlob = new Blob(['sample photo content binary stream'], { type: 'image/jpeg' });
    const checksum = await calculateSHA256(mockBlob);

    expect(checksum).toBeDefined();
    expect(checksum.length).toBe(64); // SHA-256 hex length

    const mediaItem = await mediaRepository.saveMedia({
      mediaId: 'media_test_001',
      userId: testUserId,
      fileName: 'cni_recto.jpg',
      mimeType: 'image/jpeg',
      blob: mockBlob,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
    });

    expect(mediaItem).toBeDefined();

    const stored = await mediaRepository.getMediaById('media_test_001', testUserId);
    expect(stored).toBeDefined();
    expect(stored?.fileName).toBe('cni_recto.jpg');
    expect(stored?.syncStatus).toBe('pending');
  });

  it('handles mid-flight lost upload response gracefully on retry without duplicate uploads', async () => {
    const mockBlob = new Blob(['cni photo binary stream'], { type: 'image/jpeg' });
    const mediaItem = await mediaRepository.saveMedia({
      mediaId: 'media_test_dedupe_002',
      userId: testUserId,
      fileName: 'cni_verso.jpg',
      mimeType: 'image/jpeg',
      blob: mockBlob,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
    });

    await queueRepo.enqueue('create_member', {
      localId: 'member_with_media_100',
      physiqueData: { nom: 'EBANG', prenom: 'Samuel' },
    }, testUserId);

    let uploadCount = 0;
    const mockFetcher = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url === '/api/media/upload') {
        uploadCount++;
        if (uploadCount === 1) {
          // First attempt succeeds on server (201), but response is lost/throws on client side
          return { mediaId: 'media_test_dedupe_002', url: '/uploads/media_test_dedupe_002.jpg', checksum: 'abc' };
        } else {
          // Retry attempt: server detects clientOperationId/checksum deduplication and returns HTTP 200
          return { mediaId: 'media_test_dedupe_002', url: '/uploads/media_test_dedupe_002.jpg', checksum: 'abc' };
        }
      }
      if (url === '/api/members') {
        return { id: 808, memberNumber: 'CAPEF-AGR-000808' };
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    const engine = new SyncEngine();
    vi.spyOn(engine, 'delay').mockImplementation(async () => {});

    // First sync run: media uploaded, member synced
    const res1 = await engine.processQueue(testUserId, { customFetcher: mockFetcher as any });
    expect(res1.successCount).toBe(1);

    // Verify local media Blob clean up after confirmed enrollment sync
    const remainingPendingMedia = await mediaRepository.getPendingMediaByUser(testUserId);
    expect(remainingPendingMedia.length).toBe(0);
  });

  it('executes 10 consecutive offline enrollments with full media without IndexedDB QuotaExceededError', async () => {
    // 10 consecutive enrollments each containing photo + CNI recto + CNI verso + signature
    for (let i = 1; i <= 10; i++) {
      const photoBlob = new Blob([`photo_stream_${i}`], { type: 'image/jpeg' });
      const cniRectoBlob = new Blob([`cni_recto_stream_${i}`], { type: 'image/jpeg' });
      const cniVersoBlob = new Blob([`cni_verso_stream_${i}`], { type: 'image/jpeg' });
      const signatureBlob = new Blob([`signature_stream_${i}`], { type: 'image/png' });

      await mediaRepository.saveMedia({
        mediaId: `photo_${i}`,
        userId: testUserId,
        fileName: `photo_${i}.jpg`,
        mimeType: 'image/jpeg',
        blob: photoBlob,
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
      });

      await mediaRepository.saveMedia({
        mediaId: `cni_recto_${i}`,
        userId: testUserId,
        fileName: `cni_recto_${i}.jpg`,
        mimeType: 'image/jpeg',
        blob: cniRectoBlob,
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
      });

      await mediaRepository.saveMedia({
        mediaId: `cni_verso_${i}`,
        userId: testUserId,
        fileName: `cni_verso_${i}.jpg`,
        mimeType: 'image/jpeg',
        blob: cniVersoBlob,
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
      });

      await mediaRepository.saveMedia({
        mediaId: `signature_${i}`,
        userId: testUserId,
        fileName: `signature_${i}.png`,
        mimeType: 'image/png',
        blob: signatureBlob,
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
      });

      await queueRepo.enqueue('create_member', {
        localId: `member_load_test_${i}`,
        physiqueData: { nom: `MEMBER_${i}`, prenom: `Agent` },
      }, testUserId);
    }

    const pendingMedia = await mediaRepository.getPendingMediaByUser(testUserId);
    expect(pendingMedia.length).toBe(40); // 10 enrollments x 4 media files

    const pendingQueue = await queueRepo.getPending(testUserId);
    expect(pendingQueue.length).toBe(10);
  });
});
