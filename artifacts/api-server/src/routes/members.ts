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
import { CreateMemberBody } from "@workspace/api-zod";
import { requireAppUser } from "../lib/auth";
import { validateBody } from "../middlewares/validateBody";
import { representedByWomanCondition } from "../lib/memberFilters";
import { resolveMemberMediaUrls, resolveSignedMediaUrl } from "../lib/storage";
import crypto from "crypto";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const router: IRouter = Router();

function getClientOperationId(req: any): string | undefined {
  const headerId = req.headers["x-client-operation-id"];
  const bodyId = req.body?.clientOperationId;
  const rawId = headerId || bodyId;
  if (!rawId) return undefined;
  return Array.isArray(rawId) ? rawId[0] : String(rawId);
}

function computePayloadHash(payload: any): string {
  if (payload === undefined || payload === null) return "";
  try {
    const clean = { ...payload };
    delete clean.clientOperationId;
    return crypto.createHash("sha256").update(JSON.stringify(clean)).digest("hex");
  } catch (err) {
    return "";
  }
}

async function checkProcessedOperation(
  clientOperationId: string | undefined,
  appUserId: number,
  operationType: string,
  payload: any,
  res: any,
  executor: any = db
): Promise<boolean> {
  if (!clientOperationId) return false;

  const [existing] = await executor
    .select()
    .from(processedOperationsTable)
    .where(
      and(
        eq(processedOperationsTable.userId, appUserId),
        eq(processedOperationsTable.clientOperationId, clientOperationId)
      )
    )
    .limit(1);

  if (existing) {
    const currentHash = computePayloadHash(payload);
    const isSameHash = existing.payloadHash === currentHash;
    const isSameType = existing.operationType === operationType;

    if (isSameHash && isSameType) {
      console.log(`[Idempotency] Replaying exact cached response for clientOperationId: ${clientOperationId}`);
      if (existing.resultPayload === null || existing.resultPayload === undefined) {
        res.sendStatus(204);
      } else {
        res.status(200).json(existing.resultPayload);
      }
      return true;
    } else {
      console.warn(`[Idempotency] Reused clientOperationId ${clientOperationId} with different payload or operationType!`);
      res.status(422).json({
        error: "Réutilisation d'identifiant d'opération",
        code: "REUSED_OPERATION_ID",
        message: "L'identifiant d'opération fourni a déjà été utilisé avec un corps de requête ou un type d'opération différent.",
      });
      return true;
    }
  }

  return false;
}

async function handleConcurrentOperationRace(
  clientOperationId: string | undefined,
  appUserId: number,
  res: any,
  retries = 5
): Promise<boolean> {
  if (!clientOperationId) return false;

  for (let attempt = 0; attempt < retries; attempt++) {
    const [existing] = await db
      .select()
      .from(processedOperationsTable)
      .where(
        and(
          eq(processedOperationsTable.userId, appUserId),
          eq(processedOperationsTable.clientOperationId, clientOperationId)
        )
      )
      .limit(1);

    if (existing) {
      console.log(`[Idempotency] Race condition resolved: Returning cached payload for clientOperationId: ${clientOperationId}`);
      if (existing.resultPayload === null || existing.resultPayload === undefined) {
        res.sendStatus(204);
      } else {
        res.status(200).json(existing.resultPayload);
      }
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return false;
}

function coerceNumeric(val: any): number | null {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

function escapeXml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
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

async function getMemberWithAccessCheck(appUser: any, memberId: number, res: any): Promise<typeof membersTable.$inferSelect | null> {
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membre introuvable" });
    return null;
  }

  if (appUser.role === "agent" && member.createdById !== appUser.id) {
    res.status(403).json({ error: "Accès refusé" });
    return null;
  }

  if (appUser.role === "supervisor" && appUser.regionId && member.regionId !== appUser.regionId) {
    res.status(403).json({ error: "Accès refusé" });
    return null;
  }

  return member;
}

async function getActivityWithMemberCheck(activityId: number, memberId: number, res: any): Promise<typeof memberActivitiesTable.$inferSelect | null> {
  const [activity] = await db
    .select()
    .from(memberActivitiesTable)
    .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.memberId, memberId)))
    .limit(1);

  if (!activity) {
    res.status(404).json({ error: "Activité introuvable ou n'appartient pas à ce membre" });
    return null;
  }

  return activity;
}

async function getLineItemWithActivityCheck(itemId: number, activityId: number, res: any): Promise<typeof activityLineItemsTable.$inferSelect | null> {
  const [item] = await db
    .select()
    .from(activityLineItemsTable)
    .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.activityId, activityId)))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Ligne d'activité introuvable ou n'appartient pas à cette activité" });
    return null;
  }

  return item;
}

