import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAppUser, requireRole } from "../lib/auth";
import { formatUser } from "../lib/user";

const router: IRouter = Router();

function parseId(value: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) ? id : null;
}

function normalizeZones(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((zone): zone is Record<string, unknown> => Boolean(zone) && typeof zone === "object")
    .map((zone) => ({
      regionId: Number(zone.regionId),
      departmentId: zone.departmentId == null ? null : Number(zone.departmentId),
      arrondissementId: zone.arrondissementId == null ? null : Number(zone.arrondissementId),
    }))
    .filter((zone) => Number.isInteger(zone.regionId));
}

// GET /api/users
router.get("/users", requireAppUser, requireRole("admin", "supervisor"), async (req, res): Promise<void> => {
  const { role, regionId, status } = req.query;
  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, String(role)));
  if (regionId) conditions.push(eq(usersTable.regionId, Number(regionId)));
  if (status) conditions.push(eq(usersTable.status, String(status)));

  const users = conditions.length
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);

  res.json(await Promise.all(users.map(formatUser)));
});

// POST /api/users
router.post("/users", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const { email, name, role, regionId, cniNumber, cniPhotoUrl, profilePhotoUrl, assignedZones, status } = req.body;
  if (!email || !name || !role) {
    res.status(400).json({ error: "email, name et role sont requis" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "Un utilisateur avec cet email existe déjà" });
    return;
  }

  // The current invitation UI creates a local pending record until Clerk invitation
  // wiring is available. It is intentionally not used for existing Clerk accounts.
  const zones = normalizeZones(assignedZones);
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `pending_${Date.now()}`,
      email,
      name,
      role,
      status: status ?? "active",
      regionId: regionId ?? zones[0]?.regionId ?? null,
      cniNumber: cniNumber ?? null,
      cniPhotoUrl: cniPhotoUrl ?? null,
      profilePhotoUrl: profilePhotoUrl ?? null,
      assignedZones: zones,
    })
    .returning();

  res.status(201).json(await formatUser(user));
});

// GET /api/users/:id
router.get("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Identifiant utilisateur invalide" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.json(await formatUser(user));
});

// PUT /api/users/:id
router.put("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Identifiant utilisateur invalide" });
    return;
  }

  const { name, role, regionId, cniNumber, cniPhotoUrl, profilePhotoUrl, assignedZones, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;
  if (cniNumber !== undefined) updates.cniNumber = cniNumber ?? null;
  if (cniPhotoUrl !== undefined) updates.cniPhotoUrl = cniPhotoUrl ?? null;
  if (profilePhotoUrl !== undefined) updates.profilePhotoUrl = profilePhotoUrl ?? null;
  if (assignedZones !== undefined) {
    const zones = normalizeZones(assignedZones);
    updates.assignedZones = zones;
    if (regionId === undefined) updates.regionId = zones[0]?.regionId ?? null;
  }
  if (regionId !== undefined) updates.regionId = regionId ?? null;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.json(await formatUser(user));
});

// DELETE /api/users/:id
router.delete("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Identifiant utilisateur invalide" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }

  // Delete the Clerk identity first. Otherwise ClerkProvisioner could recreate
  // the local record at the user's next sign-in.
  if (!user.clerkUserId.startsWith("pending_")) {
    try {
      await clerkClient.users.deleteUser(user.clerkUserId);
    } catch (error: any) {
      const clerkStatus = error?.status ?? error?.statusCode;
      if (clerkStatus !== 404) {
        res.status(502).json({ error: "Impossible de supprimer le compte Clerk" });
        return;
      }
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;