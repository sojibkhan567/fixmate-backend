import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { servicesCollection } from "../../config/db.js";
import { checkAuthenticatedUser } from "../../middleware/auth.js";

// Mounted at /api/services

const serviceRouter = Router();

serviceRouter.post("/", async (req, res) => {
  const data = req.body;
  const result = await servicesCollection.insertOne(data);
  //res.send(result);
  sendSuccess(res, result, "Service added successfully");
});

/**
 * Get authenticate services route
 * GET: /services
 */
serviceRouter.get("/", checkAuthenticatedUser, async (req, res) => {
  try {
    const email = req.user.email;

    const result = await servicesCollection
      .find({ technicianEmail: email })
      .toArray();

    sendSuccess(res, result, "Services retrieved successfully");
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
    });
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

      console.log({ id, isAvailable });
      console.log(req.user.email);

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
