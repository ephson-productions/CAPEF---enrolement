import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { requireAuth, requireAppUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { formatUser } from "../lib/user";

const router: IRouter = Router();

// GET /api/auth/me — returns current user with role
router.get("/auth/me", requireAppUser, async (req, res): Promise<void> => {
  try {
    const appUser = (req as any).appUser;

    res.json(await formatUser(appUser));
  } catch (error: any) {
    logger.error({ error }, "Error in /auth/me route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

// POST /api/auth/provision — JIT-provision user in app DB after Clerk sign-in
router.post("/auth/provision", requireAuth, async (req, res): Promise<void> => {
  try {
    const clerkUserId = (req as any).clerkUserId;
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    // Support both flat body payload and nested Orval `{ data: { email, name } }` payload
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
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
      const [updated] = await db
        .update(usersTable)
        .set({ email })
        .where(eq(usersTable.id, existing.id))
        .returning();
      res.json(await formatUser(updated ?? existing));
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

    res.json(await formatUser(newUser));
  } catch (error: any) {
    logger.error({ error }, "Error in /auth/provision route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

// PATCH /api/auth/profile — update only the authenticated user's personal documents/photos
router.patch("/auth/profile", requireAppUser, async (req, res): Promise<void> => {
  try {
    const appUser = (req as any).appUser;
    const { cniNumber, cniPhotoUrl, profilePhotoUrl } = req.body;
    const updates: Record<string, unknown> = {};

    if (cniNumber !== undefined) updates.cniNumber = cniNumber ?? null;
    if (cniPhotoUrl !== undefined) updates.cniPhotoUrl = cniPhotoUrl ?? null;
    if (profilePhotoUrl !== undefined) updates.profilePhotoUrl = profilePhotoUrl ?? null;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, appUser.id))
      .returning();

    res.json(await formatUser(updated ?? appUser));
  } catch (error: any) {
    logger.error({ error }, "Error in /auth/profile route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

export default router;
