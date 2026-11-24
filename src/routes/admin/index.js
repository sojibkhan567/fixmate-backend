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

const BOOKING_STATUSES = [
  "requested",
  "accepted",
  "inprogress",
  "completed",
  "rejected",
  "cancelled",
];

/**
 * GET /api/admin/bookings?status=all|requested|accepted|inprogress|completed|rejected|cancelled
 * Read-only list of every booking on the platform, filtered ON THE SERVER by `status`.
 * → { bookings: [...], counts: { all, requested, accepted, inprogress, completed, rejected, cancelled } }
 * (counts are always for the whole platform, so the filter buttons can show them)
 */
adminRouter.get("/bookings", async (req, res) => {
  try {
    const status = String(req.query.status ?? "all");
    if (status !== "all" && !BOOKING_STATUSES.includes(status))
      return res.status(400).json({ error: "Invalid status filter" });

    const db = await connectDB();
    const bookingsCol = db.collection("bookings");
    const filter = status === "all" ? {} : { status };

    const [bookings, grouped] = await Promise.all([
      bookingsCol.find(filter).sort({ createdAt: -1 }).toArray(),
      bookingsCol
        .aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }])
        .toArray(),
    ]);

    const counts = Object.fromEntries([
      ["all", 0],
      ...BOOKING_STATUSES.map((s) => [s, 0]),
    ]);
    for (const g of grouped) {
      if (g._id in counts) counts[g._id] = g.n;
      counts.all += g.n;
    }

    res.json({ bookings, counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/**
 * GET /api/admin/transactions
 * Every document in the `payments` collection (newest first) plus the total revenue,
 * summed on the server. → { payments: [...], totalRevenue, count }
 */
adminRouter.get("/transactions", async (req, res) => {
  try {
    const db = await connectDB();
    const paymentsCol = db.collection("payments");

    const [payments, [totals]] = await Promise.all([
      paymentsCol.find({}).sort({ paidAt: -1 }).toArray(),
      paymentsCol
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray()
        .then((r) => (r.length ? r : [{ totalRevenue: 0, count: 0 }])),
    ]);

    res.json({
      payments,
      totalRevenue: totals.totalRevenue,
      count: totals.count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default adminRouter;
