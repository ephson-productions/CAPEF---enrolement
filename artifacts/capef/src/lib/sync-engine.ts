import { customFetch, ApiError } from '@workspace/api-client-react';
import { offlineRepository, type OfflineQueueItem } from './offline-repository';
import { idReconciliationService } from './id-reconciliation-service';
import { mediaRepository, calculateSHA256 } from './repositories/MediaRepository';

export interface SyncEngineOptions {
  onSuccess?: (item: OfflineQueueItem) => void;
  onError?: (item: OfflineQueueItem, error: string, isTerminal: boolean) => void;
  onSyncComplete?: (summary: { successCount: number; hasNetworkOrServerError: boolean }) => void;
  customFetcher?: typeof customFetch;
}

export class SyncEngine {
  private isSyncingLock = false;

  public get isSyncing(): boolean {
    return this.isSyncingLock;
  }

  /**
   * Calculate exponential backoff delay in milliseconds based on retry count.
   * Delays: 1s, 2s, 4s, 8s, 16s... capped at 30 seconds.
   */
  public calculateBackoffDelay(retryCount: number): number {
    const baseDelayMs = 1000;
    const maxDelayMs = 30000;
    const calculated = baseDelayMs * Math.pow(2, Math.max(0, retryCount - 1));
    return Math.min(calculated, maxDelayMs);
  }

