import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { usersCollection } from "../../config/db.js";
import { sendSuccess } from "../../utils/apiResponse.js";

const router = Router();

router.get(
  "/",
  checkAuthenticatedUser,
  verifyRole(["admin"]),
  async (req, res) => {
    const result = await usersCollection.find().toArray();

    // res.send({success: true, message: "Users fetched successfully", data: res});
    sendSuccess(res, result, "Users fetched successfully");
  },
);

export default router;
