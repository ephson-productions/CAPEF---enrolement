import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Canary regression test for App.tsx Query Persistence wiring.
 *
 * Why source code assertion was chosen:
 * Full DOM/React tree mounting of App.tsx requires heavy mocking of Clerk, Wouter router,
 * and browser environment. Reading and asserting structural source invariants guarantees
 * that App.tsx retains PersistQueryClientProvider, createSyncStoragePersister,
 * offlineFirst network mode, and OfflineBootstrapTrigger without maintaining fragile runtime mocks.
 */
describe('App.tsx Query Persistence Canary Test', () => {
  it('verifies essential Query Persistence and Offline Bootstrap wiring in App.tsx', () => {
    const appPath = path.resolve(__dirname, '../../App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // 1. Verify PersistQueryClientProvider import and usage
    expect(source).toContain("import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';");
    expect(source).toContain('<PersistQueryClientProvider client={queryClient}');

    // 2. Verify createSyncStoragePersister import and usage
    expect(source).toContain("import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';");
    expect(source).toContain('const persister = createSyncStoragePersister(');
    expect(source).toContain("key: 'capef_query_cache_v1'");

    // 3. Verify offlineFirst network mode configuration
    expect(source).toContain("networkMode: 'offlineFirst'");
    expect(source).toContain('gcTime: 1000 * 60 * 60 * 24 * 7'); // 7 days

    // 4. Verify bootstrapService import and OfflineBootstrapTrigger mounting
    expect(source).toContain("import { bootstrapService } from './lib/bootstrap-service';");
    expect(source).toContain('<OfflineBootstrapTrigger />');
  });
});
