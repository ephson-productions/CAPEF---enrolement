import { Router, type IRouter } from "express";
import { eq, and, or, ilike, sql, ne, not } from "drizzle-orm";
import {
  db,
  membersTable,
  regionsTable,
  departmentsTable,
  arrondissementsTable,
  usersTable,
  memberActivitiesTable,
  activityLineItemsTable,
  userZoneAssignmentsTable
} from "@workspace/db";
import { requireAppUser } from "../lib/auth";
import { representedByWomanCondition } from "../lib/memberFilters";
import crypto from "crypto";
import QRCode from "qrcode";

const router: IRouter = Router();

function generateMemberNumber(category: string, id: number): string {
  const prefix: Record<string, string> = {
    agriculteur: "AGR",
    pecheur: "PCH",
    eleveur: "ELV",
    forestier: "FOR",
    artisan: "ART",
  };
  return `CAPEF-${prefix[category] ?? "MBR"}-${String(id).padStart(6, "0")}`;
}

async function buildSupervisorZoneConditions(appUser: any) {
  if (appUser.role !== "supervisor") return null;

  const dbAssignments = await db
    .select()
    .from(userZoneAssignmentsTable)
    .where(eq(userZoneAssignmentsTable.userId, appUser.id));

  if (dbAssignments.length > 0) {
    const zoneConditions = dbAssignments.map((za) => {
      const parts = [eq(membersTable.regionId, za.regionId)];
      if (za.departmentId) parts.push(eq(membersTable.departmentId, za.departmentId));
      if (za.arrondissementId) parts.push(eq(membersTable.arrondissementId, za.arrondissementId));
      return and(...parts);
    });
    return or(...zoneConditions);
  }

  if (appUser.regionId) {
    return eq(membersTable.regionId, appUser.regionId);
  }

  return null;
}

async function formatMemberActivity(activity: typeof memberActivitiesTable.$inferSelect) {
  const lineItems = await db
    .select()
    .from(activityLineItemsTable)
    .where(eq(activityLineItemsTable.activityId, activity.id));

  return {
    id: activity.id,
    memberId: activity.memberId,
    activityType: activity.activityType,
    isPrimary: activity.isPrimary,
    regionId: activity.regionId ?? null,
    departmentId: activity.departmentId ?? null,
    arrondissementId: activity.arrondissementId ?? null,
    village: activity.village ?? null,
    maillons: (activity.maillons as string[]) ?? [],
    createdAt: activity.createdAt.toISOString(),
    lineItems: lineItems.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

async function formatMember(m: typeof membersTable.$inferSelect, includeDetail = false) {
  const [region] = m.regionId
    ? await db.select().from(regionsTable).where(eq(regionsTable.id, m.regionId)).limit(1)
    : [null];
  const [dept] = m.departmentId
    ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, m.departmentId)).limit(1)
    : [null];
  const [arr] = m.arrondissementId
    ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.id, m.arrondissementId)).limit(1)
    : [null];
  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, m.createdById)).limit(1);

  const physique = m.physiqueData as any;
  const morale = m.moraleData as any;
  const displayName = m.memberType === "physique"
    ? (physique ? `${physique.nom ?? ""} ${physique.prenom ?? ""}`.trim() : null)
    : (morale ? morale.nom ?? null : null);

  const base = {
    id: m.id,
    memberNumber: m.memberNumber,
    memberType: m.memberType,
    category: m.category,
    displayName,
    regionName: region?.name ?? null,
    createdByName: creator?.name ?? null,
    badgeUrl: m.badgeUrl ?? null,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };

  if (!includeDetail) return base;

  // Retrieve activities & line items for details
  const activities = await db
    .select()
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.memberId, m.id));

  const formattedActivities = await Promise.all(
    activities.map(act => formatMemberActivity(act))
  );

  return {
    ...base,
    individualOrOrg: m.individualOrOrg,
    regionId: m.regionId ?? null,
    departmentId: m.departmentId ?? null,
    departmentName: dept?.name ?? null,
    arrondissementId: m.arrondissementId ?? null,
    arrondissementName: arr?.name ?? null,
    village: m.village ?? null,
    gpsLat: m.gpsLat ?? null,
    gpsLng: m.gpsLng ?? null,
    createdById: m.createdById,
    physiqueData: m.physiqueData ?? null,
    moraleData: m.moraleData ?? null,
    categoryData: m.categoryData ?? null,
    updatedAt: m.updatedAt.toISOString(),
    activities: formattedActivities,
  };
}

