export type OperationType = 'create_activity' | 'create_line_item' | 'delete_line_item' | 'create_member';
export type QueueItemStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface OfflineQueueItem<T = any> {
  id: string;
  clientOperationId: string;
  operationType: OperationType;
  payload: T;
  createdAt: string;
  retryCount: number;
  status: QueueItemStatus;
  lastError: string | null;
}

export interface IOfflineQueueRepository {
  enqueue<T>(type: OperationType, payload: T, userId?: string | null): Promise<OfflineQueueItem<T>>;
  getAll(userId?: string | null): Promise<OfflineQueueItem[]>;
  getPending(userId?: string | null): Promise<OfflineQueueItem[]>;
  updateStatus(id: string, status: QueueItemStatus, error?: string, userId?: string | null): Promise<void>;
  incrementRetry(id: string, error: string, userId?: string | null): Promise<void>;
  remove(id: string, userId?: string | null): Promise<void>;
}

const BASE_STORAGE_KEY = 'capef_offline_queue_v2';
const LEGACY_MEMBERS_KEY = 'capef_offline_queue';
const LEGACY_ACTIONS_KEY = 'capef_offline_actions_queue';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class LocalStorageQueueRepository implements IOfflineQueueRepository {
  private getStorageKey(userId?: string | null): string | null {
    if (!userId) {
      return null;
    }
    return `${BASE_STORAGE_KEY}_${userId}`;
  }

  private getStorageItems(userId?: string | null): OfflineQueueItem[] {
    const key = this.getStorageKey(userId);
    if (!key) {
      return [];
    }

    try {
      const stored = localStorage.getItem(key);
      let items: OfflineQueueItem[] = stored ? JSON.parse(stored) : [];

      let migrated = false;

      // Check and migrate un-namespaced BASE_STORAGE_KEY items to active user's key
      const unnamespacedStr = localStorage.getItem(BASE_STORAGE_KEY);
      if (unnamespacedStr) {
        try {
          const unnamespacedItems = JSON.parse(unnamespacedStr);
          if (Array.isArray(unnamespacedItems) && unnamespacedItems.length > 0) {
            for (const item of unnamespacedItems) {
              items.push({
                ...item,
                id: item.id || generateUUID(),
                clientOperationId: item.clientOperationId || generateUUID(),
              });
            }
            migrated = true;
          }
        } catch (e) {
          console.error('Failed to parse un-namespaced offline queue:', e);
        }
        localStorage.removeItem(BASE_STORAGE_KEY);
      }

      // Check and migrate legacy queues if present
      const legacyMembersStr = localStorage.getItem(LEGACY_MEMBERS_KEY);
      const legacyActionsStr = localStorage.getItem(LEGACY_ACTIONS_KEY);

      if (legacyMembersStr) {
        try {
          const legacyMembers = JSON.parse(legacyMembersStr);
          if (Array.isArray(legacyMembers) && legacyMembers.length > 0) {
            for (const member of legacyMembers) {
              const opId = generateUUID();
              items.push({
                id: generateUUID(),
                clientOperationId: opId,
                operationType: 'create_member',
                payload: member,
                createdAt: new Date().toISOString(),
                retryCount: 0,
                status: 'pending',
                lastError: null,
              });
            }
            migrated = true;
          }
        } catch (e) {
          console.error('Failed to parse legacy members queue:', e);
        }
        localStorage.removeItem(LEGACY_MEMBERS_KEY);
      }

      if (legacyActionsStr) {
        try {
          const legacyActions = JSON.parse(legacyActionsStr);
          if (Array.isArray(legacyActions) && legacyActions.length > 0) {
            for (const action of legacyActions) {
              const opId = generateUUID();
              items.push({
                id: generateUUID(),
                clientOperationId: opId,
                operationType: action.type as OperationType,
                payload: action,
                createdAt: new Date().toISOString(),
                retryCount: 0,
                status: 'pending',
                lastError: null,
              });
            }
            migrated = true;
          }
        } catch (e) {
          console.error('Failed to parse legacy actions queue:', e);
        }
        localStorage.removeItem(LEGACY_ACTIONS_KEY);
      }

      if (migrated) {
        localStorage.setItem(key, JSON.stringify(items));
      }

      return items;
    } catch (e) {
      console.error('Error reading offline queue from localStorage:', e);
      return [];
    }
  }

  private saveStorageItems(items: OfflineQueueItem[], userId?: string | null): void {
    const key = this.getStorageKey(userId);
    if (!key) return;

    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving offline queue to localStorage:', e);
    }
  }

  async enqueue<T>(type: OperationType, payload: T, userId?: string | null): Promise<OfflineQueueItem<T>> {
    const items = this.getStorageItems(userId);
    const opId = generateUUID();
    const newItem: OfflineQueueItem<T> = {
      id: generateUUID(),
      clientOperationId: opId,
      operationType: type,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    items.push(newItem);
    this.saveStorageItems(items, userId);
    return newItem;
  }

  async getAll(userId?: string | null): Promise<OfflineQueueItem[]> {
    return this.getStorageItems(userId);
  }

  async getPending(userId?: string | null): Promise<OfflineQueueItem[]> {
    const items = this.getStorageItems(userId);
    return items.filter((item) => item.status === 'pending' || item.status === 'processing');
  }

  async updateStatus(id: string, status: QueueItemStatus, error?: string, userId?: string | null): Promise<void> {
    const items = this.getStorageItems(userId);
    const item = items.find((i) => i.id === id);
    if (item) {
      item.status = status;
      if (error !== undefined) {
        item.lastError = error;
      }
      this.saveStorageItems(items, userId);
    }
  }

  async incrementRetry(id: string, error: string, userId?: string | null): Promise<void> {
    const items = this.getStorageItems(userId);
    const item = items.find((i) => i.id === id);
    if (item) {
      item.retryCount += 1;
      item.status = 'pending';
      item.lastError = error;
      this.saveStorageItems(items, userId);
    }
  }

  async remove(id: string, userId?: string | null): Promise<void> {
    let items = this.getStorageItems(userId);
    items = items.filter((i) => i.id !== id);
    this.saveStorageItems(items, userId);
  }
}

export const offlineRepository: IOfflineQueueRepository = new LocalStorageQueueRepository();