async function formatMemberActivity(activity: typeof memberActivitiesTable.$inferSelect, executor: any = db) {
  const lineItems = await executor
    .select()
    .from(activityLineItemsTable)
    .where(eq(activityLineItemsTable.activityId, activity.id));

  return {
    id: activity.id,
    version: activity.version ?? 1,
    memberId: activity.memberId,
    activityType: activity.activityType,
    isPrimary: activity.isPrimary,
    regionId: activity.regionId ?? null,
    departmentId: activity.departmentId ?? null,
    arrondissementId: activity.arrondissementId ?? null,
    village: activity.village ?? null,
    maillons: (activity.maillons as string[]) ?? [],
    createdAt: activity.createdAt.toISOString(),
    lineItems: lineItems.map((item: any) => ({
      ...item,
      version: item.version ?? 1,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

type PreJoinedMemberRow = {
  member: typeof membersTable.$inferSelect;
  regionName: string | null;
  departmentName: string | null;
  arrondissementName: string | null;
  createdByName: string | null;
};

function formatPreJoinedMember(row: PreJoinedMemberRow, includeDetail = false) {
  const m = row.member;
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
    version: m.version ?? 1,
    displayName,
    regionName: row.regionName ?? null,
    createdByName: row.createdByName ?? null,
    badgeUrl: m.badgeUrl ?? null,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };

  if (!includeDetail) return base;

  return {
    ...base,
    individualOrOrg: m.individualOrOrg,
    regionId: m.regionId ?? null,
    departmentId: m.departmentId ?? null,
    departmentName: row.departmentName ?? null,
    arrondissementId: m.arrondissementId ?? null,
    arrondissementName: row.arrondissementName ?? null,
    village: m.village ?? null,
    gpsLat: m.gpsLat ?? null,
    gpsLng: m.gpsLng ?? null,
    createdById: m.createdById,
    physiqueData: m.physiqueData ?? null,
    moraleData: m.moraleData ?? null,
    categoryData: m.categoryData ?? null,
    updatedAt: m.updatedAt.toISOString(),
  };
}

async function formatMember(m: typeof membersTable.$inferSelect, includeDetail = false, executor: any = db) {
  const [region] = m.regionId
    ? await executor.select().from(regionsTable).where(eq(regionsTable.id, m.regionId)).limit(1)
    : [null];
  const [dept] = m.departmentId
    ? await executor.select().from(departmentsTable).where(eq(departmentsTable.id, m.departmentId)).limit(1)
    : [null];
  const [arr] = m.arrondissementId
    ? await executor.select().from(arrondissementsTable).where(eq(arrondissementsTable.id, m.arrondissementId)).limit(1)
    : [null];
  const [creator] = await executor.select().from(usersTable).where(eq(usersTable.id, m.createdById)).limit(1);

  const formattedBase = formatPreJoinedMember(
    {
      member: m,
      regionName: region?.name ?? null,
      departmentName: dept?.name ?? null,
      arrondissementName: arr?.name ?? null,
      createdByName: creator?.name ?? null,
    },
    includeDetail
  );

  if (!includeDetail) return formattedBase;

  const activities = await executor
    .select()
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.memberId, m.id));

  const formattedActivities = await Promise.all(
    activities.map((act: any) => formatMemberActivity(act, executor))
  );

  const fullMember = {
    ...formattedBase,
    activities: formattedActivities,
  };

  return await resolveMemberMediaUrls(fullMember);
}

async function updateMemberStatusIfNeeded(memberId: number, executor: any = db): Promise<void> {
  const [member] = await executor.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member) return;

  if (["valide", "desactive", "bloque"].includes(member.status)) {
    return;
  }

  const activities = await executor
    .select()
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.memberId, memberId));

  let hasCompletedActivity = false;
  for (const act of activities) {
    const lineItems = await executor
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
    await executor
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

  if (search) {
    const s = `%${String(search)}%`;
    conditions.push(
      sql`(${membersTable.memberNumber} ILIKE ${s} OR ${membersTable.physiqueData}->>'nom' ILIKE ${s} OR ${membersTable.physiqueData}->>'prenom' ILIKE ${s} OR ${membersTable.moraleData}->>'nom' ILIKE ${s})`
    );
  }

  let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(membersTable);
  if (conditions.length) {
    countQuery = countQuery.where(and(...conditions)) as any;
  }

  let joinedQuery = db
    .select({
      id: membersTable.id,
      memberNumber: membersTable.memberNumber,
      memberType: membersTable.memberType,
      category: membersTable.category,
      version: membersTable.version,
      status: membersTable.status,
      createdAt: membersTable.createdAt,
      physiqueNom: sql<string | null>`${membersTable.physiqueData}->>'nom'`,
      physiquePrenom: sql<string | null>`${membersTable.physiqueData}->>'prenom'`,
      moraleNom: sql<string | null>`${membersTable.moraleData}->>'nom'`,
      regionName: regionsTable.name,
      departmentName: departmentsTable.name,
      arrondissementName: arrondissementsTable.name,
      createdByName: usersTable.name,
    })
    .from(membersTable)
    .leftJoin(regionsTable, eq(membersTable.regionId, regionsTable.id))
    .leftJoin(departmentsTable, eq(membersTable.departmentId, departmentsTable.id))
    .leftJoin(arrondissementsTable, eq(membersTable.arrondissementId, arrondissementsTable.id))
    .leftJoin(usersTable, eq(membersTable.createdById, usersTable.id));

  if (conditions.length) {
    joinedQuery = joinedQuery.where(and(...conditions)) as any;
  }

  const [totalResult] = await countQuery;
  const total = totalResult?.count ?? 0;

  const rows = await joinedQuery
    .orderBy(sql`${membersTable.createdAt} DESC`)
    .limit(limitNum)
    .offset(offset);

  const summaries = rows.map((row) => {
    const displayName = row.memberType === "physique"
      ? `${row.physiqueNom ?? ""} ${row.physiquePrenom ?? ""}`.trim() || null
      : (row.moraleNom ?? null);

    return {
      id: row.id,
      memberNumber: row.memberNumber,
      memberType: row.memberType,
      category: row.category,
      version: row.version ?? 1,
      displayName,
      regionName: row.regionName ?? null,
      createdByName: row.createdByName ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  });

  res.json({
    data: summaries,
    total,
    page: pageNum,
    limit: limitNum,
  });
});

