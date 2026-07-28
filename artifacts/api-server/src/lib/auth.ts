import { getAuth } from "@clerk/express";
import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Non autorisé" });
    return;
  }
  (req as any).clerkUserId = clerkUserId;
  next();
};

export const requireAppUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Non autorisé" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Utilisateur non enregistré dans l'application" });
    return;
  }

  (req as any).appUser = user;
  next();
};

export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const appUser = (req as any).appUser;
    if (!appUser || !roles.includes(appUser.role)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    next();
  };
};
