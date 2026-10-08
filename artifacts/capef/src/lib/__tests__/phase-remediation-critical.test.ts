import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { memberRepository } from '../repositories/MemberRepository';
import { syncEngine } from '../sync-engine';
import { offlineRepository } from '../offline-repository';

vi.mock('@workspace/api-client-react', () => ({
  customFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { customFetch } from '@workspace/api-client-react';

describe('CAPEF Critical Remediation — Identity, Routing, Agent Name & Single Creation Tests', () => {
  const userId = 'user_agent_critical_001';

  beforeEach(async () => {
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    await db.operations.clear();
    await db.entityMappings.clear();
    vi.clearAllMocks();

    vi.spyOn(syncEngine, 'checkOnlineHealth').mockResolvedValue(true);
  });

  it('1. Test A (Two Crossed IDs): getMemberById(31) strictly returns member with serverId=31, NEVER auto-increment id=31', async () => {
    // Member A: Dexie internal id = 31, serverId = 27
    await db.members.put({
      id: 31,
      localId: 'local_member_a',
      serverId: 27,
      userId,
      memberNumber: 'CAPEF-ELV-000027',
      displayName: 'Member A (Server 27)',
      memberType: 'physique',
      category: 'eleveur',
      individualOrOrg: 'individuel',
      status: 'valide',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });

    // Member B: serverId = 31
    await db.members.put({
      id: 99,
      localId: 'local_member_b',
      serverId: 31,
      userId,
      memberNumber: 'CAPEF-AGR-000031',
      displayName: 'Member B (Server 31)',
      memberType: 'physique',
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      status: 'valide',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });

    // Request ID 31 -> MUST return Member B (serverId = 31)
    const result = await memberRepository.getMemberById(31, userId);
    expect(result).not.toBeNull();
    expect(result?.serverId).toBe(31);
    expect(result?.displayName).toBe('Member B (Server 31)');
    expect(result?.memberNumber).toBe('CAPEF-AGR-000031');
  });

  it('2. Test B (Single Online Creation): Unified single-path enrollment generates exactly 1 server creation call with 1 clientOperationId', async () => {
    const localId = crypto.randomUUID();
    const payload = {
      memberType: 'physique' as const,
      category: 'agriculteur',
      physiqueData: { nom: 'Fosso', prenom: 'Paul' },
      localId,
    };

    // 1. Local write
    await memberRepository.saveLocalMember(userId, payload);

    // 2. Queue enqueue
    const op = await offlineRepository.enqueue('create_member', { ...payload, _local: { localId } }, userId);

    // 3. Mock single server response
    (customFetch as any).mockResolvedValueOnce({ id: 501, memberNumber: 'CAPEF-AGR-00501' });

    // 4. Trigger sync engine
    const syncRes = await syncEngine.syncNow(userId);

    expect(syncRes.successCount).toBe(1);

    // Verify customFetch was called EXACTLY ONCE
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(customFetch).toHaveBeenLastCalledWith(
      '/api/members',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Client-Operation-ID': op.clientOperationId },
      })
    );

    // Verify local record updated to serverId 501
    const updatedMember = await memberRepository.getMemberById(localId, userId);
    expect(updatedMember?.serverId).toBe(501);
    expect(updatedMember?.syncStatus).toBe('synced');
  });

  it('3. Test C (Agent Name Display): getMemberById returns createdByName for display', async () => {
    const serverSummary = {
      id: 77,
      memberNumber: 'CAPEF-PCH-000077',
      memberType: 'physique',
      category: 'pecheur',
      status: 'valide',
      displayName: 'Koko Victor',
      createdByName: 'Agent Jean Paul',
      createdById: 12,
      createdAt: '2026-10-01T10:00:00.000Z',
    };

    await memberRepository.upsertServerMembers(userId, [serverSummary]);

    const retrieved = await memberRepository.getMemberById(77, userId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.createdByName).toBe('Agent Jean Paul');
    expect(retrieved?.displayName).toBe('Koko Victor');
  });
});
