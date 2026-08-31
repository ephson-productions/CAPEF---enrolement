import { db, membersTable, memberActivitiesTable, activityLineItemsTable } from "./index";
import { eq, sql, isNull } from "drizzle-orm";

async function runPreflightCheck() {
  console.log("🔍 Running Database Integrity Preflight Audit...");

  // 1. Query orphan member_activities referencing non-existent member IDs
  const orphanActivities = await db
    .select({
      activityId: memberActivitiesTable.id,
      memberId: memberActivitiesTable.memberId,
    })
    .from(memberActivitiesTable)
    .leftJoin(membersTable, eq(memberActivitiesTable.memberId, membersTable.id))
    .where(isNull(membersTable.id));

  // 2. Query orphan activity_line_items referencing non-existent activity IDs
  const orphanLineItems = await db
    .select({
      itemId: activityLineItemsTable.id,
      activityId: activityLineItemsTable.activityId,
    })
    .from(activityLineItemsTable)
    .leftJoin(memberActivitiesTable, eq(activityLineItemsTable.activityId, memberActivitiesTable.id))
    .where(isNull(memberActivitiesTable.id));

  // 3. Query members possessing multiple primary activities
  const multiplePrimary = await db
    .select({
      memberId: memberActivitiesTable.memberId,
      primaryCount: sql<number>`count(*)::int`,
    })
    .from(memberActivitiesTable)
    .where(eq(memberActivitiesTable.isPrimary, true))
    .groupBy(memberActivitiesTable.memberId)
    .having(sql`count(*) > 1`);

  // 4. Query invalid status/memberType/category values in members
  const validStatuses = ["incomplet", "en_attente", "valide", "desactive", "bloque"];
  const validMemberTypes = ["physique", "morale"];
  const validCategories = ["agriculteur", "pecheur", "eleveur", "forestier", "artisan"];

  const invalidMembers = await db
    .select({
      id: membersTable.id,
      status: membersTable.status,
      memberType: membersTable.memberType,
      category: membersTable.category,
    })
    .from(membersTable)
    .where(
      sql`${membersTable.status} NOT IN ${validStatuses} OR ${membersTable.memberType} NOT IN ${validMemberTypes} OR ${membersTable.category} NOT IN ${validCategories}`
    );

  console.log("\n📊 AUDIT RESULTS:");
  console.log(`- Orphan Member Activities: ${orphanActivities.length}`);
  console.log(`- Orphan Line Items: ${orphanLineItems.length}`);
  console.log(`- Members with >1 Primary Activity: ${multiplePrimary.length}`);
  console.log(`- Members with Invalid Enums: ${invalidMembers.length}`);

  let hasIssues = false;

  if (orphanActivities.length > 0) {
    hasIssues = true;
    console.error("❌ Action required: Clean up orphan activities before applying ON DELETE CASCADE/FK constraints.");
    console.error("   IDs:", orphanActivities.map((a) => a.activityId));
  }

  if (orphanLineItems.length > 0) {
    hasIssues = true;
    console.error("❌ Action required: Clean up orphan line items before applying ON DELETE CASCADE/FK constraints.");
    console.error("   IDs:", orphanLineItems.map((l) => l.itemId));
  }

  if (multiplePrimary.length > 0) {
    hasIssues = true;
    console.error("❌ Action required: Resolve multiple primary activities for members before creating partial unique index.");
    console.error("   Member IDs:", multiplePrimary.map((m) => m.memberId));
  }

  if (invalidMembers.length > 0) {
    hasIssues = true;
    console.error("❌ Action required: Fix invalid enum values in members table.");
    console.error("   Member IDs:", invalidMembers.map((m) => m.id));
  }

  if (!hasIssues) {
    console.log("\n✅ Preflight check passed! All data complies with business integrity constraints.");
  } else {
    process.exit(1);
  }
}

if (require.main === module) {
  runPreflightCheck().catch((err) => {
    console.error("Fatal preflight audit error:", err);
    process.exit(1);
  });
}

export { runPreflightCheck };
