import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, membersTable, usersTable, memberActivitiesTable } from "@workspace/db";

describe("Public Badge Verification Security & Data Sanitization (REM-SEC-001)", () => {
  let validMember: any;
  const testBadgeToken = "token_public_test_badge_789";

  beforeEach(async () => {
    // Clean test data
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    const [agent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "user_agent_badge_test",
        email: "agent.badge@capef.cm",
        name: "Agent Badge Test",
        role: "agent",
      })
      .returning();

    [validMember] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-099999",
        memberType: "physique",
        category: "agriculteur",
        version: 1,
        individualOrOrg: "individuel",
        village: "Mbankolo",
        gpsLat: 3.8667,
        gpsLng: 11.5167,
        createdById: agent.id,
        badgeToken: testBadgeToken,
        badgeUrl: "badge_MBANKOLO_099999.svg",
        physiqueData: {
          nom: "FOTSO",
          prenom: "Alain",
          civilite: "M.",
          sexe: "M",
          numeroCni: "1122334455",
          cniRectoUrl: "media/cni_recto_secret.jpg",
          cniVersoUrl: "media/cni_verso_secret.jpg",
          signatureUrl: "media/signature_secret.png",
          photoUrl: "https://example.com/photos/fotso.jpg",
          telephone1: "+237699001122",
        },
        status: "valide",
      })
      .returning();

    await db.insert(memberActivitiesTable).values({
      memberId: validMember.id,
      activityType: "agriculteur",
      isPrimary: true,
      village: "Mbankolo",
    });
  });

  it("1. Anonymous request without Authorization header to /api/public/members/badge/:token returns HTTP 200 with public projection", async () => {
    const res = await request(app).get(`/api/public/members/badge/${testBadgeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.memberNumber).toBe("CAPEF-AGR-099999");
    expect(res.body.displayName).toBe("FOTSO Alain");
    expect(res.body.category).toBe("agriculteur");
    expect(res.body.status).toBe("valide");
    expect(res.body.isValid).toBe(true);
    expect(res.body.photoUrl).toBe("https://example.com/photos/fotso.jpg");
    expect(res.body.activities).toBeDefined();
    expect(res.body.activities.length).toBe(1);
  });

  it("2. Backward-compatible alias /api/members/badge/:token is also accessible anonymously", async () => {
    const res = await request(app).get(`/api/members/badge/${testBadgeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.memberNumber).toBe("CAPEF-AGR-099999");
    expect(res.body.displayName).toBe("FOTSO Alain");
  });

  it("3. Sensitive PII fields are strictly excluded from the public verification response", async () => {
    const res = await request(app).get(`/api/public/members/badge/${testBadgeToken}`);

    expect(res.status).toBe(200);

    // Forbidden sensitive properties must be undefined / absent
    expect(res.body.numeroCni).toBeUndefined();
    expect(res.body.cniRectoUrl).toBeUndefined();
    expect(res.body.cniVersoUrl).toBeUndefined();
    expect(res.body.signatureUrl).toBeUndefined();
    expect(res.body.createdById).toBeUndefined();
    expect(res.body.gpsLat).toBeUndefined();
    expect(res.body.gpsLng).toBeUndefined();
    expect(res.body.physiqueData).toBeUndefined();
    expect(res.body.moraleData).toBeUndefined();
  });

  it("4. Non-existent or invalid badge token returns HTTP 404 Not Found", async () => {
    const res = await request(app).get("/api/public/members/badge/invalid_token_999999");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("introuvable");
  });
});
