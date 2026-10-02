import { customFetch, ApiError } from '@workspace/api-client-react';
import { offlineRepository, OfflineQueueItem } from './offline-repository';
import { idReconciliationService, UnresolvedDependencyError } from './id-reconciliation-service';
import { db } from './repositories/CapefDexieDatabase';
import { memberRepository } from './repositories/MemberRepository';

export class SyncEngine {
  private isSyncingLock = false;

  constructor() {
    this.resetOrphanOperations();
  }

  /**
   * Reset orphan 'processing' or 'in_progress' operations back to 'pending' on startup
   */
  async resetOrphanOperations(): Promise<void> {
    try {
      await db.operations.where('status').equals('processing').modify({ status: 'pending' });
    } catch (err) {
      console.error('[SyncEngine] Error resetting orphan processing operations:', err);
    }
  }

  /**
   * Verify online connectivity using a fast 3-second timeout healthz ping
   */
  async checkOnlineHealth(): Promise<boolean> {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('/api/healthz', { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      return res.ok;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  async syncNow(userId?: string | null, onProgress?: (count: number) => void): Promise<{ successCount: number; hasError: boolean }> {
    // 1. Web Locks API multi-tab concurrency protection
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      return navigator.locks.request('capef_sync_engine_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          console.warn('[SyncEngine] Sync already in progress in another tab. Skipping.');
          return { successCount: 0, hasError: false };
        }
        return this.executeSync(userId, onProgress);
      });
    }

    if (this.isSyncingLock) {
      return { successCount: 0, hasError: false };
    }

    this.isSyncingLock = true;
    try {
      return await this.executeSync(userId, onProgress);
    } finally {
      this.isSyncingLock = false;
    }
  }

