import { Router, type IRouter } from "express";
import { eq, sql, gte } from "drizzle-orm";
import { db, membersTable, regionsTable, usersTable } from "@workspace/db";
import { requireAppUser } from "../lib/auth";

const router: IRouter = Router();

// GET /api/dashboard/stats
router.get("/dashboard/stats", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;

  let baseWhere: any = undefined;
  if (appUser.role === "agent") {
    baseWhere = eq(membersTable.createdById, appUser.id);
  } else if (appUser.role === "supervisor" && appUser.regionId) {
    baseWhere = eq(membersTable.regionId, appUser.regionId);
  }

  // Total counts
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(membersTable)
    .where(baseWhere);
  const totalMembers = totalResult?.count ?? 0;

  const [physiqueResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(membersTable)
    .where(baseWhere ? sql`${baseWhere} AND ${membersTable.memberType} = 'physique'` : eq(membersTable.memberType, "physique"));
  const totalPhysique = physiqueResult?.count ?? 0;

  const totalMorale = totalMembers - totalPhysique;

  // By category
  const categoryRows = await db
    .select({
      category: membersTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(membersTable)
    .where(baseWhere)
    .groupBy(membersTable.category);

  const byCategory = categoryRows.map((r) => ({ category: r.category, count: r.count }));

  // By region (join with regions table)
  const regionRows = await db
    .select({
      regionId: membersTable.regionId,
      count: sql<number>`count(*)::int`,
    })
    .from(membersTable)
    .where(baseWhere)
    .groupBy(membersTable.regionId);

  const byRegion = await Promise.all(
    regionRows
      .filter((r) => r.regionId !== null)
      .map(async (r) => {
        const [region] = await db.select().from(regionsTable).where(eq(regionsTable.id, r.regionId!)).limit(1);
        return { regionName: region?.name ?? "Inconnue", count: r.count };
      })
  );

  // Recent week count
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [weekResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(membersTable)
    .where(
      baseWhere
        ? sql`${baseWhere} AND ${membersTable.createdAt} >= ${oneWeekAgo}`
        : gte(membersTable.createdAt, oneWeekAgo)
    );
  const recentWeekCount = weekResult?.count ?? 0;

  res.json({
    totalMembers,
    totalPhysique,
    totalMorale,
    byCategory,
    byRegion,
    recentWeekCount,
  });
});

// GET /api/dashboard/recent
router.get("/dashboard/recent", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10)));

  let query = db.select().from(membersTable);

  if (appUser.role === "agent") {
    query = query.where(eq(membersTable.createdById, appUser.id)) as any;
  } else if (appUser.role === "supervisor" && appUser.regionId) {
    query = query.where(eq(membersTable.regionId, appUser.regionId)) as any;
  }

  const rows = await query
    .orderBy(sql`${membersTable.createdAt} DESC`)
    .limit(limit);

  const summaries = await Promise.all(rows.map(async (m) => {
    const physique = m.physiqueData as any;
    const morale = m.moraleData as any;
    const displayName = m.memberType === "physique"
      ? `${physique?.nom ?? ""} ${physique?.prenom ?? ""}`.trim()
      : (morale?.nom ?? null);

    const [region] = m.regionId
      ? await db.select().from(regionsTable).where(eq(regionsTable.id, m.regionId)).limit(1)
      : [null];
    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, m.createdById)).limit(1);

    return {
      id: m.id,
      memberNumber: m.memberNumber,
      memberType: m.memberType,
      category: m.category,
      displayName: displayName || null,
      regionName: region?.name ?? null,
      createdByName: creator?.name ?? null,
      badgeUrl: m.badgeUrl ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }));

  res.json(summaries);
});

export default router;