// POST /api/members
router.post("/members", requireAppUser, validateBody(CreateMemberBody), async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const { memberType, category, individualOrOrg, regionId, departmentId, arrondissementId, village, gpsLat, gpsLng, physiqueData, moraleData, categoryData, initialLineItems } = req.body;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "create_member", req.body, res)) {
    return;
  }

  if (!memberType || !category) {
    res.status(400).json({ error: "memberType et category sont requis" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "create_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const seqResult: any = await tx.execute(sql`SELECT nextval('seq_member_number') as "seqVal"`);
      const rawSeqVal = seqResult.rows?.[0]?.seqVal ?? seqResult?.[0]?.seqVal;
      const seqVal = parseInt(String(rawSeqVal), 10);

      const memberNumber = generateMemberNumber(category, seqVal);

      const [inserted] = await tx
        .insert(membersTable)
        .values({
          memberNumber,
          memberType,
          category,
          version: 1,
          individualOrOrg: individualOrOrg ?? "individuel",
          regionId: coerceNumeric(regionId),
          departmentId: coerceNumeric(departmentId),
          arrondissementId: coerceNumeric(arrondissementId),
          village: village ?? null,
          gpsLat: coerceNumeric(gpsLat),
          gpsLng: coerceNumeric(gpsLng),
          createdById: appUser.id,
          physiqueData: physiqueData ?? null,
          moraleData: moraleData ?? null,
          categoryData: categoryData ?? null,
          status: "incomplet",
        })
        .returning();

      const [primaryActivity] = await tx
        .insert(memberActivitiesTable)
        .values({
          memberId: inserted.id,
          activityType: category,
          version: 1,
          isPrimary: true,
          regionId: inserted.regionId ?? null,
          departmentId: inserted.departmentId ?? null,
          arrondissementId: inserted.arrondissementId ?? null,
          village: inserted.village ?? null,
          maillons: [],
        })
        .returning();

      if (Array.isArray(initialLineItems) && initialLineItems.length > 0) {
        await tx.insert(activityLineItemsTable).values(
          initialLineItems.map((item: any) => ({
            ...normalizeLineItemPayload(item),
            activityId: primaryActivity.id,
            version: 1,
          }))
        );
      }

      const formatted = await formatMember(inserted, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: inserted.id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (POST /members):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
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

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `capef-membres-${dateStr}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: true,
  });

  const worksheet = workbook.addWorksheet("Tous les membres");

  worksheet.columns = [
    { header: "matricule", key: "matricule", width: 22 },
    { header: "name", key: "name", width: 30 },
    { header: "forme", key: "forme", width: 20 },
    { header: "activite", key: "activite", width: 18 },
    { header: "nature", key: "nature", width: 30 },
    { header: "date_creation", key: "date_creation", width: 15 },
    { header: "region", key: "region", width: 20 },
    { header: "departement", key: "departement", width: 20 },
    { header: "commune", key: "commune", width: 20 },
    { header: "mobile", key: "mobile", width: 18 },
    { header: "village", key: "village", width: 20 },
    { header: "statut", key: "statut", width: 15 },
    { header: "agent", key: "agent", width: 25 },
    { header: "inscription", key: "inscription", width: 15 },
    { header: "cotisation", key: "cotisation", width: 15 },
    { header: "adhesion_yunus", key: "adhesion_yunus", width: 15 },
    { header: "inscription_date", key: "inscription_date", width: 15 },
    { header: "cotisation_restant", key: "cotisation_restant", width: 15 },
    { header: "adhesion_yunus_restant", key: "adhesion_yunus_restant", width: 15 },
  ];

  if (representantGenre && memberType === "physique") {
    await workbook.commit();
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

  const categoryTranslation: Record<string, string> = {
    agriculteur: "agriculture",
    pecheur: "fishing",
    eleveur: "livestock",
    forestier: "forestry",
    artisan: "artisanat"
  };

  const batchSize = 500;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = db
      .select({
        id: membersTable.id,
        memberNumber: membersTable.memberNumber,
        memberType: membersTable.memberType,
        category: membersTable.category,
        village: membersTable.village,
        status: membersTable.status,
        createdAt: membersTable.createdAt,
        physiqueNom: sql<string | null>`${membersTable.physiqueData}->>'nom'`,
        physiquePrenom: sql<string | null>`${membersTable.physiqueData}->>'prenom'`,
        physiqueTel: sql<string | null>`${membersTable.physiqueData}->>'telephone1'`,
        moraleNom: sql<string | null>`${membersTable.moraleData}->>'nom'`,
        moraleOrg: sql<string | null>`${membersTable.moraleData}->>'typeOrganisation'`,
        moraleTel: sql<string | null>`${membersTable.moraleData}->>'telephone1'`,
        regionName: regionsTable.name,
        departmentName: departmentsTable.name,
        arrondissementName: arrondissementsTable.name,
        createdByName: usersTable.name,
      })
      .from(membersTable)
      .leftJoin(regionsTable, eq(membersTable.regionId, regionsTable.id))
      .leftJoin(departmentsTable, eq(membersTable.departmentId, departmentsTable.id))
      .leftJoin(arrondissementsTable, eq(membersTable.arrondissementId, arrondissementsTable.id))
      .leftJoin(usersTable, eq(membersTable.createdById, usersTable.id));

    if (conditions.length) {
      query = query.where(and(...conditions)) as any;
    }

    const batch = await query
      .orderBy(sql`${membersTable.id} ASC`)
      .limit(batchSize)
      .offset(offset);

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    const memberIds = batch.map((r) => r.id);
    const batchActivities = await db
      .select({
        memberId: memberActivitiesTable.memberId,
        activityType: memberActivitiesTable.activityType,
        cropName: activityLineItemsTable.cropName,
        speciesPêche: activityLineItemsTable.speciesPêche,
        species: activityLineItemsTable.species,
        essence: activityLineItemsTable.essence,
        artisanatProducts: activityLineItemsTable.artisanatProducts,
      })
      .from(memberActivitiesTable)
      .innerJoin(activityLineItemsTable, eq(activityLineItemsTable.activityId, memberActivitiesTable.id))
      .where(sql`${memberActivitiesTable.memberId} IN ${memberIds}`);

    const natureMap = new Map<number, string[]>();
    for (const act of batchActivities) {
      const list = natureMap.get(act.memberId) || [];
      if (act.activityType === "agriculteur" && act.cropName) list.push(act.cropName);
      else if (act.activityType === "pecheur" && act.speciesPêche) list.push(act.speciesPêche);
      else if (act.activityType === "eleveur" && act.species) list.push(act.species);
      else if (act.activityType === "forestier" && act.essence) list.push(act.essence);
      else if (act.activityType === "artisan" && act.artisanatProducts) list.push(act.artisanatProducts);
      natureMap.set(act.memberId, list);
    }

    for (const m of batch) {
      const name = m.memberType === "physique"
        ? `${m.physiqueNom ?? ""} ${m.physiquePrenom ?? ""}`.trim()
        : (m.moraleNom ?? "");
      const forme = m.memberType === "morale"
        ? (m.moraleOrg ?? "")
        : "";
      const activite = categoryTranslation[m.category] || m.category;
      const mobile = m.memberType === "physique"
        ? (m.physiqueTel ?? "")
        : (m.moraleTel ?? "");

      const lineItems = natureMap.get(m.id) || [];
      const nature = lineItems.length > 0 ? Array.from(new Set(lineItems)).join("; ") : "";

      worksheet.addRow({
        matricule: m.memberNumber,
        name,
        forme,
        activite,
        nature,
        date_creation: m.createdAt.toISOString().split("T")[0],
        region: m.regionName ?? "",
        departement: m.departmentName ?? "",
        commune: m.arrondissementName ?? "",
        mobile,
        village: m.village ?? "",
        statut: m.status,
        agent: m.createdByName ?? "",
        inscription: "",
        cotisation: "",
        adhesion_yunus: "",
        inscription_date: "",
        cotisation_restant: "",
        adhesion_yunus_restant: "",
      }).commit();

    }

    offset += batch.length;
    if (batch.length < batchSize) {
      hasMore = false;
    }
  }

  await workbook.commit();
});

// GET /api/members/:id
router.get("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;

  const member = await getMemberWithAccessCheck(appUser, id, res);
  if (!member) return;

  res.json(await formatMember(member, true));
});

// PUT /api/members/:id — Update a member with Atomic OCC Concurrency & Idempotency
router.put("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "update_member", req.body, res)) {
    return;
  }

  const existing = await getMemberWithAccessCheck(appUser, id, res);
  if (!existing) return;

  const clientVersion = req.body.version !== undefined && req.body.version !== null ? Number(req.body.version) : null;
  const currentVersion = existing.version ?? 1;

  if (clientVersion !== null && clientVersion !== currentVersion) {
    const currentMemberState = await formatMember(existing, true);
    res.status(409).json({
      error: "Conflit de modification (OCC)",
      message: `La version fournie (${clientVersion}) ne correspond pas à la version actuelle du serveur (${currentVersion}).`,
      serverVersion: currentVersion,
      currentMember: currentMemberState,
    });
    return;
  }

  const updates: Record<string, unknown> = {
    version: currentVersion + 1,
  };

  const fields = ["category", "individualOrOrg", "village", "physiqueData", "moraleData", "categoryData", "badgeUrl"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const numericFields = ["regionId", "departmentId", "arrondissementId", "gpsLat", "gpsLng"];
  for (const f of numericFields) {
    if (req.body[f] !== undefined) updates[f] = coerceNumeric(req.body[f]);
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "update_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(membersTable)
        .set(updates)
        .where(and(eq(membersTable.id, id), eq(membersTable.version, currentVersion)))
        .returning();

      if (!updated) {
        const [latestMember] = await tx.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
        const latestState = await formatMember(latestMember, true, tx);
        res.status(409).json({
          error: "Conflit de modification (OCC)",
          message: `Mise à jour concurrente détectée. La version serveur actuelle est ${latestMember?.version ?? currentVersion}.`,
          serverVersion: latestMember?.version ?? currentVersion,
          currentMember: latestState,
        });
        return null;
      }

      const formatted = await formatMember(updated, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (result) {
      res.json(result);
    }
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (PUT /members/:id):", {
      code: error.code,
      detail: error.detail,
      message: error.message,
    });

    res.status(400).json({
      success: false,
      error: "Échec de la mise à jour du membre",
      code: error.code || "UNKNOWN_DB_ERROR",
      message: error.message,
    });
  }
});

// DELETE /api/members/:id
router.delete("/members/:id", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "delete_member", req.body, res)) {
    return;
  }

  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Seul l'administrateur peut supprimer des membres" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "delete_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [deleted] = await tx.delete(membersTable).where(eq(membersTable.id, id)).returning();
      if (!deleted) {
        return null;
      }

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: null,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return true;
    });

    if (!result) {
      res.status(404).json({ error: "Membre introuvable" });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec de la suppression du membre" });
  }
});

// GET /api/members/:id/activities
router.get("/members/:id/activities", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(raw, 10);
  if (isNaN(memberId)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

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
  if (isNaN(memberId)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const { activityType, isPrimary, regionId, departmentId, arrondissementId, village, maillons } = req.body;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "create_activity", req.body, res)) {
    return;
  }

  if (!activityType) {
    res.status(400).json({ error: "activityType est requis" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "create_activity",
          payloadHash: computePayloadHash(req.body),
        });
      }

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
          version: 1,
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
        version: activity.version ?? 1,
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
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: activity.id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json(result);
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (POST activity):", {
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

// PUT /api/members/:id/activities/:activityId
router.put("/members/:id/activities/:activityId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);
  if (isNaN(memberId) || isNaN(activityId)) {
    res.status(400).json({ error: "ID membre ou activité invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "update_activity", req.body, res)) {
    return;
  }

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const activity = await getActivityWithMemberCheck(activityId, memberId, res);
  if (!activity) return;

  const currentVersion = activity.version ?? 1;
  const clientVersion = req.body.version !== undefined && req.body.version !== null ? Number(req.body.version) : null;

  if (clientVersion !== null && clientVersion !== currentVersion) {
    res.status(409).json({
      error: "Conflit de modification (OCC)",
      message: `La version de l'activité fournie (${clientVersion}) ne correspond pas à la version actuelle du serveur (${currentVersion}).`,
      serverVersion: currentVersion,
    });
    return;
  }

  const { activityType, isPrimary, regionId, departmentId, arrondissementId, village, maillons } = req.body;

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "update_activity",
          payloadHash: computePayloadHash(req.body),
        });
      }

      if (isPrimary) {
        await tx
          .update(memberActivitiesTable)
          .set({ isPrimary: false })
          .where(and(eq(memberActivitiesTable.memberId, memberId), ne(memberActivitiesTable.id, activityId)));
      }

      const [updated] = await tx
        .update(memberActivitiesTable)
        .set({
          activityType,
          version: currentVersion + 1,
          isPrimary: isPrimary ?? false,
          regionId: regionId !== undefined ? regionId : null,
          departmentId: departmentId !== undefined ? departmentId : null,
          arrondissementId: arrondissementId !== undefined ? arrondissementId : null,
          village: village !== undefined ? village : null,
          maillons: maillons !== undefined ? maillons : [],
        })
        .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.version, currentVersion)))
        .returning();

      if (!updated) {
        const [latestAct] = await tx.select().from(memberActivitiesTable).where(eq(memberActivitiesTable.id, activityId)).limit(1);
        res.status(409).json({
          error: "Conflit de modification (OCC)",
          message: `Mise à jour concurrente de l'activité détectée.`,
          serverVersion: latestAct?.version ?? currentVersion,
        });
        return null;
      }

      const formatted = await formatMemberActivity(updated, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: activityId,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (result) {
      await updateMemberStatusIfNeeded(memberId);
      res.json(result);
    }
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (PUT activity):", {
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

// DELETE /api/members/:id/activities/:activityId
router.delete("/members/:id/activities/:activityId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);
  if (isNaN(memberId) || isNaN(activityId)) {
    res.status(400).json({ error: "ID membre ou activité invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "delete_activity", req.body, res)) {
    return;
  }

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const activity = await getActivityWithMemberCheck(activityId, memberId, res);
  if (!activity) return;

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "delete_activity",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [deleted] = await tx
        .delete(memberActivitiesTable)
        .where(and(eq(memberActivitiesTable.id, activityId), eq(memberActivitiesTable.memberId, memberId)))
        .returning();

      await tx.delete(activityLineItemsTable).where(eq(activityLineItemsTable.activityId, activityId));

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: activityId,
            resultPayload: null,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return true;
    });

    await updateMemberStatusIfNeeded(memberId);
    res.sendStatus(204);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec de la suppression de l'activité" });
  }
});

