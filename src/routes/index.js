import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import usersRouter from "./users/index.js";
import serviceRouter from "./services/index.js";
import adminRouter from "./admin/index.js";
import technicianRouter from "./technician/index.js";

const router = Router();

// GET /api/health — quick check that the server is up.
router.get("/test", (req, res) => {
  sendSuccess(res, { status: "ok" }, "API is running");
});

router.use("/users", usersRouter);
router.use("/services", serviceRouter);
router.use("/admin", adminRouter);
router.use("/technician", technicianRouter);

export default router;
