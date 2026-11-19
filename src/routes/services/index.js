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

export default serviceRouter;
