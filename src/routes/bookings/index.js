import { Router } from "express";
import { checkAuthenticatedUser } from "../../middleware/auth.js";
import { ObjectId } from "mongodb";
import { bookingCollection, servicesCollection } from "../../config/db.js";

const bookingRouter = Router();

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

export default bookingRouter;
