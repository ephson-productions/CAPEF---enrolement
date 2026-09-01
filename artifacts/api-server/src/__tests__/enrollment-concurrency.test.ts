import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable, membersTable, memberActivitiesTable, activityLineItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Data Integrity & Concurrency Gate (enrollment-concurrency.test.ts)", () => {
  let agent: any;

  beforeEach(async () => {
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [agent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_conc",
        email: "agent_conc@capef.cm",
        name: "Agent Concurrency",
        role: "agent",
      })
      .returning();
  });

  it("10 concurrent POST /api/members creation requests succeed with unique sequential member numbers and zero PENDING rows", async () => {
    const payload = {
      memberType: "physique",
      category: "agriculteur",
      physiqueData: { nom: "Ndongo", prenom: "Paul" },
    };

    const requests = Array.from({ length: 10 }).map(() =>
      request(app)
        .post("/api/members")
        .set("Authorization", `Bearer ${agent.clerkUserId}`)
        .send(payload)
    );

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.memberNumber).toMatch(/^CAPEF-AGR-\d{6}$/);
      expect(res.body.memberNumber).not.toBe("PENDING");
    }

    const memberNumbers = responses.map((r) => r.body.memberNumber);
    const uniqueNumbers = new Set(memberNumbers);
    expect(uniqueNumbers.size).toBe(10);

    const membersInDb = await db.select().from(membersTable);
    expect(membersInDb.length).toBe(10);

    const pendingMembers = membersInDb.filter((m) => m.memberNumber === "PENDING");
    expect(pendingMembers.length).toBe(0);

    const primaryActivities = await db
      .select()
      .from(memberActivitiesTable)
      .where(eq(memberActivitiesTable.isPrimary, true));

    expect(primaryActivities.length).toBe(10);
  });
});
