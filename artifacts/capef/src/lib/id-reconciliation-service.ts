import { db, EntityMapping } from './repositories/CapefDexieDatabase';

export type EntityRef =
  | { kind: 'server'; id: number }
  | { kind: 'local'; localId: string };

export class UnresolvedDependencyError extends Error {
  constructor(public entityType: string, public localId: string) {
    super(`Unresolved local dependency for ${entityType} localId=${localId}`);
    this.name = 'UnresolvedDependencyError';
  }
}

export class IdReconciliationService {
  /**
   * Save a mapping between a client localId and a server numeric ID.
   */
  async saveMapping(localId: string, entityType: 'member' | 'activity' | 'line_item' | 'media', serverId: number): Promise<void> {
    try {
      await db.entityMappings.put({
        localId,
        entityType,
        serverId,
        syncStatus: 'synced',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IdReconciliationService] Error saving mapping:', err);
      throw err;
    }
  }

  /**
   * Resolve an EntityRef or localId string into an integer server ID.
   * Throws UnresolvedDependencyError if localId has not been mapped yet.
   */
  async resolveRef(entityType: 'member' | 'activity' | 'line_item' | 'media', ref: EntityRef | number | string | null | undefined): Promise<number | null> {
    if (ref === null || ref === undefined) {
      return null;
    }

    if (typeof ref === 'number') {
      return ref;
    }

    if (typeof ref === 'object' && ref.kind === 'server') {
      return ref.id;
    }

    const localId = typeof ref === 'string' ? ref : ref.localId;
    if (!localId) return null;

    const mapping = await db.entityMappings.where({ entityType, localId }).first();
    if (mapping && typeof mapping.serverId === 'number') {
      return mapping.serverId;
    }
    if (mapping && typeof mapping.serverId === 'string') {
      const parsed = parseInt(mapping.serverId, 10);
      if (!isNaN(parsed)) return parsed;
    }

    throw new UnresolvedDependencyError(entityType, localId);
  }

  /**
   * Atomically map server response IDs and remove the completed operation from Dexie operations queue.
   */
  async reconcileAndRemoveOperation(
    operationId: string,
    userId: string,
    operationType: string,
    payload: any,
    serverResponse: any
  ): Promise<void> {
    await db.transaction('rw', [db.operations, db.entityMappings], async () => {
      const now = new Date().toISOString();

      // 1. Save mappings
      if (operationType === 'create_member' && serverResponse) {
        if (payload._local?.localId && serverResponse.id) {
          await db.entityMappings.put({
            localId: payload._local.localId,
            entityType: 'member',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
        }
        if (payload._local?.primaryActivityLocalId && Array.isArray(serverResponse.activities)) {
          const primaryAct = serverResponse.activities.find((a: any) => a.isPrimary);
          if (primaryAct && primaryAct.id) {
            await db.entityMappings.put({
              localId: payload._local.primaryActivityLocalId,
              entityType: 'activity',
              serverId: primaryAct.id,
              syncStatus: 'synced',
              createdAt: now,
            });
          }
        }
      } else if (operationType === 'create_activity' && serverResponse?.id) {
        if (payload._local?.localId) {
          await db.entityMappings.put({
            localId: payload._local.localId,
            entityType: 'activity',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
        }
      } else if (operationType === 'create_line_item' && serverResponse?.id) {
        if (payload._local?.localId) {
          await db.entityMappings.put({
            localId: payload._local.localId,
            entityType: 'line_item',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
        }
      }

      // 2. Remove operation from Dexie queue
      const op = await db.operations.where({ operationId, userId }).first();
      if (op && op.id) {
        await db.operations.delete(op.id);
      }
    });
  }
}

export const idReconciliationService = new IdReconciliationService();