function validateActivityLineItem(activityType: string, payload: any) {
  const errors: Array<{ field: string; code: string }> = [];

  const isNum = (val: any) => typeof val === "number" && !isNaN(val) && Number.isFinite(val);
  const isStr = (val: any) => typeof val === "string" && val.trim().length > 0;

  const isAssociatedCrop = activityType === "agriculteur" && (payload.cultureType === "Associée" || payload.isPrincipalCrop === false);
  if (!isAssociatedCrop) {
    if (!isNum(payload.superficieHa)) {
      errors.push({ field: "superficieHa", code: "required" });
    } else if (payload.superficieHa < 0) {
      errors.push({ field: "superficieHa", code: "negative" });
    }
  }

  if (activityType === "eleveur" || activityType === "forestier") {
    if (!Array.isArray(payload.products) || payload.products.length === 0 || payload.products.length > 20) {
      errors.push({ field: "products", code: "min_one_product_required" });
    } else {
      payload.products.forEach((p: any, idx: number) => {
        if (!isStr(p.name) || p.name.length > 100) {
          errors.push({ field: `products.${idx}.name`, code: "required_and_max_100" });
        }
        if (!isNum(p.quantity) || p.quantity < 0) {
          errors.push({ field: `products.${idx}.quantity`, code: "invalid_quantity" });
        }
        if (!isStr(p.unit)) {
          errors.push({ field: `products.${idx}.unit`, code: "required_unit" });
        }
        if (!isNum(p.fcfa) || p.fcfa < 0) {
          errors.push({ field: `products.${idx}.fcfa`, code: "invalid_fcfa" });
        }
      });
    }
  } else {
    if (!isNum(payload.productionQuantity) || payload.productionQuantity < 0) {
      errors.push({ field: "productionQuantity", code: "invalid_quantity" });
    }
    if (!isStr(payload.productionUnit)) {
      errors.push({ field: "productionUnit", code: "required_unit" });
    }
    if (!isNum(payload.productionFcfa) || payload.productionFcfa < 0) {
      errors.push({ field: "productionFcfa", code: "invalid_fcfa" });
    }
  }

  return errors;
}

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
    payload.products = body.products;
  }

  return payload;
}

