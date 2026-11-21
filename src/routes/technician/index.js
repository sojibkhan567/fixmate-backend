import { Router } from "express";
import { checkAuthenticatedUser } from "../../middleware/auth.js";
import { servicesCollection } from "../../config/db.js";
import { sendSuccess } from "../../utils/apiResponse.js";

const technicianRouter = Router();

/**
 * Get authenticate services route
 * GET: /technician/my-services
 */
technicianRouter.get(
  "/my-services",
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      if (req.user.role !== "technician") {
        return res.status(403).json({
          success: false,
          message: "Only technicians can access this resource",
        });
      }

      const services = await servicesCollection
        .find({
          technicianEmail: req.user.email,
        })
        .sort({ createdAt: -1 })
        .toArray();

      sendSuccess(res, services, "Technician services retrieved successfully");
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to retrieve technician services",
      });
    }
  },
);

export default technicianRouter;
