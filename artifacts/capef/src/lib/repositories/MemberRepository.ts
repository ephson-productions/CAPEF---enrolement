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

    if (typeof idOrLocalId === 'number' || (typeof idOrLocalId === 'string' && !isNaN(Number(idOrLocalId)))) {
      const numId = Number(idOrLocalId);
      member = await db.members.where('id').equals(numId).first();
      if (!member) {
        member = await db.members.where('serverId').equals(numId).first();
      }
    }

    if (!member && typeof idOrLocalId === 'string') {
      member = await db.members.where('localId').equals(idOrLocalId).first();
    }

    if (!member || member.deletedLocally) {
      return null;
    }

    if (member.userId !== userId && !member.serverId) {
      return null;
    }

    const activities = await db.activities
      .where('memberLocalId')
      .equals(member.localId)
      .toArray();

    const activitiesWithLineItems = await Promise.all(
      activities.map(async (act) => {
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

    const displayName = member.memberType === 'physique'
      ? `${member.physiqueData?.nom ?? ''} ${member.physiqueData?.prenom ?? ''}`.trim()
      : (member.moraleData?.nom ?? '');

    return {
      ...member,
      displayName: displayName || member.memberNumber || member.localId,
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
            let existingAct = await db.activities.where('serverId').equals(sa.id).first();
            const actLocalId = existingAct?.localId || crypto.randomUUID();

            const localAct: LocalActivity = {
              id: existingAct?.id,
              localId: actLocalId,
              serverId: sa.id,
              memberLocalId: localId,
              memberServerId: sm.id,
              userId,
              activityType: sa.activityType,
              isPrimary: sa.isPrimary ?? false,
              regionId: sa.regionId ?? null,
              departmentId: sa.departmentId ?? null,
              arrondissementId: sa.arrondissementId ?? null,
              village: sa.village ?? null,
              maillons: sa.maillons || [],
              version: sa.version || 1,
              createdAt: sa.createdAt || now,
              updatedAt: now,
              syncStatus: 'synced',
            };

            await db.activities.put(localAct);

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
}

export const memberRepository = new MemberRepository();
