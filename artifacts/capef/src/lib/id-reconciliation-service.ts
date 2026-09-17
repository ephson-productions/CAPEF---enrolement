import { db, type EntityMapping } from './repositories/CapefDexieDatabase';

export class IdReconciliationService {
  /**
   * Immediately record or update a mapping between a localId (UUID) and a server integer/string ID.
   */
  async recordMapping(
    entityType: 'member' | 'activity' | 'line_item' | 'media',
    localId: string,
    serverId: number | string
  ): Promise<EntityMapping> {
    try {
      const existing = await db.entityMappings
        .where({ entityType, localId })
        .first();

      const now = new Date().toISOString();

      if (existing && existing.id) {
        await db.entityMappings.update(existing.id, {
          serverId,
          syncStatus: 'synced',
        });
        return { ...existing, serverId, syncStatus: 'synced' };
      } else {
        const mapping: EntityMapping = {
          entityType,
          localId,
          serverId,
          syncStatus: 'synced',
          createdAt: now,
        };
        const id = await db.entityMappings.add(mapping);
        return { ...mapping, id };
      }
    } catch (error) {
      console.error('[IdReconciliationService] Error recording mapping:', error);
      throw error;
    }
  }

  /**
   * Resolve a serverId given an entityType and localId or numeric candidate ID.
   * If candidateId is already a number or numeric string, it is returned directly.
   * If candidateId is a local UUID string, it is resolved from the persistent entityMappings table.
   */
  async resolveServerId(
    entityType: 'member' | 'activity' | 'line_item' | 'media',
    candidateId: number | string
  ): Promise<number | string> {
    if (typeof candidateId === 'number') {
      return candidateId;
    }

    // Check if candidateId is a numeric string
    if (!isNaN(Number(candidateId)) && !isNaN(parseInt(String(candidateId), 10))) {
      return Number(candidateId);
    }

    // candidateId is a local UUID string, look up in entityMappings table
    try {
      const mapping = await db.entityMappings
        .where({ entityType, localId: String(candidateId) })
        .first();

      if (mapping && mapping.serverId !== undefined && mapping.serverId !== null) {
        return mapping.serverId;
      }

      // If not mapped yet, return original candidateId
      return candidateId;
    } catch (error) {
      console.error('[IdReconciliationService] Error resolving serverId:', error);
      return candidateId;
    }
  }

  /**
   * Get all persistent mappings stored in IndexedDB.
   */
  async getAllMappings(): Promise<EntityMapping[]> {
    try {
      return await db.entityMappings.toArray();
    } catch (error) {
      console.error('[IdReconciliationService] Error fetching all mappings:', error);
      return [];
    }
  }

  /**
   * Clear all entity mappings (used during reset/logout or tests).
   */
  async clearMappings(): Promise<void> {
    try {
      await db.entityMappings.clear();
    } catch (error) {
      console.error('[IdReconciliationService] Error clearing mappings:', error);
    }
  }
}

export const idReconciliationService = new IdReconciliationService();