// Helper to transition state to "en_attente" if member has at least one complete activity.
async function updateMemberStatusIfNeeded(memberId: number): Promise<void> {
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member) return;

  // If already at valide, bloque, or desactive, we shouldn't automatically move back.
  if (["valide", "desactive", "bloque"].includes(member.status)) {
    return;
  }

  // Check if there is at least one activity with at least one line item
  const activities = await db
    .select()
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.memberId, memberId));

  let hasCompletedActivity = false;
  for (const act of activities) {
    const lineItems = await db
      .select()
      .from(activityLineItemsTable)
      .where(eq(activityLineItemsTable.activityId, act.id))
      .limit(1);

    if (lineItems.length > 0) {
      hasCompletedActivity = true;
      break;
    }
  }

  const targetStatus = hasCompletedActivity ? "en_attente" : "incomplet";
  if (member.status !== targetStatus) {
    await db
      .update(membersTable)
      .set({ status: targetStatus })
      .where(eq(membersTable.id, memberId));
  }
}

// GET /api/members
router.get("/members", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const { category, memberType, regionId, departmentId, search, page = "1", limit = "20", createdById, status, representantGenre } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
  const offset = (pageNum - 1) * limitNum;

  if (representantGenre && memberType === "physique") {
    res.json({
      data: [],
      total: 0,
      page: pageNum,
      limit: limitNum,
    });
    return;
  }

  const conditions: any[] = [];

  // Role-based filtering
  if (appUser.role === "agent") {
    conditions.push(eq(membersTable.createdById, appUser.id));
  } else if (appUser.role === "supervisor") {
    const supervisorCond = await buildSupervisorZoneConditions(appUser);
    if (supervisorCond) {
      conditions.push(supervisorCond);
    }
  }

  if (category) conditions.push(eq(membersTable.category, String(category)));
  if (memberType) conditions.push(eq(membersTable.memberType, String(memberType)));
  if (regionId && appUser.role !== "supervisor") conditions.push(eq(membersTable.regionId, Number(regionId)));
  if (departmentId) conditions.push(eq(membersTable.departmentId, Number(departmentId)));
  if (createdById && appUser.role === "admin") conditions.push(eq(membersTable.createdById, Number(createdById)));
  if (status) conditions.push(eq(membersTable.status, String(status)));

  if (representantGenre) {
    conditions.push(eq(membersTable.memberType, "morale"));
    if (representantGenre === "femme") {
      conditions.push(representedByWomanCondition);
    } else if (representantGenre === "homme") {
      conditions.push(not(representedByWomanCondition));
    }
  }

  let query = db.select().from(membersTable);
  let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(membersTable);

  if (conditions.length) {
    query = query.where(and(...conditions)) as any;
    countQuery = countQuery.where(and(...conditions)) as any;
  }

  // Search by member number or display name (via JSON)
  if (search) {
    const s = `%${String(search)}%`;
    const searchCond = sql`(${membersTable.memberNumber} ILIKE ${s} OR ${membersTable.physiqueData}->>'nom' ILIKE ${s} OR ${membersTable.physiqueData}->>'prenom' ILIKE ${s} OR ${membersTable.moraleData}->>'nom' ILIKE ${s})`;
    query = query.where(searchCond) as any;
    countQuery = countQuery.where(searchCond) as any;
  }

  const [totalResult] = await countQuery;
  const total = totalResult?.count ?? 0;

  const rows = await query
    .orderBy(sql`${membersTable.createdAt} DESC`)
    .limit(limitNum)
    .offset(offset);

  const summaries = await Promise.all(rows.map((m) => formatMember(m, false)));

  res.json({
    data: summaries,
    total,
    page: pageNum,
    limit: limitNum,
  });
});

