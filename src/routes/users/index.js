import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { usersCollection } from "../../config/db.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ObjectId } from "mongodb";

const router = Router();

router.get(
  "/",
  checkAuthenticatedUser,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const users = await usersCollection.find().toArray();

      const result = users.map(({ _id, ...user }) => ({
        id: _id.toString(),
        ...user,
      }));

      sendSuccess(res, result, "Users fetched successfully");
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
      });
    }
  },
);

/** update users role */
router.patch(
  "/:id/role",
  checkAuthenticatedUser,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Validate MongoDB ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      // Validate role
      const allowedRoles = ["admin", "technician", "customer"];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      // Check user exists
      const user = await usersCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Prevent admin from changing their own role
      if (user._id.toString() === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own role",
        });
      }

      const result = await usersCollection.findOneAndUpdate(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        },
        {
          returnDocument: "after",
        },
      );

      sendSuccess(res, result, "User role updated successfully");
    } catch (error) {
      console.error("Update role error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update user role",
      });
    }
  },
);

export default router;
