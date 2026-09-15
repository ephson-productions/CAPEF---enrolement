import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { DexieOfflineQueueRepository } from '../offline-repository';

describe('Phase 8A — Offline Multi-Agent Isolation Test (Dexie)', () => {
  let repository: DexieOfflineQueueRepository;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    repository = new DexieOfflineQueueRepository();
  });

  it('isolates offline queue items by clerkUserId and prevents Agent B from reading or syncing Agent A items', async () => {
    const agentAId = 'user_clerk_agent_a_123';
    const agentBId = 'user_clerk_agent_b_456';

    // 1. Agent A enqueues 2 member enrollment items
    await repository.enqueue(
      'create_member',
      { name: 'Membre Agent A 1', category: 'agriculteur' },
      agentAId
    );
    await repository.enqueue(
      'create_member',
      { name: 'Membre Agent A 2', category: 'pecheur' },
      agentAId
    );

    // Verify Agent A queue contains 2 pending items
    const agentAPending = await repository.getPending(agentAId);
    expect(agentAPending).toHaveLength(2);
    expect(agentAPending[0].payload.name).toBe('Membre Agent A 1');

    // 2. Simulate User Switch to Agent B
    // Read queue under Agent B identity
    const agentBPending = await repository.getPending(agentBId);
    const agentBAll = await repository.getAll(agentBId);

    // VERIFICATION: Agent B queue MUST be completely empty (0 items)
    expect(agentBPending).toHaveLength(0);
    expect(agentBAll).toHaveLength(0);

    // 3. Agent B enqueues an item under Agent B identity
    await repository.enqueue(
      'create_member',
      { name: 'Membre Agent B 1', category: 'eleveur' },
      agentBId
    );

    // Agent B sees only their 1 item
    const agentBPendingUpdated = await repository.getPending(agentBId);
    expect(agentBPendingUpdated).toHaveLength(1);
    expect(agentBPendingUpdated[0].payload.name).toBe('Membre Agent B 1');

    // Agent A's queue remains untouched with 2 items
    const agentAPendingFinal = await repository.getPending(agentAId);
    expect(agentAPendingFinal).toHaveLength(2);
  });
});
