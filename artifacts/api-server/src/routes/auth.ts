import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, usersTable, regionsTable } from "@workspace/db";
import { requireAuth, requireAppUser } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/auth/me — returns current user with role
router.get("/auth/me", requireAppUser, async (req, res): Promise<void> => {
  try {
    const appUser = (req as any).appUser;

    let regionName: string | null = null;
    if (appUser.regionId) {
      const [region] = await db
        .select()
        .from(regionsTable)
        .where(eq(regionsTable.id, appUser.regionId))
        .limit(1);
      regionName = region?.name ?? null;
    }

    res.json({
      id: appUser.id,
      clerkUserId: appUser.clerkUserId,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      regionId: appUser.regionId ?? null,
      regionName,
      createdAt: appUser.createdAt.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error }, "Error in /auth/me route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

// POST /api/auth/provision — JIT-provision user in app DB after Clerk sign-in
router.post("/auth/provision", requireAuth, async (req, res): Promise<void> => {
  try {
    const clerkUserId = (req as any).clerkUserId;

    // Support both flat body payload and nested Orval `{ data: { email, name } }` payload
    const email = req.body.email || req.body.data?.email;
    const name = req.body.name || req.body.data?.name;

    if (!email || !name) {
      res.status(400).json({ error: "email et name sont requis" });
      return;
    }

    // Check if already exists
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);

    if (existing) {
      res.json({
        id: existing.id,
        clerkUserId: existing.clerkUserId,
        email: existing.email,
        name: existing.name,
        role: existing.role,
        regionId: existing.regionId ?? null,
        regionName: null,
        createdAt: existing.createdAt.toISOString(),
      });
      return;
    }

    // Create new user — first user becomes admin, rest become agents
    const [count] = await db.select().from(usersTable);
    const isFirstUser = !count;

    const [newUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        name,
        role: isFirstUser ? "admin" : "agent",
      })
      .returning();

    res.json({
      id: newUser.id,
      clerkUserId: newUser.clerkUserId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      regionId: newUser.regionId ?? null,
      regionName: null,
      createdAt: newUser.createdAt.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error }, "Error in /auth/provision route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

export default router;
