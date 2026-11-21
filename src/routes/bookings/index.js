import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { ObjectId } from "mongodb";
import { bookingCollection, servicesCollection } from "../../config/db.js";

const bookingRouter = Router();
const ACTIVE_STATUSES = ["requested", "accepted", "in-progress"];

/**
 * POST /bookings
 * Customer only. Body: { serviceId, phone, address, preferredDate, problemDescription }
 * 400 invalid · 404 service unavailable · 409 duplicate active request · 201 created
 */
bookingRouter.post("/", checkAuthenticatedUser, async (req, res) => {
  try {
    const data = req.body;
    const { serviceId, preferredDate: date, address, phone } = req.body;

    if (!serviceId || !ObjectId.isValid(serviceId)) {
      return res.status(400).json({ message: "Valid serviceId is required" });
    }
    if (!date || !phone || !address) {
      return res
        .status(400)
        .json({ message: "date, time and address are required" });
    }

    const service = await servicesCollection.findOne({
      _id: new ObjectId(serviceId),
    });

    if (
      !service ||
      service.approvalStatus !== "approved" ||
      service.isAvailable === false
    ) {
      return res
        .status(404)
        .json({ message: "Service not found or unavailable" });
    }

    const booking = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await bookingCollection.insertOne(booking);

    return res.status(201).json({
      id: result.insertedId.toString(),
      ...booking,
      serviceId,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/bookings/active?serviceId=...
 * Customer only. → { active: boolean }
 * (Keep this above any "/:id" route.)
 */
bookingRouter.get(
  "/active",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const { serviceId } = req.query;
      if (!serviceId)
        return res.status(400).json({ error: "serviceId is required" });

      const existing = await bookingCollection.findOne(
        {
          "customer.email": req.user.email,
          serviceId: String(serviceId),
          status: { $in: ACTIVE_STATUSES },
        },
        { projection: { _id: 1 } },
      );
      res.json({ active: Boolean(existing) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

export default bookingRouter;
