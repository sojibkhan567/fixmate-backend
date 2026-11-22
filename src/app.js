import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { markBookingPaid } from "./utils/payment.js";
import { stripe } from "./config/stripe.js";

// Builds the Express app. Does not start listening (see src/index.js).

const app = express();
// Only the frontend origin may call this API from a browser.
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Parse JSON request bodies.
app.use(express.json());

/**
 * POST /api/stripe/webhook
 * Stripe → your server. The source of truth for "paid".
 * Needs the RAW body, so mount this BEFORE express.json():
 */
app.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Stripe webhook signature failed:", err.message);
    return res.status(400).send("Invalid signature");
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        await markBookingPaid(session.metadata?.bookingId, session);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Webhook handler failed"); // Stripe will retry
  }
});

app.use("/", routes);

// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;
