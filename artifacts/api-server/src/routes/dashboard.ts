import { Router, type IRouter } from "express";
import { eq, sql, gte, and } from "drizzle-orm";
import { db, membersTable, regionsTable, usersTable } from "@workspace/db";
import { requireAppUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { representedByWomanCondition } from "../lib/memberFilters";

const router: IRouter = Router();

// GET /api/dashboard/stats
router.get("/dashboard/stats", requireAppUser, async (req, res): Promise<void> => {
  try {
    const appUser = (req as any).appUser;
    const { status, activity, regionId } = req.query;

    const conditions: any[] = [];
    if (appUser.role === "agent") {
      conditions.push(eq(membersTable.createdById, appUser.id));
    } else if (appUser.role === "supervisor" && appUser.regionId) {
      conditions.push(eq(membersTable.regionId, appUser.regionId));
    }

    if (status) conditions.push(eq(membersTable.status, String(status)));
    if (activity) conditions.push(eq(membersTable.category, String(activity)));
    if (regionId) conditions.push(eq(membersTable.regionId, parseInt(String(regionId), 10)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total counts
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(whereClause);
    const totalMembers = totalResult?.count ?? 0;

    const [physiqueResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(
        whereClause
          ? sql`${whereClause} AND ${membersTable.memberType} = 'physique'`
          : eq(membersTable.memberType, "physique")
      );
    const totalPhysique = physiqueResult?.count ?? 0;

    const totalMorale = totalMembers - totalPhysique;

    // Organizations represented by a woman count (respecting active role-based filter whereClause)
    const [femaleMoraleResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(
        and(
          whereClause ? whereClause : sql`true`,
          eq(membersTable.memberType, "morale"),
          representedByWomanCondition
        )
      );
    const organisationsRepresenteesParFemmes = femaleMoraleResult?.count ?? 0;

    // By category
    const categoryRows = await db
      .select({
        category: membersTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(membersTable)
      .where(whereClause)
      .groupBy(membersTable.category);

    const byCategory = categoryRows.map((r) => ({ category: r.category, count: r.count }));

    // By region (join with regions table)
    const regionRows = await db
      .select({
        regionId: membersTable.regionId,
        count: sql<number>`count(*)::int`,
      })
      .from(membersTable)
      .where(whereClause)
      .groupBy(membersTable.regionId);

    const byRegion = await Promise.all(
      regionRows
        .filter((r) => r.regionId !== null)
        .map(async (r) => {
          const [region] = await db.select().from(regionsTable).where(eq(regionsTable.id, r.regionId!)).limit(1);
          return { regionName: region?.name ?? "Inconnue", count: r.count };
        })
    );

    // By status (Phase 4 bucket counts)
    const statusRows = await db
      .select({
        status: membersTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(membersTable)
      .where(whereClause)
      .groupBy(membersTable.status);

    const byStatus = statusRows.map((r) => ({ status: r.status, count: r.count }));

    // Recent week count
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(
        whereClause
          ? sql`${whereClause} AND ${membersTable.createdAt} >= ${oneWeekAgo}`
          : gte(membersTable.createdAt, oneWeekAgo)
      );
    const recentWeekCount = weekResult?.count ?? 0;

    res.json({
      totalMembers,
      totalPhysique,
      totalMorale,
      organisationsRepresenteesParFemmes,
      byCategory,
      byRegion,
      byStatus,
      recentWeekCount,
    });
  } catch (error: any) {
    logger.error({ error }, "Error in /dashboard/stats route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

// GET /api/dashboard/recent
router.get("/dashboard/recent", requireAppUser, async (req, res): Promise<void> => {
  try {
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
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      };
    }));

    res.json(summaries);
  } catch (error: any) {
    logger.error({ error }, "Error in /dashboard/recent route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

export default router;