// POST /api/members/:id/activities/:activityId/line-items
router.post("/members/:id/activities/:activityId/line-items", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);
  if (isNaN(memberId) || isNaN(activityId)) {
    res.status(400).json({ error: "ID membre ou activité invalide" });
    return;
  }
  const appUser = (req as any).appUser;

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const activity = await getActivityWithMemberCheck(activityId, memberId, res);
  if (!activity) return;

  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "create_line_item", req.body, res)) {
    return;
  }

  const normalized = normalizeLineItemPayload(req.body);

  const validationErrors = validateActivityLineItem(activity.activityType, normalized);
  if (validationErrors.length > 0) {
    res.status(400).json({
      error: "Certains champs obligatoires de la ligne d'activité sont manquants ou invalides.",
      fields: validationErrors,
    });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "create_line_item",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [item] = await tx
        .insert(activityLineItemsTable)
        .values({
          activityId,
          version: 1,
          ...normalized
        })
        .returning();

      const formatted = {
        ...item,
        version: item.version ?? 1,
        createdAt: item.createdAt.toISOString(),
      };

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: item.id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    await updateMemberStatusIfNeeded(memberId);

    res.status(201).json(result);
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (POST line-item):", {
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

// PUT /api/members/:id/activities/:activityId/line-items/:itemId
router.put("/members/:id/activities/:activityId/line-items/:itemId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItem, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);
  if (isNaN(memberId) || isNaN(activityId) || isNaN(itemId)) {
    res.status(400).json({ error: "ID membre, activité ou ligne invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "update_line_item", req.body, res)) {
    return;
  }

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const activity = await getActivityWithMemberCheck(activityId, memberId, res);
  if (!activity) return;

  const existingItem = await getLineItemWithActivityCheck(itemId, activityId, res);
  if (!existingItem) return;

  const currentVersion = existingItem.version ?? 1;
  const clientVersion = req.body.version !== undefined && req.body.version !== null ? Number(req.body.version) : null;

  if (clientVersion !== null && clientVersion !== currentVersion) {
    res.status(409).json({
      error: "Conflit de modification (OCC)",
      message: `La version de la ligne d'activité fournie (${clientVersion}) ne correspond pas à la version actuelle du serveur (${currentVersion}).`,
      serverVersion: currentVersion,
    });
    return;
  }

  const normalized = normalizeLineItemPayload(req.body);

  const validationErrors = validateActivityLineItem(activity.activityType, {
    ...existingItem,
    ...normalized,
  });

  if (validationErrors.length > 0) {
    res.status(400).json({
      error: "Certains champs obligatoires de la ligne d'activité sont manquants ou invalides.",
      fields: validationErrors,
    });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "update_line_item",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(activityLineItemsTable)
        .set({
          ...normalized,
          version: currentVersion + 1,
        })
        .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.version, currentVersion)))
        .returning();

      if (!updated) {
        const [latestItem] = await tx.select().from(activityLineItemsTable).where(eq(activityLineItemsTable.id, itemId)).limit(1);
        res.status(409).json({
          error: "Conflit de modification (OCC)",
          message: "Mise à jour concurrente de la ligne d'activité détectée.",
          serverVersion: latestItem?.version ?? currentVersion,
        });
        return null;
      }

      const formatted = {
        ...updated,
        version: updated.version ?? currentVersion + 1,
        createdAt: updated.createdAt.toISOString(),
      };

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: itemId,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (result) {
      await updateMemberStatusIfNeeded(memberId);
      res.json(result);
    }
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    console.error("🚨 POSTGRES EXECUTION ERROR (PUT line-item):", {
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

// DELETE /api/members/:id/activities/:activityId/line-items/:itemId
router.delete("/members/:id/activities/:activityId/line-items/:itemId", requireAppUser, async (req, res): Promise<void> => {
  const rawAct = Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId;
  const activityId = parseInt(rawAct, 10);
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItem, 10);
  const rawMem = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memberId = parseInt(rawMem, 10);
  if (isNaN(memberId) || isNaN(activityId) || isNaN(itemId)) {
    res.status(400).json({ error: "ID membre, activité ou ligne invalide" });
    return;
  }
  const appUser = (req as any).appUser;
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "delete_line_item", req.body, res)) {
    return;
  }

  const targetMember = await getMemberWithAccessCheck(appUser, memberId, res);
  if (!targetMember) return;

  const activity = await getActivityWithMemberCheck(activityId, memberId, res);
  if (!activity) return;

  const existingItem = await getLineItemWithActivityCheck(itemId, activityId, res);
  if (!existingItem) return;

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "delete_line_item",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [deleted] = await tx
        .delete(activityLineItemsTable)
        .where(and(eq(activityLineItemsTable.id, itemId), eq(activityLineItemsTable.activityId, activityId)))
        .returning();

      if (!deleted) {
        return null;
      }

      const payload = { success: true, deletedId: itemId };

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: itemId,
            resultPayload: payload,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return payload;
    });

    await updateMemberStatusIfNeeded(memberId);

    res.sendStatus(204);
  } catch (error: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

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

// Admin Status Actions

router.post("/members/:id/validate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "validate_member", req.body, res)) {
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "validate_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(membersTable)
        .set({ status: "valide" })
        .where(eq(membersTable.id, id))
        .returning();

      if (!updated) return null;

      const formatted = await formatMember(updated, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (!result) {
      res.status(404).json({ error: "Membre introuvable" });
      return;
    }

    res.json(result);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec de la validation du membre" });
  }
});

