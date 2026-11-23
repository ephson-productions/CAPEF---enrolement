import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, membersTable, regionsTable } from "@workspace/db";
import { resolveSignedMediaUrl } from "../lib/storage";

const router = Router();
const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function rateLimitPublicVerification(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recentRequests = (requestsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: "Trop de requêtes. Veuillez réessayer dans une minute." });
    return;
  }

  recentRequests.push(now);
  requestsByIp.set(ip, recentRequests);
  next();
}

router.get("/:badgeToken", rateLimitPublicVerification, async (req, res): Promise<void> => {
  const rawToken = req.params.badgeToken;
  const badgeToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!badgeToken) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.badgeToken, badgeToken))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [region] = member.regionId
    ? await db
        .select({ name: regionsTable.name })
        .from(regionsTable)
        .where(eq(regionsTable.id, member.regionId))
        .limit(1)
    : [null];

  const physique = (member.physiqueData as Record<string, unknown> | null) ?? {};
  const morale = (member.moraleData as Record<string, unknown> | null) ?? {};
  const displayName =
    member.memberType === "physique"
      ? `${typeof physique.nom === "string" ? physique.nom : ""} ${
          typeof physique.prenom === "string" ? physique.prenom : ""
        }`.trim() || member.memberNumber
      : (typeof morale.nom === "string" && morale.nom.trim()) || member.memberNumber;

  const storedPhoto =
    member.memberType === "physique" && typeof physique.photoUrl === "string"
      ? physique.photoUrl
      : null;
  const photoUrl = storedPhoto ? await resolveSignedMediaUrl(storedPhoto) : null;

  res.json({
    memberNumber: member.memberNumber,
    displayName,
    memberType: member.memberType,
    category: member.category,
    regionName: region?.name ?? null,
    isValid: member.status === "valide",
    photoUrl,
  });
});

export default router;
