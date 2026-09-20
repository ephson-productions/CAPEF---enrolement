import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { offlineRepository } from '../../offline-repository';
import { cacheClaimsForUIGatingOnly, getLocallyCachedRoleForUIGatingOnly } from '../../auth';
import type { AppUser } from '@workspace/api-client-react';

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

describe('Phase 13 — 72-Hour Continuous Offline Simulation Tests', () => {
  const mockAgent: AppUser = {
    id: 101,
    clerkUserId: 'user_clerk_agent_72h',
    email: 'agent72h@capef.cm',
    name: 'Field Agent 72H',
    role: 'agent',
    status: 'active',
    regionId: 4,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    (global as any).localStorage = createLocalStorageMock();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  it('simulates progressive field usage across T+0, T+24h, T+48h, and T+72h offline without queue loss or claim expiration', async () => {
    const startTime = new Date('2026-09-01T08:00:00Z');
    vi.setSystemTime(startTime);

    // T+0: Agent logs in online, claims are cached for UI gating, and initial enrollment is captured offline
    cacheClaimsForUIGatingOnly(mockAgent);
    const initialItem = await offlineRepository.enqueue('create_member', { name: 'Member Day 0' }, mockAgent.clerkUserId);

    expect(initialItem).toBeDefined();
    let pending = await offlineRepository.getPending(mockAgent.clerkUserId);
    expect(pending.length).toBe(1);

    let claims = getLocallyCachedRoleForUIGatingOnly(mockAgent.clerkUserId);
    expect(claims).not.toBeNull();
    expect(claims?.role).toBe('agent');

    // T+24h (1 Day Offline): Agent captures additional activities and member edits in remote zone
    vi.setSystemTime(new Date(startTime.getTime() + 24 * 60 * 60 * 1000));

    await offlineRepository.enqueue('create_activity', { memberId: 101, activityType: 'agriculteur' }, mockAgent.clerkUserId);
    pending = await offlineRepository.getPending(mockAgent.clerkUserId);
    expect(pending.length).toBe(2);

    claims = getLocallyCachedRoleForUIGatingOnly(mockAgent.clerkUserId);
    expect(claims).not.toBeNull();
    expect(claims?.role).toBe('agent');

    // T+48h (2 Days Offline): Agent creates line items for field crops
    vi.setSystemTime(new Date(startTime.getTime() + 48 * 60 * 60 * 1000));

    await offlineRepository.enqueue('create_line_item', { memberId: 101, activityId: 201, cropName: 'Cacao' }, mockAgent.clerkUserId);
    pending = await offlineRepository.getPending(mockAgent.clerkUserId);
    expect(pending.length).toBe(3);

    claims = getLocallyCachedRoleForUIGatingOnly(mockAgent.clerkUserId);
    expect(claims).not.toBeNull();

    // T+72h (3 Days Offline): Full 72-hour offline milestone reached
    vi.setSystemTime(new Date(startTime.getTime() + 72 * 60 * 60 * 1000));

    await offlineRepository.enqueue('update_member', { id: 101, village: 'Village Far North' }, mockAgent.clerkUserId);
    pending = await offlineRepository.getPending(mockAgent.clerkUserId);
    expect(pending.length).toBe(4);

    claims = getLocallyCachedRoleForUIGatingOnly(mockAgent.clerkUserId);
    expect(claims).not.toBeNull();
    expect(claims?.email).toBe('agent72h@capef.cm');

    // All 4 operations created across 72 hours are completely preserved in sequence
    const allOps = await offlineRepository.getAll(mockAgent.clerkUserId);
    expect(allOps.length).toBe(4);
    expect(allOps.map((o) => o.operationType)).toEqual([
      'create_member',
      'create_activity',
      'create_line_item',
      'update_member',
    ]);
  });
});
