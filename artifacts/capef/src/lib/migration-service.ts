import { db, type LocalOfflineOperation } from './repositories/CapefDexieDatabase';
import { syncRepository } from './repositories/SyncRepository';

const LEGACY_STORAGE_KEYS = [
  'capef_offline_queue_v2',
  'capef_offline_queue',
  'capef_offline_actions_queue',
];

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

export class MigrationService {
  private currentSchemaVersion = 2;

  /**
   * Migrate legacy localStorage queues (v2, members, actions) into Dexie IndexedDB.
   *
   * CRITICAL GUARANTEE:
   * Legacy localStorage keys are ONLY purged after Dexie database insertion is fully confirmed.
   */
  async migrateLegacyLocalStorageToDexie(userId: string = 'anonymous_user'): Promise<{ migratedCount: number }> {
    if (typeof localStorage === 'undefined') {
      return { migratedCount: 0 };
    }

    let migratedCount = 0;
    const keysToPurge: string[] = [];

    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const opId = item.id || generateUUID();
            const clientOpId = item.clientOperationId || generateUUID();
            const opType = item.operationType || item.type || 'create_member';
            const payload = item.payload || item;

            const op: Omit<LocalOfflineOperation, 'id'> = {
              operationId: opId,
              clientOperationId: clientOpId,
              userId: item.userId || userId,
              operationType: opType,
              payload,
              status: item.status || 'pending',
              retryCount: item.retryCount || 0,
              lastError: item.lastError || null,
              createdAt: item.createdAt || new Date().toISOString(),
            };

            await syncRepository.enqueueOperation(op);
            migratedCount++;
          }
        }
        keysToPurge.push(key);
      } catch (err) {
        console.error(`[MigrationService] Error parsing legacy key "${key}":`, err);
      }
    }

    // ONLY purge legacy LocalStorage keys AFTER successful Dexie enqueuing
    if (migratedCount > 0) {
      for (const k of keysToPurge) {
        localStorage.removeItem(k);
      }
      console.log(`[MigrationService] Successfully migrated ${migratedCount} operations to Dexie IndexedDB and purged ${keysToPurge.length} legacy localStorage keys.`);
    }

    return { migratedCount };
  }

  /**
   * Check app version and Dexie schema version compatibility.
   */
  checkSchemaCompatibility(appVersion: string, installedVersion: number = this.currentSchemaVersion): { isCompatible: boolean; message: string } {
    if (installedVersion > this.currentSchemaVersion) {
      return {
        isCompatible: false,
        message: `Version de base de données Dexie (${installedVersion}) supérieure à la version supportée (${this.currentSchemaVersion}). Veuillez mettre à jour l'application.`,
      };
    }
    return {
      isCompatible: true,
      message: `Compatibilité vérifiée: App ${appVersion} / Schema Dexie v${installedVersion}`,
    };
  }
}

export const migrationService = new MigrationService();
