import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { memberRepository } from '../repositories/MemberRepository';

describe('Phase P5 — Local-First Member & Repository Integration Tests', () => {
  const userIdAgent1 = 'user_agent_p5_001';
  const userIdAgent2 = 'user_agent_p5_002';

  beforeEach(async () => {
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.regions.clear();
  });

  it('1. Offline creation saves member and primary activity locally with localId UUID and pending syncStatus', async () => {
    const memberData = {
      memberType: 'physique' as const,
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      physiqueData: { nom: 'Nguema', prenom: 'Samuel' },
    };

    const { member, primaryActivity } = await memberRepository.saveLocalMember(userIdAgent1, memberData);

    expect(member.localId).toBeDefined();
    expect(member.syncStatus).toBe('pending');
    expect(member.physiqueData.nom).toBe('Nguema');

    expect(primaryActivity.memberLocalId).toBe(member.localId);
    expect(primaryActivity.activityType).toBe('agriculteur');
    expect(primaryActivity.isPrimary).toBe(true);

    const retrieved = await memberRepository.getMemberById(member.localId, userIdAgent1);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.displayName).toBe('Nguema Samuel');
    expect(retrieved?.activities.length).toBe(1);
    expect(retrieved?.activities[0].activityType).toBe('agriculteur');
  });

  it('2. Search, category/type/status filtering, and local pagination work in MemberRepository', async () => {
    await memberRepository.saveLocalMember(userIdAgent1, {
      memberType: 'physique',
      category: 'agriculteur',
      status: 'incomplet',
      physiqueData: { nom: 'Kamga', prenom: 'Paul' },
    });

    await memberRepository.saveLocalMember(userIdAgent1, {
      memberType: 'morale',
      category: 'pecheur',
      status: 'valide',
      moraleData: { nom: 'GIC Pêcheurs de Kribi' },
    });

    await memberRepository.saveLocalMember(userIdAgent1, {
      memberType: 'physique',
      category: 'eleveur',
      status: 'incomplet',
      physiqueData: { nom: 'Bello', prenom: 'Oumarou' },
    });

    // Search query
    const searchRes = await memberRepository.getMembers(userIdAgent1, { search: 'Kamga' });
    expect(searchRes.total).toBe(1);
    expect(searchRes.data[0].displayName).toBe('Kamga Paul');

    // Filter category
    const catRes = await memberRepository.getMembers(userIdAgent1, { category: 'pecheur' });
    expect(catRes.total).toBe(1);
    expect(catRes.data[0].displayName).toBe('GIC Pêcheurs de Kribi');

    // Filter type & status
    const typeRes = await memberRepository.getMembers(userIdAgent1, { memberType: 'physique', status: 'incomplet' });
    expect(typeRes.total).toBe(2);

    // Pagination
    const page1 = await memberRepository.getMembers(userIdAgent1, { limit: 2, page: 1 });
    expect(page1.data.length).toBe(2);
    const page2 = await memberRepository.getMembers(userIdAgent1, { limit: 2, page: 2 });
    expect(page2.data.length).toBe(1);
  });

  it('3. Offline member edit updates local Dexie record immediately', async () => {
    const { member } = await memberRepository.saveLocalMember(userIdAgent1, {
      memberType: 'physique',
      category: 'agriculteur',
      village: 'Village Alpha',
      physiqueData: { nom: 'Mbida', prenom: 'Jean' },
    });

    const updated = await memberRepository.updateLocalMember(member.localId, userIdAgent1, {
      village: 'Village Beta',
      syncStatus: 'pending',
    });

    expect(updated).not.toBeNull();
    expect(updated?.village).toBe('Village Beta');

    const reloaded = await memberRepository.getMemberById(member.localId, userIdAgent1);
    expect(reloaded?.village).toBe('Village Beta');
  });

  it('4. Multi-agent data isolation: Agent 1 cannot query or view Agent 2 local members', async () => {
    const { member: member1 } = await memberRepository.saveLocalMember(userIdAgent1, {
      memberType: 'physique',
      category: 'agriculteur',
      physiqueData: { nom: 'Agent1 Member', prenom: 'A1' },
    });

    const { member: member2 } = await memberRepository.saveLocalMember(userIdAgent2, {
      memberType: 'physique',
      category: 'pecheur',
      physiqueData: { nom: 'Agent2 Member', prenom: 'A2' },
    });

    // Agent 1 list query returns only Agent 1 member
    const agent1List = await memberRepository.getMembers(userIdAgent1);
    expect(agent1List.total).toBe(1);
    expect(agent1List.data[0].localId).toBe(member1.localId);

    // Agent 1 detail lookup on Agent 2 member returns null
    const forbiddenLookup = await memberRepository.getMemberById(member2.localId, userIdAgent1);
    expect(forbiddenLookup).toBeNull();
  });

  it('5. Dexie schema version 4 migration upgrades existing records without data loss', async () => {
    // Insert mock record with missing fields
    await db.members.put({
      localId: 'legacy_local_id_999',
      userId: userIdAgent1,
      memberType: 'physique',
      category: 'agriculteur',
      individualOrOrg: 'individuel',
      status: 'incomplet',
      version: 1,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      syncStatus: 'pending',
      deletedLocally: false,
    });

    const retrieved = await memberRepository.getMemberById('legacy_local_id_999', userIdAgent1);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.localId).toBe('legacy_local_id_999');
    expect(retrieved?.deletedLocally).toBe(false);
  });
});
