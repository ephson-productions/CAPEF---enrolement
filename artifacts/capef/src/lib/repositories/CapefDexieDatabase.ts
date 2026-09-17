import Dexie, { type Table } from 'dexie';

export interface LocalMember {
  id?: number;
  localId: string;
  userId: string;
  memberNumber?: string | null;
  memberType: 'physique' | 'morale';
  category: string;
  individualOrOrg: string;
  regionId?: number | null;
  departmentId?: number | null;
  arrondissementId?: number | null;
  village?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  physiqueData?: any;
  moraleData?: any;
  categoryData?: any;
  status: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'error';
}

export interface LocalReferenceRegion {
  id: number;
  name: string;
}

export interface LocalReferenceDepartment {
  id: number;
  regionId: number;
  name: string;
}

export interface LocalReferenceArrondissement {
  id: number;
  departmentId: number;
  name: string;
}

export interface LocalMediaItem {
  id?: number;
  mediaId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  base64Data?: string | null;
  remoteUrl?: string | null;
  syncStatus: 'pending' | 'uploaded' | 'error';
  createdAt: string;
}

export interface LocalOfflineOperation {
  id?: number;
  operationId: string;
  clientOperationId: string;
  userId: string;
  operationType: 'create_member' | 'create_activity' | 'create_line_item' | 'delete_line_item' | 'update_member';
  payload: any;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
}

export interface EntityMapping {
  id?: number;
  entityType: 'member' | 'activity' | 'line_item' | 'media';
  localId: string;
  serverId: number | string;
  syncStatus: 'synced' | 'pending' | 'error';
  createdAt: string;
}

export class CapefDexieDatabase extends Dexie {
  members!: Table<LocalMember, number>;
  regions!: Table<LocalReferenceRegion, number>;
  departments!: Table<LocalReferenceDepartment, number>;
  arrondissements!: Table<LocalReferenceArrondissement, number>;
  media!: Table<LocalMediaItem, number>;
  operations!: Table<LocalOfflineOperation, number>;
  entityMappings!: Table<EntityMapping, number>;

  constructor() {
    super('CapefOfflineDB');
    this.version(1).stores({
      members: '++id, localId, userId, memberNumber, syncStatus, createdAt',
      regions: 'id, name',
      departments: 'id, regionId, name',
      arrondissements: 'id, departmentId, name',
      media: '++id, mediaId, userId, syncStatus, createdAt',
      operations: '++id, operationId, clientOperationId, userId, status, createdAt',
    });

    this.version(2).stores({
      members: '++id, localId, userId, memberNumber, syncStatus, createdAt',
      regions: 'id, name',
      departments: 'id, regionId, name',
      arrondissements: 'id, departmentId, name',
      media: '++id, mediaId, userId, syncStatus, createdAt',
      operations: '++id, operationId, clientOperationId, userId, status, createdAt',
      entityMappings: '++id, [entityType+localId], entityType, localId, serverId, syncStatus, createdAt',
    });
  }
}

export const db = new CapefDexieDatabase();
