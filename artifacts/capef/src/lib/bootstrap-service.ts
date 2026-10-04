import { db, type LocalMember, type LocalActivity, type LocalLineItem } from './repositories/CapefDexieDatabase';
import { customFetch } from '@workspace/api-client-react';

export type BootstrapStatus = 'IDLE' | 'BOOTSTRAPPING' | 'READY' | 'PARTIAL' | 'FAILED';

export class BootstrapService {
  private abortController: AbortController | null = null;

  private getStorageKey(userId: string): string {
    return `capef_offline_bootstrap_status_${userId}`;
  }

  getBootstrapStatus(userId: string): BootstrapStatus {
    if (typeof window === 'undefined' || !window.localStorage) return 'IDLE';
    const status = window.localStorage.getItem(this.getStorageKey(userId));
    return (status as BootstrapStatus) || 'IDLE';
  }

  private setBootstrapStatus(userId: string, status: BootstrapStatus): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.getStorageKey(userId), status);
    }
  }

  cancelBootstrap(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async runBootstrap(user: { id: string | number; role?: string; regionId?: number | null }): Promise<BootstrapStatus> {
    if (!user || user.id === undefined || user.id === null) return 'FAILED';
    const userId = String(user.id);

    this.cancelBootstrap();
    this.abortController = new AbortController();

    this.setBootstrapStatus(userId, 'BOOTSTRAPPING');
    let hasPartialError = false;

    // 1. Reference Data: Regions, Departments, Arrondissements
    try {
      const regions = await customFetch('/api/regions') as any[];
      if (Array.isArray(regions)) {
        await db.regions.bulkPut(regions.map(r => ({ id: r.id, name: r.name })));
      }
    } catch (err) {
      console.warn('[BootstrapService] Failed to load regions:', err);
      hasPartialError = true;
    }

    try {
      const departments = await customFetch('/api/departments') as any[];
      if (Array.isArray(departments)) {
        await db.departments.bulkPut(departments.map(d => ({ id: d.id, regionId: d.regionId, name: d.name })));
      }
    } catch (err) {
      console.warn('[BootstrapService] Failed to load departments:', err);
      hasPartialError = true;
    }

    try {
      const arrondissements = await customFetch('/api/arrondissements') as any[];
      if (Array.isArray(arrondissements)) {
        await db.arrondissements.bulkPut(arrondissements.map(a => ({ id: a.id, departmentId: a.departmentId, name: a.name })));
      }
    } catch (err) {
      console.warn('[BootstrapService] Failed to load arrondissements:', err);
      hasPartialError = true;
    }

    // 2. Members scoped by role with progressive details (activities + line items)
    let members: any[] = [];
    let attempts = 0;
    const params = new URLSearchParams();
    params.set('limit', '100'); // Scoped preloading chunk
    if (user.role === 'agent') {
      params.set('createdById', userId);
    } else if (user.role === 'superviseur' && user.regionId) {
      params.set('regionId', String(user.regionId));
    }

    while (attempts < 3) {
      try {
        const response = await customFetch(`/api/members?${params.toString()}`) as any;
        members = Array.isArray(response) ? response : response?.data || [];
        break; // Success!
      } catch (err: any) {
        attempts++;
        if (err?.status === 401 && attempts < 3) {
          console.warn(`[BootstrapService] Cold start 401 on members preload, retrying (attempt ${attempts}/3)...`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } else {
          console.warn('[BootstrapService] Failed to load preload scoped members:', err);
          hasPartialError = true;
          break;
        }
      }
    }

    try {
      if (Array.isArray(members)) {
        for (const m of members) {
          if (this.abortController?.signal.aborted) break;

          const now = new Date().toISOString();
          let existing = await db.members.where('serverId').equals(m.id).first();
          const localId = existing?.localId || crypto.randomUUID();

          const localMember: LocalMember = {
            id: existing?.id,
            localId,
            serverId: m.id,
            userId,
            memberNumber: m.memberNumber,
            memberType: m.memberType,
            category: m.category,
            individualOrOrg: m.individualOrOrg || 'individuel',
            regionId: m.regionId,
            departmentId: m.departmentId,
            arrondissementId: m.arrondissementId,
            village: m.village,
            status: m.status || 'valide',
            version: m.version || 1,
            createdAt: m.createdAt || now,
            updatedAt: m.updatedAt || now,
            syncStatus: 'synced',
            deletedLocally: false,
          };

          await db.members.put(localMember);

          // Fetch member detail with activities & line items progressively
          try {
            const detail = await customFetch(`/api/members/${m.id}`) as any;
            if (detail && Array.isArray(detail.activities)) {
              for (const sa of detail.activities) {
                let existingAct = await db.activities.where('serverId').equals(sa.id).first();
                const actLocalId = existingAct?.localId || crypto.randomUUID();

                const localAct: LocalActivity = {
                  id: existingAct?.id,
                  localId: actLocalId,
                  serverId: sa.id,
                  memberLocalId: localId,
                  memberServerId: m.id,
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
                  }
                }
              }
            }
          } catch (detailErr) {
            console.warn(`[BootstrapService] Progressive detail load failed for member ${m.id}:`, detailErr);
          }
        }
      }
    } catch (err) {
      console.warn('[BootstrapService] Failed to preload scoped members:', err);
      hasPartialError = true;
    }

    const finalStatus: BootstrapStatus = hasPartialError ? 'PARTIAL' : 'READY';
    this.setBootstrapStatus(userId, finalStatus);
    return finalStatus;
  }
}

export const bootstrapService = new BootstrapService();
