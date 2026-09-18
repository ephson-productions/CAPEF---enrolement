import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable, membersTable, processedOperationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Phase 9 — Optimistic Concurrency Control (OCC) Gate (occ-conflict.test.ts)", () => {
  let agent: any;
  let createdMemberId: number;

  beforeEach(async () => {
    await db.delete(processedOperationsTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [agent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_occ",
        email: "agent_occ@capef.cm",
        name: "Agent OCC Test",
        role: "agent",
      })
      .returning();

    // Create a base member (starts at version 1)
    const createRes = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .send({
        memberType: "physique",
        category: "agriculteur",
        physiqueData: {
          nom: "FOKOU",
          prenom: "Initial Name",
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.version).toBe(1);
    createdMemberId = createRes.body.id;
  });

  it("handles concurrent updates with OCC version check: 1st update succeeds (v1 -> v2), 2nd update fails with HTTP 409 Conflict", async () => {
    // 1st concurrent update sending expected version 1
    const update1Res = await request(app)
      .put(`/api/members/${createdMemberId}`)
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .send({
        version: 1,
        village: "Village Updated First",
        physiqueData: {
          nom: "FOKOU",
          prenom: "Update 1 First Agent",
        },
      });

    expect(update1Res.status).toBe(200);
    expect(update1Res.body.version).toBe(2);
    expect(update1Res.body.village).toBe("Village Updated First");

    // 2nd concurrent update sending STALE expected version 1 (which was already bumped to 2 by Agent 1)
    const update2Res = await request(app)
      .put(`/api/members/${createdMemberId}`)
      .set("Authorization", `Bearer ${agent.clerkUserId}`)
      .send({
        version: 1, // Stale version 1!
        village: "Village Stale Overwrite Attempt",
        physiqueData: {
          nom: "FOKOU",
          prenom: "Stale Overwrite Agent 2",
        },
      });

    // Must return HTTP 409 Conflict with current server state
    expect(update2Res.status).toBe(409);
    expect(update2Res.body.error).toContain("Conflit");
    expect(update2Res.body.serverVersion).toBe(2);
    expect(update2Res.body.currentMember.village).toBe("Village Updated First");

    // Verify database state remains uncorrupted with version = 2 and Agent 1's values intact
    const [dbMember] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, createdMemberId))
      .limit(1);

    expect(dbMember.version).toBe(2);
    expect(dbMember.village).toBe("Village Updated First");
    expect((dbMember.physiqueData as any).prenom).toBe("Update 1 First Agent");
  });
});
