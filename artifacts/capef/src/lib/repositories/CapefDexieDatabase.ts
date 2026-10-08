import Dexie, { type Table } from 'dexie';

export interface LocalMember {
  id?: number;
  localId: string;
  serverId?: number | null;
  userId: string;
  memberNumber?: string | null;
  displayName?: string | null;
  memberType: 'physique' | 'morale';
  category: string;
  individualOrOrg: string;
  regionId?: number | null;
  departmentId?: number | null;
  arrondissementId?: number | null;
  regionName?: string | null;
  departmentName?: string | null;
  arrondissementName?: string | null;
  createdById?: number | null;
  createdByName?: string | null;
  village?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  physiqueData?: any;
  moraleData?: any;
  categoryData?: any;
  badgeUrl?: string | null;
  badgeToken?: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  deletedLocally?: boolean;
}

export interface LocalActivity {
  id?: number;
  localId: string;
  serverId?: number | null;
  memberLocalId: string;
  memberServerId?: number | null;
  userId: string;
  activityType: string;
  isPrimary: boolean;
  regionId?: number | null;
  departmentId?: number | null;
  arrondissementId?: number | null;
  village?: string | null;
  maillons?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
}

export interface LocalLineItem {
  id?: number;
  localId: string;
  serverId?: number | null;
  activityLocalId: string;
  activityServerId?: number | null;
  userId: string;
  parcelleGroupId?: string | null;
  cropCategory?: string | null;
  cropName?: string | null;
  cultureType?: string | null;
  superficieHa?: number | null;
  productionQuantity?: number | null;
  productionUnit?: string | null;
  productionFcfa?: number | null;
  isPrincipalCrop?: boolean | null;
  parentLineItemId?: number | null;
  species?: string | null;
  cheptelSize?: number | null;
  foodType?: string | null;
  products?: any;
  speciesPêche?: string | null;
  subCategory?: string | null;
  essence?: string | null;
  plantationType?: string | null;
  artisanatProducts?: string | null;
  rawMaterials?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
}

export interface LocalSyncConflict {
  id?: number;
  conflictId: string;
  userId: string;
  entityType: 'member' | 'activity' | 'line_item';
  localId: string;
  serverId?: number | string | null;
  clientVersion: number;
  serverVersion: number;
  localData: any;
  serverData: any;
  status: 'unresolved' | 'resolved';
  createdAt: string;
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
  remoteUrl?: string | null;
  syncStatus: 'pending' | 'uploaded' | 'error';
  createdAt: string;
}

export interface LocalOfflineOperation {
  id?: number;
  operationId: string;
  clientOperationId: string;
  userId: string;
  operationType: 'create_member' | 'create_activity' | 'create_line_item' | 'delete_line_item' | 'update_member' | 'update_activity' | 'update_line_item' | 'delete_activity';
  payload: any;
  status: 'pending' | 'processing' | 'waiting' | 'retry' | 'blocked' | 'failed' | 'completed';
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

export interface LocalUserProfileRecord {
  clerkUserId: string;
  serverId: number;
  name: string;
  email: string;
  role: string;
  regionId?: number | null;
  zones?: string[];
  lastOnlineVerification: string;
  pinHash?: string | null;
  pinSalt?: string | null;
}

export class CapefDexieDatabase extends Dexie {
  members!: Table<LocalMember, number>;
  activities!: Table<LocalActivity, number>;
  lineItems!: Table<LocalLineItem, number>;
  syncConflicts!: Table<LocalSyncConflict, number>;
  regions!: Table<LocalReferenceRegion, number>;
  departments!: Table<LocalReferenceDepartment, number>;
  arrondissements!: Table<LocalReferenceArrondissement, number>;
  media!: Table<LocalMediaItem, number>;
  operations!: Table<LocalOfflineOperation, number>;
  entityMappings!: Table<EntityMapping, number>;
  profiles!: Table<LocalUserProfileRecord, string>;

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

    this.version(3).stores({
      members: '++id, localId, userId, memberNumber, syncStatus, createdAt',
      regions: 'id, name',
      departments: 'id, regionId, name',
      arrondissements: 'id, departmentId, name',
      media: '++id, mediaId, userId, syncStatus, createdAt',
      operations: '++id, operationId, clientOperationId, userId, status, createdAt',
      entityMappings: '++id, [entityType+localId], entityType, localId, serverId, syncStatus, createdAt',
      profiles: 'clerkUserId, email, role',
    });

    this.version(4).stores({
      members: '++id, localId, serverId, userId, memberNumber, category, memberType, status, syncStatus, deletedLocally, createdAt, updatedAt',
      activities: '++id, localId, serverId, memberLocalId, memberServerId, userId, activityType, isPrimary, syncStatus, createdAt, updatedAt',
      lineItems: '++id, localId, serverId, activityLocalId, activityServerId, userId, syncStatus, createdAt, updatedAt',
      syncConflicts: '++id, conflictId, userId, entityType, localId, serverId, status, createdAt',
      regions: 'id, name',
      departments: 'id, regionId, name',
      arrondissements: 'id, departmentId, name',
      media: '++id, mediaId, userId, syncStatus, createdAt',
      operations: '++id, operationId, clientOperationId, userId, status, createdAt',
      entityMappings: '++id, [entityType+localId], entityType, localId, serverId, syncStatus, createdAt',
      profiles: 'clerkUserId, email, role',
    }).upgrade(async (tx) => {
      await tx.table('members').toCollection().modify((m: LocalMember) => {
        if (!m.localId) m.localId = crypto.randomUUID();
        if (m.version === undefined) m.version = 1;
        if (!m.updatedAt) m.updatedAt = m.createdAt || new Date().toISOString();
        if (m.deletedLocally === undefined) m.deletedLocally = false;
      });
    });
  }
}

export const db = new CapefDexieDatabase();
