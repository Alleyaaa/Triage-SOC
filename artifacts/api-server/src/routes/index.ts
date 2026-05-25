import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { sessionsRouter } from "./sessions";
import { logsRouter } from "./logs";
import { correlationsRouter } from "./correlations";
import { analyzeRouter } from "./analyze";
import { reportsRouter } from "./reports";
import { dashboardRouter } from "./dashboard";
import { n8nConfigRouter } from "./n8nConfig";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(logsRouter);
router.use(correlationsRouter);
router.use(analyzeRouter);
router.use(reportsRouter);
router.use(dashboardRouter);
router.use(n8nConfigRouter);

export default router;