  /**
   * Helper delay promise for exponential backoff pause.
   */
  public async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Process all pending offline queue items for a given user.
   * Concurrency lock guarantees only one sync loop runs at a time.
   */
  public async processQueue(userId: string, options: SyncEngineOptions = {}): Promise<{ successCount: number; hasNetworkOrServerError: boolean }> {
    if (this.isSyncingLock) {
      console.warn('[SyncEngine] Sync already in progress. Skipping concurrent run.');
      return { successCount: 0, hasNetworkOrServerError: false };
    }

    this.isSyncingLock = true;
    let successCount = 0;
    let hasNetworkOrServerError = false;
    const fetchFn = options.customFetcher || customFetch;

    try {
      const pendingItems = await offlineRepository.getPending(userId);
      if (pendingItems.length === 0) {
        return { successCount: 0, hasNetworkOrServerError: false };
      }

      for (const item of pendingItems) {
        // If network was lost mid-processing, abort further item retries in this cycle
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          hasNetworkOrServerError = true;
          break;
        }

        // Phase 7: Sync pending media Blobs for this user before submitting dependent enrollment operations
        const pendingMedia = await mediaRepository.getPendingMediaByUser(userId);
        for (const media of pendingMedia) {
          try {
            const checksum = await calculateSHA256(media.blob);
            const arrayBuffer = await media.blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64Data = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64');

            const uploadRes: any = await fetchFn('/api/media/upload', {
              method: 'POST',
              body: JSON.stringify({
                base64Data: `data:${media.mimeType};base64,${base64Data}`,
                checksum,
                clientOperationId: media.mediaId,
              }),
            });

            if (uploadRes && uploadRes.url) {
              await mediaRepository.updateMediaStatus(media.mediaId, userId, 'uploaded', uploadRes.url);
              await idReconciliationService.recordMapping('media', media.mediaId, uploadRes.url);
            } else {
              throw new Error('Media upload returned invalid response');
            }
          } catch (mErr) {
            console.error('[SyncEngine] Error uploading media Blob prior to enrollment sync:', mErr);
            // Re-throw error to defer processing of dependent member operation if media upload fails
            throw mErr;
          }
        }

        // Dynamically resolve any media ID references in item.payload to server URLs before posting
        if (item.payload) {
          const payloadStr = JSON.stringify(item.payload);
          let updatedStr = payloadStr;
          const mediaMappings = await idReconciliationService.getAllMappings();
          for (const map of mediaMappings) {
            if (map.entityType === 'media' && map.serverId) {
              updatedStr = updatedStr.replaceAll(map.localId, String(map.serverId));
            }
          }
          if (updatedStr !== payloadStr) {
            item.payload = JSON.parse(updatedStr);
          }
        }

        await offlineRepository.updateStatus(item.id, 'processing', undefined, userId);

        try {
          const headers: Record<string, string> = {
            'X-Client-Operation-ID': item.clientOperationId,
          };

          if (item.operationType === 'create_member') {
            const memberResponse: any = await fetchFn('/api/members', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...item.payload,
                clientOperationId: item.clientOperationId,
              }),
            });

            // Immediately record (localId, serverId) mapping in persistent IndexedDB before purging queue item
            if (memberResponse && memberResponse.id) {
              const localId = item.payload.localId || item.payload.id || item.clientOperationId;
              await idReconciliationService.recordMapping('member', String(localId), memberResponse.id);
            }
          } else if (item.operationType === 'update_member') {
            const { id, data } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveServerId('member', id);
            await fetchFn(`/api/members/${resolvedMemberId}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                ...data,
                clientOperationId: item.clientOperationId,
              }),
            });
          } else if (item.operationType === 'create_activity') {
            const { memberId, data } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveServerId('member', memberId);
            const activityResponse: any = await fetchFn(`/api/members/${resolvedMemberId}/activities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...data,
                clientOperationId: item.clientOperationId,
              }),
            });

            if (activityResponse && activityResponse.id) {
              const localActivityId = data?.localId || data?.id || item.clientOperationId;
              await idReconciliationService.recordMapping('activity', String(localActivityActivityId(data) || localActivityId), activityResponse.id);
            }
          } else if (item.operationType === 'create_line_item') {
            const { memberId, activityId, data } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveServerId('member', memberId);
            const resolvedActivityId = await idReconciliationService.resolveServerId('activity', activityId);

            const itemResponse: any = await fetchFn(`/api/members/${resolvedMemberId}/activities/${resolvedActivityId}/line-items`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...data,
                clientOperationId: item.clientOperationId,
              }),
            });

            if (itemResponse && itemResponse.id) {
              const localItemId = data?.localId || data?.id || item.clientOperationId;
              await idReconciliationService.recordMapping('line_item', String(localItemId), itemResponse.id);
            }
          } else if (item.operationType === 'delete_line_item') {
            const { memberId, activityId, itemId } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveServerId('member', memberId);
            const resolvedActivityId = await idReconciliationService.resolveServerId('activity', activityId);
            const resolvedItemId = await idReconciliationService.resolveServerId('line_item', itemId);

            await fetchFn(`/api/members/${resolvedMemberId}/activities/${resolvedActivityId}/line-items/${resolvedItemId}`, {
              method: 'DELETE',
              headers,
            });
          }

          // Confirmed server acknowledgement: remove from local queue and clean up local media Blobs
          await offlineRepository.remove(item.id, userId);

          // Clean up local media Blobs for confirmed uploaded media
          const uploadedMedia = await mediaRepository.getUploadedMediaByUser(userId);
          for (const m of uploadedMedia) {
            await mediaRepository.deleteMedia(m.mediaId, userId);
          }

          successCount++;
          if (options.onSuccess) options.onSuccess(item);

        } catch (err: any) {
          const errorMsg = err?.message || 'Erreur de synchronisation';
          let status = 0;
          if (err instanceof ApiError) {
            status = err.status;
          } else if (err?.status) {
            status = err.status;
          }

          // Terminal business / validation error (HTTP 4xx: 400, 403, 404, 409, 422) vs retryable error (5xx, 0 / network failure)
          const isTerminalError = status >= 400 && status < 500;

          if (isTerminalError) {
            // Mark item failed permanently to prevent infinite retries
            await offlineRepository.updateStatus(item.id, 'failed', errorMsg, userId);
            if (options.onError) options.onError(item, errorMsg, true);
          } else {
            // Retryable network or 5xx server error: increment retry count
            await offlineRepository.incrementRetry(item.id, errorMsg, userId);
            hasNetworkOrServerError = true;
            if (options.onError) options.onError(item, errorMsg, false);

            // Apply exponential backoff delay if further items remain
            const backoffMs = this.calculateBackoffDelay(item.retryCount + 1);
            await this.delay(backoffMs);

            // Abort current cycle loop on network failure
            break;
          }
        }
      }
    } finally {
      this.isSyncingLock = false;
      const summary = { successCount, hasNetworkOrServerError };
      if (options.onSyncComplete) options.onSyncComplete(summary);
    }

    return { successCount, hasNetworkOrServerError };
  }
}

function localActivityActivityId(data: any): string | undefined {
  return data?.localId || data?.id;
}

export const syncEngine = new SyncEngine();