// POST /api/members
router.post("/members", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const { memberType, category, individualOrOrg, regionId, departmentId, arrondissementId, village, gpsLat, gpsLng, physiqueData, moraleData, categoryData } = req.body;

  if (!memberType || !category) {
    res.status(400).json({ error: "memberType et category sont requis" });
    return;
  }

  // Insert with placeholder number; update after getting ID
  const [member] = await db
    .insert(membersTable)
    .values({
      memberNumber: "PENDING",
      memberType,
      category,
      individualOrOrg: individualOrOrg ?? "individuel",
      regionId: regionId ?? null,
      departmentId: departmentId ?? null,
      arrondissementId: arrondissementId ?? null,
      village: village ?? null,
      gpsLat: gpsLat ?? null,
      gpsLng: gpsLng ?? null,
      createdById: appUser.id,
      physiqueData: physiqueData ?? null,
      moraleData: moraleData ?? null,
      categoryData: categoryData ?? null,
      status: "incomplet",
    })
    .returning();

  // Update with real member number
  const memberNumber = generateMemberNumber(category, member.id);
  const [updated] = await db
    .update(membersTable)
    .set({ memberNumber })
    .where(eq(membersTable.id, member.id))
    .returning();

  // Seed the first activity as primary based on category
  await db.insert(memberActivitiesTable).values({
    memberId: updated.id,
    activityType: category,
    isPrimary: true,
    regionId: updated.regionId,
    departmentId: updated.departmentId,
    arrondissementId: updated.arrondissementId,
    village: updated.village,
    maillons: [],
  });

  res.status(201).json(await formatMember(updated, true));
});

// GET /api/members/export
router.get("/members/export", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const { category, memberType, regionId, status, representantGenre } = req.query;

  if (representantGenre && memberType === "physique") {
    const filename = `capef-membres-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF"); // Return empty file
    return;
  }

  const conditions: any[] = [];
  if (appUser.role === "agent") {
    conditions.push(eq(membersTable.createdById, appUser.id));
  } else if (appUser.role === "supervisor") {
    const supervisorCond = await buildSupervisorZoneConditions(appUser);
    if (supervisorCond) {
      conditions.push(supervisorCond);
    }
  }
  if (category) conditions.push(eq(membersTable.category, String(category)));
  if (memberType) conditions.push(eq(membersTable.memberType, String(memberType)));
  if (regionId && appUser.role !== "supervisor") conditions.push(eq(membersTable.regionId, Number(regionId)));
  if (status) conditions.push(eq(membersTable.status, String(status)));

  if (representantGenre) {
    conditions.push(eq(membersTable.memberType, "morale"));
    if (representantGenre === "femme") {
      conditions.push(representedByWomanCondition);
    } else if (representantGenre === "homme") {
      conditions.push(not(representedByWomanCondition));
    }
  }

  const rows = conditions.length
    ? await db.select().from(membersTable).where(and(...conditions))
    : await db.select().from(membersTable);

  const categoryTranslation: Record<string, string> = {
    agriculteur: "agriculture",
    pecheur: "fishing",
    eleveur: "livestock",
    forestier: "forestry",
    artisan: "artisanat"
  };

  // Legacy consular columns requested by Ephraim + new helpful columns
  const headers = [
    "matricule",
    "name",
    "forme",
    "activite",
    "nature",
    "date_creation",
    "region",
    "departement",
    "commune",
    "mobile",
    "village",
    "statut",
    "agent",
    "inscription",
    "cotisation",
    "adhesion_yunus",
    "inscription_date",
    "cotisation_restant",
    "adhesion_yunus_restant"
  ];
  const csvRows = [headers.join(",")];

  const escapeCsv = (str: any) => {
    const val = str === null || str === undefined ? "" : String(str);
    if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  for (const m of rows) {
    const physique = m.physiqueData as any;
    const morale = m.moraleData as any;
    const name = m.memberType === "physique"
      ? `${physique?.nom ?? ""} ${physique?.prenom ?? ""}`.trim()
      : (morale?.nom ?? "");
    const forme = m.memberType === "morale"
      ? (morale?.typeOrganisation ?? "")
      : "";
    const activite = categoryTranslation[m.category] || m.category;
    const mobile = m.memberType === "physique"
      ? (physique?.telephone1 ?? "")
      : (morale?.telephone1 ?? "");

    const [region] = m.regionId
      ? await db.select().from(regionsTable).where(eq(regionsTable.id, m.regionId)).limit(1)
      : [null];
    const [dept] = m.departmentId
      ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, m.departmentId)).limit(1)
      : [null];
    const [arr] = m.arrondissementId
      ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.id, m.arrondissementId)).limit(1)
      : [null];

    // Build the nature column from member activities and line items
    const memberActivities = await db
      .select()
      .from(memberActivitiesTable)
      .where(eq(memberActivitiesTable.memberId, m.id));

    const lineItemDetails: string[] = [];
    for (const act of memberActivities) {
      const items = await db
        .select()
        .from(activityLineItemsTable)
        .where(eq(activityLineItemsTable.activityId, act.id));
      for (const item of items) {
        if (act.activityType === "agriculteur") {
          if (item.cropName) lineItemDetails.push(item.cropName);
        } else if (act.activityType === "pecheur") {
          if (item.speciesPêche) lineItemDetails.push(item.speciesPêche);
        } else if (act.activityType === "eleveur") {
          if (item.species) lineItemDetails.push(item.species);
        } else if (act.activityType === "forestier") {
          if (item.essence) lineItemDetails.push(item.essence);
        } else if (act.activityType === "artisan") {
          if (item.artisanatProducts) lineItemDetails.push(item.artisanatProducts);
        }
      }
    }
    const nature = lineItemDetails.length > 0 ? lineItemDetails.join("; ") : "";

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, m.createdById)).limit(1);

    csvRows.push([
      escapeCsv(m.memberNumber),
      escapeCsv(name),
      escapeCsv(forme),
      escapeCsv(activite),
      escapeCsv(nature),
      escapeCsv(m.createdAt.toISOString().split("T")[0]),
      escapeCsv(region?.name),
      escapeCsv(dept?.name),
      escapeCsv(arr?.name),
      escapeCsv(mobile),
      escapeCsv(m.village),
      escapeCsv(m.status),
      escapeCsv(creator?.name),
      "", // inscription (blank)
      "", // cotisation (blank)
      "", // adhesion_yunus (blank)
      "", // inscription_date (blank)
      "", // cotisation_restant (blank)
      ""  // adhesion_yunus_restant (blank)
    ].join(","));
  }

  const csv = csvRows.join("\n");
  const filename = `capef-membres-${new Date().toISOString().split("T")[0]}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Prepend a UTF-8 BOM so Excel opens accented French characters correctly
  res.send("\uFEFF" + csv);
});

