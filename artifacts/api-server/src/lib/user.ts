import { eq } from "drizzle-orm";
import { db, regionsTable, usersTable } from "@workspace/db";

export async function formatUser(user: typeof usersTable.$inferSelect) {
  let regionName: string | null = null;
  if (user.regionId) {
    const [region] = await db
      .select()
      .from(regionsTable)
      .where(eq(regionsTable.id, user.regionId))
      .limit(1);
    regionName = region?.name ?? null;
  }

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    regionId: user.regionId ?? null,
    regionName,
    cniNumber: user.cniNumber ?? null,
    cniPhotoUrl: user.cniPhotoUrl ?? null,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    assignedZones: (user.assignedZones as any[]) ?? [],
    createdAt: user.createdAt.toISOString(),
  };
}