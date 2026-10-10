import { Router, type IRouter } from "express";
import { eq, sql, gte, and } from "drizzle-orm";
import { db, membersTable, regionsTable, usersTable, memberActivitiesTable } from "@workspace/db";
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

    // By category (aggregated over multi-activity member_activities table)
    let categoryQuery = db
      .select({
        category: memberActivitiesTable.activityType,
        count: sql<number>`count(DISTINCT ${memberActivitiesTable.memberId})::int`,
      })
      .from(memberActivitiesTable)
      .innerJoin(membersTable, eq(memberActivitiesTable.memberId, membersTable.id));

    if (whereClause) {
      categoryQuery = categoryQuery.where(whereClause) as any;
    }

    const categoryRows = await categoryQuery.groupBy(memberActivitiesTable.activityType);

    const byCategory = categoryRows.map((r) => ({ category: r.category, count: r.count }));

    // By region (single pre-joined query with GROUP BY)
    const byRegionRows = await db
      .select({
        regionName: sql<string>`COALESCE(${regionsTable.name}, 'Inconnue')`,
        count: sql<number>`count(*)::int`,
      })
      .from(membersTable)
      .leftJoin(regionsTable, eq(membersTable.regionId, regionsTable.id))
      .where(whereClause)
      .groupBy(regionsTable.name);

    const byRegion = byRegionRows.map((r) => ({
      regionName: r.regionName,
      count: r.count,
    }));

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

    let joinedQuery = db
      .select({
        id: membersTable.id,
        memberNumber: membersTable.memberNumber,
        memberType: membersTable.memberType,
        category: membersTable.category,
        status: membersTable.status,
        createdAt: membersTable.createdAt,
        physiqueNom: sql<string | null>`${membersTable.physiqueData}->>'nom'`,
        physiquePrenom: sql<string | null>`${membersTable.physiqueData}->>'prenom'`,
        moraleNom: sql<string | null>`${membersTable.moraleData}->>'nom'`,
        regionName: regionsTable.name,
        createdByName: usersTable.name,
      })
      .from(membersTable)
      .leftJoin(regionsTable, eq(membersTable.regionId, regionsTable.id))
      .leftJoin(usersTable, eq(membersTable.createdById, usersTable.id));

    if (appUser.role === "agent") {
      joinedQuery = joinedQuery.where(eq(membersTable.createdById, appUser.id)) as any;
    } else if (appUser.role === "supervisor" && appUser.regionId) {
      joinedQuery = joinedQuery.where(eq(membersTable.regionId, appUser.regionId)) as any;
    }

    const rows = await joinedQuery
      .orderBy(sql`${membersTable.createdAt} DESC`)
      .limit(limit);

    const summaries = rows.map((m) => {
      const displayName = m.memberType === "physique"
        ? `${m.physiqueNom ?? ""} ${m.physiquePrenom ?? ""}`.trim()
        : (m.moraleNom ?? null);

      return {
        id: m.id,
        memberNumber: m.memberNumber,
        memberType: m.memberType,
        category: m.category,
        displayName: displayName || null,
        regionName: m.regionName ?? null,
        createdByName: m.createdByName ?? null,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      };
    });

    res.json(summaries);
  } catch (error: any) {
    logger.error({ error }, "Error in /dashboard/recent route");
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});

export default router;
