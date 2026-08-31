import { describe, it, expect, beforeEach } from "vitest";
import { db, usersTable, membersTable, memberActivitiesTable, activityLineItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Database Relational Integrity Gate (relational-integrity.test.ts)", () => {
  beforeEach(async () => {
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);
  });

  it("Attempting to delete a user with assigned members fails with ON DELETE RESTRICT error", async () => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_restrict",
        email: "user_restrict@capef.cm",
        name: "User Restrict",
        role: "agent",
      })
      .returning();

    await db.insert(membersTable).values({
      memberNumber: "CAPEF-AGR-000555",
      memberType: "physique",
      category: "agriculteur",
      createdById: user.id,
    });

    await expect(db.delete(usersTable).where(eq(usersTable.id, user.id))).rejects.toThrow();
  });

  it("Deleting a member automatically ON DELETE CASCADE deletes associated activities and line items", async () => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_cascade",
        email: "user_cascade@capef.cm",
        name: "User Cascade",
        role: "agent",
      })
      .returning();

    const [member] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-000777",
        memberType: "physique",
        category: "agriculteur",
        createdById: user.id,
      })
      .returning();

    const [activity] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId: member.id,
        activityType: "agriculteur",
        isPrimary: true,
      })
      .returning();

    await db.insert(activityLineItemsTable).values({
      activityId: activity.id,
      cropName: "Cacao",
      superficieHa: 5,
    });

    const activitiesBefore = await db.select().from(memberActivitiesTable).where(eq(memberActivitiesTable.memberId, member.id));
    expect(activitiesBefore.length).toBe(1);

    const itemsBefore = await db.select().from(activityLineItemsTable).where(eq(activityLineItemsTable.activityId, activity.id));
    expect(itemsBefore.length).toBe(1);

    await db.delete(membersTable).where(eq(membersTable.id, member.id));

    const activitiesAfter = await db.select().from(memberActivitiesTable).where(eq(memberActivitiesTable.memberId, member.id));
    expect(activitiesAfter.length).toBe(0);

    const itemsAfter = await db.select().from(activityLineItemsTable).where(eq(activityLineItemsTable.activityId, activity.id));
    expect(itemsAfter.length).toBe(0);
  });
});
