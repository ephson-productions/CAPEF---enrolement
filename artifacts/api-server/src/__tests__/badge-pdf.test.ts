import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import app from "../app";
import { generateMemberBadgePdf, CR80_WIDTH, CR80_HEIGHT } from "../lib/badge-pdf";
import { db, membersTable, usersTable, memberActivitiesTable } from "@workspace/db";

describe("Printable Vector PDF Badge Generator [REM-FONC-01]", () => {
  let testAgent: any;
  let testMember: any;

  beforeEach(async () => {
    await db.delete(memberActivitiesTable);
    await db.delete(membersTable);
    await db.delete(usersTable);

    [testAgent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "test_user_agent_badge_pdf",
        email: "agent.pdf@capef.cm",
        name: "Agent PDF Test",
        role: "agent",
      })
      .returning();

    [testMember] = await db
      .insert(membersTable)
      .values({
        memberNumber: "CAPEF-AGR-000042",
        memberType: "physique",
        category: "agriculteur",
        version: 1,
        individualOrOrg: "individuel",
        village: "Obala Centre",
        createdById: testAgent.id,
        physiqueData: {
          nom: "KAMGA",
          prenom: "Jean-Pierre",
          telephone1: "+237677112233",
        },
        status: "valide",
      })
      .returning();
  });

  it("1. generateMemberBadgePdf produces a valid PDF buffer starting with %PDF-1.", async () => {
    const qrBuffer = await QRCode.toBuffer("https://capef.cm/badge-verify/test-token", { type: "png" });

    const pdfBuffer = await generateMemberBadgePdf(
      {
        memberNumber: "CAPEF-AGR-000042",
        displayName: "KAMGA Jean-Pierre",
        memberType: "physique",
        category: "agriculteur",
        regionName: "Centre",
        departmentName: "Lekié",
        phone: "+237677112233",
        issuedAt: new Date().toISOString(),
      },
      qrBuffer,
      null,
      null,
      null
    );

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Standard PDF header signature
    const header = pdfBuffer.subarray(0, 8).toString("utf-8");
    expect(header.startsWith("%PDF-1.")).toBe(true);
  });

  it("2. generated PDF has exactly 2 pages (Recto & Verso) with exact CR80 ISO/IEC 7810 ID-1 dimensions", async () => {
    const qrBuffer = await QRCode.toBuffer("https://capef.cm/badge-verify/test-token", { type: "png" });

    const pdfBuffer = await generateMemberBadgePdf(
      {
        memberNumber: "CAPEF-AGR-000042",
        displayName: "KAMGA Jean-Pierre",
        memberType: "physique",
        category: "agriculteur",
        regionName: "Centre",
        departmentName: "Lekié",
      },
      qrBuffer
    );

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    expect(pdfDoc.getPageCount()).toBe(2);

    const page1 = pdfDoc.getPage(0);
    expect(Math.round(page1.getWidth())).toBe(Math.round(CR80_WIDTH));
    expect(Math.round(page1.getHeight())).toBe(Math.round(CR80_HEIGHT));

    const page2 = pdfDoc.getPage(1);
    expect(Math.round(page2.getWidth())).toBe(Math.round(CR80_WIDTH));
    expect(Math.round(page2.getHeight())).toBe(Math.round(CR80_HEIGHT));
  });

  it("3. POST /api/members/:id/badge returns signed PDF URL ending with .pdf", async () => {
    const res = await request(app)
      .post(`/api/members/${testMember.id}/badge`)
      .set("Authorization", `Bearer ${testAgent.clerkUserId}`);

    expect(res.status).toBe(200);
    expect(res.body.memberNumber).toBe("CAPEF-AGR-000042");
    expect(res.body.badgeUrl).toBeDefined();
    expect(res.body.badgeUrl).toContain(".pdf");
  });

  it("4. GET /api/members/:id/badge.pdf serves direct binary application/pdf stream with attachment header", async () => {
    const res = await request(app)
      .get(`/api/members/${testMember.id}/badge.pdf`)
      .set("Authorization", `Bearer ${testAgent.clerkUserId}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment; filename=");
    expect(res.headers["content-disposition"]).toContain(".pdf");
    expect(res.body.length).toBeGreaterThan(1000);
  });
});
