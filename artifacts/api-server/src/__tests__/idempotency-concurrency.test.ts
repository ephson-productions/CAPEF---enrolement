import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import {
  db,
  usersTable,
  membersTable,
  memberActivitiesTable,
  activityLineItemsTable,
  processedOperationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

describe("Phase P4 Idempotency & Atomic OCC Concurrency Integration Tests", () => {
  let agent1: any;
  let agent2: any;
  let member1: any;
  let activity1: any;

  beforeEach(async () => {
    await db.delete(processedOperationsTable);
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [agent1] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_p4_1",
        email: "agent1.p4@capef.cm",
        name: "Agent 1 P4",
        role: "agent",
        regionId: 1,
      })
      .returning();

    [agent2] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_p4_2",
        email: "agent2.p4@capef.cm",
        name: "Agent 2 P4",
        role: "agent",
        regionId: 1,
      })
      .returning();

    [member1] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-000100",
        memberType: "physique",
        category: "agriculteur",
        version: 1,
        createdById: agent1.id,
      })
      .returning();

    [activity1] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId: member1.id,
        activityType: "agriculteur",
        version: 1,
        isPrimary: true,
      })
      .returning();
  });

  it("Test 1: Replaying identical request with X-Client-Operation-ID returns cached response with 0 duplicate DB records", async () => {
    const clientOpId = "11111111-1111-4111-a111-111111111111";
    const payload = {
      memberType: "physique",
      category: "agriculteur",
      physiqueData: { nom: "Djiomeko", prenom: "Paul" },
    };

    // First request
    const res1 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOpId)
      .send(payload);

    expect(res1.status).toBe(201);
    const createdMemberId = res1.body.id;

    // Second identical replayed request
    const res2 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOpId)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(createdMemberId);

    // Confirm total created members by agent1 is exactly 2 (member1 + 1 new member)
    const [countRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(eq(membersTable.createdById, agent1.id));

    expect(countRes.count).toBe(2);
  });

  it("Test 2: Reusing clientOperationId with DIFFERENT payload returns 422 Unprocessable Entity", async () => {
    const clientOpId = "22222222-2222-4222-a222-222222222222";

    // Initial request
    const res1 = await request(app)
      .post(`/api/members/${member1.id}/activities`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOpId)
      .send({ activityType: "pecheur" });

    expect(res1.status).toBe(201);

    // Second request with SAME clientOpId BUT DIFFERENT payload
    const res2 = await request(app)
      .post(`/api/members/${member1.id}/activities`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOpId)
      .send({ activityType: "artisan" }); // Different payload!

    expect(res2.status).toBe(422);
    expect(res2.body.code).toBe("REUSED_OPERATION_ID");
  });

  it("Test 3: Multi-agent isolation - Agent 1 and Agent 2 using same clientOperationId do not collide", async () => {
    const sharedClientOpId = "33333333-3333-4333-a333-333333333333";

    // Agent 1 creates member
    const res1 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .set("X-Client-Operation-ID", sharedClientOpId)
      .send({ memberType: "physique", category: "agriculteur", physiqueData: { nom: "Agent1 Member", prenom: "Pierre" } });

    expect(res1.status).toBe(201);

    // Agent 2 sends creation with SAME clientOperationId
    const res2 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent2.clerkUserId}`)
      .set("X-Client-Operation-ID", sharedClientOpId)
      .send({ memberType: "physique", category: "agriculteur", physiqueData: { nom: "Agent2 Member", prenom: "Jean" } });

    expect(res2.status).toBe(201);
    expect(res2.body.id).not.toBe(res1.body.id);
  });

  it("Test 4: Concurrent parallel requests with same clientOperationId produce 1 creation", async () => {
    const clientOpId = "44444444-4444-4444-a444-444444444444";
    const payload = {
      memberType: "physique",
      category: "eleveur",
      physiqueData: { nom: "Coopérative", prenom: "Parallèle" },
    };

    // Execute 2 concurrent requests simultaneously
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/members")
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .set("X-Client-Operation-ID", clientOpId)
        .send(payload),
      request(app)
        .post("/api/members")
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .set("X-Client-Operation-ID", clientOpId)
        .send(payload),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect([200, 201].includes(statuses[0]) || [201, 204].includes(statuses[0])).toBe(true);
    expect([200, 201].includes(statuses[1]) || [201, 204].includes(statuses[1])).toBe(true);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(eq(membersTable.createdById, agent1.id));

    expect(countRes.count).toBe(2); // member1 + 1 new concurrent member
  });

  it("Test 5: Concurrent member updates with same version produce 1 success + 1 HTTP 409 Conflict", async () => {
    // Current server version is 1
    const updatePayload1 = { version: 1, village: "Village A" };
    const updatePayload2 = { version: 1, village: "Village B" };

    const res1 = await request(app)
      .put(`/api/members/${member1.id}`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .send(updatePayload1);

    expect(res1.status).toBe(200);
    expect(res1.body.version).toBe(2);

    // Second update with stale expected version 1
    const res2 = await request(app)
      .put(`/api/members/${member1.id}`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .send(updatePayload2);

    expect(res2.status).toBe(409);
    expect(res2.body.serverVersion).toBe(2);
    expect(res2.body.currentMember).toBeDefined();
  });

  it("Test 6: Activity update OCC conflict detection", async () => {
    // Activity version is 1
    const res1 = await request(app)
      .put(`/api/members/${member1.id}/activities/${activity1.id}`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .send({ version: 1, activityType: "agriculteur", village: "Updated Village" });

    expect(res1.status).toBe(200);
    expect(res1.body.version).toBe(2);

    // Concurrent activity update with version 1
    const res2 = await request(app)
      .put(`/api/members/${member1.id}/activities/${activity1.id}`)
      .set("Authorization", `Bearer ${agent1.clerkUserId}`)
      .send({ version: 1, activityType: "agriculteur", village: "Conflicting Village" });

    expect(res2.status).toBe(409);
    expect(res2.body.serverVersion).toBe(2);
  });
});
