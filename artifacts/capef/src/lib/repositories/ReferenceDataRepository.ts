import {
  db,
  type LocalReferenceRegion,
  type LocalReferenceDepartment,
  type LocalReferenceArrondissement,
} from './CapefDexieDatabase';

export interface IReferenceDataRepository {
  saveRegions(regions: LocalReferenceRegion[]): Promise<void>;
  getRegions(): Promise<LocalReferenceRegion[]>;
  saveDepartments(departments: LocalReferenceDepartment[]): Promise<void>;
  getDepartmentsByRegion(regionId: number): Promise<LocalReferenceDepartment[]>;
  saveArrondissements(arrondissements: LocalReferenceArrondissement[]): Promise<void>;
  getArrondissementsByDepartment(departmentId: number): Promise<LocalReferenceArrondissement[]>;
  clearReferenceData(): Promise<void>;
}

export class DexieReferenceDataRepository implements IReferenceDataRepository {
  async saveRegions(regions: LocalReferenceRegion[]): Promise<void> {
    try {
      await db.regions.bulkPut(regions);
    } catch (error) {
      console.error('[ReferenceDataRepository] Error saving regions:', error);
      throw error; // CRITICAL: Propagate error
    }
  }

  async getRegions(): Promise<LocalReferenceRegion[]> {
    try {
      return await db.regions.orderBy('name').toArray();
    } catch (error) {
      console.error('[ReferenceDataRepository] Error fetching regions:', error);
      throw error;
    }
  }

  async saveDepartments(departments: LocalReferenceDepartment[]): Promise<void> {
    try {
      await db.departments.bulkPut(departments);
    } catch (error) {
      console.error('[ReferenceDataRepository] Error saving departments:', error);
      throw error;
    }
  }

  async getDepartmentsByRegion(regionId: number): Promise<LocalReferenceDepartment[]> {
    try {
      return await db.departments.where('regionId').equals(regionId).sortBy('name');
    } catch (error) {
      console.error('[ReferenceDataRepository] Error fetching departments:', error);
      throw error;
    }
  }

  async saveArrondissements(arrondissements: LocalReferenceArrondissement[]): Promise<void> {
    try {
      await db.arrondissements.bulkPut(arrondissements);
    } catch (error) {
      console.error('[ReferenceDataRepository] Error saving arrondissements:', error);
      throw error;
    }
  }

  async getArrondissementsByDepartment(departmentId: number): Promise<LocalReferenceArrondissement[]> {
    try {
      return await db.arrondissements.where('departmentId').equals(departmentId).sortBy('name');
    } catch (error) {
      console.error('[ReferenceDataRepository] Error fetching arrondissements:', error);
      throw error;
    }
  }

  async clearReferenceData(): Promise<void> {
    try {
      await Promise.all([
        db.regions.clear(),
        db.departments.clear(),
        db.arrondissements.clear(),
      ]);
    } catch (error) {
      console.error('[ReferenceDataRepository] Error clearing reference data:', error);
      throw error;
    }
  }
}

export const referenceDataRepository = new DexieReferenceDataRepository();
