import { customFetch, ApiError } from '@workspace/api-client-react';
import { offlineRepository, OfflineQueueItem } from './offline-repository';
import { idReconciliationService, UnresolvedDependencyError } from './id-reconciliation-service';

export class SyncEngine {
  private isSyncingLock = false;

  async syncNow(userId?: string | null, onProgress?: (count: number) => void): Promise<{ successCount: number; hasError: boolean }> {
    if (this.isSyncingLock) {
      return { successCount: 0, hasError: false };
    }

    this.isSyncingLock = true;
    let successCount = 0;
    let hasError = false;

    try {
      const pendingItems = await offlineRepository.getPending(userId);
      if (pendingItems.length === 0) {
        return { successCount: 0, hasError: false };
      }

      for (const item of pendingItems) {
        // Double check status
        if (item.status === 'failed') continue;

        await offlineRepository.updateStatus(item.id, 'processing', undefined, userId);

        try {
          const headers: Record<string, string> = {
            'X-Client-Operation-ID': item.clientOperationId,
          };

          let serverResponse: any = null;

          if (item.operationType === 'create_member') {
            const cleanPayload = { ...item.payload };
            delete cleanPayload._local;

            serverResponse = await customFetch('/api/members', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...cleanPayload,
                clientOperationId: item.clientOperationId,
              }),
            });
          } else if (item.operationType === 'create_activity') {
            const { memberRef, data } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveRef('member', memberRef);

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
            const { memberRef, activityRef, data } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveRef('member', memberRef);
            const resolvedActivityId = await idReconciliationService.resolveRef('activity', activityRef);

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
            const { memberRef, activityRef, itemRef, itemId } = item.payload;
            const resolvedMemberId = await idReconciliationService.resolveRef('member', memberRef);
            const resolvedActivityId = await idReconciliationService.resolveRef('activity', activityRef);
            const resolvedItemId = itemRef
              ? await idReconciliationService.resolveRef('line_item', itemRef)
              : itemId;

            serverResponse = await customFetch(`/api/members/${resolvedMemberId}/activities/${resolvedActivityId}/line-items/${resolvedItemId}`, {
              method: 'DELETE',
              headers,
            });
          }

          // Atomic reconciliation and removal upon success
          await idReconciliationService.reconcileAndRemoveOperation(
            item.id,
            userId || 'anonymous_user',
            item.operationType,
            item.payload,
            serverResponse
          );

          successCount++;
          if (onProgress) onProgress(successCount);
        } catch (err: any) {
          if (err instanceof UnresolvedDependencyError) {
            console.warn(`[SyncEngine] Unresolved dependency for operation ${item.id}:`, err.message);
            await offlineRepository.updateStatus(item.id, 'failed', `dependency_failed: ${err.message}`, userId);
            continue;
          }

          const errorMsg = err?.message || 'Erreur de synchronisation';
          let status = 0;
          if (err instanceof ApiError) status = err.status;
          else if (err?.status) status = err.status;

          const isConflictError = status === 409;
          const isTerminalError = status >= 400 && status < 500;

          if (isConflictError) {
            await offlineRepository.updateStatus(item.id, 'failed', `Conflit (409): ${errorMsg}`, userId);
          } else if (isTerminalError) {
            await offlineRepository.updateStatus(item.id, 'failed', errorMsg, userId);
          } else {
            // Network failure or 5xx server error -> increment retry & interrupt cycle
            await offlineRepository.incrementRetry(item.id, errorMsg, userId);
            hasError = true;
            break;
          }
        }
      }

      return { successCount, hasError };
    } finally {
      this.isSyncingLock = false;
    }
  }
}

export const syncEngine = new SyncEngine();
