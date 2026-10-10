import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../repositories/CapefDexieDatabase';
import { localProfileService } from '../local-profile-service';

describe('Assigned Zones & Profile Offline Storage Tests', () => {
  const clerkUserIdA = 'user_agent_zone_test_A';
  const clerkUserIdB = 'user_agent_zone_test_B';

  beforeEach(async () => {
    await db.profiles.clear();
    await db.regions.clear();
    await db.departments.clear();
    await db.arrondissements.clear();
    vi.clearAllMocks();
  });

  it('1. Persists assignedZones into local Dexie db.profiles for active user', async () => {
    const profile = {
      serverId: 101,
      clerkUserId: clerkUserIdA,
      name: 'Agent Zone A',
      email: 'agentA@capef.cm',
      role: 'agent',
      regionId: 1,
      assignedZones: [
        { regionId: 1, departmentId: 10, arrondissementId: 101 },
        { regionId: 1, departmentId: 11, arrondissementId: null },
      ],
      lastOnlineVerification: new Date().toISOString(),
    };

    await localProfileService.saveProfile(profile);

    const saved = await db.profiles.get(clerkUserIdA);
    expect(saved).not.toBeNull();
    expect(saved?.assignedZones?.length).toBe(2);
    expect(saved?.assignedZones?.[0].departmentId).toBe(10);
  });

  it('2. Enforces multi-user isolation on shared device for assignedZones', async () => {
    // User A has 2 zone combinations
    await localProfileService.saveProfile({
      serverId: 101,
      clerkUserId: clerkUserIdA,
      name: 'Agent A',
      email: 'agentA@capef.cm',
      role: 'agent',
      assignedZones: [
        { regionId: 1, departmentId: 10 },
        { regionId: 2, departmentId: 20 },
      ],
      lastOnlineVerification: new Date().toISOString(),
    });

    // User B has 0 assigned zones (National / Admin)
    await localProfileService.saveProfile({
      serverId: 102,
      clerkUserId: clerkUserIdB,
      name: 'Agent B',
      email: 'agentB@capef.cm',
      role: 'admin',
      assignedZones: [],
      lastOnlineVerification: new Date().toISOString(),
    });

    // Retrieve User A's profile
    const profileA = await localProfileService.getProfile(clerkUserIdA);
    expect(profileA?.assignedZones?.length).toBe(2);

    // Retrieve User B's profile
    const profileB = await localProfileService.getProfile(clerkUserIdB);
    expect(profileB?.assignedZones?.length).toBe(0);
    expect(profileB?.clerkUserId).toBe(clerkUserIdB);
  });

  it('3. Retains assignedZones across offline profile retrieval', async () => {
    const timestamp = new Date().toISOString();
    await localProfileService.saveProfile({
      serverId: 200,
      clerkUserId: clerkUserIdA,
      name: 'Agent Offline',
      email: 'offline@capef.cm',
      role: 'supervisor',
      regionId: 3,
      assignedZones: [
        { regionId: 3, departmentId: null, arrondissementId: null },
      ],
      lastOnlineVerification: timestamp,
    });

    const retrieved = await localProfileService.getProfile(clerkUserIdA);
    expect(retrieved?.role).toBe('supervisor');
    expect(retrieved?.assignedZones).toEqual([
      { regionId: 3, departmentId: null, arrondissementId: null },
    ]);
  });
});
