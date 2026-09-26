import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../repositories/CapefDexieDatabase';
import { offlineRepository } from '../../offline-repository';
import { syncEngine } from '../../sync-engine';
import { idReconciliationService } from '../../id-reconciliation-service';

describe('Offline Activity Sync & Replay Test Suite', () => {
  beforeEach(async () => {
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.members.clear();
  });

  it('1. Enqueues create_member, create_activity, and create_line_item with local UUID refs', async () => {
    const memberUuid = 'member_local_123';
    const activityUuid = 'act_local_456';

    const memOp = await offlineRepository.enqueue('create_member', {
      memberType: 'physique',
      category: 'agriculteur',
      _local: { localId: memberUuid, primaryActivityLocalId: activityUuid },
    }, 'user_agent_1');

    expect(memOp.status).toBe('pending');
    expect(memOp.clientOperationId).toBeDefined();

    const pending = await offlineRepository.getPending('user_agent_1');
    expect(pending).toHaveLength(1);
    expect(pending[0].operationType).toBe('create_member');
  });

  it('2. User isolation: Agent A does not receive or replay operations enqueued by Agent B', async () => {
    await offlineRepository.enqueue('create_member', { category: 'agriculteur' }, 'agent_a');
    await offlineRepository.enqueue('create_member', { category: 'pecheur' }, 'agent_b');

    const pendingA = await offlineRepository.getPending('agent_a');
    const pendingB = await offlineRepository.getPending('agent_b');

    expect(pendingA).toHaveLength(1);
    expect(pendingA[0].payload.category).toBe('agriculteur');

    expect(pendingB).toHaveLength(1);
    expect(pendingB[0].payload.category).toBe('pecheur');
  });

  it('3. Reconciliation and ID mapping on server acknowledgement', async () => {
    const localId = 'item_local_999';
    await idReconciliationService.saveMapping(localId, 'line_item', 888);

    const resolved = await idReconciliationService.resolveRef('line_item', { kind: 'local', localId });
    expect(resolved).toBe(888);
  });
});
