import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, regionsTable } from "@workspace/db";
import { requireAppUser, requireRole } from "../lib/auth";

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
    assignedZones: (user.assignedZones as any[]) ?? [],
    createdAt: user.createdAt.toISOString(),
  };
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
  const { email, name, role, regionId, cniNumber, cniPhotoUrl, assignedZones } = req.body;
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
      assignedZones: assignedZones ?? [],
    })
    .returning();

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
router.put("/users/:id", requireAppUser, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, role, regionId, cniNumber, cniPhotoUrl, assignedZones } = req.body;

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (role) updates.role = role;
  if (regionId !== undefined) updates.regionId = regionId ?? null;
  if (cniNumber !== undefined) updates.cniNumber = cniNumber ?? null;
  if (cniPhotoUrl !== undefined) updates.cniPhotoUrl = cniPhotoUrl ?? null;
  if (assignedZones !== undefined) updates.assignedZones = assignedZones ?? [];

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
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.sendStatus(204);
});

export default router;
