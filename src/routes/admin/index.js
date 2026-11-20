import express from "express";
import { servicesCollection } from "../../config/db.js";
import { ObjectId } from "mongodb";

const adminRouter = express.Router();

// GET /api/admin/services
adminRouter.get("/services", async (req, res) => {
  try {
    const { approvalStatus, search, category } = req.query;

    const query = {};

    // Filter by approval status
    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Search service
    if (search) {
      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
        {
          category: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const services = await servicesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      data: services,
    });
  } catch (error) {
    console.error("Get admin services error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
    });
  }
});

/**
 * PATCH: /admin/services/:id
 */
// PATCH /api/admin/services/:id
adminRouter.patch("/services/:id", async (req, res) => {
  try {
    const { approvalStatus } = req.body;

    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid approval status" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid service id" });
    }

    const result = await servicesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { approvalStatus, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res
      .status(200)
      .json({ success: true, message: `Service ${approvalStatus}` });
  } catch (error) {
    console.error("Update service status error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update service" });
  }
});

export default adminRouter;
