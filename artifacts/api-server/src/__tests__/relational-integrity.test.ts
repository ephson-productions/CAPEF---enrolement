import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  usersTable,
  membersTable,
  memberActivitiesTable,
  activityLineItemsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Database Relational Integrity & Migration Verification Tests", () => {
  beforeEach(async () => {
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);
  });

  it("Enforces ON DELETE CASCADE for member activities and line items when member is deleted", async () => {
    const [user] = await db.insert(usersTable).values({
      clerkUserId: "test_rel_integrity_user",
      email: "rel.integrity@capef.cm",
      name: "Rel Integrity Agent",
      role: "agent",
    }).returning();

    const [member] = await db.insert(membersTable).values({
      memberNumber: "CAPEF-AGR-000999",
      memberType: "physique",
      category: "agriculteur",
      createdById: user.id,
    }).returning();

    const [activity] = await db.insert(memberActivitiesTable).values({
      memberId: member.id,
      activityType: "agriculteur",
      isPrimary: true,
    }).returning();

    const [lineItem] = await db.insert(activityLineItemsTable).values({
      activityId: activity.id,
      cropName: "Maïs",
      superficieHa: 2.5,
      productionQuantity: 500,
      productionUnit: "kg",
      productionFcfa: 250000,
    }).returning();

    const deletedMember = await db.delete(membersTable).where(eq(membersTable.id, member.id)).returning();
    expect(deletedMember.length).toBe(1);

    const remainingActivities = await db.select().from(memberActivitiesTable).where(eq(memberActivitiesTable.memberId, member.id));
    expect(remainingActivities.length).toBe(0);

    const remainingLineItems = await db.select().from(activityLineItemsTable).where(eq(activityLineItemsTable.id, lineItem.id));
    expect(remainingLineItems.length).toBe(0);
  });

  it("Enforces RESTRICT policy on usersTable when referenced by membersTable", async () => {
    const [user] = await db.insert(usersTable).values({
      clerkUserId: "test_restrict_user",
      email: "restrict@capef.cm",
      name: "Restrict Agent",
      role: "agent",
    }).returning();

    await db.insert(membersTable).values({
      memberNumber: "CAPEF-AGR-000888",
      memberType: "physique",
      category: "agriculteur",
      createdById: user.id,
    });

    await expect(db.delete(usersTable).where(eq(usersTable.id, user.id))).rejects.toThrow();
  });

  it("Verifies Migration 0004 against simulated production database with existing member_activities row id 30", async () => {
    const { newDb } = await import("pg-mem");
    const fs = await import("fs");

    const memDb = newDb();

    // 1. Create legacy schema WITHOUT version columns on member_activities and activity_line_items
    memDb.public.none(`
      CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
      CREATE TABLE members (
        id SERIAL PRIMARY KEY,
        member_number TEXT NOT NULL UNIQUE,
        member_type TEXT NOT NULL,
        category TEXT NOT NULL,
        version INT DEFAULT 1 NOT NULL,
        created_by_id INT NOT NULL REFERENCES users(id)
      );
      CREATE TABLE member_activities (
        id SERIAL PRIMARY KEY,
        member_id INT NOT NULL REFERENCES members(id),
        activity_type TEXT NOT NULL
      );
      CREATE TABLE activity_line_items (
        id SERIAL PRIMARY KEY,
        activity_id INT NOT NULL REFERENCES member_activities(id)
      );
      CREATE TABLE processed_operations (
        user_id INT NOT NULL REFERENCES users(id),
        client_operation_id UUID NOT NULL,
        operation_type TEXT NOT NULL,
        PRIMARY KEY (user_id, client_operation_id)
      );
    `);

    // 2. Insert mock production row with id 30
    memDb.public.none(`
      INSERT INTO users (id, name) VALUES (1, 'Test User');
      INSERT INTO members (id, member_number, member_type, category, version, created_by_id) VALUES (10, 'CAPEF-AGR-000001', 'physique', 'agriculteur', 1, 1);
      INSERT INTO member_activities (id, member_id, activity_type) VALUES (30, 10, 'agriculteur');
      INSERT INTO activity_line_items (id, activity_id) VALUES (50, 30);
    `);

    // 3. Apply Migration 0004 SQL statements
    const migrationSql = fs.readFileSync("../../lib/db/drizzle/0004_mighty_meltdown.sql", "utf8");
    memDb.public.none(migrationSql);

    // 4. Query row 30 to confirm version column exists
    const res = memDb.public.many(`
      SELECT id, member_id, activity_type, COALESCE(version, 1) as version FROM member_activities WHERE id = 30;
    `);

    expect(res).toBeDefined();
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(30);
    expect(res[0].version).toBe(1);
  });
});
