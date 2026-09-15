import { customFetch } from '@workspace/api-client-react';
import { referenceDataRepository } from './repositories/ReferenceDataRepository';
import { memberRepository } from './repositories/MemberRepository';

export interface OfflineBootstrapStatus {
  status: 'READY' | 'PARTIAL' | 'FAILED';
  userId: string;
  completedAt: string;
  lastSuccessfulSyncAt: string | null;
  appVersion: string;
  schemaVersion: number;
  referenceVersion: string;
  error?: string | null;
}

const BOOTSTRAP_STORAGE_KEY = 'capef_offline_bootstrap_status';
const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;

export class BootstrapService {
  getBootstrapStatus(userId: string): OfflineBootstrapStatus | null {
    try {
      const stored = localStorage.getItem(`${BOOTSTRAP_STORAGE_KEY}_${userId}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private setBootstrapStatus(status: OfflineBootstrapStatus): void {
    try {
      localStorage.setItem(`${BOOTSTRAP_STORAGE_KEY}_${status.userId}`, JSON.stringify(status));
    } catch (err) {
      console.error('[BootstrapService] Failed to persist bootstrap status:', err);
    }
  }

  async runBootstrap(user: { id: number; clerkUserId: string; role: string; regionId?: number | null }): Promise<OfflineBootstrapStatus> {
    const userId = user.clerkUserId;
    let referenceSuccess = false;
    let memberDataSuccess = false;
    let errorMsg: string | null = null;

    try {
      // 1. Fetch full un-filtered geographic reference data
      const [regions, departments, arrondissements] = await Promise.all([
        customFetch<any[]>('/api/regions', { method: 'GET' }),
        customFetch<any[]>('/api/departments', { method: 'GET' }),
        customFetch<any[]>('/api/arrondissements', { method: 'GET' }),
      ]);

      if (Array.isArray(regions) && Array.isArray(departments) && Array.isArray(arrondissements)) {
        await referenceDataRepository.saveRegions(regions.map(r => ({ id: r.id, name: r.name })));
        await referenceDataRepository.saveDepartments(departments.map(d => ({ id: d.id, regionId: d.regionId, name: d.name })));
        await referenceDataRepository.saveArrondissements(arrondissements.map(a => ({ id: a.id, departmentId: a.departmentId, name: a.name })));
        referenceSuccess = true;
      }

      // 2. Fetch scoped member data for the active user
      // For agent: createdById = user.id. For supervisor: regionId = user.regionId
      let queryParams = '';
      if (user.role === 'supervisor' && user.regionId) {
        queryParams = `?regionId=${user.regionId}`;
      }

      const memberListResponse = await customFetch<any>(`/api/members${queryParams}`, { method: 'GET' });
      const members = memberListResponse?.members || (Array.isArray(memberListResponse) ? memberListResponse : []);

      if (Array.isArray(members)) {
        for (const m of members) {
          await memberRepository.saveMember({
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
            gpsLat: m.gpsLat,
            gpsLng: m.gpsLng,
            physiqueData: m.physiqueData,
            moraleData: m.moraleData,
            categoryData: m.categoryData,
            status: m.status,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt || m.createdAt,
            syncStatus: 'synced',
          });
        }
        memberDataSuccess = true;
      }
    } catch (err: any) {
      console.error('[BootstrapService] Bootstrap execution failed/partial:', err);
      errorMsg = err?.message || 'Network error during bootstrap';
    }

    const isReady = referenceSuccess && memberDataSuccess;
    const isPartial = referenceSuccess || memberDataSuccess;

    const finalStatus: OfflineBootstrapStatus = {
      status: isReady ? 'READY' : isPartial ? 'PARTIAL' : 'FAILED',
      userId,
      completedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: isReady ? new Date().toISOString() : null,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      referenceVersion: new Date().toISOString().split('T')[0],
      error: errorMsg,
    };

    this.setBootstrapStatus(finalStatus);
    return finalStatus;
  }
}

export const bootstrapService = new BootstrapService();
