import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { memberRepository } from '../repositories/MemberRepository';

describe('Member list role scope and combined local filters', () => {
  const cacheUserId = 'member-filter-cache';

  beforeEach(async () => {
    await db.members.clear();
    await db.activities.clear();
    await db.lineItems.clear();
    await db.operations.clear();
    await db.entityMappings.clear();
    await db.regions.clear();
    await db.departments.clear();
    await db.arrondissements.clear();
  });

  async function saveMorale({
    number,
    name,
    creatorId,
    regionId,
    civilite,
  }: {
    number: number;
    name: string;
    creatorId: number;
    regionId: number;
    civilite: string;
  }) {
    const { member } = await memberRepository.saveLocalMember(cacheUserId, {
      memberType: 'morale',
      category: 'agriculteur',
      status: 'valide',
      regionId,
      moraleData: {
        nom: name,
        representants: [{ ordre: 1, civilite, nom: 'Représentant', prenom: 'Test' }],
      },
    });
    await db.members.update(member.id!, {
      serverId: 900 + number,
      createdById: creatorId,
      syncStatus: 'synced',
    });
    return member;
  }

  it('combines type, category, representation, agent and search for admins', async () => {
    await saveMorale({
      number: 1,
      name: 'GIC Femme Centre',
      creatorId: 21,
      regionId: 1,
      civilite: 'Mme.',
    });
    await saveMorale({
      number: 2,
      name: 'GIC Homme Centre',
      creatorId: 21,
      regionId: 1,
      civilite: 'M.',
    });
    await saveMorale({
      number: 3,
      name: 'GIC Femme Littoral',
      creatorId: 22,
      regionId: 2,
      civilite: 'Mme.',
    });

    const results = await memberRepository.getMembers(cacheUserId, {
      userRole: 'admin',
      memberType: 'morale',
      category: 'agriculteur',
      representantGenre: 'femme',
      agentId: 21,
      search: 'Femme',
    });

    expect(results.total).toBe(1);
    expect(results.data[0].moraleData?.nom).toBe('GIC Femme Centre');
  });

  it('keeps agents on their own records and supervisor results inside the assigned region', async () => {
    await saveMorale({
      number: 4,
      name: 'GIC Femme Centre',
      creatorId: 21,
      regionId: 1,
      civilite: 'Mme.',
    });
    await saveMorale({
      number: 5,
      name: 'GIC Homme Centre',
      creatorId: 22,
      regionId: 1,
      civilite: 'M.',
    });
    await saveMorale({
      number: 6,
      name: 'GIC Femme Littoral',
      creatorId: 22,
      regionId: 2,
      civilite: 'Mme.',
    });

    const agentResults = await memberRepository.getMembers(cacheUserId, {
      userRole: 'agent',
      currentUserId: 21,
      agentId: 22,
      search: 'GIC',
    });
    expect(agentResults.total).toBe(1);
    expect(agentResults.data[0].moraleData?.nom).toBe('GIC Femme Centre');

    const supervisorResults = await memberRepository.getMembers(cacheUserId, {
      userRole: 'supervisor',
      currentUserId: 30,
      scopeRegionId: 1,
      allowedAgentIds: [21, 22],
      agentId: 22,
      representantGenre: 'homme',
      search: 'Centre',
    });
    expect(supervisorResults.total).toBe(1);
    expect(supervisorResults.data[0].moraleData?.nom).toBe('GIC Homme Centre');

    const forbiddenAgentResults = await memberRepository.getMembers(cacheUserId, {
      userRole: 'supervisor',
      currentUserId: 30,
      scopeRegionId: 1,
      allowedAgentIds: [21, 22],
      agentId: 23,
    });
    expect(forbiddenAgentResults.total).toBe(0);

    const missingRegionResults = await memberRepository.getMembers(cacheUserId, {
      userRole: 'supervisor',
      currentUserId: 30,
      scopeRegionId: null,
    });
    expect(missingRegionResults.total).toBe(0);
  });
});
