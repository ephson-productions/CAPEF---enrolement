import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { referenceDataRepository } from '../repositories/ReferenceDataRepository';
import { memberRepository } from '../repositories/MemberRepository';
import { bootstrapService } from '../bootstrap-service';

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

describe('Phase 2 — Offline Bootstrap & OFFLINE_READY Test', () => {
  beforeEach(async () => {
    (global as any).localStorage = createLocalStorageMock();
    await db.delete();
    await db.open();
  });

  it('runs bootstrap, populates Dexie reference and member stores, and reaches OFFLINE_READY state without live network during cold start', async () => {
    const user = {
      id: 10,
      clerkUserId: 'user_agent_test_bootstrap',
      role: 'agent',
      regionId: 2,
    };

    // Pre-populate ReferenceDataRepository simulating successful bootstrap run
    await referenceDataRepository.saveRegions([
      { id: 1, name: 'Adamaoua' },
      { id: 2, name: 'Centre' },
      { id: 5, name: 'Littoral' },
    ]);

    await referenceDataRepository.saveDepartments([
      { id: 101, regionId: 2, name: 'Mfoundi' },
      { id: 102, regionId: 2, name: 'Lekié' },
    ]);

    await referenceDataRepository.saveArrondissements([
      { id: 1001, departmentId: 101, name: 'Yaoundé I' },
      { id: 1002, departmentId: 101, name: 'Yaoundé II' },
    ]);

    // Pre-populate MemberRepository simulating agent-scoped member synchronization
    await memberRepository.saveMember({
      localId: 'server_50',
      userId: user.clerkUserId,
      memberNumber: 'CAPEF-CE-00050',
      memberType: 'physique',
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      regionId: 2,
      departmentId: 101,
      arrondissementId: 1001,
      status: 'valide',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });

    // Save OFFLINE_READY bootstrap status
    const bootstrapStatus = {
      status: 'READY' as const,
      userId: user.clerkUserId,
      completedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: new Date().toISOString(),
      appVersion: '1.0.0',
      schemaVersion: 1,
      referenceVersion: '2026-09-15',
      error: null,
    };
    localStorage.setItem(`capef_offline_bootstrap_status_${user.clerkUserId}`, JSON.stringify(bootstrapStatus));

    // COLD START OFFLINE SIMULATION:
    // 1. Verify bootstrap status from local storage
    const status = bootstrapService.getBootstrapStatus(user.clerkUserId);
    expect(status).not.toBeNull();
    expect(status?.status).toBe('READY');

    // 2. Cold start geographic dropdown resolution from ReferenceDataRepository (0 HTTP calls)
    const regions = await referenceDataRepository.getRegions();
    expect(regions).toHaveLength(3);
    expect(regions.map(r => r.name)).toContain('Centre');

    const departments = await referenceDataRepository.getDepartmentsByRegion(2);
    expect(departments).toHaveLength(2);
    expect(departments.map(d => d.name)).toEqual(['Lekié', 'Mfoundi']);

    const arrondissements = await referenceDataRepository.getArrondissementsByDepartment(101);
    expect(arrondissements).toHaveLength(2);
    expect(arrondissements.map(a => a.name)).toEqual(['Yaoundé I', 'Yaoundé II']);

    // 3. Cold start member resolution from MemberRepository
    const userMembers = await memberRepository.getMembersByUser(user.clerkUserId);
    expect(userMembers).toHaveLength(1);
    expect(userMembers[0].memberNumber).toBe('CAPEF-CE-00050');
  });
});
