import { db, type LocalOfflineOperation } from './CapefDexieDatabase';

export interface ISyncRepository {
  enqueueOperation(operation: Omit<LocalOfflineOperation, 'id'>): Promise<LocalOfflineOperation>;
  getOperationsByUser(userId: string): Promise<LocalOfflineOperation[]>;
  getPendingOperationsByUser(userId: string): Promise<LocalOfflineOperation[]>;
  updateOperationStatus(operationId: string, userId: string, status: 'pending' | 'processing' | 'failed' | 'completed', error?: string): Promise<void>;
  incrementOperationRetry(operationId: string, userId: string, error: string): Promise<void>;
  removeOperation(operationId: string, userId: string): Promise<void>;
}

export class DexieSyncRepository implements ISyncRepository {
  async enqueueOperation(operation: Omit<LocalOfflineOperation, 'id'>): Promise<LocalOfflineOperation> {
    try {
      const id = await db.operations.add(operation as LocalOfflineOperation);
      return { ...operation, id };
    } catch (error) {
      console.error('[SyncRepository] Error enqueuing operation:', error);
      throw error;
    }
  }

  async getOperationsByUser(userId: string): Promise<LocalOfflineOperation[]> {
    try {
      return await db.operations.where('userId').equals(userId).toArray();
    } catch (error) {
      console.error('[SyncRepository] Error fetching operations:', error);
      throw error;
    }
  }

  async getPendingOperationsByUser(userId: string): Promise<LocalOfflineOperation[]> {
    try {
      return await db.operations
        .where('userId')
        .equals(userId)
        .and((op) => op.status === 'pending' || op.status === 'processing')
        .toArray();
    } catch (error) {
      console.error('[SyncRepository] Error fetching pending operations:', error);
      throw error;
    }
  }

  async updateOperationStatus(
    operationId: string,
    userId: string,
    status: 'pending' | 'processing' | 'failed' | 'completed',
    error?: string
  ): Promise<void> {
    try {
      const op = await db.operations.where({ operationId, userId }).first();
      if (op && op.id) {
        const updates: Partial<LocalOfflineOperation> = { status };
        if (error !== undefined) updates.lastError = error;
        await db.operations.update(op.id, updates);
      }
    } catch (error) {
      console.error('[SyncRepository] Error updating operation status:', error);
      throw error;
    }
  }

  async incrementOperationRetry(operationId: string, userId: string, error: string): Promise<void> {
    try {
      const op = await db.operations.where({ operationId, userId }).first();
      if (op && op.id) {
        await db.operations.update(op.id, {
          retryCount: (op.retryCount || 0) + 1,
          status: 'pending',
          lastError: error,
        });
      }
    } catch (error) {
      console.error('[SyncRepository] Error incrementing operation retry:', error);
      throw error;
    }
  }

  async removeOperation(operationId: string, userId: string): Promise<void> {
    try {
      const op = await db.operations.where({ operationId, userId }).first();
      if (op && op.id) {
        await db.operations.delete(op.id);
      }
    } catch (error) {
      console.error('[SyncRepository] Error removing operation:', error);
      throw error;
    }
  }
}

export const syncRepository = new DexieSyncRepository();
