import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { connectDB } from "../../config/db.js";
import { ObjectId } from "mongodb";

const adminRouter = Router();
//adminRouter.use(checkAuthenticatedUser, verifyRole); // everything below is admin only

/**
 * GET /admin/services
 * Every service from every technician (any approvalStatus), newest first.
 */
adminRouter.get(
  "/services",
  checkAuthenticatedUser,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const db = await connectDB();
      const services = await db
        .collection("services")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      console.log(services);
      res.json(services);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

/**
 * PATCH /api/admin/services/:id/approval
 * Body: { approvalStatus: "approved" | "rejected" }
 * Works from any current status (so a wrong decision can be reversed).
 */
adminRouter.patch(
  "/services/:id/approval",
  checkAuthenticatedUser,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { approvalStatus } = req.body ?? {};

      if (!ObjectId.isValid(id))
        return res.status(404).json({ error: "Service not found" });
      if (!["approved", "rejected"].includes(approvalStatus))
        return res
          .status(400)
          .json({ error: "approvalStatus must be approved or rejected" });

      const db = await connectDB();
      const result = await db.collection("services").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            approvalStatus,
            reviewedAt: new Date(),
            reviewedBy: req.user.email,
            updatedAt: new Date(),
          },
        },
      );
      if (result.matchedCount === 0)
        return res.status(404).json({ error: "Service not found" });

      res.json({ ok: true, approvalStatus });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

export default adminRouter;
