import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, ne } from "drizzle-orm";
import {
  db,
  membersTable,
  regionsTable,
  departmentsTable,
  arrondissementsTable,
  usersTable,
  memberActivitiesTable,
  activityLineItemsTable
} from "@workspace/db";
import { requireAppUser } from "../lib/auth";

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
  const { category, memberType, regionId, departmentId, search, page = "1", limit = "20", createdById, status } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];

  // Role-based filtering
  if (appUser.role === "agent") {
    conditions.push(eq(membersTable.createdById, appUser.id));
  } else if (appUser.role === "supervisor" && appUser.regionId) {
    conditions.push(eq(membersTable.regionId, appUser.regionId));
  }

  if (category) conditions.push(eq(membersTable.category, String(category)));
  if (memberType) conditions.push(eq(membersTable.memberType, String(memberType)));
  if (regionId && appUser.role !== "supervisor") conditions.push(eq(membersTable.regionId, Number(regionId)));
  if (departmentId) conditions.push(eq(membersTable.departmentId, Number(departmentId)));
  if (createdById && appUser.role === "admin") conditions.push(eq(membersTable.createdById, Number(createdById)));
  if (status) conditions.push(eq(membersTable.status, String(status)));

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
  const { category, memberType, regionId } = req.query;

  const conditions: any[] = [];
  if (appUser.role === "agent") conditions.push(eq(membersTable.createdById, appUser.id));
  else if (appUser.role === "supervisor" && appUser.regionId) conditions.push(eq(membersTable.regionId, appUser.regionId));
  if (category) conditions.push(eq(membersTable.category, String(category)));
  if (memberType) conditions.push(eq(membersTable.memberType, String(memberType)));
  if (regionId && appUser.role !== "supervisor") conditions.push(eq(membersTable.regionId, Number(regionId)));

  const rows = conditions.length
    ? await db.select().from(membersTable).where(and(...conditions))
    : await db.select().from(membersTable);

  // Generate CSV content
  const headers = ["ID", "Numéro membre", "Type", "Catégorie", "Nom/Organisation", "Région", "Village", "Statut", "Date création"];
  const csvRows = [headers.join(",")];

  for (const m of rows) {
    const physique = m.physiqueData as any;
    const morale = m.moraleData as any;
    const name = m.memberType === "physique"
      ? `${physique?.nom ?? ""} ${physique?.prenom ?? ""}`.trim()
      : (morale?.nom ?? "");
    const [region] = m.regionId
      ? await db.select().from(regionsTable).where(eq(regionsTable.id, m.regionId)).limit(1)
      : [null];

    csvRows.push([
      m.id,
      m.memberNumber,
      m.memberType,
      m.category,
      `"${name.replace(/"/g, '""')}"`,
      region?.name ?? "",
      m.village ?? "",
      m.status,
      m.createdAt.toISOString().split("T")[0],
    ].join(","));
  }

  const csv = csvRows.join("\n");
  const base64 = Buffer.from(csv, "utf-8").toString("base64");

  // For now return a data URL; in production this would be stored in object storage
  const downloadUrl = `data:text/csv;charset=utf-8;base64,${base64}`;
  res.json({ downloadUrl });
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

  const [item] = await db
    .insert(activityLineItemsTable)
    .values({
      activityId,
      ...req.body
    })
    .returning();

  await updateMemberStatusIfNeeded(memberId);

  res.status(201).json({
    ...item,
    createdAt: item.createdAt.toISOString(),
  });
});

// PUT /api/members/:id/activities/:activityId/line-items/:itemId
router.put("/members/:id/activities/:activityId/line-items/:itemId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItem, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);

  const [updated] = await db
    .update(activityLineItemsTable)
    .set(req.body)
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

  const physique = member.physiqueData as any;
  const morale = member.moraleData as any;
  const name = member.memberType === "physique"
    ? `${physique?.nom ?? ""} ${physique?.prenom ?? ""}`.trim()
    : (morale?.nom ?? "");

  const [region] = member.regionId
    ? await db.select().from(regionsTable).where(eq(regionsTable.id, member.regionId)).limit(1)
    : [null];

  // Generate a simple SVG-based badge as base64-encoded HTML for download
  const qrData = `CAPEF:${member.memberNumber}`;
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
  <text x="160" y="38" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.8">CHAMBRE D'AGRICULTURE, DE LA PÊCHE ET DES FORÊTS</text>
  <text x="160" y="54" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#fbbf24" text-anchor="middle">CAPEF CAMEROUN</text>
  <line x1="30" y1="62" x2="290" y2="62" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.3"/>
  <text x="160" y="86" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${name}</text>
  <text x="160" y="104" font-family="Arial,sans-serif" font-size="11" fill="#d1fae5" text-anchor="middle">${member.category.toUpperCase()} — ${member.memberType === "physique" ? "Personne Physique" : "Personne Morale"}</text>
  <text x="160" y="120" font-family="Arial,sans-serif" font-size="10" fill="#bbf7d0" text-anchor="middle">${region?.name ?? ""}</text>
  <rect x="230" y="130" width="64" height="64" rx="4" fill="#ffffff"/>
  <text x="262" y="165" font-family="Arial,sans-serif" font-size="6" fill="#166534" text-anchor="middle" font-weight="bold">QR CODE</text>
  <text x="262" y="175" font-family="Arial,sans-serif" font-size="5" fill="#166534" text-anchor="middle">${member.memberNumber}</text>
  <text x="120" y="148" font-family="Arial,sans-serif" font-size="9" fill="#bbf7d0" text-anchor="middle">N° MEMBRE</text>
  <text x="120" y="164" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#fbbf24" text-anchor="middle">${member.memberNumber}</text>
  <text x="120" y="186" font-family="Arial,sans-serif" font-size="8" fill="#6ee7b7" text-anchor="middle">Enrôlé le ${member.createdAt.toISOString().split("T")[0]}</text>
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

export default router;
