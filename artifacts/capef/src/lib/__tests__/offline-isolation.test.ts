import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageQueueRepository } from '../offline-repository';

// Simple in-memory localStorage mock for node environment
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

describe('Phase 8A — Offline Multi-Agent Isolation Test', () => {
  let repository: LocalStorageQueueRepository;

  beforeEach(() => {
    (global as any).localStorage = createLocalStorageMock();
    repository = new LocalStorageQueueRepository();
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

  it('migrates un-namespaced legacy queue items to active agent on first load', async () => {
    const agentAId = 'user_clerk_agent_a_123';

    // Simulate legacy un-namespaced items in capef_offline_queue_v2
    localStorage.setItem(
      'capef_offline_queue_v2',
      JSON.stringify([
        {
          id: 'legacy_1',
          clientOperationId: 'op_legacy_1',
          operationType: 'create_member',
          payload: { name: 'Membre Ancien' },
          createdAt: new Date().toISOString(),
          retryCount: 0,
          status: 'pending',
          lastError: null,
        },
      ])
    );

    // Agent A logs in and accesses queue
    const agentAPending = await repository.getPending(agentAId);
    expect(agentAPending).toHaveLength(1);
    expect(agentAPending[0].payload.name).toBe('Membre Ancien');

    // Un-namespaced legacy key should be cleared
    expect(localStorage.getItem('capef_offline_queue_v2')).toBeNull();
  });
});
