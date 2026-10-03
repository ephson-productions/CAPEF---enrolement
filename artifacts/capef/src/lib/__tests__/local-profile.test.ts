import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { localProfileService, MAX_OFFLINE_DURATION_MS } from '../local-profile-service';
import { migrationService } from '../migration-service';
import { db } from '../repositories/CapefDexieDatabase';

// Polyfill WebCrypto for Node environment in Vitest
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

describe('LocalProfileService & Offline Identity Unit Tests', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await db.operations.clear();
  });

  it('hashes PIN deterministically with WebCrypto PBKDF2 and random salt', async () => {
    const pin = '1234';
    const { hashHex, saltHex } = await localProfileService.hashPin(pin);

    expect(hashHex).toBeDefined();
    expect(hashHex.length).toBe(64); // 256 bits = 64 hex chars
    expect(saltHex).toBeDefined();
    expect(saltHex.length).toBe(32); // 16 bytes = 32 hex chars

    // Verifying with same salt produces identical hash
    const rehash = await localProfileService.hashPin(pin, saltHex);
    expect(rehash.hashHex).toBe(hashHex);
  });

  it('correctly calculates offline expiration (>21 days)', () => {
    const recentDate = new Date().toISOString();
    expect(localProfileService.isOfflineExpired(recentDate)).toBe(false);

    const oldDate = new Date(Date.now() - (MAX_OFFLINE_DURATION_MS + 1000)).toISOString();
    expect(localProfileService.isOfflineExpired(oldDate)).toBe(true);
  });

  it('computes correct verification status online and offline', () => {
    const recentDate = new Date().toISOString();
    const oldDate = new Date(Date.now() - (MAX_OFFLINE_DURATION_MS + 1000)).toISOString();

    expect(localProfileService.getVerificationStatus(true, recentDate)).toBe('verified-online');
    expect(localProfileService.getVerificationStatus(false, recentDate)).toBe('not-reverified-offline');
    expect(localProfileService.getVerificationStatus(false, oldDate)).toBe('expired-readonly');
  });

  it('migrates legacy anonymous_user operations into active user scope without data loss', async () => {
    const targetUserId = 'user_active_agent_123';

    // Insert dummy anonymous_user operation
    await db.operations.add({
      operationId: 'op_anon_1',
      clientOperationId: 'client_anon_1',
      userId: 'anonymous_user',
      operationType: 'create_member',
      payload: { name: 'Test Member' },
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    const migrated = await migrationService.migrateAnonymousOperationsToUser(targetUserId);
    expect(migrated).toBe(1);

    const remainingAnon = await db.operations.where('userId').equals('anonymous_user').toArray();
    expect(remainingAnon.length).toBe(0);

    const migratedOps = await db.operations.where('userId').equals(targetUserId).toArray();
    expect(migratedOps.length).toBe(1);
    expect(migratedOps[0].operationId).toBe('op_anon_1');
  });
});
