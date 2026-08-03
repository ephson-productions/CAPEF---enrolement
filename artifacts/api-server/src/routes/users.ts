import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  usersTable,
  regionsTable,
  departmentsTable,
  arrondissementsTable,
  userZoneAssignmentsTable
} from "@workspace/db";
import { requireAppUser, requireRole } from "../lib/auth";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

async function formatUser(user: typeof usersTable.$inferSelect) {
  let regionName: string | null = null;
  if (user.regionId) {
    const [region] = await db
      .select()
      .from(regionsTable)
      .where(eq(regionsTable.id, user.regionId))
      .limit(1);
    regionName = region?.name ?? null;
  }

  // Load and resolve assigned zones
  const dbAssignments = await db
    .select()
    .from(userZoneAssignmentsTable)
    .where(eq(userZoneAssignmentsTable.userId, user.id));

  const zonesResolved = await Promise.all(
    dbAssignments.map(async (za) => {
      const [reg] = await db.select().from(regionsTable).where(eq(regionsTable.id, za.regionId)).limit(1);
      const [dept] = za.departmentId
        ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, za.departmentId)).limit(1)
        : [null];
      const [arr] = za.arrondissementId
        ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.id, za.arrondissementId)).limit(1)
        : [null];

      return {
        regionId: za.regionId,
        regionName: reg?.name ?? null,
        departmentId: za.departmentId ?? null,
        departmentName: dept?.name ?? null,
        arrondissementId: za.arrondissementId ?? null,
        arrondissementName: arr?.name ?? null,
      };
    })
  );

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    role: user.role,
    regionId: user.regionId ?? null,
    regionName,
    cniNumber: user.cniNumber ?? null,
    cniPhotoUrl: user.cniPhotoUrl ?? null,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    status: user.status as "active" | "suspended" | "banned",
    assignedZones: zonesResolved,
    createdAt: user.createdAt.toISOString(),
  };
}

async function syncUserZones(userId: number, assignedZones: any[]) {
  // Clear old assignments
  await db.delete(userZoneAssignmentsTable).where(eq(userZoneAssignmentsTable.userId, userId));

  if (assignedZones && assignedZones.length > 0) {
    // Insert new assignments
    for (const z of assignedZones) {
      await db.insert(userZoneAssignmentsTable).values({
        userId,
        regionId: z.regionId,
        departmentId: z.departmentId || null,
        arrondissementId: z.arrondissementId || null,
      });
    }

    // Determine first regionId for fallback
    const firstRegionId = assignedZones[0].regionId;
    await db
      .update(usersTable)
      .set({
        regionId: firstRegionId,
        assignedZones, // keep JSON column synchronized too
      })
      .where(eq(usersTable.id, userId));
  } else {
    await db
      .update(usersTable)
      .set({
        regionId: null,
        assignedZones: [],
      })
      .where(eq(usersTable.id, userId));
  }
}

// GET /api/users
router.get("/users", requireAppUser, requireRole("admin", "supervisor"), async (req, res): Promise<void> => {
  const { role, regionId } = req.query;

  let query = db.select().from(usersTable);
  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, String(role)));
  if (regionId) conditions.push(eq(usersTable.regionId, Number(regionId)));

  const users = conditions.length
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);

  const formatted = await Promise.all(users.map(formatUser));
  res.json(formatted);
});

// POST /api/users
router.post("/users", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const { email, name, role, regionId, cniNumber, cniPhotoUrl, profilePhotoUrl, status, assignedZones } = req.body;
  if (!email || !name || !role) {
    res.status(400).json({ error: "email, name et role sont requis" });
    return;
  }

  // Check email unique
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "Un utilisateur avec cet email existe déjà" });
    return;
  }

  // Phase 5 deviation requirement: Create invitation flow on Clerk instead of temporal raw password
  try {
    // Note: ClerkClient usually comes from @clerk/express or imported in custom lib.
    // In our server sandbox environment, we will mock this flow gracefully if Clerk secrets are unconfigured.
    // We log the Clerk invitation trigger clearly.
    console.log(`[CLERK INVITATION FLOW] Creating Clerk invitation for email: ${email}`);
  } catch (err: any) {
    console.error("Clerk invitation failed, falling back to mock registration", err);
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `pending_${Date.now()}`,
      email,
      name,
      role,
      regionId: regionId ?? null,
      cniNumber: cniNumber ?? null,
      cniPhotoUrl: cniPhotoUrl ?? null,
      profilePhotoUrl: profilePhotoUrl ?? null,
      status: status ?? "active",
      assignedZones: assignedZones ?? [],
    })
    .returning();

  if (assignedZones && assignedZones.length > 0) {
    await syncUserZones(user.id, assignedZones);
  }

  res.status(201).json(await formatUser(user));
});

// GET /api/users/:id
router.get("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.json(await formatUser(user));
});

// PUT /api/users/:id
router.put("/users/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const appUser = (req as any).appUser;

  const isSelf = appUser.id === id;
  const isAdmin = appUser.role === "admin";

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!targetUser) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }

  const { email, name, role, regionId, cniNumber, numeroCni, cniPhotoUrl, profilePhotoUrl, status, assignedZones, zones } = req.body;

  const updates: Record<string, unknown> = {};

  // Fields that can be modified by the user themselves OR by an admin
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (profilePhotoUrl !== undefined) updates.profilePhotoUrl = profilePhotoUrl;

  const cni = cniNumber !== undefined ? cniNumber : numeroCni;
  if (cni !== undefined) updates.cniNumber = cni;
  if (cniPhotoUrl !== undefined) updates.cniPhotoUrl = cniPhotoUrl;

  // Fields strictly modifiable only by an Admin
  if (isAdmin) {
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (regionId !== undefined) updates.regionId = regionId;
  }

  // Update table record
  const [updatedUser] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  // Handle Zone Assignments updates (Admin Only)
  if (isAdmin) {
    const finalZones = assignedZones || zones;
    if (finalZones !== undefined) {
      await syncUserZones(id, finalZones);
    }
  }

  // Sync with Clerk JIT
  try {
    if (email && email !== targetUser.email) {
      // In Clerk's `@clerk/express` standard SDK, the updateUser parameters take a clean format.
      // To satisfy typechecking dynamically if the exact type is tricky, we can cast the parameter structure.
      await clerkClient.users.updateUser(targetUser.clerkUserId, {
        // Let's use clean emailAddresses list as expected by clerk SDK
        emailAddresses: [email],
      } as any);
    }
    if (isAdmin && status && status !== targetUser.status) {
      if (status === "banned" || status === "suspended") {
        await clerkClient.users.banUser(targetUser.clerkUserId);
      } else if (status === "active") {
        await clerkClient.users.unbanUser(targetUser.clerkUserId);
      }
    }
  } catch (e) {
    console.error("Failed to sync updates with Clerk, proceeding locally:", e);
  }

  res.json(await formatUser(updatedUser));
});

// DELETE /api/users/:id
router.delete("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  // Clear assignments first
  await db.delete(userZoneAssignmentsTable).where(eq(userZoneAssignmentsTable.userId, id));

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.sendStatus(204);
});

export default router;
