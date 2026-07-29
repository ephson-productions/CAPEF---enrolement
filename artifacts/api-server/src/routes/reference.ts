import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, regionsTable, departmentsTable, arrondissementsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/regions
router.get("/regions", async (_req, res): Promise<void> => {
  try {
    const regions = await db.select().from(regionsTable).orderBy(regionsTable.name);
    res.json(regions);
  } catch (error) {
    logger.error({ error }, "Error fetching regions");
    res.status(500).json({ error: "Failed to fetch regions", details: String(error) });
  }
});

// GET /api/departments
router.get("/departments", async (req, res): Promise<void> => {
  try {
    const { regionId } = req.query;

    const departments = regionId
      ? await db.select().from(departmentsTable).where(eq(departmentsTable.regionId, Number(regionId))).orderBy(departmentsTable.name)
      : await db.select().from(departmentsTable).orderBy(departmentsTable.name);

    res.json(departments);
  } catch (error) {
    logger.error({ error }, "Error fetching departments");
    res.status(500).json({ error: "Failed to fetch departments", details: String(error) });
  }
});

// GET /api/arrondissements
router.get("/arrondissements", async (req, res): Promise<void> => {
  try {
    const { departmentId } = req.query;

    const arrondissements = departmentId
      ? await db.select().from(arrondissementsTable).where(eq(arrondissementsTable.departmentId, Number(departmentId))).orderBy(arrondissementsTable.name)
      : await db.select().from(arrondissementsTable).orderBy(arrondissementsTable.name);

    res.json(arrondissements);
  } catch (error) {
    logger.error({ error }, "Error fetching arrondissements");
    res.status(500).json({ error: "Failed to fetch arrondissements", details: String(error) });
  }
});

export default router;
