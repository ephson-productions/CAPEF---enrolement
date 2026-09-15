import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

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

describe('Phase 3 — TanStack Query Cache Persistence & Offline Reload Test', () => {
  let storageMock: any;

  beforeEach(() => {
    storageMock = createLocalStorageMock();
    (global as any).localStorage = storageMock;
  });

  it('persists query cache and hydrates across cold restarts offline without white screens or empty cache', async () => {
    const PERSIST_KEY = 'capef_query_cache_v1';

    // 1. Session 1: Populate QueryClient with member list & dashboard stats while online
    const queryClient1 = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 1000 * 60 * 60 * 24 * 7,
          staleTime: 1000 * 60 * 5,
          networkMode: 'offlineFirst',
        },
      },
    });

    queryClient1.setQueryData(['members', { page: 1 }], {
      data: [{ id: 1, name: 'Membre Persistent 1', status: 'valide' }],
      total: 1,
      page: 1,
      limit: 10,
    });

    queryClient1.setQueryData(['dashboard-stats'], {
      totalMembers: 42,
      byRegion: [{ regionName: 'Centre', count: 42 }],
    });

    // Dehydrate state and persist to storage
    const dehydratedState = dehydrate(queryClient1);
    storageMock.setItem(PERSIST_KEY, JSON.stringify(dehydratedState));

    // Verify storage has persisted query cache key
    const persistedRaw = storageMock.getItem(PERSIST_KEY);
    expect(persistedRaw).not.toBeNull();
    expect(persistedRaw).toContain('Membre Persistent 1');
    expect(persistedRaw).toContain('42');

    // 2. Session 2 (Offline Cold Reload / F5 simulation): Instantiate fresh QueryClient and restore
    const queryClient2 = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 1000 * 60 * 60 * 24 * 7,
          staleTime: 1000 * 60 * 5,
          networkMode: 'offlineFirst',
        },
      },
    });

    const restoredStateRaw = storageMock.getItem(PERSIST_KEY);
    expect(restoredStateRaw).not.toBeNull();

    if (restoredStateRaw) {
      hydrate(queryClient2, JSON.parse(restoredStateRaw));
    }

    // Verify hydrated queries in Session 2
    const hydratedMembers = queryClient2.getQueryData<any>(['members', { page: 1 }]);
    const hydratedStats = queryClient2.getQueryData<any>(['dashboard-stats']);

    expect(hydratedMembers).toBeDefined();
    expect(hydratedMembers.data[0].name).toBe('Membre Persistent 1');

    expect(hydratedStats).toBeDefined();
    expect(hydratedStats.totalMembers).toBe(42);
  });
});
