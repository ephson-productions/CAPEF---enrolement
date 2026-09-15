import { db, type LocalMediaItem } from './CapefDexieDatabase';

export interface IMediaRepository {
  saveMedia(media: LocalMediaItem): Promise<LocalMediaItem>;
  getMediaById(mediaId: string, userId: string): Promise<LocalMediaItem | undefined>;
  getPendingMediaByUser(userId: string): Promise<LocalMediaItem[]>;
  updateMediaStatus(mediaId: string, userId: string, status: 'pending' | 'uploaded' | 'error', remoteUrl?: string): Promise<void>;
  deleteMedia(mediaId: string, userId: string): Promise<void>;
}

export class DexieMediaRepository implements IMediaRepository {
  async saveMedia(media: LocalMediaItem): Promise<LocalMediaItem> {
    try {
      const existing = await db.media.where({ mediaId: media.mediaId, userId: media.userId }).first();
      if (existing && existing.id) {
        await db.media.update(existing.id, media);
        return { ...existing, ...media };
      } else {
        const id = await db.media.add(media);
        return { ...media, id };
      }
    } catch (error) {
      console.error('[MediaRepository] Error saving media:', error);
      throw error;
    }
  }

  async getMediaById(mediaId: string, userId: string): Promise<LocalMediaItem | undefined> {
    try {
      return await db.media.where({ mediaId, userId }).first();
    } catch (error) {
      console.error('[MediaRepository] Error fetching media:', error);
      throw error;
    }
  }

  async getPendingMediaByUser(userId: string): Promise<LocalMediaItem[]> {
    try {
      return await db.media.where({ userId, syncStatus: 'pending' }).toArray();
    } catch (error) {
      console.error('[MediaRepository] Error fetching pending media:', error);
      throw error;
    }
  }

  async updateMediaStatus(
    mediaId: string,
    userId: string,
    status: 'pending' | 'uploaded' | 'error',
    remoteUrl?: string
  ): Promise<void> {
    try {
      const existing = await db.media.where({ mediaId, userId }).first();
      if (existing && existing.id) {
        const updates: Partial<LocalMediaItem> = { syncStatus: status };
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
      console.error('[MediaRepository] Error deleting media:', error);
      throw error;
    }
  }
}

export const mediaRepository = new DexieMediaRepository();
