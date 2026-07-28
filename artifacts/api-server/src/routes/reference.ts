import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, regionsTable, departmentsTable, arrondissementsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /api/regions
router.get("/regions", async (_req, res): Promise<void> => {
  const regions = await db.select().from(regionsTable).orderBy(regionsTable.name);
  res.json(regions);
});

// GET /api/departments
router.get("/departments", async (req, res): Promise<void> => {
  const { regionId } = req.query;

  const departments = regionId
    ? await db.select().from(departmentsTable).where(eq(departmentsTable.regionId, Number(regionId))).orderBy(departmentsTable.name)
    : await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  res.json(departments);
});

// GET /api/arrondissements
router.get("/arrondissements", async (req, res): Promise<void> => {
  const { departmentId } = req.query;

  const arrondissements = departmentId
    ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.departmentId, Number(departmentId))).orderBy(arrondissementsTable.name)
    : await db.select().from(arrondissementsTable).orderBy(arrondissementsTable.name);

  res.json(arrondissements);
});

export default router;