router.post("/members/:id/deactivate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "deactivate_member", req.body, res)) {
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "deactivate_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(membersTable)
        .set({ status: "desactive" })
        .where(eq(membersTable.id, id))
        .returning();

      if (!updated) return null;

      const formatted = await formatMember(updated, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (!result) {
      res.status(404).json({ error: "Membre introuvable" });
      return;
    }

    res.json(result);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec de la désactivation du membre" });
  }
});

router.post("/members/:id/reactivate", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "reactivate_member", req.body, res)) {
    return;
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (member && member.status === "bloque") {
    res.status(400).json({ error: "Impossible de réactiver un membre bloqué de manière définitive" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "reactivate_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(membersTable)
        .set({ status: "valide" })
        .where(eq(membersTable.id, id))
        .returning();

      if (!updated) return null;

      const formatted = await formatMember(updated, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (!result) {
      res.status(404).json({ error: "Membre introuvable" });
      return;
    }

    res.json(result);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec de la réactivation du membre" });
  }
});

router.post("/members/:id/block", requireAppUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  if (appUser.role !== "admin") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const clientOperationId = getClientOperationId(req);

  if (await checkProcessedOperation(clientOperationId, appUser.id, "block_member", req.body, res)) {
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (clientOperationId) {
        await tx.insert(processedOperationsTable).values({
          userId: appUser.id,
          clientOperationId,
          operationType: "block_member",
          payloadHash: computePayloadHash(req.body),
        });
      }

      const [updated] = await tx
        .update(membersTable)
        .set({ status: "bloque" })
        .where(eq(membersTable.id, id))
        .returning();

      if (!updated) return null;

      const formatted = await formatMember(updated, true, tx);

      if (clientOperationId) {
        await tx
          .update(processedOperationsTable)
          .set({
            resourceId: id,
            resultPayload: formatted,
          })
          .where(
            and(
              eq(processedOperationsTable.userId, appUser.id),
              eq(processedOperationsTable.clientOperationId, clientOperationId)
            )
          );
      }

      return formatted;
    });

    if (!result) {
      res.status(404).json({ error: "Membre introuvable" });
      return;
    }

    res.json(result);
  } catch (err: any) {
    if (await handleConcurrentOperationRace(clientOperationId, appUser.id, res)) {
      return;
    }

    res.status(400).json({ error: "Échec du blocage du membre" });
  }
});

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// POST /api/members/:id/badge
router.post("/members/:id/badge", requireAppUser, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID membre invalide" });
    return;
  }
  const appUser = (req as any).appUser;

  const member = await getMemberWithAccessCheck(appUser, id, res);
  if (!member) return;

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

  <g id="recto">
    <rect x="0" y="0" width="1012" height="638" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
    <clipPath id="recto-clip">
      <rect x="0" y="0" width="1012" height="638" rx="28"/>
    </clipPath>
    <g clip-path="url(#recto-clip)">
      <linearGradient id="recto-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f0fdf4" stop-opacity="1" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="100%" stop-color="#ecfdf5" stop-opacity="1" />
      </linearGradient>
      <rect x="0" y="0" width="1012" height="638" fill="url(#recto-bg-grad)" />

      <image href="${logoDataUrl}" x="350" y="150" width="350" height="350" opacity="0.04" />

      <rect x="0" y="145" width="1012" height="15" fill="#005A36"/>
      <rect x="0" y="160" width="1012" height="15" fill="#E11D48"/>

      <text x="228" y="45" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="900" fill="#005A36" text-anchor="middle">REPUBLIQUE DU CAMEROUN</text>
      <text x="228" y="60" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">Paix-Travail-Patrie</text>
      <text x="228" y="73" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>
      <text x="228" y="87" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">CHAMBRE D’AGRICULTURE, DES PECHES, DE L’ELEVAGE</text>
      <text x="228" y="100" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">ET DES FORETS DU CAMEROUN</text>
      <text x="228" y="113" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>

      <image href="${logoDataUrl}" x="456" y="30" width="100" height="100" />

      <text x="784" y="45" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="900" fill="#E11D48" text-anchor="middle">REPUBLIC OF CAMEROON</text>
      <text x="784" y="60" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">Peace-Work-Fatherland</text>
      <text x="784" y="73" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>
      <text x="784" y="87" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">CHAMBER OF AGRICULTURE, FISHERIES, LIVESTOCK</text>
      <text x="784" y="100" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" opacity="0.8" text-anchor="middle">AND FORESTS OF CAMEROON</text>
      <text x="784" y="113" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#3c4043" text-anchor="middle">*************</text>

      <rect x="50" y="195" width="912" height="40" rx="6" fill="#005A36" />
      <text x="506" y="222" font-family="'Helvetica Neue', Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">CARTE D'ENRÔLEMENT CONSULAIRE / CONSULAR REGISTRATION CARD</text>

      <defs>
        <clipPath id="photo-clip">
          <rect x="50" y="250" width="220" height="260" rx="16"/>
        </clipPath>
      </defs>
      <rect x="48" y="248" width="224" height="264" rx="18" fill="none" stroke="#005A36" stroke-width="3" stroke-opacity="0.3"/>
      ${avatarSvgHD}

      <rect x="50" y="525" width="220" height="42" rx="10" fill="${theme.bg}" stroke="${theme.primary}" stroke-width="1.5" />
      <text x="160" y="551" class="category-badge" fill="${theme.text}" text-anchor="middle" letter-spacing="1">${escapeXml(theme.label)}</text>

      <text x="310" y="270" class="label">Nom complet / Full Name</text>
      <text x="310" y="300" font-family="'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="900" fill="#111827">${escapeXml(name.toUpperCase())}</text>

      <text x="310" y="325" class="label">Téléphone / Contacts</text>
      <text x="310" y="350" font-family="'Helvetica Neue', Arial, sans-serif" font-size="20" font-weight="900" fill="#005A36">${escapeXml(phone)}</text>

      <rect x="310" y="365" width="440" height="48" rx="8" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1" />
      <text x="325" y="395" class="label" font-size="12">N° MEMBRE / ID:</text>
      <text x="460" y="397" class="num-member">${escapeXml(member.memberNumber)}</text>

      <g transform="translate(310, 420)">
        <text x="0" y="15" class="label">Région / Region</text>
        <text x="0" y="40" class="value">${escapeXml(region?.name ?? "-")}</text>

        <text x="230" y="15" class="label">Département / Division</text>
        <text x="230" y="40" class="value">${escapeXml(dept?.name ?? "-")}</text>
      </g>

      <g transform="translate(310, 475)">
        <text x="0" y="15" class="label">Arrondissement / Subdivision</text>
        <text x="0" y="40" class="value">${escapeXml(arr?.name ?? "-")}</text>
      </g>

      <g transform="translate(310, 535)">
        <rect x="0" y="0" width="440" height="42" rx="8" fill="#fffbeb" stroke="#fef3c7" stroke-width="1.5" />
        <text x="220" y="26" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="bold" fill="#b45309" text-anchor="middle">DATE D'ENRÔLEMENT: ${dateEnrolementStr}</text>
      </g>

      <rect x="790" y="250" width="170" height="170" rx="14" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
      <image href="${qrDataUrl}" x="795" y="255" width="160" height="160" />
      <text x="875" y="440" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="800" fill="#005A36" text-anchor="middle">VERIFICATION SCAN</text>

      <g transform="translate(790, 465)">
        <rect x="0" y="0" width="170" height="102" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
        <text x="85" y="25" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="bold" fill="#70757a" text-anchor="middle">SCEAU ET SIGNATURE</text>
        <path d="M 35 65 Q 65 45 95 65 T 145 55 M 55 50 Q 85 75 115 50" fill="none" stroke="#1d4ed8" stroke-width="2" opacity="0.7" />
        <text x="85" y="90" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="bold" fill="#005A36" text-anchor="middle">Secrétariat Général CAPEF</text>
      </g>
    </g>
  </g>

  <g id="verso" transform="translate(0, 638)">
    <rect x="0" y="0" width="1012" height="638" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
    <clipPath id="verso-clip">
      <rect x="0" y="0" width="1012" height="638" rx="28"/>
    </clipPath>
    <g clip-path="url(#verso-clip)">
      <linearGradient id="verso-bg-grad" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#f9fafb" stop-opacity="1" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="100%" stop-color="#f3f4f6" stop-opacity="1" />
      </linearGradient>
      <rect x="0" y="0" width="1012" height="638" fill="url(#verso-bg-grad)" />

      <image href="${logoDataUrl}" x="306" y="119" width="400" height="400" opacity="0.08" />

      <rect x="0" y="0" width="1012" height="15" fill="#fecd0b"/>
      <rect x="337" y="0" width="338" height="15" fill="#ce1126"/>
      <rect x="675" y="0" width="337" height="15" fill="#005A36"/>
      <polygon points="506,1.5 509,8 516,8 510,12 512,18 506,14 500,18 502,12 496,8 503,8" fill="#fecd0b" />

      <g transform="translate(60, 45)">
        <text x="446" y="40" font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="900" fill="#005A36" text-anchor="middle" letter-spacing="1">CONDITIONS D'UTILISATION / TERMS OF USE</text>
        <line x1="246" y1="55" x2="646" y2="55" stroke="#005A36" stroke-width="2" opacity="0.3"/>

        <g transform="translate(0, 90)">
          <text x="0" y="0" class="disclaimer-title" fill="#005A36">Réglementation Consulaire :</text>
          <text x="0" y="28" class="disclaimer-text">1. Cette carte d'enrôlement est strictly personnelle, incessible et demeure la propriété exclusive de la CAPEF.</text>
          <text x="0" y="53" class="disclaimer-text">2. Elle atteste de l'inscription officielle du titulaire au registre consulaire professionnel de la Chambre au Cameroun.</text>
          <text x="0" y="78" class="disclaimer-text">3. Le titulaire s'engage à respecter scrupuleusement les statuts, règlements et chartes professionnelles en vigueur.</text>
          <text x="0" y="103" class="disclaimer-text">4. En cas de perte, de vol ou de détérioration, le titulaire doit obligatoirement en informer la délégation régionale de sa zone.</text>
          <text x="0" y="128" class="disclaimer-text">5. Les autorités publiques sont priées de prêter assistance et de faciliter l'accès du titulaire aux services de développement.</text>
        </g>

        <g transform="translate(0, 275)">
          <text x="0" y="0" class="disclaimer-title" fill="#ce1126">Consular Regulation :</text>
          <text x="0" y="28" class="disclaimer-text">1. This registration card is strictly personal, non-transferable and remains the exclusive property of CAPEF.</text>
          <text x="0" y="53" class="disclaimer-text">2. It certifies the holder's official registration in the professional consular registry of the Chamber in Cameroon.</text>
          <text x="0" y="78" class="disclaimer-text">3. The holder agrees to fully comply with all professional bylaws, internal regulations, and ethical standards.</text>
          <text x="0" y="103" class="disclaimer-text">4. In case of loss, theft or damage, the holder must immediately notify the local regional delegation office.</text>
          <text x="0" y="128" class="disclaimer-text">5. Public authorities are kindly requested to assist and facilitate the holder's access to professional assistance.</text>
        </g>
      </g>

      <line x1="60" y1="520" x2="952" y2="520" stroke="#e5e7eb" stroke-width="1.5" />

      <text x="140" y="555" class="signature-title" text-anchor="middle">SIGNATURE DU TITULAIRE / HOLDER'S SIGNATURE</text>
      <rect x="40" y="565" width="200" height="60" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3,3" />
      ${signatureImageSvg}

      <text x="506" y="575" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="900" fill="#005A36" text-anchor="middle" letter-spacing="1">CHAMBRE D'AGRICULTURE, DES PECHES, DE L'ELEVAGE ET DES FORETS</text>
      <text x="506" y="595" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="bold" fill="#70757a" text-anchor="middle">BP 287 Yaoundé, Cameroun — Email: contact@capef.cm</text>

      <text x="892" y="555" class="signature-title" text-anchor="end">SIGNATURE DU PRESIDENT / PRESIDENT'S SIGNATURE</text>
      <path d="M 820 575 Q 840 565 860 580 T 900 570" fill="none" stroke="#ce1126" stroke-width="2.5" opacity="0.6"/>
      <circle cx="860" cy="580" r="22" fill="none" stroke="#ce1126" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.5" />
    </g>
  </g>
