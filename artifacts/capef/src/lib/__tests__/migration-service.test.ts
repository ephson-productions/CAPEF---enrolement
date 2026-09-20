import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { migrationService } from '../migration-service';
import { db } from '../repositories/CapefDexieDatabase';
import { syncRepository } from '../repositories/SyncRepository';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Phase 12 — Migration Service & Schema Versioning Tests', () => {
  const testUserId = 'user_migration_test_888';

  beforeEach(async () => {
    (global as any).localStorage = createLocalStorageMock();
    await db.operations.clear();
  });

  it('migrates non-empty legacy localStorage queues into Dexie IndexedDB and purges localStorage keys AFTER migration confirmation', async () => {
    // 1. Seed realistic legacy LocalStorage data across v2 and legacy keys
    const legacyQueueV2 = [
      {
        id: 'legacy_v2_op_1',
        clientOperationId: 'client_op_v2_1',
        userId: testUserId,
        operationType: 'create_member',
        payload: { memberType: 'physique', category: 'agriculteur', physiqueData: { nom: 'Legacy V2 Member' } },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
        lastError: null,
      },
    ];

    const legacyMembersQueue = [
      {
        memberType: 'morale',
        category: 'eleveur',
        moraleData: { nom: 'Legacy GIC Coop' },
      },
    ];

    const legacyActionsQueue = [
      {
        type: 'create_activity',
        memberId: 55,
        data: { activityType: 'eleveur', isPrimary: true },
      },
    ];

    localStorage.setItem('capef_offline_queue_v2', JSON.stringify(legacyQueueV2));
    localStorage.setItem('capef_offline_queue', JSON.stringify(legacyMembersQueue));
    localStorage.setItem('capef_offline_actions_queue', JSON.stringify(legacyActionsQueue));

    // Initial check: legacy keys are present before migration
    expect(localStorage.getItem('capef_offline_queue_v2')).not.toBeNull();
    expect(localStorage.getItem('capef_offline_queue')).not.toBeNull();
    expect(localStorage.getItem('capef_offline_actions_queue')).not.toBeNull();

    // 2. Execute migration
    const result = await migrationService.migrateLegacyLocalStorageToDexie(testUserId);

    expect(result.migratedCount).toBe(3);

    // 3. Verify all 3 items now reside intact in Dexie IndexedDB
    const dexieOps = await syncRepository.getOperationsByUser(testUserId);
    expect(dexieOps.length).toBe(3);

    const memberOp = dexieOps.find((o) => o.operationType === 'create_member');
    expect(memberOp).toBeDefined();

    const activityOp = dexieOps.find((o) => o.operationType === 'create_activity');
    expect(activityOp).toBeDefined();

    // 4. VERIFY LEGACY KEYS PURGED AFTER CONFIRMED MIGRATION
    expect(localStorage.getItem('capef_offline_queue_v2')).toBeNull();
    expect(localStorage.getItem('capef_offline_queue')).toBeNull();
    expect(localStorage.getItem('capef_offline_actions_queue')).toBeNull();
  });

  it('validates schema compatibility check against app version', () => {
    const valid = migrationService.checkSchemaCompatibility('1.0.0', 2);
    expect(valid.isCompatible).toBe(true);

    const incompatible = migrationService.checkSchemaCompatibility('1.0.0', 3);
    expect(incompatible.isCompatible).toBe(false);
    expect(incompatible.message).toContain('supérieure');
  });
});
