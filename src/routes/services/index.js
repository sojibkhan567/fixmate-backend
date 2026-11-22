import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  connectDB,
  servicesCollection,
  usersCollection,
} from "../../config/db.js";
import { checkAuthenticatedUser } from "../../middleware/auth.js";

// Mounted at /api/services

const serviceRouter = Router();

/**
 * GET /api/services/featured
 * Public. 6 latest approved + available services, newest first, technician attached.
 * (Keep this above "/:id".)
 */
serviceRouter.get("/featured", async (req, res) => {
  try {
    const db = await connectDB();
    const services = await db
      .collection("services")
      .find({ approvalStatus: "approved", isAvailable: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    const ids = [...new Set(services.map((s) => String(s.technicianId)))]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const techs = ids.length
      ? await db
          .collection("users")
          .find(
            { _id: { $in: ids } },
            { projection: { name: 1, image: 1, area: 1, bio: 1 } },
          )
          .toArray()
      : [];
    const byId = new Map(techs.map((t) => [String(t._id), t]));

    res.json(
      services.map((s) => {
        const t = byId.get(String(s.technicianId));
        return {
          ...s,
          technician: t
            ? { name: t.name, image: t.image, area: t.area, bio: t.bio }
            : undefined,
        };
      }),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/**
 * Create services data
 * */
serviceRouter.post("/", async (req, res) => {
  const data = req.body;
  const servicesData = { ...data, createdAt: new Date() };
  const result = await servicesCollection.insertOne(servicesData);
  //res.send(result);
  sendSuccess(res, result, "Service added successfully");
});

/**
 * Get services for homepage
 */
serviceRouter.get("/", async (req, res) => {
  try {
    const { approvalStatus, isAvailable, sort, search, category, serviceMode } =
      req.query;
    const query = {};

    // Approval status
    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }

    // Availability
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true";
    }

    // Category
    if (category) {
      query.category = category;
    }

    // Service mode
    if (serviceMode) {
      query.serviceMode = serviceMode;
    }

    // Search
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
        {
          technicianName: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Sort
    let sortOption = { createdAt: -1 };

    if (sort === "price_asc") {
      sortOption = { basePrice: 1 };
    } else if (sort === "price_desc") {
      sortOption = { basePrice: -1 };
    } else if (sort === "newest") {
      sortOption = { createdAt: -1 };
    } else if (sort === "oldest") {
      sortOption = { createdAt: 1 };
    }

    const services = await servicesCollection
      .find(query)
      .sort(sortOption)
      .toArray();

    sendSuccess(res, services, "Services fetched successfully");
  } catch (error) {
    console.error("Get services error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch services",
    });
  }
});

/**
 * Get services for details page
/** GET /services/:id → returns the service, or 404 when missing / not approved / unavailable */
serviceRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Service not found" });
    }

    const service = await servicesCollection.findOne({ _id: new ObjectId(id) });

    if (
      !service ||
      service.approvalStatus !== "approved" ||
      service.isAvailable === false
    ) {
      return res.status(404).json({ message: "Service not found" });
    }

    const technician = service.technicianEmail
      ? await usersCollection.findOne(
          { email: service.technicianEmail },
          { projection: { password: 0 } },
        )
      : null;

    const { _id, ...rest } = service;

    return res.status(200).json({
      id: _id.toString(),
      ...rest,
      technician: technician
        ? { ...technician, id: technician._id.toString(), _id: undefined }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

/** update availability */
serviceRouter.patch(
  "/:id/availability",
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isAvailable must be a boolean",
        });
      }

      const result = await servicesCollection.updateOne(
        {
          _id: new ObjectId(id),
          technicianEmail: req.user.email,
        },
        {
          $set: {
            isAvailable,
            updatedAt: new Date(),
          },
        },
      );

      console.log(result);

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Availability updated successfully",
        data: {
          _id: id,
          isAvailable,
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Failed to update availability",
      });
    }
  },
);

/** Update services by technician */
serviceRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate MongoDB ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    // Prevent empty update
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    // Fields that are allowed to be updated
    const allowedFields = [
      "title",
      "category",
      "description",
      "price",
      "serviceMode",
      "image",
      "status",
      "approvalStatus",
    ];

    // Only allow approved fields
    const updateData = { approvalStatus: "pending" };

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    // Add updatedAt
    updateData.updatedAt = new Date();

    const result = await servicesCollection.findOneAndUpdate(
      {
        _id: new ObjectId(id),
      },
      {
        $set: updateData,
      },
      {
        returnDocument: "after",
      },
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update service error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update service",
      error: error.message,
    });
  }
});

/** delete services */
serviceRouter.delete("/:id", checkAuthenticatedUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    const service = await servicesCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Make sure the logged-in user owns this service
    if (service.technicianEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this service",
      });
    }

    const result = await servicesCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Service could not be deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service",
    });
  }
});

export default serviceRouter;
