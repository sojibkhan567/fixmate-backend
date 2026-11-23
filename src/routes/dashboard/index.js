import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { connectDB } from "../../config/db.js";

const dashboardRouter = Router();

// ---- Adjust to the values you store in your collections -------------------
const USERS_COLLECTION = "user"; // better-auth default; change to "users" if yours is plural
const ACTIVE_BOOKING_STATUSES = ["accepted", "inprogress"]; // a job being worked on
const COMPLETED_STATUS = "completed";
const PENDING_BOOKING_STATUS = "pending"; // booking waiting for the technician
const APPROVED_SERVICE_STATUS = "approved";
const PENDING_SERVICE_STATUS = "pending"; // service waiting for admin approval
// ---------------------------------------------------------------------------

// GET /dashboard/customer/stats
dashboardRouter.get(
  "/customer/stats",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const db = await connectDB();
      const bookings = db.collection("bookings");
      const customerEmail = req.user.email;

      const [totalRequests, activeJobs, completedJobs] = await Promise.all([
        bookings.countDocuments({ "customer.email": customerEmail }),
        bookings.countDocuments({
          "customer.email": customerEmail,
          status: { $in: ACTIVE_BOOKING_STATUSES },
        }),
        bookings.countDocuments({
          "customer.email": customerEmail,
          status: COMPLETED_STATUS,
        }),
      ]);

      res.json({ totalRequests, activeJobs, completedJobs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

// GET /dashboard/technician/stats
dashboardRouter.get(
  "/technician/stats",
  checkAuthenticatedUser,
  verifyRole(["technician"]),
  async (req, res) => {
    try {
      const db = await connectDB();
      const services = db.collection("services");
      const bookings = db.collection("bookings");
      const technicianEmail = req.user.email;

      const [totalServices, approvedServices, pendingRequests] =
        await Promise.all([
          services.countDocuments({ technicianEmail }),
          services.countDocuments({
            technicianEmail,
            approvalStatus: APPROVED_SERVICE_STATUS,
          }),
          bookings.countDocuments({
            "technician.email": technicianEmail,
            status: PENDING_BOOKING_STATUS,
          }),
        ]);

      res.json({ totalServices, approvedServices, pendingRequests });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

// GET /dashboard/admin/stats
dashboardRouter.get(
  "/admin/stats",
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      const db = await connectDB();
      const users = db.collection(USERS_COLLECTION);
      const services = db.collection("services");

      const [totalUsers, totalTechnicians, pendingServices] = await Promise.all(
        [
          users.countDocuments({}),
          users.countDocuments({ role: "technician" }),
          services.countDocuments({ approvalStatus: PENDING_SERVICE_STATUS }),
        ],
      );

      res.json({ totalUsers, totalTechnicians, pendingServices });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

export default dashboardRouter;