// GET /api/members/:id
router.get("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const appUser = (req as any).appUser;

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  // Agents can only see their own members
  if (appUser.role === "agent" && member.createdById !== appUser.id) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }
  // Supervisors can only see their region
  if (appUser.role === "supervisor" && appUser.regionId && member.regionId !== appUser.regionId) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }

  res.json(await formatMember(member, true));
});

// PUT /api/members/:id
router.put("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const appUser = (req as any).appUser;

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  if (appUser.role === "agent" && existing.createdById !== appUser.id) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const fields = ["category", "individualOrOrg", "regionId", "departmentId", "arrondissementId", "village", "gpsLat", "gpsLng", "physiqueData", "moraleData", "categoryData", "badgeUrl"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const [updated] = await db
    .update(membersTable)
    .set(updates)
    .where(eq(membersTable.id, id))
    .returning();

  res.json(await formatMember(updated, true));
});

// DELETE /api/members/:id
router.delete("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const appUser = (req as any).appUser;

  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Seul l'administrateur peut supprimer des membres" });
    return;
  }

  const [deleted] = await db.delete(membersTable).where(eq(membersTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }
  res.sendStatus(204);
});

// GET /api/members/:id/activities
router.get("/members/:id/activities", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(raw, 10);

  const activities = await db
    .select()
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.memberId, memberId));

  const formatted = await Promise.all(
    activities.map(act => formatMemberActivity(act))
  );

  res.json(formatted);
});

// POST /api/members/:id/activities
router.post("/members/:id/activities", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(raw, 10);
  const { activityType, isPrimary, regionId, departmentId, arrondissementId, village, maillons } = req.body;

  if (!activityType) {
    res.status(400).json({ error: "activityType est requis" });
    return;
  }

  // If setting this activity as primary, clear other activities' primary flags for this member
  if (isPrimary) {
    await db
      .update(memberActivitiesTable)
      .set({ isPrimary: false })
      .where(eq(memberActivitiesTable.memberId, memberId));
  }

  try {
    const [activity] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId,
        activityType,
        isPrimary: isPrimary ?? false,
        regionId: regionId ?? null,
        departmentId: departmentId ?? null,
        arrondissementId: arrondissementId ?? null,
        village: village ?? null,
        maillons: maillons ?? [],
      })
      .returning();

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json(await formatMemberActivity(activity));
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (POST activity):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint,
      schema: error.schema,
      table: error.table,
    });

    res.status(400).json({
      success: false,
      error: "Database operation failed",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
});

