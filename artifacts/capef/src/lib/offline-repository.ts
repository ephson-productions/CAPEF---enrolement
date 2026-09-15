import { syncRepository, type ISyncRepository } from './repositories/SyncRepository';

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

export class DexieOfflineQueueRepository implements IOfflineQueueRepository {
  private syncRepo: ISyncRepository;

  constructor(syncRepo: ISyncRepository = syncRepository) {
    this.syncRepo = syncRepo;
  }

  private resolveUserId(userId?: string | null): string {
    return userId || 'anonymous_user';
  }

  async enqueue<T>(type: OperationType, payload: T, userId?: string | null): Promise<OfflineQueueItem<T>> {
    const activeUser = this.resolveUserId(userId);
    const opId = generateUUID();
    const clientOpId = generateUUID();
    const createdAt = new Date().toISOString();

    try {
      const inserted = await this.syncRepo.enqueueOperation({
        operationId: opId,
        clientOperationId: clientOpId,
        userId: activeUser,
        operationType: type,
        payload,
        status: 'pending',
        retryCount: 0,
        createdAt,
      });

      return {
        id: inserted.operationId,
        clientOperationId: inserted.clientOperationId,
        operationType: inserted.operationType as OperationType,
        payload: inserted.payload,
        createdAt: inserted.createdAt,
        retryCount: inserted.retryCount,
        status: inserted.status as QueueItemStatus,
        lastError: inserted.lastError ?? null,
      };
    } catch (error) {
      console.error('[DexieOfflineQueueRepository] Error enqueuing operation:', error);
      throw error;
    }
  }

  async getAll(userId?: string | null): Promise<OfflineQueueItem[]> {
    const activeUser = this.resolveUserId(userId);
    try {
      const ops = await this.syncRepo.getOperationsByUser(activeUser);
      return ops.map((op) => ({
        id: op.operationId,
        clientOperationId: op.clientOperationId,
        operationType: op.operationType as OperationType,
        payload: op.payload,
        createdAt: op.createdAt,
        retryCount: op.retryCount,
        status: op.status as QueueItemStatus,
        lastError: op.lastError ?? null,
      }));
    } catch (error) {
      console.error('[DexieOfflineQueueRepository] Error fetching all operations:', error);
      throw error;
    }
  }

  async getPending(userId?: string | null): Promise<OfflineQueueItem[]> {
    const activeUser = this.resolveUserId(userId);
    try {
      const ops = await this.syncRepo.getPendingOperationsByUser(activeUser);
      return ops.map((op) => ({
        id: op.operationId,
        clientOperationId: op.clientOperationId,
        operationType: op.operationType as OperationType,
        payload: op.payload,
        createdAt: op.createdAt,
        retryCount: op.retryCount,
        status: op.status as QueueItemStatus,
        lastError: op.lastError ?? null,
      }));
    } catch (error) {
      console.error('[DexieOfflineQueueRepository] Error fetching pending operations:', error);
      throw error;
    }
  }

  async updateStatus(id: string, status: QueueItemStatus, error?: string, userId?: string | null): Promise<void> {
    const activeUser = this.resolveUserId(userId);
    try {
      await this.syncRepo.updateOperationStatus(id, activeUser, status, error);
    } catch (err) {
      console.error('[DexieOfflineQueueRepository] Error updating status:', err);
      throw err;
    }
  }

  async incrementRetry(id: string, error: string, userId?: string | null): Promise<void> {
    const activeUser = this.resolveUserId(userId);
    try {
      await this.syncRepo.incrementOperationRetry(id, activeUser, error);
    } catch (err) {
      console.error('[DexieOfflineQueueRepository] Error incrementing retry:', err);
      throw err;
    }
  }

  async remove(id: string, userId?: string | null): Promise<void> {
    const activeUser = this.resolveUserId(userId);
    try {
      await this.syncRepo.removeOperation(id, activeUser);
    } catch (err) {
      console.error('[DexieOfflineQueueRepository] Error removing operation:', err);
      throw err;
    }
  }
}

export const offlineRepository: IOfflineQueueRepository = new DexieOfflineQueueRepository();
