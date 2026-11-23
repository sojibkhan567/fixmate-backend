import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { usersCollection, connectDB } from "../../config/db.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ObjectId } from "mongodb";

const router = Router();

// fetch user list
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

// PATCH /profile  (mount with: app.use("/api", profileRouter))
// Shared route: every logged-in user can update their own profile.
router.patch("/profile", checkAuthenticatedUser, async (req, res) => {
  try {
    // assumes checkAuthenticatedUser puts the logged-in user on req.user
    const userId = req.user?.id || req.user?._id;

    // only these fields are saved (email and role are never touched)
    const { name, phone, area, bio, image } = req.body;
    const updates = { name, phone, area, bio, image };
    Object.keys(updates).forEach(
      (key) => updates[key] === undefined && delete updates[key],
    );

    const db = await connectDB();
    const result = await db
      .collection("user")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $set: { ...updates, updatedAt: new Date() } },
      );

    res.json({ message: "Profile updated successfully", result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;