// PUT /api/members/:id/activities/:activityId
router.put("/members/:id/activities/:activityId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const { activityType, isPrimary, regionId, departmentId, arrondissementId, village, maillons } = req.body;

  if (isPrimary) {
    await db
      .update(memberActivitiesTable)
      .set({ isPrimary: false })
      .where(and(eq(memberActivitiesTable.memberId, memberId), ne(memberActivitiesTable.id, activityId)));
  }

  try {
    const [updated] = await db
      .update(memberActivitiesTable)
      .set({
        activityType,
        isPrimary: isPrimary ?? false,
        regionId: regionId !== undefined ? regionId : null,
        departmentId: departmentId !== undefined ? departmentId : null,
        arrondissementId: arrondissementId !== undefined ? arrondissementId : null,
        village: village !== undefined ? village : null,
        maillons: maillons !== undefined ? maillons : [],
      })
      .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.memberId, memberId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Activité introuvable" });
      return;
    }

    await updateMemberStatusIfNeeded(memberId);

    res.json(await formatMemberActivity(updated));
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (PUT activity):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint,
      schema: error.schema,
      table: error.table,
    });

    res.status(400).json({
      success: false,
      error: "Database operation failed",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
});

// DELETE /api/members/:id/activities/:activityId
router.delete("/members/:id/activities/:activityId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const [deleted] = await db
    .delete(memberActivitiesTable)
    .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.memberId, memberId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Activité introuvable" });
    return;
  }

  // Delete line items belonging to this activity
  await db.delete(activityLineItemsTable).where(eq(activityLineItemsTable.activityId, activityId));

  await updateMemberStatusIfNeeded(memberId);

  res.sendStatus(204);
});

function normalizeLineItemPayload(body: any) {
  const payload: Record<string, any> = {};

  const textFields = [
    "parcelleGroupId", "cropCategory", "cropName", "cultureType",
    "productionUnit", "species", "foodType", "speciesPêche",
    "subCategory", "essence", "plantationType", "artisanatProducts", "rawMaterials"
  ];

  const numericFields = [
    "superficieHa", "productionQuantity", "productionFcfa", "cheptelSize", "parentLineItemId"
  ];

  for (const f of textFields) {
    if (body[f] === undefined || body[f] === "" || body[f] === null) {
      payload[f] = null;
    } else {
      payload[f] = String(body[f]);
    }
  }

  for (const f of numericFields) {
    if (body[f] === undefined || body[f] === "" || body[f] === null) {
      payload[f] = null;
    } else {
      const num = Number(body[f]);
      payload[f] = Number.isNaN(num) ? null : num;
    }
  }

  if (body.isPrincipalCrop === undefined || body.isPrincipalCrop === null) {
    payload.isPrincipalCrop = true;
  } else {
    payload.isPrincipalCrop = Boolean(body.isPrincipalCrop);
  }

  if (body.products === undefined || body.products === null) {
    payload.products = null;
  } else {
    payload.products = body.products; // Already jsonb
  }

  return payload;
}

// POST /api/members/:id/activities/:activityId/line-items
router.post("/members/:id/activities/:activityId/line-items", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const [activity] = await db
    .select()
    .from(memberActivitiesTable)
    .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.memberId, memberId)))
    .limit(1);

  if (!activity) {
    res.status(404).json({ error: "Activité introuvable" });
    return;
  }

  const normalized = normalizeLineItemPayload(req.body);

  try {
    const [item] = await db
      .insert(activityLineItemsTable)
      .values({
        activityId,
        ...normalized
      })
      .returning();

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json({
      ...item,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (POST line-item):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint,
      schema: error.schema,
      table: error.table,
      payload: req.body,
      normalizedPayload: normalized
    });

    res.status(400).json({
      success: false,
      error: "Database operation failed",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
});

// PUT /api/members/:id/activities/:activityId/line-items/:itemId
router.put("/members/:id/activities/:activityId/line-items/:itemId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItem, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const normalized = normalizeLineItemPayload(req.body);

  try {
    const [updated] = await db
      .update(activityLineItemsTable)
      .set(normalized)
      .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.activityId, activityId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ligne d'activité introuvable" });
      return;
    }

    await updateMemberStatusIfNeeded(memberId);

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (PUT line-item):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint,
      schema: error.schema,
      table: error.table,
      payload: req.body,
      normalizedPayload: normalized
    });

    res.status(400).json({
      success: false,
      error: "Database operation failed",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
});