  private async executeSync(userId?: string | null, onProgress?: (count: number) => void): Promise<{ successCount: number; hasError: boolean }> {
    let successCount = 0;
    let hasError = false;

    const isHealthy = await this.checkOnlineHealth();
    if (!isHealthy) {
      return { successCount: 0, hasError: true };
    }

    const pendingItems = await offlineRepository.getPending(userId);
    if (pendingItems.length === 0) {
      return { successCount: 0, hasError: false };
    }

    for (const item of pendingItems) {
      if (item.status === 'blocked' || item.status === 'failed' || item.status === 'waiting') continue;

      await offlineRepository.updateStatus(item.id, 'processing', undefined, userId);

      try {
        const headers: Record<string, string> = {
          'X-Client-Operation-ID': item.clientOperationId,
        };

        let serverResponse: any = null;

        if (item.operationType === 'create_member') {
          const cleanPayload = { ...item.payload };
          delete cleanPayload._local;
          delete cleanPayload.localId;

          serverResponse = await customFetch('/api/members', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...cleanPayload,
              clientOperationId: item.clientOperationId,
            }),
          });
        } else if (item.operationType === 'update_member') {
          const { serverId, updates, version } = item.payload;
          const targetMemberId = serverId || (item.payload._local?.localId ? await idReconciliationService.resolveRef('member', item.payload._local.localId) : null);

          if (!targetMemberId) {
            throw new UnresolvedDependencyError('member', item.payload._local?.localId || 'unknown');
          }

          serverResponse = await customFetch(`/api/members/${targetMemberId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              ...updates,
              version,
              clientOperationId: item.clientOperationId,
            }),
          });
        } else if (item.operationType === 'create_activity') {
          const { memberRef, memberId, data } = item.payload;
          const ref = memberRef || memberId || item.payload._local?.memberLocalId;
          const resolvedMemberId = await idReconciliationService.resolveRef('member', ref);

          const cleanData = { ...data };
          delete cleanData._local;

          serverResponse = await customFetch(`/api/members/${resolvedMemberId}/activities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...cleanData,
              clientOperationId: item.clientOperationId,
            }),
          });
        } else if (item.operationType === 'create_line_item') {
          const { memberRef, memberId, activityRef, activityId, data } = item.payload;
          const mRef = memberRef || memberId || item.payload._local?.memberLocalId;
          const aRef = activityRef || activityId || item.payload._local?.activityLocalId;

          const resolvedMemberId = await idReconciliationService.resolveRef('member', mRef);
          const resolvedActivityId = await idReconciliationService.resolveRef('activity', aRef);

          const cleanData = { ...data };
          delete cleanData._local;

          if (cleanData.parentLineItemRef) {
            const resolvedParentItemId = await idReconciliationService.resolveRef('line_item', cleanData.parentLineItemRef);
            cleanData.parentLineItemId = resolvedParentItemId;
            delete cleanData.parentLineItemRef;
          }

          serverResponse = await customFetch(`/api/members/${resolvedMemberId}/activities/${resolvedActivityId}/line-items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...cleanData,
              clientOperationId: item.clientOperationId,
            }),
          });
        } else if (item.operationType === 'delete_line_item') {
          const { memberRef, memberId, activityRef, activityId, itemRef, itemId } = item.payload;
          const mRef = memberRef || memberId || item.payload._local?.memberLocalId;
          const aRef = activityRef || activityId || item.payload._local?.activityLocalId;
          const iRef = itemRef || itemId;

          const resolvedMemberId = await idReconciliationService.resolveRef('member', mRef);
          const resolvedActivityId = await idReconciliationService.resolveRef('activity', aRef);
          const resolvedItemId = await idReconciliationService.resolveRef('line_item', iRef);

          serverResponse = await customFetch(`/api/members/${resolvedMemberId}/activities/${resolvedActivityId}/line-items/${resolvedItemId}`, {
            method: 'DELETE',
            headers,
          });
        }

        const activeUser = userId || (typeof localStorage !== 'undefined' ? localStorage.getItem('capef_last_known_user_id') : null) || 'unassigned_user';

        // Update local Dexie MemberRepository state with confirmed server values
        if (item.operationType === 'create_member' && serverResponse?.id) {
          const localId = item.payload.localId || item.payload._local?.localId;
          if (localId) {
            await memberRepository.updateLocalMember(localId, activeUser, {
              serverId: serverResponse.id,
              memberNumber: serverResponse.memberNumber,
              syncStatus: 'synced',
            });
          }
        } else if (item.operationType === 'update_member' && serverResponse?.id) {
          const localId = item.payload.localId || item.payload._local?.localId;
          if (localId) {
            await memberRepository.updateLocalMember(localId, activeUser, {
              version: serverResponse.version || (item.payload.version + 1),
              syncStatus: 'synced',
            });
          }
        }

        // Atomic reconciliation and queue operation purge in same Dexie transaction
        await idReconciliationService.reconcileAndRemoveOperation(
          item.id,
          activeUser,
          item.operationType,
          item.payload,
          serverResponse
        );

        successCount++;
        if (onProgress) onProgress(successCount);
      } catch (err: any) {
        if (err instanceof UnresolvedDependencyError) {
          console.warn(`[SyncEngine] Unresolved parent dependency for item ${item.id}. Transitioning to 'waiting':`, err.message);
          await offlineRepository.updateStatus(item.id, 'waiting', `waiting_for_parent: ${err.message}`, userId);
          continue;
        }

        const errorMsg = err?.message || 'Erreur de synchronisation';
        let status = 0;
        if (err instanceof ApiError) status = err.status;
        else if (err?.status) status = err.status;

        const isConflictError = status === 409;
        const isTerminalError = status >= 400 && status < 500;

        if (isConflictError) {
          await offlineRepository.updateStatus(item.id, 'blocked', `Conflit OCC (409): ${errorMsg}`, userId);
        } else if (isTerminalError) {
          await offlineRepository.updateStatus(item.id, 'blocked', errorMsg, userId);
        } else {
          // Retryable network / 5xx error -> exponential backoff retry & abort cycle
          await offlineRepository.incrementRetry(item.id, errorMsg, userId);
          hasError = true;
          break;
        }
      }
    }

    return { successCount, hasError };
  }
}

export const syncEngine = new SyncEngine();
