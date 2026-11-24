import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { connectDB } from "../../config/db.js";

const paymentRouter = Router();

/**
 * GET /api/payments/my
 * Customer only. Payments from the `payments` collection made by the logged-in customer
 * (matched by customerEmail), newest first.
 */
paymentRouter.get(
  "/my",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const db = await connectDB();
      const payments = await db
        .collection("payments")
        .find({ customerEmail: req.user.email })
        .sort({ paidAt: -1 })
        .toArray();
      res.json(payments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

export default paymentRouter;
