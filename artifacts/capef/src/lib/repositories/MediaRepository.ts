import { db, type LocalMediaItem } from './CapefDexieDatabase';

export interface IMediaRepository {
  saveMedia(item: Omit<LocalMediaItem, 'id'>): Promise<LocalMediaItem>;
  getMediaById(mediaId: string, userId: string): Promise<LocalMediaItem | undefined>;
  getPendingMediaByUser(userId: string): Promise<LocalMediaItem[]>;
  updateMediaStatus(mediaId: string, userId: string, syncStatus: 'pending' | 'uploaded' | 'error', remoteUrl?: string): Promise<void>;
  deleteMedia(mediaId: string, userId: string): Promise<void>;
  clearUserMedia(userId: string): Promise<void>;
}

export async function calculateSHA256(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class DexieMediaRepository implements IMediaRepository {
  async saveMedia(item: Omit<LocalMediaItem, 'id'>): Promise<LocalMediaItem> {
    try {
      const existing = await db.media
        .where({ mediaId: item.mediaId, userId: item.userId })
        .first();

      if (existing && existing.id) {
        await db.media.update(existing.id, {
          ...item,
        });
        return { ...existing, ...item };
      } else {
        const id = await db.media.add(item as LocalMediaItem);
        return { ...item, id };
      }
    } catch (error) {
      console.error('[MediaRepository] Error saving binary Blob media:', error);
      throw error;
    }
  }

  async getUploadedMediaByUser(userId: string): Promise<LocalMediaItem[]> {
    try {
      return await db.media
        .where('userId')
        .equals(userId)
        .and((item) => item.syncStatus === 'uploaded')
        .toArray();
    } catch (error) {
      console.error('[MediaRepository] Error fetching uploaded media:', error);
      throw error;
    }
  }

  async getMediaById(mediaId: string, userId: string): Promise<LocalMediaItem | undefined> {
    try {
      return await db.media.where({ mediaId, userId }).first();
    } catch (error) {
      console.error('[MediaRepository] Error fetching media by ID:', error);
      throw error;
    }
  }

  async getPendingMediaByUser(userId: string): Promise<LocalMediaItem[]> {
    try {
      return await db.media
        .where('userId')
        .equals(userId)
        .and((item) => item.syncStatus === 'pending')
        .toArray();
    } catch (error) {
      console.error('[MediaRepository] Error fetching pending media:', error);
      throw error;
    }
  }

  async updateMediaStatus(
    mediaId: string,
    userId: string,
    syncStatus: 'pending' | 'uploaded' | 'error',
    remoteUrl?: string
  ): Promise<void> {
    try {
      const existing = await db.media.where({ mediaId, userId }).first();
      if (existing && existing.id) {
        const updates: Partial<LocalMediaItem> = { syncStatus };
        if (remoteUrl) updates.remoteUrl = remoteUrl;
        await db.media.update(existing.id, updates);
      }
    } catch (error) {
      console.error('[MediaRepository] Error updating media status:', error);
      throw error;
    }
  }

  async deleteMedia(mediaId: string, userId: string): Promise<void> {
    try {
      const existing = await db.media.where({ mediaId, userId }).first();
      if (existing && existing.id) {
        await db.media.delete(existing.id);
      }
    } catch (error) {
      console.error('[MediaRepository] Error deleting local media Blob:', error);
      throw error;
    }
  }

  async clearUserMedia(userId: string): Promise<void> {
    try {
      await db.media.where('userId').equals(userId).delete();
    } catch (error) {
      console.error('[MediaRepository] Error clearing user media:', error);
      throw error;
    }
  }
}

export const mediaRepository = new DexieMediaRepository();
