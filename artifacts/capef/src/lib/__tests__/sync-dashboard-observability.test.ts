import { describe, it, expect, beforeEach } from 'vitest';
import { offlineRepository } from '../offline-repository';

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

describe('Phase 11 — Observability Dashboard Data Integration Tests', () => {
  beforeEach(() => {
    (global as any).localStorage = createLocalStorageMock();
  });

  it('correctly aggregates pending and failed counts for observability UI dashboard', async () => {
    // 1. Enqueue 2 pending operations
    await offlineRepository.enqueue('create_member', { name: 'Pending Member 1' });
    const item2 = await offlineRepository.enqueue('create_activity', { memberId: 10 });

    // 2. Mark 1 failed operation
    await offlineRepository.updateStatus(item2.id, 'failed', 'HTTP 400 Bad Request validation failed');

    // Fetch and aggregate
    const allOps = await offlineRepository.getAll();
    const pendingOps = allOps.filter((o) => o.status === 'pending' || o.status === 'processing');
    const failedOps = allOps.filter((o) => o.status === 'failed');

    expect(pendingOps.length).toBe(1);
    expect(failedOps.length).toBe(1);
    expect(failedOps[0].lastError).toContain('HTTP 400');
  });
});