// DELETE /api/members/:id/activities/:activityId/line-items/:itemId
router.delete("/members/:id/activities/:activityId/line-items/:itemId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItem, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const [deleted] = await db
    .delete(activityLineItemsTable)
    .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.activityId, activityId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Ligne d'activité introuvable" });
    return;
  }

  await updateMemberStatusIfNeeded(memberId);

  res.sendStatus(204);
});

// Admin Status Actions (Phase 3)

router.post("/members/:id/validate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [updated] = await db
    .update(membersTable)
    .set({ status: "valide" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  res.json(await formatMember(updated, true));
});

router.post("/members/:id/deactivate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [updated] = await db
    .update(membersTable)
    .set({ status: "desactive" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  res.json(await formatMember(updated, true));
});

router.post("/members/:id/reactivate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  // If blocked, we cannot reactivate/unblock
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (member && member.status === "bloque") {
    res.status(400).json({ error: "Impossible de réactiver un membre bloqué de manière définitive" });
    return;
  }

  const [updated] = await db
    .update(membersTable)
    .set({ status: "valide" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  res.json(await formatMember(updated, true));
});

router.post("/members/:id/block", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [updated] = await db
    .update(membersTable)
    .set({ status: "bloque" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  res.json(await formatMember(updated, true));
});

// POST /api/members/:id/badge — generate badge PDF with QR code
router.post("/members/:id/badge", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  // Generate badge_token if not already present
  let token = member.badgeToken;
  if (!token) {
    token = crypto.randomUUID();
    await db.update(membersTable).set({ badgeToken: token }).where(eq(membersTable.id, id));
  }

  const physique = member.physiqueData as any;
  const morale = member.moraleData as any;
  const name = member.memberType === "physique"
    ? `${physique?.nom ?? ""} ${physique?.prenom ?? ""}`.trim()
    : (morale?.nom ?? "");

  const [region] = member.regionId
    ? await db.select().from(regionsTable).where(eq(regionsTable.id, member.regionId)).limit(1)
    : [null];

  const phone = member.memberType === "physique"
    ? (physique?.telephone1 ?? "-")
    : (morale?.telephone1 ?? "-");

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verificationUrl = `${frontendUrl}/badge-verify/${token}`;

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 150 });

  let avatarSvg = "";
  if (member.memberType === "physique" && physique?.photoUrl) {
    avatarSvg = `
  <defs>
    <clipPath id="avatar-clip">
      <rect x="24" y="115" width="55" height="55" rx="6"/>
    </clipPath>
  </defs>
  <rect x="23" y="114" width="57" height="57" rx="7" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.5"/>
  <image x="24" y="115" width="55" height="55" href="${physique.photoUrl}" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice"/>
    `;
  } else {
    avatarSvg = `
  <rect x="23" y="114" width="57" height="57" rx="7" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.2"/>
  <rect x="24" y="115" width="55" height="55" rx="6" fill="#ffffff" fill-opacity="0.1"/>
  <text x="51" y="148" font-family="Arial,sans-serif" font-size="24" fill="#ffffff" fill-opacity="0.3" text-anchor="middle">${member.memberType === "physique" ? "👤" : "🏢"}</text>
    `;
  }

  const badgeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="320" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#166534;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#14532d;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="320" height="200" rx="12" fill="url(#bg)"/>
  <rect x="12" y="12" width="296" height="176" rx="8" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
  <text x="160" y="34" font-family="Arial,sans-serif" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.8">CHAMBRE D'AGRICULTURE, DE LA PÊCHE ET DES FORÊTS</text>
  <text x="160" y="48" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#fbbf24" text-anchor="middle">CAPEF CAMEROUN</text>
  <line x1="30" y1="56" x2="290" y2="56" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.3"/>
  <text x="160" y="76" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${name}</text>
  <text x="160" y="92" font-family="Arial,sans-serif" font-size="10" fill="#d1fae5" text-anchor="middle">${member.category.toUpperCase()} — ${member.memberType === "physique" ? "Personne Physique" : "Personne Morale"}</text>
  <text x="160" y="106" font-family="Arial,sans-serif" font-size="9" fill="#bbf7d0" text-anchor="middle">${region?.name ?? ""}</text>

  <!-- Left Side: Member Photo / Icon -->
  ${avatarSvg}

  <!-- Center Side: Member Number and Phone -->
  <text x="154" y="128" font-family="Arial,sans-serif" font-size="8" fill="#6ee7b7" text-anchor="middle">N° MEMBRE</text>
  <text x="154" y="144" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="#fbbf24" text-anchor="middle">${member.memberNumber}</text>
  <text x="154" y="160" font-family="Arial,sans-serif" font-size="8" fill="#bbf7d0" text-anchor="middle">Tél: ${phone}</text>
  <text x="154" y="176" font-family="Arial,sans-serif" font-size="7" fill="#6ee7b7" text-anchor="middle" opacity="0.8">Enrôlé le ${member.createdAt.toISOString().split("T")[0]}</text>

  <!-- Right Side: Scannable QR Code -->
  <rect x="231" y="114" width="57" height="57" rx="7" fill="#ffffff"/>
  <image x="232" y="115" width="55" height="55" href="${qrDataUrl}"/>
</svg>`;

  const base64Badge = Buffer.from(badgeSvg, "utf-8").toString("base64");
  const badgeUrl = `data:image/svg+xml;base64,${base64Badge}`;

  // Persist badge URL
  await db.update(membersTable).set({ badgeUrl }).where(eq(membersTable.id, id));

  res.json({ badgeUrl, memberNumber: member.memberNumber });
});

// POST /api/members/sync — bulk offline sync
router.post("/members/sync", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const { members } = req.body;

  if (!Array.isArray(members)) {
    res.status(400).json({ error: "members doit être un tableau" });
    return;
  }

  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    try {
      const [member] = await db
        .insert(membersTable)
        .values({
          memberNumber: "PENDING",
          memberType: m.memberType,
          category: m.category,
          individualOrOrg: m.individualOrOrg ?? "individuel",
          regionId: m.regionId ?? null,
          departmentId: m.departmentId ?? null,
          arrondissementId: m.arrondissementId ?? null,
          village: m.village ?? null,
          gpsLat: m.gpsLat ?? null,
          gpsLng: m.gpsLng ?? null,
          createdById: appUser.id,
          physiqueData: m.physiqueData ?? null,
          moraleData: m.moraleData ?? null,
          categoryData: m.categoryData ?? null,
          status: "incomplet",
        })
        .returning();
      const memberNumber = generateMemberNumber(m.category, member.id);
      await db.update(membersTable).set({ memberNumber }).where(eq(membersTable.id, member.id));

      // Seed the first activity as primary based on category
      await db.insert(memberActivitiesTable).values({
        memberId: member.id,
        activityType: m.category,
        isPrimary: true,
        regionId: m.regionId ?? null,
        departmentId: m.departmentId ?? null,
        arrondissementId: m.arrondissementId ?? null,
        village: m.village ?? null,
        maillons: [],
      });

      created++;
    } catch (err: any) {
      errors.push(`Entrée ${i + 1}: ${err?.message ?? "Erreur inconnue"}`);
    }
  }

  res.json({ created, failed: errors.length, errors });
});

const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

const publicRateLimiter = (req: any, res: any, next: any) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 30; // Max 30 requests per minute

  const record = ipRequestCounts.get(ip);

  if (!record || now > record.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    next();
  } else {
    record.count++;
    if (record.count > maxRequests) {
      res.status(429).json({ error: "Trop de requêtes. Veuillez réessayer dans une minute." });
    } else {
      next();
    }
  }
};

// GET /api/public/members/badge/:badgeToken
router.get("/public/members/badge/:badgeToken", publicRateLimiter, async (req, res): Promise<void> => {
  const token = req.params.badgeToken;
  if (!token) {
    res.status(404).json({ error: "Token requis" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.badgeToken, token))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Membre introuvable" });
    return;
  }

  // Return full member record using the standard formatMember helper
  res.json(await formatMember(member, true));
});

export default router;
