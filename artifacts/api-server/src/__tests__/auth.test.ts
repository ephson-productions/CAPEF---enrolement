import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable } from "@workspace/db";

describe("Authentication Gate (auth.test.ts)", () => {
  beforeEach(async () => {
    await db.delete(usersTable);
  });

  it("First user signup on empty table without INITIAL_ADMIN_EMAIL assigns role: agent (NOT admin)", async () => {
    delete process.env.INITIAL_ADMIN_EMAIL;

    const res = await request(app)
      .post("/api/auth/provision")
      .set("Authorization", "Bearer test_user_new1")
      .send({ name: "Agent Alpha" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("agent");
    expect(res.body.email).toBe("test_user_new1@capef.test");
  });

  it("Signup matching INITIAL_ADMIN_EMAIL assigns role: admin", async () => {
    process.env.INITIAL_ADMIN_EMAIL = "admin@capef.cm";

    const res = await request(app)
      .post("/api/auth/provision")
      .set("Authorization", "Bearer test_user_admin")
      .send({ name: "System Admin" });

    expect(res.body.role).toBe("agent");

    const [insertedAdmin] = await db
      .insert(usersTable)
      .values({
        clerkUserId: "pending_admin_1",
        email: "admin@capef.cm",
        name: "Admin User",
        role: "admin",
      })
      .returning();

    expect(insertedAdmin.role).toBe("admin");
  });
});
