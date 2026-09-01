import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable, membersTable, memberActivitiesTable, activityLineItemsTable } from "@workspace/db";

describe("Security & Authorization Gate (authorization.test.ts)", () => {
  let agentA: any;
  let agentB: any;
  let memberB: any;
  let activityB: any;

  beforeEach(async () => {
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [agentA] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agentA",
        email: "agentA@capef.cm",
        name: "Agent A",
        role: "agent",
      })
      .returning();

    [agentB] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agentB",
        email: "agentB@capef.cm",
        name: "Agent B",
        role: "agent",
      })
      .returning();

    [memberB] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-000099",
        memberType: "physique",
        category: "agriculteur",
        createdById: agentB.id,
        badgeToken: "token_member_b_123",
      })
      .returning();

    [activityB] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId: memberB.id,
        activityType: "agriculteur",
        isPrimary: true,
      })
      .returning();
  });

  it("Anonymous -> protected member endpoint returns 401 Unauthorized", async () => {
    const res = await request(app).get("/api/members");
    expect(res.status).toBe(401);
  });

  it("Anonymous -> badge verification API returns 401 Unauthorized", async () => {
    const res = await request(app).get(`/api/members/badge/${memberB.badgeToken}`);
    expect(res.status).toBe(401);
  });

  it("Agent A -> Member B activity mutation returns 403 Forbidden", async () => {
    const res = await request(app)
      .post(`/api/members/${memberB.id}/activities`)
      .set("Authorization", `Bearer ${agentA.clerkUserId}`)
      .send({ activityType: "pecheur" });

    expect(res.status).toBe(403);
  });

  it("Agent A -> Member B line item mutation returns 403 Forbidden", async () => {
    const res = await request(app)
      .post(`/api/members/${memberB.id}/activities/${activityB.id}/line-items`)
      .set("Authorization", `Bearer ${agentA.clerkUserId}`)
      .send({ cropName: "Maïs", superficieHa: 2 });

    expect(res.status).toBe(403);
  });

  it("Agent A -> Member B badge verification returns 200 OK + full member profile", async () => {
    const res = await request(app)
      .get(`/api/members/badge/${memberB.badgeToken}`)
      .set("Authorization", `Bearer ${agentA.clerkUserId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(memberB.id);
    expect(res.body.memberNumber).toBe(memberB.memberNumber);
    expect(res.body.activities).toBeDefined();
  });
});
