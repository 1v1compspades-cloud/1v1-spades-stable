import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import roomsRouter from "./rooms.js";
import statsRouter from "./stats.js";
import v11Router from "./v11.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/rooms", roomsRouter);
router.use("/admin", statsRouter);
router.use("/v1.1", v11Router);

export default router;
