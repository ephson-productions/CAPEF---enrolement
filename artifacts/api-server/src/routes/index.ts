import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import referenceRouter from "./reference";
import membersRouter from "./members";
import dashboardRouter from "./dashboard";
import uploadsRouter from "./uploads";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(referenceRouter);
router.use(membersRouter);
router.use(dashboardRouter);
router.use(uploadsRouter);

export default router;
