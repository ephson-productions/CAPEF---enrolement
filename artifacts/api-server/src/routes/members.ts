import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, ne, not } from "drizzle-orm";
import {
  db,
  membersTable,
  regionsTable,
  departmentsTable,
  arrondissementsTable,
  usersTable,
  memberActivitiesTable,
  activityLineItemsTable,
  processedOperationsTable
} from "@workspace/db";
import { requireAppUser } from "../lib/auth";
import { representedByWomanCondition } from "../lib/memberFilters";
import crypto from "crypto";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

function getClientOperationId(req: any): string | undefined {
  const headerId = req.headers["x-client-operation-id"];
  const bodyId = req.body?.clientOperationId;
  const rawId = headerId || bodyId;
  if (!rawId) return undefined;
  return Array.isArray(rawId) ? rawId[0] : String(rawId);
}

async function getProcessedOperation(clientOperationId?: string) {
  if (!clientOperationId) return null;
  const [existing] = await db
    .select()
    .from(processedOperationsTable)
    .where(eq(processedOperationsTable.clientOperationId, clientOperationId))
    .limit(1);
  return existing || null;
}

function generateMemberNumber(category: string, seqVal: number | string): string {
  const prefix: Record<string, string> = {
    agriculteur: "AGR",
    pecheur: "PCH",
    eleveur: "ELV",
    forestier: "FOR",
    artisan: "ART",
  };
  return `CAPEF-${prefix[category] ?? "MBR"}-${String(seqVal).padStart(6, "0")}`;
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
  } else if (appUser.role === "supervisor" && appUser.regionId) {
    conditions.push(eq(membersTable.regionId, appUser.regionId));
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
  const { memberType, category, individualOrOrg, regionId, departmentId, arrondissementId, village, gpsLat, gpsLng, physiqueData, moraleData, categoryData, initialLineItems } = req.body;
  const clientOperationId = getClientOperationId(req);

  if (clientOperationId) {
    const existing = await getProcessedOperation(clientOperationId);
    if (existing) {
      console.log(`[Idempotency] Match found for clientOperationId: ${clientOperationId}`);
      res.status(200).json(existing.resultPayload);
      return;
    }
  }

  if (!memberType || !category) {
    res.status(400).json({ error: "memberType et category sont requis" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Create sequence if not exists on postgres instance, then fetch nextval
      await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS seq_member_number START WITH 1 INCREMENT BY 1`);
      const seqResult: any = await tx.execute(sql`SELECT nextval('seq_member_number') as "seqVal"`);
      const rawSeqVal = seqResult.rows?.[0]?.seqVal ?? seqResult?.[0]?.seqVal;
      const seqVal = parseInt(String(rawSeqVal), 10);

      const memberNumber = generateMemberNumber(category, seqVal);

      // Insert member record with final guaranteed unique memberNumber
      const [inserted] = await tx
        .insert(membersTable)
        .values({
          memberNumber,
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

      // Seed primary activity inside same transaction
      const [primaryActivity] = await tx
        .insert(memberActivitiesTable)
        .values({
          memberId: inserted.id,
          activityType: category,
          isPrimary: true,
          regionId: inserted.regionId ?? null,
          departmentId: inserted.departmentId ?? null,
          arrondissementId: inserted.arrondissementId ?? null,
          village: inserted.village ?? null,
          maillons: [],
        })
        .returning();

      // Insert initial line items if present
      if (Array.isArray(initialLineItems) && initialLineItems.length > 0) {
        await tx.insert(activityLineItemsTable).values(
          initialLineItems.map((item: any) => ({
            ...normalizeLineItemPayload(item),
            activityId: primaryActivity.id,
          }))
        );
      }

      const formatted = await formatMember(inserted, true);

      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          clientOperationId,
          userId: appUser.id,
          operationType: "create_member",
          resourceId: inserted.id,
          resultPayload: formatted,
        });
      }

      return formatted;
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (POST /members):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint,
    });

    const isConflict = error.code === "23505";
    const statusCode = isConflict ? 409 : 400;

    res.status(statusCode).json({
      success: false,
      error: isConflict ? "Membre déjà existant ou conflit d'identifiant" : "Échec de la création du membre",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
    });
  }
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
  if (appUser.role === "agent") conditions.push(eq(membersTable.createdById, appUser.id));
  else if (appUser.role === "supervisor" && appUser.regionId) conditions.push(eq(membersTable.regionId, appUser.regionId));
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
  const appUser = (req as any).appUser;
  const { activityType, isPrimary, regionId, departmentId, arrondissementId, village, maillons } = req.body;
  const clientOperationId = getClientOperationId(req);

  if (clientOperationId) {
    const existing = await getProcessedOperation(clientOperationId);
    if (existing) {
      console.log(`[Idempotency] Match found for clientOperationId: ${clientOperationId}`);
      res.status(200).json(existing.resultPayload);
      return;
    }
  }

  if (!activityType) {
    res.status(400).json({ error: "activityType est requis" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // If setting this activity as primary, clear other activities' primary flags for this member
      if (isPrimary) {
        await tx
          .update(memberActivitiesTable)
          .set({ isPrimary: false })
          .where(eq(memberActivitiesTable.memberId, memberId));
      }

      const [activity] = await tx
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

      const formatted = {
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
        lineItems: [],
      };

      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          clientOperationId,
          userId: appUser.id,
          operationType: "create_activity",
          resourceId: activity.id,
          resultPayload: formatted,
        });
      }

      return formatted;
    });

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json(result);
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
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (clientOperationId) {
    const existing = await getProcessedOperation(clientOperationId);
    if (existing) {
      console.log(`[Idempotency] Match found for clientOperationId: ${clientOperationId}`);
      res.status(200).json(existing.resultPayload);
      return;
    }
  }

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
    const result = await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(activityLineItemsTable)
        .values({
          activityId,
          ...normalized
        })
        .returning();

      const formatted = {
        ...item,
        createdAt: item.createdAt.toISOString(),
      };

      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          clientOperationId,
          userId: appUser.id,
          operationType: "create_line_item",
          resourceId: item.id,
          resultPayload: formatted,
        });
      }

      return formatted;
    });

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json(result);
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
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (clientOperationId) {
    const existing = await getProcessedOperation(clientOperationId);
    if (existing) {
      console.log(`[Idempotency] Match found for clientOperationId: ${clientOperationId}`);
      res.status(200).json(existing.resultPayload ?? { success: true });
      return;
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(activityLineItemsTable)
        .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.activityId, activityId)))
        .returning();

      if (!deleted) {
        return null;
      }

      const payload = { success: true, deletedId: itemId };

      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          clientOperationId,
          userId: appUser.id,
          operationType: "delete_line_item",
          resourceId: itemId,
          resultPayload: payload,
        });
      }

      return payload;
    });

    if (!result) {
      res.status(404).json({ error: "Ligne d'activité introuvable" });
      return;
    }

    await updateMemberStatusIfNeeded(memberId);

    res.sendStatus(204);
  } catch (error: any) {
    console.error("🚨 POSTGRES EXECUTION ERROR (DELETE line-item):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
    });

    res.status(400).json({
      success: false,
      error: "Database operation failed",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
    });
  }
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

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

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
  const [dept] = member.departmentId
    ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, member.departmentId)).limit(1)
    : [null];
  const [arr] = member.arrondissementId
    ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.id, member.arrondissementId)).limit(1)
    : [null];

  const phone = member.memberType === "physique"
    ? (physique?.telephone1 ?? "-")
    : (morale?.telephone1 ?? "-");

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verificationUrl = `${frontendUrl}/badge-verify/${token}`;

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 220 });

  let base64Logo = "";
  try {
    const pathsToTry = [
      path.resolve(__dirname, "../../../capef/public/assets/LOGO_CAPEF.png"),
      path.resolve(process.cwd(), "artifacts/capef/public/assets/LOGO_CAPEF.png"),
      path.resolve(process.cwd(), "../capef/public/assets/LOGO_CAPEF.png"),
      path.resolve(__dirname, "../../../../artifacts/capef/public/assets/LOGO_CAPEF.png"),
    ];
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        base64Logo = fs.readFileSync(p).toString("base64");
        break;
      }
    }
  } catch (err) {
    console.error("Failed to read logo image:", err);
  }
  const logoDataUrl = base64Logo ? `data:image/png;base64,${base64Logo}` : "";

  const categoryThemes: Record<string, { bg: string; text: string; primary: string; label: string }> = {
    agriculteur: { bg: "#e6f4ea", text: "#137333", primary: "#1e8e3e", label: "AGRICULTEUR" },
    pecheur: { bg: "#e8f0fe", text: "#1a73e8", primary: "#1967d2", label: "PÊCHEUR" },
    eleveur: { bg: "#fce8e6", text: "#c5221f", primary: "#d93025", label: "ÉLEVEUR" },
    forestier: { bg: "#fef7e0", text: "#b06000", primary: "#f29900", label: "FORESTIER" },
    artisan: { bg: "#f3e8ff", text: "#6b21a8", primary: "#a855f7", label: "ARTISAN" },
  };
  const theme = categoryThemes[member.category.toLowerCase()] || { bg: "#f1f3f4", text: "#3c4043", primary: "#5f6368", label: member.category.toUpperCase() };

  const dateEnrolementStr = formatDate(member.createdAt);

  let avatarSvgHD = "";
  if (member.memberType === "physique" && physique?.photoUrl) {
    avatarSvgHD = `
    <g clip-path="url(#photo-clip)">
      <image href="${physique.photoUrl}" x="50" y="250" width="220" height="260" preserveAspectRatio="xMidYMid slice" />
    </g>
    `;
  } else {
    const initial = name.charAt(0).toUpperCase() || "C";
    avatarSvgHD = `
    <g clip-path="url(#photo-clip)">
      <rect x="50" y="250" width="220" height="260" fill="${theme.bg}" />
      <circle cx="160" cy="345" r="55" fill="${theme.primary}" fill-opacity="0.2" />
      <path d="M105,445 C105,405 135,385 160,385 C185,385 215,405 215,445" fill="none" stroke="${theme.primary}" stroke-width="6" stroke-linecap="round" />
      <circle cx="160" cy="335" r="30" fill="${theme.primary}" />
      <text x="160" y="485" font-family="'Helvetica Neue', Arial, sans-serif" font-size="48" font-weight="bold" fill="${theme.text}" text-anchor="middle" fill-opacity="0.3">${initial}</text>
    </g>
    `;
  }

  let signatureImageSvg = "";
  if (physique?.signatureUrl) {
    signatureImageSvg = `<image href="${physique.signatureUrl}" x="42" y="567" width="196" height="56" preserveAspectRatio="xMidYMid contain" />`;
  }

  const badgeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1012" height="1276" viewBox="0 0 1012 1276" xmlns="http://www.w3.org/2000/svg">
  <style>
    .card-title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 800; font-size: 26px; fill: #0d5c3a; }
    .card-subtitle { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 600; font-size: 16px; fill: #3c4043; }
    .label { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #70757a; text-transform: uppercase; letter-spacing: 0.5px; }
    .value { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; fill: #1f2937; }
    .value-highlight { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 800; fill: #d97706; }
    .category-badge { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 800; }
    .num-member { font-family: 'Courier New', Courier, monospace; font-size: 24px; font-weight: bold; fill: #111827; }
    .disclaimer-title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: bold; fill: #1f2937; }
    .disclaimer-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; fill: #4b5563; line-height: 20px; }
    .signature-title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: bold; fill: #4b5563; }
  </style>

  <!-- ================= RECTO CARD ================= -->
  <g id="recto">
    <!-- Outer Card Border -->
    <rect x="0" y="0" width="1012" height="638" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
    <clipPath id="recto-clip">
      <rect x="0" y="0" width="1012" height="638" rx="28"/>
    </clipPath>
    <g clip-path="url(#recto-clip)">
      <!-- Background subtle gradient and design features -->
      <linearGradient id="recto-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f0fdf4" stop-opacity="1" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="100%" stop-color="#ecfdf5" stop-opacity="1" />
      </linearGradient>
      <rect x="0" y="0" width="1012" height="638" fill="url(#recto-bg-grad)" />

      <!-- Watermark logo in back -->
      <image href="${logoDataUrl}" x="350" y="150" width="350" height="350" opacity="0.04" />

      <!-- Adjusted horizontal bicolour banner Vert #005A36, Rouge #E11D48 -->
      <rect x="0" y="145" width="1012" height="15" fill="#005A36"/> <!-- Green -->
      <rect x="0" y="160" width="1012" height="15" fill="#E11D48"/> <!-- Red -->
      <!-- Interrupted pavé blanc with CAPEF -->
      <rect x="441" y="141" width="130" height="38" rx="8" fill="#ffffff" stroke="#e5e7eb" stroke-width="1.5" />
      <text x="506" y="167" font-family="'Helvetica Neue', Arial, sans-serif" font-size="20" font-weight="900" fill="#005A36" text-anchor="middle">CAPEF</text>

      <!-- Top Header 3-column bilingual layout -->
      <!-- Left Column (French) -->
      <text x="228" y="45" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="900" fill="#005A36" text-anchor="middle">REPUBLIQUE DU CAMEROUN</text>
      <text x="228" y="60" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">Paix-Travail-Patrie</text>
      <text x="228" y="73" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>
      <text x="228" y="87" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">CHAMBRE D’AGRICULTURE, DES PECHES, DE L’ELEVAGE</text>
      <text x="228" y="100" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">ET DES FORETS DU CAMEROUN</text>
      <text x="228" y="113" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>

      <!-- Center Logo -->
      <image href="${logoDataUrl}" x="456" y="30" width="100" height="100" />

      <!-- Right Column (English) -->
      <text x="784" y="45" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="900" fill="#E11D48" text-anchor="middle">REPUBLIC OF CAMEROON</text>
      <text x="784" y="60" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">Peace-Work-Fatherland</text>
      <text x="784" y="73" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>
      <text x="784" y="87" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">CHAMBER OF AGRICULTURE, FISHERIES, LIVESTOCK</text>
      <text x="784" y="100" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">AND FORESTS OF CAMEROON</text>
      <text x="784" y="113" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>

      <!-- Card Main Title Ribbon -->
      <rect x="50" y="195" width="912" height="40" rx="6" fill="#005A36" />
      <text x="506" y="222" font-family="'Helvetica Neue', Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">CARTE D'ENRÔLEMENT CONSULAIRE / CONSULAR REGISTRATION CARD</text>

      <!-- Member Photo Container -->
      <defs>
        <clipPath id="photo-clip">
          <rect x="50" y="250" width="220" height="260" rx="16"/>
        </clipPath>
      </defs>
      <!-- Premium Photo Frame Shadow -->
      <rect x="48" y="248" width="224" height="264" rx="18" fill="none" stroke="#005A36" stroke-width="3" stroke-opacity="0.3"/>
      <!-- Actual image or vector placeholder -->
      ${avatarSvgHD}

      <!-- Category Pill Badge -->
      <rect x="50" y="525" width="220" height="42" rx="10" fill="${theme.bg}" stroke="${theme.primary}" stroke-width="1.5" />
      <text x="160" y="551" class="category-badge" fill="${theme.text}" text-anchor="middle" letter-spacing="1">${theme.label}</text>

      <!-- User Information list on the right -->
      <!-- Name -->
      <text x="310" y="270" class="label">Nom complet / Full Name</text>
      <text x="310" y="300" font-family="'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="900" fill="#111827">${name.toUpperCase()}</text>

      <!-- Téléphone / Contacts -->
      <text x="310" y="325" class="label">Téléphone / Contacts</text>
      <text x="310" y="350" font-family="'Helvetica Neue', Arial, sans-serif" font-size="20" font-weight="900" fill="#005A36">${phone}</text>

      <!-- Member number inside a styled banner row -->
      <rect x="310" y="365" width="440" height="48" rx="8" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1" />
      <text x="325" y="395" class="label" font-size="12">N° MEMBRE / ID:</text>
      <text x="460" y="397" class="num-member">${member.memberNumber}</text>

      <!-- Rest of profile fields -->
      <!-- Location info columns -->
      <g transform="translate(310, 420)">
        <text x="0" y="15" class="label">Région / Region</text>
        <text x="0" y="40" class="value">${region?.name ?? "-"}</text>

        <text x="230" y="15" class="label">Département / Division</text>
        <text x="230" y="40" class="value">${dept?.name ?? "-"}</text>
      </g>

      <!-- Arrondissement on its own separate line underneath Region & Department to prevent overlap -->
      <g transform="translate(310, 475)">
        <text x="0" y="15" class="label">Arrondissement / Subdivision</text>
        <text x="0" y="40" class="value">${arr?.name ?? "-"}</text>
      </g>

      <!-- Dates banner footer — No expiration date -->
      <g transform="translate(310, 535)">
        <rect x="0" y="0" width="440" height="42" rx="8" fill="#fffbeb" stroke="#fef3c7" stroke-width="1.5" />
        <text x="220" y="26" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="bold" fill="#b45309" text-anchor="middle">DATE D'ENRÔLEMENT: ${dateEnrolementStr}</text>
      </g>

      <!-- Right/Bottom QR Code frame & image -->
      <rect x="790" y="250" width="170" height="170" rx="14" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
      <image href="${qrDataUrl}" x="795" y="255" width="160" height="160" />
      <text x="875" y="440" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="800" fill="#005A36" text-anchor="middle">VERIFICATION SCAN</text>

      <!-- Dynamic signature of Director / official seal inside Recto Card -->
      <g transform="translate(790, 465)">
        <rect x="0" y="0" width="170" height="102" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
        <text x="85" y="25" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#70757a" text-anchor="middle">SCEAU ET SIGNATURE</text>
        <!-- Subtle simulated dynamic signature vector of CAPEF General Secretariat -->
        <path d="M 35 65 Q 65 45 95 65 T 145 55 M 55 50 Q 85 75 115 50" fill="none" stroke="#1d4ed8" stroke-width="2" opacity="0.7" />
        <text x="85" y="90" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#005A36" text-anchor="middle">Secrétariat Général CAPEF</text>
      </g>
    </g>
  </g>

  <!-- ================= VERSO CARD ================= -->
  <g id="verso" transform="translate(0, 638)">
    <!-- Outer Card Border -->
    <rect x="0" y="0" width="1012" height="638" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
    <clipPath id="verso-clip">
      <rect x="0" y="0" width="1012" height="638" rx="28"/>
    </clipPath>
    <g clip-path="url(#verso-clip)">
      <!-- Background subtle gradient and design features -->
      <linearGradient id="verso-bg-grad" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#f9fafb" stop-opacity="1" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="100%" stop-color="#f3f4f6" stop-opacity="1" />
      </linearGradient>
      <rect x="0" y="0" width="1012" height="638" fill="url(#verso-bg-grad)" />

      <!-- Massive faded watermarked logo for back validation -->
      <image href="${logoDataUrl}" x="306" y="119" width="400" height="400" opacity="0.08" />

      <!-- Back header stripes mirroring Recto (Cameroon colors) -->
      <rect x="0" y="0" width="1012" height="15" fill="#fecd0b"/> <!-- Yellow -->
      <rect x="337" y="0" width="338" height="15" fill="#ce1126"/> <!-- Red -->
      <rect x="675" y="0" width="337" height="15" fill="#005A36"/> <!-- Green -->
      <!-- Star -->
      <polygon points="506,1.5 509,8 516,8 510,12 512,18 506,14 500,18 502,12 496,8 503,8" fill="#fecd0b" />

      <!-- Terms of Use container -->
      <g transform="translate(60, 45)">
        <text x="446" y="40" font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="900" fill="#005A36" text-anchor="middle" letter-spacing="1">CONDITIONS D'UTILISATION / TERMS OF USE</text>
        <line x1="246" y1="55" x2="646" y2="55" stroke="#005A36" stroke-width="2" opacity="0.3"/>

        <!-- French Terms -->
        <g transform="translate(0, 90)">
          <text x="0" y="0" class="disclaimer-title" fill="#005A36">Réglementation Consulaire :</text>
          <text x="0" y="28" class="disclaimer-text">1. Cette carte d'enrôlement est strictement personnelle, incessible et demeure la propriété exclusive de la CAPEF.</text>
          <text x="0" y="53" class="disclaimer-text">2. Elle atteste de l'inscription officielle du titulaire au registre consulaire professionnel de la Chambre au Cameroun.</text>
          <text x="0" y="78" class="disclaimer-text">3. Le titulaire s'engage à respecter scrupuleusement les statuts, règlements et chartes professionnelles en vigueur.</text>
          <text x="0" y="103" class="disclaimer-text">4. En cas de perte, de vol ou de détérioration, le titulaire doit obligatoirement en informer la délégation régionale de sa zone.</text>
          <text x="0" y="128" class="disclaimer-text">5. Les autorités publiques sont priées de prêter assistance et de faciliter l'accès du titulaire aux services de développement.</text>
        </g>

        <!-- English Terms -->
        <g transform="translate(0, 275)">
          <text x="0" y="0" class="disclaimer-title" fill="#ce1126">Consular Regulation :</text>
          <text x="0" y="28" class="disclaimer-text">1. This registration card is strictly personal, non-transferable and remains the exclusive property of CAPEF.</text>
          <text x="0" y="53" class="disclaimer-text">2. It certifies the holder's official registration in the professional consular registry of the Chamber in Cameroon.</text>
          <text x="0" y="78" class="disclaimer-text">3. The holder agrees to fully comply with all professional bylaws, internal regulations, and ethical standards.</text>
          <text x="0" y="103" class="disclaimer-text">4. In case of loss, theft or damage, the holder must immediately notify the local regional delegation office.</text>
          <text x="0" y="128" class="disclaimer-text">5. Public authorities are kindly requested to assist and facilitate the holder's access to professional assistance.</text>
        </g>
      </g>

      <!-- Signature boxes at bottom of Verso -->
      <line x1="60" y1="520" x2="952" y2="520" stroke="#e5e7eb" stroke-width="1.5" />

      <text x="140" y="555" class="signature-title" text-anchor="middle">SIGNATURE DU TITULAIRE / HOLDER'S SIGNATURE</text>
      <!-- Simulation of holder's signing area / Tactile signature -->
      <rect x="40" y="565" width="200" height="60" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3,3" />
      ${signatureImageSvg}

      <text x="506" y="575" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="900" fill="#005A36" text-anchor="middle" letter-spacing="1">CHAMBRE D'AGRICULTURE, DES PECHES, DE L'ELEVAGE ET DES FORETS</text>
      <text x="506" y="595" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="bold" fill="#70757a" text-anchor="middle">BP 287 Yaoundé, Cameroun — Email: contact@capef.cm</text>

      <text x="892" y="555" class="signature-title" text-anchor="end">SIGNATURE DU PRESIDENT / PRESIDENT'S SIGNATURE</text>
      <!-- Simulation of official signature stamp -->
      <path d="M 820 575 Q 840 565 860 580 T 900 570" fill="none" stroke="#ce1126" stroke-width="2.5" opacity="0.6"/>
      <circle cx="860" cy="580" r="22" fill="none" stroke="#ce1126" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.5" />
    </g>
  </g>
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

// GET /api/members/badge/:badgeToken - Require authentication (requireAppUser)
router.get("/members/badge/:badgeToken", requireAppUser, async (req, res): Promise<void> => {
  const rawToken = req.params.badgeToken;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
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
    res.status(404).json({ error: "Badge invalide ou introuvable" });
    return;
  }

  // Return complete member verification profile to any authenticated CAPEF user
  res.json(await formatMember(member, true));
});

export default router;
