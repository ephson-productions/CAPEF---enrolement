import { db } from './repositories/CapefDexieDatabase';
import { customFetch } from '@workspace/api-client-react';

export type BootstrapStatus = 'IDLE' | 'BOOTSTRAPPING' | 'READY' | 'PARTIAL' | 'FAILED';

export class BootstrapService {
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

  async runBootstrap(user: { id: string | number; role?: string; regionId?: number | null }): Promise<BootstrapStatus> {
    if (!user || user.id === undefined || user.id === null) return 'FAILED';
    const userId = String(user.id);

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

    // 2. Members scoped by role (agent -> createdById, supervisor -> regionId)
    try {
      const params = new URLSearchParams();
      if (user.role === 'agent') {
        params.set('createdById', userId);
      } else if (user.role === 'superviseur' && user.regionId) {
        params.set('regionId', String(user.regionId));
      }

      const response = await customFetch(`/api/members?${params.toString()}`) as any;
      const members = Array.isArray(response) ? response : response?.data || [];

      if (Array.isArray(members)) {
        await db.members.bulkPut(members.map((m: any) => ({
          id: m.id,
          localId: `server_${m.id}`,
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
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          syncStatus: 'synced',
        })));
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
