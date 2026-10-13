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

    // 1. Primary lookup in entityMappings
    const mapping = await db.entityMappings.where({ entityType, localId }).first();
    if (mapping && typeof mapping.serverId === 'number') {
      return mapping.serverId;
    }
    if (mapping && typeof mapping.serverId === 'string') {
      const parsed = parseInt(mapping.serverId, 10);
      if (!isNaN(parsed)) return parsed;
    }

    // 2. Resilient fallback lookup directly in Dexie entity tables
    if (entityType === 'member') {
      const m = await db.members.where('localId').equals(localId).first();
      if (m && typeof m.serverId === 'number') {
        return m.serverId;
      }
    } else if (entityType === 'activity') {
      const act = await db.activities.where('localId').equals(localId).first();
      if (act && typeof act.serverId === 'number') {
        return act.serverId;
      }
      if (act) {
        const canonical = await db.activities
          .where('memberLocalId')
          .equals(act.memberLocalId)
          .filter(a => a.activityType === act.activityType && typeof a.serverId === 'number')
          .first();
        if (canonical && typeof canonical.serverId === 'number') {
          return canonical.serverId;
        }
      }
    } else if (entityType === 'line_item') {
      const li = await db.lineItems.where('localId').equals(localId).first();
      if (li && typeof li.serverId === 'number') {
        return li.serverId;
      }
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
    await db.transaction('rw', [db.operations, db.entityMappings, db.members, db.activities, db.lineItems], async () => {
      const now = new Date().toISOString();

      // 1. Save mappings
      if (operationType === 'create_member' && serverResponse) {
        const memberLocalId = payload._local?.localId || payload.localId;
        if (memberLocalId && serverResponse.id) {
          await db.entityMappings.put({
            localId: memberLocalId,
            entityType: 'member',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
          await db.members.where('localId').equals(memberLocalId).modify({
            serverId: serverResponse.id,
            memberNumber: serverResponse.memberNumber || undefined,
            syncStatus: 'synced',
          });
        }
        const primActId = payload._local?.primaryActivityLocalId || payload.primaryActivityLocalId;
        if (primActId && Array.isArray(serverResponse.activities)) {
          const primaryAct = serverResponse.activities.find((a: any) => a.isPrimary);
          if (primaryAct && primaryAct.id) {
            await db.entityMappings.put({
              localId: primActId,
              entityType: 'activity',
              serverId: primaryAct.id,
              syncStatus: 'synced',
              createdAt: now,
            });
            await db.activities.where('localId').equals(primActId).modify({
              serverId: primaryAct.id,
              syncStatus: 'synced',
            });
          }
        }
      } else if (operationType === 'create_activity' && serverResponse?.id) {
        const actLocalId = payload._local?.localId || payload.data?.localId || payload.localId;
        if (actLocalId) {
          await db.entityMappings.put({
            localId: actLocalId,
            entityType: 'activity',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
          await db.activities.where('localId').equals(actLocalId).modify({
            serverId: serverResponse.id,
            syncStatus: 'synced',
          });
        }
      } else if (operationType === 'create_line_item' && serverResponse?.id) {
        const lineLocalId = payload._local?.localId || payload.data?.localId || payload.localId;
        if (lineLocalId) {
          await db.entityMappings.put({
            localId: lineLocalId,
            entityType: 'line_item',
            serverId: serverResponse.id,
            syncStatus: 'synced',
            createdAt: now,
          });
          await db.lineItems.where('localId').equals(lineLocalId).modify({
            serverId: serverResponse.id,
            syncStatus: 'synced',
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
