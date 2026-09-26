import {
  useListRegions as useListRegionsHook,
  useListDepartments as useListDepartmentsHook,
  useListArrondissements as useListArrondissementsHook,
  useListMembers as useListMembersHook,
} from '@workspace/api-client-react';
import { db } from './repositories/CapefDexieDatabase';
import { useLiveQuery } from 'dexie-react-hooks';

export function useOfflineFallbackRegions(options?: any) {
  const query = useListRegionsHook(options);
  const dexieRegions = useLiveQuery(() => db.regions.toArray());

  if ((query.isError || (!navigator.onLine && (!query.data || (query.data as any).length === 0))) && dexieRegions && dexieRegions.length > 0) {
    return {
      ...query,
      data: dexieRegions as any,
      isLoading: false,
      isError: false,
    };
  }

  return query;
}

export function useOfflineFallbackDepartments(params?: any, options?: any) {
  const query = useListDepartmentsHook(params, options);
  const regionId = params?.regionId;
  const dexieDepartments = useLiveQuery(() => {
    if (regionId) {
      return db.departments.where('regionId').equals(Number(regionId)).toArray();
    }
    return db.departments.toArray();
  });

  if ((query.isError || (!navigator.onLine && (!query.data || (query.data as any).length === 0))) && dexieDepartments && dexieDepartments.length > 0) {
    return {
      ...query,
      data: dexieDepartments as any,
      isLoading: false,
      isError: false,
    };
  }

  return query;
}

export function useOfflineFallbackArrondissements(params?: any, options?: any) {
  const query = useListArrondissementsHook(params, options);
  const departmentId = params?.departmentId;
  const dexieArrondissements = useLiveQuery(() => {
    if (departmentId) {
      return db.arrondissements.where('departmentId').equals(Number(departmentId)).toArray();
    }
    return db.arrondissements.toArray();
  });

  if ((query.isError || (!navigator.onLine && (!query.data || (query.data as any).length === 0))) && dexieArrondissements && dexieArrondissements.length > 0) {
    return {
      ...query,
      data: dexieArrondissements as any,
      isLoading: false,
      isError: false,
    };
  }

  return query;
}

export function useOfflineFallbackMembers(params?: any, options?: any) {
  const query = useListMembersHook(params, options);
  const dexieMembers = useLiveQuery(() => db.members.toArray());

  if ((query.isError || (!navigator.onLine && (!query.data || !query.data.data || query.data.data.length === 0))) && dexieMembers && dexieMembers.length > 0) {
    const formatted = dexieMembers.map((m) => ({
      id: m.id || 0,
      memberNumber: m.memberNumber || 'N/A',
      memberType: m.memberType,
      category: m.category,
      individualOrOrg: m.individualOrOrg,
      regionId: m.regionId,
      departmentId: m.departmentId,
      arrondissementId: m.arrondissementId,
      village: m.village,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    return {
      ...query,
      data: {
        data: formatted,
        total: formatted.length,
        page: 1,
        limit: formatted.length,
        totalPages: 1,
      } as any,
      isLoading: false,
      isError: false,
    };
  }

  return query;
}
