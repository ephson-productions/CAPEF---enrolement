import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../CapefDexieDatabase';
import { memberRepository } from '../MemberRepository';
import { referenceDataRepository } from '../ReferenceDataRepository';
import { mediaRepository } from '../MediaRepository';
import { syncRepository } from '../SyncRepository';
import { DexieOfflineQueueRepository } from '../../offline-repository';

describe('Phase 1 — IndexedDB Repository Layer & Error Propagation Tests', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('MemberRepository (Dexie)', () => {
    it('performs CRUD operations on member entities correctly', async () => {
      const userId = 'agent_123';
      const member = await memberRepository.saveMember({
        localId: 'local_mem_1',
        userId,
        memberType: 'physique',
        category: 'agriculteur',
        individualOrOrg: 'individuel',
        physiqueData: { nom: 'Fomena', prenom: 'Paul' },
        status: 'incomplet',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      expect(member.id).toBeDefined();

      const fetched = await memberRepository.getMemberByLocalId('local_mem_1', userId);
      expect(fetched?.physiqueData.nom).toBe('Fomena');

      const userMembers = await memberRepository.getMembersByUser(userId);
      expect(userMembers).toHaveLength(1);

      await memberRepository.deleteMember('local_mem_1', userId);
      const afterDelete = await memberRepository.getMemberByLocalId('local_mem_1', userId);
      expect(afterDelete).toBeUndefined();
    });
  });

  describe('ReferenceDataRepository (Dexie)', () => {
    it('saves and retrieves regions, departments, and arrondissements', async () => {
      await referenceDataRepository.saveRegions([
        { id: 1, name: 'Adamaoua' },
        { id: 2, name: 'Centre' },
      ]);

      const regions = await referenceDataRepository.getRegions();
      expect(regions).toHaveLength(2);
      expect(regions[0].name).toBe('Adamaoua');

      await referenceDataRepository.saveDepartments([
        { id: 10, regionId: 2, name: 'Mfoundi' },
      ]);

      const depts = await referenceDataRepository.getDepartmentsByRegion(2);
      expect(depts).toHaveLength(1);
      expect(depts[0].name).toBe('Mfoundi');
    });
  });

  describe('MediaRepository (Dexie)', () => {
    it('saves and updates media blobs and status', async () => {
      const userId = 'agent_123';
      const sampleBlob = new Blob(['test image content'], { type: 'image/jpeg' });

      const media = await mediaRepository.saveMedia({
        mediaId: 'media_1',
        userId,
        fileName: 'cni_photo.jpg',
        mimeType: 'image/jpeg',
        blob: sampleBlob,
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
      });

      expect(media.id).toBeDefined();

      const retrieved = await mediaRepository.getMediaById('media_1', userId);
      expect(retrieved?.fileName).toBe('cni_photo.jpg');

      await mediaRepository.updateMediaStatus('media_1', userId, 'uploaded', 'https://supabase/media_1.jpg');
      const updated = await mediaRepository.getMediaById('media_1', userId);
      expect(updated?.syncStatus).toBe('uploaded');
      expect(updated?.remoteUrl).toBe('https://supabase/media_1.jpg');
    });
  });

  describe('SyncRepository & DexieOfflineQueueRepository', () => {
    it('enqueues, retrieves pending, and removes offline operations', async () => {
      const queueRepo = new DexieOfflineQueueRepository(syncRepository);
      const userId = 'agent_123';

      const item1 = await queueRepo.enqueue('create_member', { name: 'Member 1' }, userId);
      const item2 = await queueRepo.enqueue('create_activity', { activityType: 'agriculteur' }, userId);

      expect(item1.id).toBeDefined();
      expect(item2.id).toBeDefined();

      const pending = await queueRepo.getPending(userId);
      expect(pending).toHaveLength(2);

      await queueRepo.updateStatus(item1.id, 'failed', 'Validation error', userId);
      const updatedPending = await queueRepo.getPending(userId);
      expect(updatedPending).toHaveLength(1);

      await queueRepo.remove(item2.id, userId);
      const finalAll = await queueRepo.getAll(userId);
      expect(finalAll).toHaveLength(1);
      expect(finalAll[0].status).toBe('failed');
    });

    it('CRITICAL ERROR PROPAGATION: propagates exceptions to caller on transaction or write failure', async () => {
      const queueRepo = new DexieOfflineQueueRepository(syncRepository);
      const userId = 'agent_123';

      // Close the Dexie database to force an error on write operations
      db.close();

      // Expect write operations to reject and throw an error rather than swallowing it silently
      await expect(
        queueRepo.enqueue('create_member', { name: 'Fail Member' }, userId)
      ).rejects.toThrow();

      await expect(
        memberRepository.saveMember({
          localId: 'local_fail',
          userId,
          memberType: 'physique',
          category: 'agriculteur',
          individualOrOrg: 'individuel',
          status: 'incomplet',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        })
      ).rejects.toThrow();
    });
  });
});
