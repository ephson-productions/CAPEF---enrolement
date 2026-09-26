import { customFetch } from '@workspace/api-client-react';
import { offlineRepository } from './offline-repository';

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export class OfflineActivityService {
  /**
   * Save or update an activity.
   * If online AND member is on server (numeric ID), executes direct HTTP request.
   * Otherwise enqueues offline operation.
   */
  async saveActivity(
    memberRef: { kind: 'server'; id: number } | { kind: 'local'; localId: string },
    data: any,
    userId?: string | null
  ): Promise<{ directSuccess: boolean; result?: any }> {
    const activityLocalId = data._local?.localId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now());
    const payload = {
      memberRef,
      data: {
        ...data,
        _local: {
          ...(data._local || {}),
          localId: activityLocalId,
        },
      },
    };

    if (isOnline() && memberRef.kind === 'server') {
      try {
        const cleanData = { ...data };
        delete cleanData._local;

        const res = await customFetch(`/api/members/${memberRef.id}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData),
        });
        return { directSuccess: true, result: res };
      } catch (err) {
        console.warn('[OfflineActivityService] Direct activity save failed, falling back to queue:', err);
      }
    }

    await offlineRepository.enqueue('create_activity', payload, userId);
    return { directSuccess: false };
  }

  /**
   * Save a line item.
   * If online AND member/activity are on server, executes direct HTTP request.
   * Otherwise enqueues offline operation.
   */
  async saveLineItem(
    memberRef: { kind: 'server'; id: number } | { kind: 'local'; localId: string },
    activityRef: { kind: 'server'; id: number } | { kind: 'local'; localId: string },
    data: any,
    userId?: string | null
  ): Promise<{ directSuccess: boolean; result?: any }> {
    const itemLocalId = data._local?.localId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'item_' + Date.now());
    const payload = {
      memberRef,
      activityRef,
      data: {
        ...data,
        _local: {
          ...(data._local || {}),
          localId: itemLocalId,
        },
      },
    };

    if (isOnline() && memberRef.kind === 'server' && activityRef.kind === 'server') {
      try {
        const cleanData = { ...data };
        delete cleanData._local;

        const res = await customFetch(`/api/members/${memberRef.id}/activities/${activityRef.id}/line-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData),
        });
        return { directSuccess: true, result: res };
      } catch (err) {
        console.warn('[OfflineActivityService] Direct line item save failed, falling back to queue:', err);
      }
    }

    await offlineRepository.enqueue('create_line_item', payload, userId);
    return { directSuccess: false };
  }

  /**
   * Delete a line item.
   */
  async deleteLineItem(
    memberRef: { kind: 'server'; id: number } | { kind: 'local'; localId: string },
    activityRef: { kind: 'server'; id: number } | { kind: 'local'; localId: string },
    itemId: number,
    itemLocalId?: string,
    userId?: string | null
  ): Promise<{ directSuccess: boolean }> {
    if (isOnline() && memberRef.kind === 'server' && activityRef.kind === 'server' && !itemLocalId) {
      try {
        await customFetch(`/api/members/${memberRef.id}/activities/${activityRef.id}/line-items/${itemId}`, {
          method: 'DELETE',
        });
        return { directSuccess: true };
      } catch (err) {
        console.warn('[OfflineActivityService] Direct delete failed, falling back to queue:', err);
      }
    }

    await offlineRepository.enqueue('delete_line_item', {
      memberRef,
      activityRef,
      itemId,
      itemRef: itemLocalId ? { kind: 'local', localId: itemLocalId } : undefined,
    }, userId);

    return { directSuccess: false };
  }
}

export const offlineActivityService = new OfflineActivityService();
