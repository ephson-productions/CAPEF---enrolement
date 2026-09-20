import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLocallyCachedRoleForUIGatingOnly, cacheClaimsForUIGatingOnly } from '../auth';
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

describe('Phase 8B — Offline Auth UI Claims Gating Cache Tests', () => {
  const mockUser: AppUser = {
    id: 42,
    clerkUserId: 'user_clerk_agent_777',
    email: 'agent777@capef.cm',
    name: 'Agent Test 777',
    role: 'agent',
    status: 'active',
    regionId: 3,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    (global as any).localStorage = createLocalStorageMock();
    vi.useRealTimers();
  });

  it('persists claims for 21 days and retrieves them for UI gating when offline', () => {
    cacheClaimsForUIGatingOnly(mockUser);

    const cached = getLocallyCachedRoleForUIGatingOnly(mockUser.clerkUserId);
    expect(cached).not.toBeNull();
    expect(cached?.role).toBe('agent');
    expect(cached?.assignedRegionId).toBe(3);
    expect(cached?.email).toBe('agent777@capef.cm');
  });

  it('expires cached UI claims and returns null when past 21 days TTL', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-01T10:00:00Z');
    vi.setSystemTime(now);

    cacheClaimsForUIGatingOnly(mockUser);

    // Fast-forward 20 days (should still be valid)
    vi.setSystemTime(new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000));
    expect(getLocallyCachedRoleForUIGatingOnly(mockUser.clerkUserId)).not.toBeNull();

    // Fast-forward past 21 days (22 days: expired)
    vi.setSystemTime(new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000));
    const expired = getLocallyCachedRoleForUIGatingOnly(mockUser.clerkUserId);
    expect(expired).toBeNull();
  });
});
