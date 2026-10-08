import { db, type LocalMember, type LocalActivity, type LocalLineItem } from './CapefDexieDatabase';
import { DexieSyncRepository } from './SyncRepository';

export interface MemberFilterOptions {
  category?: string;
  memberType?: string;
  status?: string;
  search?: string;
  representantGenre?: string;
  agentId?: number;
  page?: number;
  limit?: number;
}

export interface LocalMemberWithDetails extends LocalMember {
  displayName: string;
  activities: (LocalActivity & { lineItems: LocalLineItem[] })[];
  regionName?: string | null;
  departmentName?: string | null;
  arrondissementName?: string | null;
}

export class MemberRepository {
  private syncRepo: DexieSyncRepository;

  constructor() {
    this.syncRepo = new DexieSyncRepository();
  }

  async getMembers(userId: string, options: MemberFilterOptions = {}) {
    const { category, memberType, status, search, representantGenre, agentId, page = 1, limit = 20 } = options;

    let collection = db.members
      .where('userId')
      .equals(userId)
      .filter(m => !m.deletedLocally);

    if (category) {
      collection = collection.filter(m => m.category === category);
    }
    if (memberType) {
      collection = collection.filter(m => m.memberType === memberType);
    }
    if (status) {
      collection = collection.filter(m => m.status === status);
    }
    if (agentId) {
      collection = collection.filter(m => Number(m.createdById || m.userId) === agentId);
    }
    if (representantGenre) {
      collection = collection.filter(m => {
        if (m.memberType !== 'morale') return false;
        const repGenre = m.moraleData?.representantSexe || m.moraleData?.genreRepresentant;
        if (representantGenre === 'femme') return repGenre === 'F' || repGenre === 'femme';
        if (representantGenre === 'homme') return repGenre === 'M' || repGenre === 'homme';
        return true;
      });
    }
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      collection = collection.filter(m => {
        const numMatch = m.memberNumber?.toLowerCase().includes(q) ?? false;
        const physiqueNom = m.physiqueData?.nom?.toLowerCase().includes(q) ?? false;
        const physiquePrenom = m.physiqueData?.prenom?.toLowerCase().includes(q) ?? false;
        const moraleNom = m.moraleData?.nom?.toLowerCase().includes(q) ?? false;
        return numMatch || physiqueNom || physiquePrenom || moraleNom;
      });
    }

    const allFiltered = await collection.sortBy('createdAt');
    allFiltered.reverse();

    const total = allFiltered.length;
    const startIndex = (page - 1) * limit;
    const paginated = allFiltered.slice(startIndex, startIndex + limit);

    const regions = await db.regions.toArray();
    const departments = await db.departments.toArray();
    const arrondissements = await db.arrondissements.toArray();

    const regMap = new Map(regions.map(r => [r.id, r.name]));
    const deptMap = new Map(departments.map(d => [d.id, d.name]));
    const arrMap = new Map(arrondissements.map(a => [a.id, a.name]));

