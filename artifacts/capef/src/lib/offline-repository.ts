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
  enqueue<T>(type: OperationType, payload: T): Promise<OfflineQueueItem<T>>;
  getAll(): Promise<OfflineQueueItem[]>;
  getPending(): Promise<OfflineQueueItem[]>;
  updateStatus(id: string, status: QueueItemStatus, error?: string): Promise<void>;
  incrementRetry(id: string, error: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'capef_offline_queue_v2';
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
  private getStorageItems(): OfflineQueueItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let items: OfflineQueueItem[] = stored ? JSON.parse(stored) : [];

      // Check and migrate legacy queues if present
      const legacyMembersStr = localStorage.getItem(LEGACY_MEMBERS_KEY);
      const legacyActionsStr = localStorage.getItem(LEGACY_ACTIONS_KEY);

      let migrated = false;

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }

      return items;
    } catch (e) {
      console.error('Error reading offline queue from localStorage:', e);
      return [];
    }
  }

  private saveStorageItems(items: OfflineQueueItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving offline queue to localStorage:', e);
    }
  }

  async enqueue<T>(type: OperationType, payload: T): Promise<OfflineQueueItem<T>> {
    const items = this.getStorageItems();
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
    this.saveStorageItems(items);
    return newItem;
  }

  async getAll(): Promise<OfflineQueueItem[]> {
    return this.getStorageItems();
  }

  async getPending(): Promise<OfflineQueueItem[]> {
    const items = this.getStorageItems();
    return items.filter((item) => item.status === 'pending' || item.status === 'processing');
  }

  async updateStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
    const items = this.getStorageItems();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.status = status;
      if (error !== undefined) {
        item.lastError = error;
      }
      this.saveStorageItems(items);
    }
  }

  async incrementRetry(id: string, error: string): Promise<void> {
    const items = this.getStorageItems();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.retryCount += 1;
      item.status = 'pending';
      item.lastError = error;
      this.saveStorageItems(items);
    }
  }

  async remove(id: string): Promise<void> {
    let items = this.getStorageItems();
    items = items.filter((i) => i.id !== id);
    this.saveStorageItems(items);
  }
}

export const offlineRepository: IOfflineQueueRepository = new LocalStorageQueueRepository();
