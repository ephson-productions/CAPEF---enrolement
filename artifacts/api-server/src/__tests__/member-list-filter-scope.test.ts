import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { db, usersTable, membersTable } from "@workspace/db";

describe("Member list filters and role scope", () => {
  let admin: any;
  let supervisor: any;
  let supervisorWithoutRegion: any;
  let agentA: any;
  let agentB: any;
  let agentOutside: any;

  beforeEach(async () => {
    await db.delete(membersTable);
    await db.delete(usersTable);

    [admin] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_admin",
      email: "filter-admin@capef.cm",
      name: "Filter Admin",
      role: "admin",
    }).returning();

    [supervisor] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_supervisor",
      email: "filter-supervisor@capef.cm",
      name: "Filter Supervisor",
      role: "supervisor",
      regionId: 1,
    }).returning();

    [supervisorWithoutRegion] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_supervisor_no_region",
      email: "filter-supervisor-no-region@capef.cm",
      name: "Unassigned Supervisor",
      role: "supervisor",
    }).returning();

    [agentA] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_agent_a",
      email: "filter-agent-a@capef.cm",
      name: "Agent A",
      role: "agent",
      regionId: 1,
    }).returning();

    [agentB] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_agent_b",
      email: "filter-agent-b@capef.cm",
      name: "Agent B",
      role: "agent",
      regionId: 1,
    }).returning();

    [agentOutside] = await db.insert(usersTable).values({
      clerkUserId: "test_user_filter_agent_outside",
      email: "filter-agent-outside@capef.cm",
      name: "Agent Outside",
      role: "agent",
      regionId: 2,
    }).returning();

    await db.insert(membersTable).values([
      {
        memberNumber: "CAPEF-AGR-FILTER-001",
        memberType: "physique",
        category: "agriculteur",
        status: "valide",
        regionId: 1,
        createdById: agentA.id,
        physiqueData: { nom: "Femme", prenom: "Aline" },
      },
      {
        memberNumber: "CAPEF-AGR-FILTER-002",
        memberType: "morale",
        category: "agriculteur",
        status: "valide",
        regionId: 1,
        createdById: agentA.id,
        moraleData: {
          nom: "GIC Femme Cacao",
          representants: [{ ordre: 1, civilite: "Mme.", nom: "MANGA", prenom: "Aline" }],
        },
      },
      {
        memberNumber: "CAPEF-AGR-FILTER-003",
        memberType: "morale",
        category: "agriculteur",
        status: "valide",
        regionId: 1,
        createdById: agentA.id,
        moraleData: {
          nom: "GIC Femme Café",
          representants: [{ ordre: 1, civilite: "Mlle.", nom: "KAMGA", prenom: "Mireille" }],
        },
      },
      {
        memberNumber: "CAPEF-AGR-FILTER-004",
        memberType: "morale",
        category: "agriculteur",
        status: "valide",
        regionId: 1,
        createdById: agentB.id,
        moraleData: {
          nom: "GIC Homme Cacao",
          representants: [{ ordre: 1, civilite: "M.", nom: "TAMO", prenom: "Paul" }],
        },
      },
      {
        memberNumber: "CAPEF-PEC-FILTER-005",
        memberType: "morale",
        category: "pecheur",
        status: "en_attente",
        regionId: 2,
        createdById: agentOutside.id,
        moraleData: {
          nom: "GIC Femme Littoral",
          representants: [{ ordre: 1, civilite: "Mme.", nom: "ESSOMBA", prenom: "Eva" }],
        },
      },
    ]);
  });

  it("admin filters are intersected in the result and total", async () => {
    const response = await request(app)
      .get(`/api/members?memberType=morale&category=agriculteur&representantGenre=femme&createdById=${agentA.id}&search=Femme&limit=1`)
      .set("Authorization", `Bearer ${admin.clerkUserId}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].createdById).toBe(agentA.id);
    expect(response.body.data[0].memberType).toBe("morale");
    expect(response.body.data[0].category).toBe("agriculteur");

    const maleRepresentativeResponse = await request(app)
      .get("/api/members?memberType=morale&category=agriculteur&representantGenre=homme")
      .set("Authorization", `Bearer ${admin.clerkUserId}`);
    expect(maleRepresentativeResponse.status).toBe(200);
    expect(maleRepresentativeResponse.body.total).toBe(1);
    expect(maleRepresentativeResponse.body.data[0].createdById).toBe(agentB.id);
  });

  it("agent search and a forged creator filter never reveal another agent's members", async () => {
    const response = await request(app)
      .get(`/api/members?search=CAPEF-AGR-FILTER&createdById=${agentB.id}`)
      .set("Authorization", `Bearer ${agentA.clerkUserId}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    expect(response.body.data.every((member: any) => member.createdById === agentA.id)).toBe(true);
  });

  it("supervisor agent filters work only inside the supervisor's region", async () => {
    const allowedAgentResponse = await request(app)
      .get(`/api/members?regionId=1&createdById=${agentB.id}&search=GIC`)
      .set("Authorization", `Bearer ${supervisor.clerkUserId}`);

    expect(allowedAgentResponse.status).toBe(200);
    expect(allowedAgentResponse.body.total).toBe(1);
    expect(allowedAgentResponse.body.data[0].createdById).toBe(agentB.id);

    const forgedRegionResponse = await request(app)
      .get(`/api/members?regionId=2&search=CAPEF`)
      .set("Authorization", `Bearer ${supervisor.clerkUserId}`);
    expect(forgedRegionResponse.status).toBe(200);
    expect(forgedRegionResponse.body.total).toBe(0);

    const outsideAgentResponse = await request(app)
      .get(`/api/members?createdById=${agentOutside.id}`)
      .set("Authorization", `Bearer ${supervisor.clerkUserId}`);
    expect(outsideAgentResponse.status).toBe(403);
  });

  it("supervisor without a region receives no member records", async () => {
    const response = await request(app)
      .get("/api/members?search=CAPEF")
      .set("Authorization", `Bearer ${supervisorWithoutRegion.clerkUserId}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.data).toEqual([]);
  });

  it("supervisor agent options stay region-scoped even if role and region are falsified", async () => {
    const response = await request(app)
      .get("/api/users?role=admin&regionId=2")
      .set("Authorization", `Bearer ${supervisor.clerkUserId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.every((user: any) => user.role === "agent" && user.regionId === 1)).toBe(true);

    const adminAgentsResponse = await request(app)
      .get("/api/users?role=agent")
      .set("Authorization", `Bearer ${admin.clerkUserId}`);
    expect(adminAgentsResponse.status).toBe(200);
    expect(adminAgentsResponse.body).toHaveLength(3);
    expect(adminAgentsResponse.body.every((user: any) => user.role === "agent")).toBe(true);

    const unassignedSupervisorAgents = await request(app)
      .get("/api/users?role=agent")
      .set("Authorization", `Bearer ${supervisorWithoutRegion.clerkUserId}`);
    expect(unassignedSupervisorAgents.status).toBe(200);
    expect(unassignedSupervisorAgents.body).toEqual([]);
  });
});