    const data = paginated.map(m => {
      const nom = m.memberType === 'physique'
        ? `${m.physiqueData?.nom ?? ''} ${m.physiqueData?.prenom ?? ''}`.trim()
        : (m.moraleData?.nom ?? '');
      const displayNameToUse = m.displayName || nom || m.memberNumber || m.localId;
      return {
        ...m,
        displayName: displayNameToUse,
        regionName: m.regionName || (m.regionId ? regMap.get(m.regionId) ?? null : null),
        departmentName: m.departmentName || (m.departmentId ? deptMap.get(m.departmentId) ?? null : null),
        arrondissementName: m.arrondissementName || (m.arrondissementId ? arrMap.get(m.arrondissementId) ?? null : null),
      };
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getMemberById(idOrLocalId: string | number, userId: string): Promise<LocalMemberWithDetails | null> {
    let member: LocalMember | undefined;

    // 1. If numeric ID or numeric string (e.g. 31 or "31"), query strictly by PostgreSQL serverId
    if (typeof idOrLocalId === 'number' || (typeof idOrLocalId === 'string' && !isNaN(Number(idOrLocalId)) && Number(idOrLocalId) > 0)) {
      const numServerId = Number(idOrLocalId);
      member = await db.members.where('serverId').equals(numServerId).first();
    }

    // 2. If not found by serverId or if string localId (UUID / TMP-), query by localId
    if (!member && typeof idOrLocalId === 'string') {
      member = await db.members.where('localId').equals(idOrLocalId).first();
    }

    // 3. Fallback: query by memberNumber
    if (!member && typeof idOrLocalId === 'string') {
      member = await db.members.where('memberNumber').equals(idOrLocalId).first();
    }

    if (!member || member.deletedLocally) {
      return null;
    }

    if (member.userId !== userId && !member.serverId) {
      return null;
    }

    // Canonical activity filtering:
    // 1. Keep all server-synced activities (serverId != null)
    // 2. Keep local drafts belonging to current user (serverId == null && userId === currentUserId)
    // 3. Exclude drafts belonging to other users on shared device
    // 4. Deduplicate by activityType (preferring synced over pending)
    const rawActivities = await db.activities
      .where('memberLocalId')
      .equals(member.localId)
      .toArray();

    const filteredActivities = rawActivities.filter((act) => {
      if (act.serverId !== null && act.serverId !== undefined) return true;
      return act.userId === userId;
    });

    // Group by activityType to build canonical list
    const canonicalMap = new Map<string, LocalActivity>();
    for (const act of filteredActivities) {
      const existing = canonicalMap.get(act.activityType);
      if (!existing) {
        canonicalMap.set(act.activityType, act);
      } else {
        // Prefer server-synced activity over pending local draft
        if (!existing.serverId && act.serverId) {
          canonicalMap.set(act.activityType, act);
        }
      }
    }

    const canonicalActivities = Array.from(canonicalMap.values());

    const activitiesWithLineItems = await Promise.all(
      canonicalActivities.map(async (act) => {
        const lineItems = await db.lineItems
          .where('activityLocalId')
          .equals(act.localId)
          .toArray();
        return {
          ...act,
          lineItems,
        };
      })
    );

    const regions = await db.regions.toArray();
    const departments = await db.departments.toArray();
    const arrondissements = await db.arrondissements.toArray();

    const regMap = new Map(regions.map(r => [r.id, r.name]));
    const deptMap = new Map(departments.map(d => [d.id, d.name]));
    const arrMap = new Map(arrondissements.map(a => [a.id, a.name]));

    const nom = member.memberType === 'physique'
      ? `${member.physiqueData?.nom ?? ''} ${member.physiqueData?.prenom ?? ''}`.trim()
      : (member.moraleData?.nom ?? '');

    const displayName = member.displayName || nom || member.memberNumber || member.localId;

    return {
      ...member,
      displayName,
      activities: activitiesWithLineItems,
      regionName: member.regionName || (member.regionId ? regMap.get(member.regionId) ?? null : null),
      departmentName: member.departmentName || (member.departmentId ? deptMap.get(member.departmentId) ?? null : null),
      arrondissementName: member.arrondissementName || (member.arrondissementId ? arrMap.get(member.arrondissementId) ?? null : null),
    };
  }

  async saveLocalMember(
    userId: string,
    memberData: Partial<LocalMember>
  ): Promise<{ member: LocalMember; primaryActivity: LocalActivity }> {
    const localId = memberData.localId || crypto.randomUUID();
    const now = new Date().toISOString();

    let regName = memberData.regionName ?? null;
    let deptName = memberData.departmentName ?? null;
    let arrName = memberData.arrondissementName ?? null;

    if (!regName && memberData.regionId) {
      const reg = await db.regions.get(memberData.regionId);
      if (reg) regName = reg.name;
    }
    if (!deptName && memberData.departmentId) {
      const dept = await db.departments.get(memberData.departmentId);
      if (dept) deptName = dept.name;
    }
    if (!arrName && memberData.arrondissementId) {
      const arr = await db.arrondissements.get(memberData.arrondissementId);
      if (arr) arrName = arr.name;
    }

    const nom = memberData.displayName || (
      memberData.memberType === 'physique'
        ? `${memberData.physiqueData?.nom ?? ''} ${memberData.physiqueData?.prenom ?? ''}`.trim()
        : (memberData.moraleData?.nom ?? '')
    ) || null;

    const memberRecord: LocalMember = {
      localId,
      userId,
      serverId: memberData.serverId ?? null,
      memberNumber: memberData.memberNumber ?? `TMP-${localId.slice(0, 8).toUpperCase()}`,
      displayName: nom,
      memberType: memberData.memberType || 'physique',
      category: memberData.category || 'agriculteur',
      individualOrOrg: memberData.individualOrOrg || 'individuel',
      regionId: memberData.regionId ?? null,
      departmentId: memberData.departmentId ?? null,
      arrondissementId: memberData.arrondissementId ?? null,
      regionName: regName,
      departmentName: deptName,
      arrondissementName: arrName,
      createdByName: memberData.createdByName ?? null,
      village: memberData.village ?? null,
      gpsLat: memberData.gpsLat ?? null,
      gpsLng: memberData.gpsLng ?? null,
      physiqueData: memberData.physiqueData ?? null,
      moraleData: memberData.moraleData ?? null,
      categoryData: memberData.categoryData ?? null,
      status: memberData.status || 'incomplet',
      version: memberData.version || 1,
      createdAt: memberData.createdAt || now,
      updatedAt: now,
      syncStatus: memberData.syncStatus || 'pending',
      deletedLocally: false,
    };

    const memberDbId = await db.members.put(memberRecord);
    memberRecord.id = memberDbId;

    const activityLocalId = crypto.randomUUID();
    const primaryActivityRecord: LocalActivity = {
      localId: activityLocalId,
      memberLocalId: localId,
      userId,
      activityType: memberRecord.category,
      isPrimary: true,
      regionId: memberRecord.regionId ?? null,
      departmentId: memberRecord.departmentId ?? null,
      arrondissementId: memberRecord.arrondissementId ?? null,
      village: memberRecord.village ?? null,
      maillons: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const actDbId = await db.activities.put(primaryActivityRecord);
    primaryActivityRecord.id = actDbId;

    return {
      member: memberRecord,
      primaryActivity: primaryActivityRecord,
    };
  }

  async getMemberByServerId(serverId: number, userId: string): Promise<LocalMemberWithDetails | null> {
    return this.getMemberById(serverId, userId);
  }

  async getMemberByLocalId(localId: string, userId: string): Promise<LocalMemberWithDetails | null> {
    return this.getMemberById(localId, userId);
  }

  async updateLocalMember(
    localId: string,
    userId: string,
    updates: Partial<LocalMember>
  ): Promise<LocalMember | null> {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing || existing.userId !== userId) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedRecord: LocalMember = {
      ...existing,
      ...updates,
      localId: existing.localId,
      userId: existing.userId,
      updatedAt: now,
      syncStatus: updates.syncStatus || 'pending',
    };

    await db.members.put(updatedRecord);
    return updatedRecord;
  }

  async upsertServerMembers(userId: string, serverMembers: any[]): Promise<void> {
    await db.transaction('rw', [db.members, db.activities, db.lineItems, db.entityMappings], async () => {
      for (const sm of serverMembers) {
        let existing = await db.members.where('serverId').equals(sm.id).first();
        if (!existing && sm.memberNumber) {
          existing = await db.members.where('memberNumber').equals(sm.memberNumber).first();
        }

        const localId = existing?.localId || crypto.randomUUID();
        const now = new Date().toISOString();

        const displayName = sm.displayName || (
          sm.memberType === 'physique'
            ? `${sm.physiqueData?.nom ?? ''} ${sm.physiqueData?.prenom ?? ''}`.trim()
            : (sm.moraleData?.nom ?? '')
        ) || existing?.displayName || null;

        const localMember: LocalMember = {
          id: existing?.id,
          localId,
          serverId: sm.id,
          userId,
          memberNumber: sm.memberNumber,
          displayName,
          memberType: sm.memberType,
          category: sm.category,
          individualOrOrg: sm.individualOrOrg || existing?.individualOrOrg || 'individuel',
          regionId: sm.regionId ?? existing?.regionId ?? null,
          departmentId: sm.departmentId ?? existing?.departmentId ?? null,
          arrondissementId: sm.arrondissementId ?? existing?.arrondissementId ?? null,
          regionName: sm.regionName ?? existing?.regionName ?? null,
          departmentName: sm.departmentName ?? existing?.departmentName ?? null,
          arrondissementName: sm.arrondissementName ?? existing?.arrondissementName ?? null,
          createdById: sm.createdById ?? existing?.createdById ?? null,
          createdByName: sm.createdByName ?? existing?.createdByName ?? null,
          village: sm.village ?? existing?.village ?? null,
          gpsLat: sm.gpsLat ?? existing?.gpsLat ?? null,
          gpsLng: sm.gpsLng ?? existing?.gpsLng ?? null,
          physiqueData: sm.physiqueData ?? existing?.physiqueData ?? null,
          moraleData: sm.moraleData ?? existing?.moraleData ?? null,
          categoryData: sm.categoryData ?? existing?.categoryData ?? null,
          status: sm.status || existing?.status || 'incomplet',
          version: sm.version || existing?.version || 1,
          createdAt: sm.createdAt || existing?.createdAt || now,
          updatedAt: sm.updatedAt || now,
          syncStatus: 'synced',
          deletedLocally: false,
        };

        const dbId = await db.members.put(localMember);

        await db.entityMappings.put({
          entityType: 'member',
          localId,
          serverId: sm.id,
          syncStatus: 'synced',
          createdAt: now,
        });

        if (Array.isArray(sm.activities)) {
          for (const sa of sm.activities) {
            // 1. Search by serverId
            let existingAct = await db.activities.where('serverId').equals(sa.id).first();

            // 2. If absent, search for pending local draft for this member & activityType
            if (!existingAct) {
              const localCandidates = await db.activities
                .where('memberLocalId')
                .equals(localId)
                .toArray();
              existingAct = localCandidates.find(
                a => a.activityType === sa.activityType && (!a.serverId || a.serverId === sa.id)
              );
            }

            const actLocalId = existingAct?.localId || crypto.randomUUID();

            // Clean up any remaining unsynced duplicate local activity records for this member and activityType
            const allMemberActs = await db.activities.where('memberLocalId').equals(localId).toArray();
            for (const duplicateAct of allMemberActs) {
              if (
                duplicateAct.activityType === sa.activityType &&
                duplicateAct.localId !== actLocalId &&
                (!duplicateAct.serverId || duplicateAct.serverId === sa.id)
              ) {
                // Re-link line items from duplicate to canonical actLocalId
                await db.lineItems
                  .where('activityLocalId')
                  .equals(duplicateAct.localId)
                  .modify({ activityLocalId: actLocalId, activityServerId: sa.id });
                // Delete duplicate activity record
                if (duplicateAct.id) {
                  await db.activities.delete(duplicateAct.id);
                }
              }
            }

            const localAct: LocalActivity = {
              id: existingAct?.id,
              localId: actLocalId,
              serverId: sa.id,
              memberLocalId: localId,
              memberServerId: sm.id,
              userId,
              activityType: sa.activityType,
              isPrimary: sa.isPrimary ?? false,
              regionId: sa.regionId ?? existingAct?.regionId ?? null,
              departmentId: sa.departmentId ?? existingAct?.departmentId ?? null,
              arrondissementId: sa.arrondissementId ?? existingAct?.arrondissementId ?? null,
              village: sa.village ?? existingAct?.village ?? null,
              maillons: sa.maillons || existingAct?.maillons || [],
              version: sa.version || existingAct?.version || 1,
              createdAt: sa.createdAt || existingAct?.createdAt || now,
              updatedAt: now,
              syncStatus: 'synced',
            };

            await db.activities.put(localAct);
            await db.activities.where('localId').equals(actLocalId).modify({ serverId: sa.id, syncStatus: 'synced' });

            await db.entityMappings.put({
              entityType: 'activity',
              localId: actLocalId,
              serverId: sa.id,
              syncStatus: 'synced',
              createdAt: now,
            });

            if (Array.isArray(sa.lineItems)) {
              for (const sli of sa.lineItems) {
                let existingLi = await db.lineItems.where('serverId').equals(sli.id).first();
                const liLocalId = existingLi?.localId || crypto.randomUUID();

                const localLi: LocalLineItem = {
                  id: existingLi?.id,
                  localId: liLocalId,
                  serverId: sli.id,
                  activityLocalId: actLocalId,
                  activityServerId: sa.id,
                  userId,
                  parcelleGroupId: sli.parcelleGroupId ?? null,
                  cropCategory: sli.cropCategory ?? null,
                  cropName: sli.cropName ?? null,
                  cultureType: sli.cultureType ?? null,
                  superficieHa: sli.superficieHa ?? null,
                  productionQuantity: sli.productionQuantity ?? null,
                  productionUnit: sli.productionUnit ?? null,
                  productionFcfa: sli.productionFcfa ?? null,
                  isPrincipalCrop: sli.isPrincipalCrop ?? true,
                  parentLineItemId: sli.parentLineItemId ?? null,
                  species: sli.species ?? null,
                  cheptelSize: sli.cheptelSize ?? null,
                  foodType: sli.foodType ?? null,
                  products: sli.products ?? null,
                  speciesPêche: sli.speciesPêche ?? null,
                  subCategory: sli.subCategory ?? null,
                  essence: sli.essence ?? null,
                  plantationType: sli.plantationType ?? null,
                  artisanatProducts: sli.artisanatProducts ?? null,
                  rawMaterials: sli.rawMaterials ?? null,
                  version: sli.version || 1,
                  createdAt: sli.createdAt || now,
                  updatedAt: now,
                  syncStatus: 'synced',
                };

                await db.lineItems.put(localLi);

                await db.entityMappings.put({
                  entityType: 'line_item',
                  localId: liLocalId,
                  serverId: sli.id,
                  syncStatus: 'synced',
                  createdAt: now,
                });
              }
            }
          }
        }
      }
    });
  }
  async upsertActivity(
    userId: string,
    activityData: Partial<LocalActivity> & { memberLocalId: string; activityType: string }
  ): Promise<LocalActivity> {
    const now = new Date().toISOString();
    let existing: LocalActivity | undefined;

    if (activityData.serverId) {
      existing = await db.activities.where('serverId').equals(activityData.serverId).first();
    }

    if (!existing && activityData.localId) {
      existing = await db.activities.where('localId').equals(activityData.localId).first();
    }

    if (!existing) {
      const candidates = await db.activities
        .where('memberLocalId')
        .equals(activityData.memberLocalId)
        .toArray();
      existing = candidates.find(a => a.activityType === activityData.activityType);
    }

    const localId = existing?.localId || activityData.localId || crypto.randomUUID();

    const record: LocalActivity = {
      id: existing?.id,
      localId,
      serverId: activityData.serverId ?? existing?.serverId ?? null,
      memberLocalId: activityData.memberLocalId,
      memberServerId: activityData.memberServerId ?? existing?.memberServerId ?? null,
      userId,
      activityType: activityData.activityType,
      isPrimary: activityData.isPrimary ?? existing?.isPrimary ?? false,
      regionId: activityData.regionId ?? existing?.regionId ?? null,
      departmentId: activityData.departmentId ?? existing?.departmentId ?? null,
      arrondissementId: activityData.arrondissementId ?? existing?.arrondissementId ?? null,
      village: activityData.village ?? existing?.village ?? null,
      maillons: activityData.maillons || existing?.maillons || [],
      version: activityData.version || existing?.version || 1,
      createdAt: activityData.createdAt || existing?.createdAt || now,
      updatedAt: now,
      syncStatus: activityData.syncStatus || existing?.syncStatus || 'pending',
    };

    const id = await db.activities.put(record);
    record.id = id;
    return record;
  }

  async cleanupDuplicateActivities(userId?: string): Promise<number> {
    let cleaned = 0;
    const allMembers = await db.members.toArray();

    for (const member of allMembers) {
      const memberActs = await db.activities.where('memberLocalId').equals(member.localId).toArray();
      const byType = new Map<string, LocalActivity[]>();

      for (const act of memberActs) {
        if (!byType.has(act.activityType)) {
          byType.set(act.activityType, []);
        }
        byType.get(act.activityType)!.push(act);
      }

      for (const [, acts] of byType.entries()) {
        if (acts.length <= 1) continue;

        // Sort: prefer synced record (serverId != null) first, then highest version/newest
        acts.sort((a, b) => {
          if (a.serverId && !b.serverId) return -1;
          if (!a.serverId && b.serverId) return 1;
          return (b.version || 1) - (a.version || 1);
        });

        const canonical = acts[0];
        const duplicates = acts.slice(1);

        for (const dup of duplicates) {
          // Re-link line items to canonical activity
          await db.lineItems
            .where('activityLocalId')
            .equals(dup.localId)
            .modify({
              activityLocalId: canonical.localId,
              activityServerId: canonical.serverId || undefined,
            });

          // Re-link entityMappings
          await db.entityMappings.where({ localId: dup.localId, entityType: 'activity' }).delete();

          // Delete duplicate
          if (dup.id) {
            await db.activities.delete(dup.id);
            cleaned++;
          }
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[MemberRepository] Cleaned up ${cleaned} duplicate local activity records.`);
    }
    return cleaned;
  }
}

export const memberRepository = new MemberRepository();