</svg>`;

  const badgeFileName = `badge_m${id}_${Date.now()}.svg`;
  let badgePath = `member-documents/${badgeFileName}`;

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.storage.from("member-documents").upload(badgeFileName, Buffer.from(badgeSvg, "utf-8"), {
        contentType: "image/svg+xml",
        upsert: true,
      });
      badgePath = badgeFileName;
    }
  } catch (err) {
    console.error("Failed to upload badge SVG to Supabase Storage:", err);
  }

  await db.update(membersTable).set({ badgeUrl: badgePath }).where(eq(membersTable.id, id));

  const resolvedBadgeUrl = await resolveSignedMediaUrl(badgePath);

  res.json({ badgeUrl: resolvedBadgeUrl, memberNumber: member.memberNumber });
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
          version: 1,
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

      await db.insert(memberActivitiesTable).values({
        memberId: member.id,
        activityType: m.category,
        version: 1,
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

const ipRequestLogs = new Map<string, number[]>();

const publicRateLimiter = (req: any, res: any, next: any) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;

  let timestamps = ipRequestLogs.get(ip) || [];
  timestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (timestamps.length >= maxRequests) {
    res.status(429).json({ error: "Trop de requêtes. Veuillez réessayer dans une minute." });
    return;
  }

  timestamps.push(now);
  ipRequestLogs.set(ip, timestamps);
  next();
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

  res.json(await formatMember(member, true));
});

export default router;
