import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import {
  db,
  usersTable,
  membersTable,
  memberActivitiesTable,
  activityLineItemsTable
} from "@workspace/db";

describe("Phase P3 Security & Multi-Role Authorization Tests", () => {
  let adminUser: any;
  let supervisorRegionA: any;
  let supervisorRegionB: any;
  let agent1: any;
  let agent2: any;

  let member1: any;
  let activity1: any;
  let lineItem1: any;

  let member2: any;
  let activity2: any;
  let lineItem2: any;

  beforeEach(async () => {
    await db.delete(activityLineItemsTable);
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [adminUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_admin_100",
        email: "admin@capef.cm",
        name: "Admin User",
        role: "admin",
      })
      .returning();

    [supervisorRegionA] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_supervisor_regA",
        email: "sup.regA@capef.cm",
        name: "Supervisor Region A",
        role: "supervisor",
        regionId: 1, // Region 1 pre-seeded
      })
      .returning();

    [supervisorRegionB] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_supervisor_regB",
        email: "sup.regB@capef.cm",
        name: "Supervisor Region B",
        role: "supervisor",
        regionId: 2, // Region 2 pre-seeded
      })
      .returning();

    [agent1] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_1",
        email: "agent1@capef.cm",
        name: "Agent 1",
        role: "agent",
        regionId: 1,
      })
      .returning();

    [agent2] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_2",
        email: "agent2@capef.cm",
        name: "Agent 2",
        role: "agent",
        regionId: 1,
      })
      .returning();

    // Member 1 created by Agent 1 in Region 1
    [member1] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-000001",
        memberType: "physique",
        category: "agriculteur",
        regionId: 1,
        createdById: agent1.id,
        badgeToken: "token_member_1",
      })
      .returning();

    [activity1] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId: member1.id,
        activityType: "agriculteur",
        isPrimary: true,
      })
      .returning();

    [lineItem1] = await db
      .insert(activityLineItemsTable)
      .values({
        activityId: activity1.id,
        cropName: "Maïs",
        superficieHa: 3,
        productionQuantity: 10,
        productionUnit: "Tonnes",
        productionFcfa: 500000,
      })
      .returning();

    // Member 2 created by Agent 2 in Region 1
    [member2] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-ELV-000002",
        memberType: "physique",
        category: "eleveur",
        regionId: 1,
        createdById: agent2.id,
        badgeToken: "token_member_2",
      })
      .returning();

    [activity2] = await db
      .insert(memberActivitiesTable)
      .values({
        memberId: member2.id,
        activityType: "eleveur",
        isPrimary: true,
      })
      .returning();

    [lineItem2] = await db
      .insert(activityLineItemsTable)
      .values({
        activityId: activity2.id,
        species: "Bovins",
        cheptelSize: 50,
        products: [{ name: "Lait", quantity: 100, unit: "Litres", fcfa: 50000 }],
      })
      .returning();
  });

  describe("Member Activities Access Controls", () => {
    it("Agent 1 -> GET Member 1 activities succeeds (200 OK)", async () => {
      const res = await request(app)
        .get(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });

    it("Agent 2 -> GET Member 1 activities is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`);

      expect(res.status).toBe(403);
    });

    it("Supervisor Region B -> GET Member 1 activities (Region 1) is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${supervisorRegionB.clerkUserId}`);

      expect(res.status).toBe(403);
    });

    it("Supervisor Region A -> GET Member 1 activities (Region 1) succeeds (200 OK)", async () => {
      const res = await request(app)
        .get(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${supervisorRegionA.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it("Agent 1 -> POST Member 1 activity succeeds (201 Created)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({ activityType: "pecheur", isPrimary: false });

      expect(res.status).toBe(201);
      expect(res.body.activityType).toBe("pecheur");
    });

    it("Agent 2 -> POST Member 1 activity is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/activities`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`)
        .send({ activityType: "pecheur", isPrimary: false });

      expect(res.status).toBe(403);
    });

    it("Agent 1 -> PUT Member 1 Mismatched Activity 2 (belonging to Member 2) is rejected (404 Not Found)", async () => {
      const res = await request(app)
        .put(`/api/members/${member1.id}/activities/${activity2.id}`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({ activityType: "agriculteur", isPrimary: true });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Activité introuvable ou n'appartient pas à ce membre");
    });

    it("Agent 2 -> DELETE Member 1 Activity 1 is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/members/${member1.id}/activities/${activity1.id}`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Line Items Access Controls & Mismatched Hierarchical Checks", () => {
    it("Agent 1 -> POST Member 1, Activity 1 line item succeeds (201 Created)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/activities/${activity1.id}/line-items`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({
          cropName: "Manioc",
          superficieHa: 2,
          productionQuantity: 5,
          productionUnit: "Tonnes",
          productionFcfa: 250000,
        });

      expect(res.status).toBe(201);
      expect(res.body.cropName).toBe("Manioc");
    });

    it("Agent 2 -> POST Member 1, Activity 1 line item is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/activities/${activity1.id}/line-items`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`)
        .send({
          cropName: "Manioc",
          superficieHa: 2,
          productionQuantity: 5,
          productionUnit: "Tonnes",
          productionFcfa: 250000,
        });

      expect(res.status).toBe(403);
    });

    it("Agent 1 -> POST Member 1 with Activity 2 (belonging to Member 2) is rejected (404 Not Found)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/activities/${activity2.id}/line-items`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({
          cropName: "Manioc",
          superficieHa: 2,
          productionQuantity: 5,
          productionUnit: "Tonnes",
          productionFcfa: 250000,
        });

      expect(res.status).toBe(404);
    });

    it("Agent 1 -> PUT Member 1, Activity 1, Line Item 1 succeeds (200 OK)", async () => {
      const res = await request(app)
        .put(`/api/members/${member1.id}/activities/${activity1.id}/line-items/${lineItem1.id}`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({
          cropName: "Maïs Doux",
          superficieHa: 4,
          productionQuantity: 15,
          productionUnit: "Tonnes",
          productionFcfa: 750000,
        });

      expect(res.status).toBe(200);
      expect(res.body.cropName).toBe("Maïs Doux");
    });

    it("Agent 2 -> PUT Member 1, Activity 1, Line Item 1 is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .put(`/api/members/${member1.id}/activities/${activity1.id}/line-items/${lineItem1.id}`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`)
        .send({
          cropName: "Maïs Doux",
          superficieHa: 4,
          productionQuantity: 15,
          productionUnit: "Tonnes",
          productionFcfa: 750000,
        });

      expect(res.status).toBe(403);
    });

    it("Agent 1 -> PUT Member 1, Activity 1 with Mismatched Line Item 2 (belonging to Activity 2) is rejected (404 Not Found)", async () => {
      const res = await request(app)
        .put(`/api/members/${member1.id}/activities/${activity1.id}/line-items/${lineItem2.id}`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`)
        .send({
          cropName: "Maïs Doux",
          superficieHa: 4,
          productionQuantity: 15,
          productionUnit: "Tonnes",
          productionFcfa: 750000,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Ligne d'activité introuvable ou n'appartient pas à cette activité");
    });

    it("Agent 2 -> DELETE Member 1, Activity 1, Line Item 1 is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/members/${member1.id}/activities/${activity1.id}/line-items/${lineItem1.id}`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`);

      expect(res.status).toBe(403);
    });

    it("Agent 1 -> DELETE Member 1, Activity 1, Line Item 1 succeeds (204 No Content)", async () => {
      const res = await request(app)
        .delete(`/api/members/${member1.id}/activities/${activity1.id}/line-items/${lineItem1.id}`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`);

      expect(res.status).toBe(204);
    });
  });

  describe("Member Badge Generation & Admin Status Transitions", () => {
    it("Agent 1 -> Badge for Member 1 succeeds (200 OK)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/badge`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.badgeUrl).toBeDefined();
    });

    it("Agent 2 -> Badge for Member 1 is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/badge`)
        .set("Authorization", `Bearer ${agent2.clerkUserId}`);

      expect(res.status).toBe(403);
    });

    it("Admin -> Badge for Member 1 succeeds (200 OK)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/badge`)
        .set("Authorization", `Bearer ${adminUser.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.badgeUrl).toBeDefined();
    });

    it("Agent 1 -> POST /members/:id/validate is rejected (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/validate`)
        .set("Authorization", `Bearer ${agent1.clerkUserId}`);

      expect(res.status).toBe(403);
    });

    it("Admin -> POST /members/:id/validate succeeds (200 OK)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/validate`)
        .set("Authorization", `Bearer ${adminUser.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("valide");
    });

    it("Admin -> POST /members/:id/block succeeds (200 OK)", async () => {
      const res = await request(app)
        .post(`/api/members/${member1.id}/block`)
        .set("Authorization", `Bearer ${adminUser.clerkUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("bloque");
    });

    it("Admin -> POST /members/:id/reactivate on blocked member is rejected (400 Bad Request)", async () => {
      await request(app)
        .post(`/api/members/${member1.id}/block`)
        .set("Authorization", `Bearer ${adminUser.clerkUserId}`);

      const res = await request(app)
        .post(`/api/members/${member1.id}/reactivate`)
        .set("Authorization", `Bearer ${adminUser.clerkUserId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("bloqué de manière définitive");
    });
  });
});
