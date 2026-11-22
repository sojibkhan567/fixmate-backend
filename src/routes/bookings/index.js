import { Router } from "express";
import { checkAuthenticatedUser, verifyRole } from "../../middleware/auth.js";
import { ObjectId } from "mongodb";
import { bookingCollection, servicesCollection } from "../../config/db.js";
import { stripe } from "../../config/stripe.js";
import { markBookingPaid } from "../../utils/payment.js";

const bookingRouter = Router();
const ACTIVE_STATUSES = ["requested", "accepted", "in-progress"];

/**
 * POST /bookings
 * Customer only. Body: { serviceId, phone, address, preferredDate, problemDescription }
 * 400 invalid · 404 service unavailable · 409 duplicate active request · 201 created
 */
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

    // Check existing booking
    const existingBooking = await bookingCollection.findOne({
      serviceId: String(serviceId),
      "customer.email": req.user.email,
      // Only block active bookings
      status: {
        $in: ["pending", "confirmed", "inprogress"],
      },
    });
    if (existingBooking) {
      return res.status(409).json({ message: "Already booking this service." });
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

/**
 * GET /api/bookings/status?serviceId=...
 * Public (signed-in is optional). Checks the bookings collection directly:
 *   booked → ANY customer has a requested / accepted / inprogress booking for the service
 *   mine   → that booking belongs to the signed-in customer
 */
bookingRouter.get("/status", checkAuthenticatedUser, async (req, res) => {
  try {
    const { serviceId } = req.query;
    if (!serviceId)
      return res.status(400).json({ error: "serviceId is required" });

    const active = await bookingCollection.findOne(
      { serviceId: String(serviceId), status: { $in: ACTIVE_STATUSES } },
      { projection: { customer: 1 } },
    );
    //console.log(active);
    res.json({
      booked: Boolean(active),
      mine: Boolean(
        active && req.user && active.customer?.email === req.user.email,
      ),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/**
 * GET /bookings/my
 * Customer only. All bookings of the logged-in customer, newest first.
 */
bookingRouter.get(
  "/my",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const bookings = await bookingCollection
        .find({ "customer.email": req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(bookings);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

/**
 * PATCH /api/bookings/:id/cancel
 * Customer only, own booking, only while status === "requested".
 * Single atomic update so it can't race with the technician accepting.
 */
bookingRouter.patch(
  "/:id/cancel",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(404).json({ error: "Booking not found" });

      const result = await bookingCollection.updateOne(
        {
          _id: new ObjectId(id),
          "customer.email": req.user.email,
          status: "requested",
        },
        { $set: { status: "cancelled", updatedAt: new Date() } },
      );

      if (result.matchedCount === 0) {
        const exists = await bookingCollection.findOne(
          { _id: new ObjectId(id), "customer.email": req.user.email },
          { projection: { _id: 1 } },
        );
        return exists
          ? res
              .status(409)
              .json({ error: "Only requested bookings can be cancelled" })
          : res.status(404).json({ error: "Booking not found" });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

/**
 * POST /api/bookings/:id/checkout
 * Customer only. Creates a Stripe Checkout Session for a completed, unpaid booking.
 * → { url }
 * The booking is marked paid by the Stripe webhook (and by verify-payment below).
 * ৳ equal 1 unit of STRIPE_CURRENCY (e.g. 120 for USD). Default 1.
 */

bookingRouter.post(
  "/:id/checkout",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(404).json({ error: "Booking not found" });

      const booking = await bookingCollection.findOne({
        _id: new ObjectId(id),
        "customer.email": req.user.email,
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      if (booking.status !== "completed" || booking.paymentStatus !== "unpaid")
        return res
          .status(409)
          .json({ error: "This booking can't be paid right now" });

      const amount = Number(booking.finalAmount);
      if (!amount || amount <= 0)
        return res
          .status(409)
          .json({ error: "The final amount hasn't been set yet" });

      // Convert ৳ → Stripe currency (if needed), then to the smallest unit (cents)
      const rate = Number(process.env.BDT_PER_STRIPE_UNIT) || 1;
      const unitAmount = Math.round((amount / rate) * 100);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: req.user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: process.env.STRIPE_CURRENCY || "usd",
              unit_amount: unitAmount,
              product_data: { name: booking.service.title },
            },
          },
        ],
        metadata: { bookingId: String(booking._id), customerId: req.user.id },
        success_url: `${process.env.CLIENT_URL}/dashboard/customer/bookings?payment=success&booking=${booking._id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard/customer/bookings?payment=cancelled`,
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't start payment" });
    }
  },
);

/**
 * GET /api/bookings/:id/verify-payment?session_id=cs_...
 * Customer only. Called when Stripe sends the customer back. Asks Stripe directly whether the
 * session was paid and marks the booking paid (idempotent), so the page is correct even if the
 * webhook is a moment late. → { paid: boolean }
 */
bookingRouter.get(
  "/:id/verify-payment",
  checkAuthenticatedUser,
  verifyRole(["customer"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { session_id } = req.query;
      if (!ObjectId.isValid(id) || !session_id)
        return res.status(400).json({ error: "Invalid request" });

      const booking = await bookingCollection.findOne({
        _id: new ObjectId(id),
        "customer.email": req.user.email,
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const session = await stripe.checkout.sessions.retrieve(
        String(session_id),
      );
      if (session.metadata?.bookingId !== String(booking._id))
        return res
          .status(400)
          .json({ error: "Session doesn't match this booking" });

      if (session.payment_status === "paid")
        await markBookingPaid(String(booking._id), session);
      res.json({ paid: session.payment_status === "paid" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't verify payment" });
    }
  },
);

export default bookingRouter;
