import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable, membersTable, memberActivitiesTable, activityLineItemsTable, processedOperationsTable } from "@workspace/db";
import crypto from "crypto";

describe("Offline Sync & Idempotency Gate (offline.test.ts)", () => {
  let agent: any;

  beforeEach(async () => {
    await db.delete(processedOperationsTable);
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [agent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_offline",
        email: "agent_offline@capef.cm",
        name: "Agent Offline",
        role: "agent",
      })
      .returning();
  });

  it("Replaying identical clientOperationId returns cached HTTP 200 result with 0 duplicate DB records", async () => {
    const clientOperationId = crypto.randomUUID();
    const payload = {
      memberType: "physique",
      category: "agriculteur",
      physiqueData: { nom: "Menga", prenom: "Jean" },
      clientOperationId,
    };

    const res1 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOperationId)
      .send(payload);

    expect(res1.status).toBe(201);
    const firstMemberId = res1.body.id;

    const res2 = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .set("X-Client-Operation-ID", clientOperationId)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(firstMemberId);

    const membersInDb = await db.select().from(membersTable);
    expect(membersInDb.length).toBe(1);

    const opsInDb = await db.select().from(processedOperationsTable);
    expect(opsInDb.length).toBe(1);
    expect(opsInDb[0].clientOperationId).toBe(clientOperationId);
  });

  it("HTTP 400 validation error on bad payload returns 400 without crashing or inserting invalid rows", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .send({});

    expect(res.status).toBe(400);

    const membersInDb = await db.select().from(membersTable);
    expect(membersInDb.length).toBe(0);
  });
});
