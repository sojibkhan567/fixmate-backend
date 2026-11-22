/*
 * payments collection
 * {
 *   _id: ObjectId (auto),
 *   bookingId: String,            // _id of the paid booking
 *   serviceTitle: String,         // copied from the booking
 *   customerName, customerEmail,  // who paid
 *   technicianName, technicianEmail, // who earned it
 *   amount: Number,               // paid amount (= booking.finalAmount)
 *   currency: String,             // 'usd'
 *   transactionId: String,        // Stripe payment_intent id
 *   stripeSessionId: String,      // Stripe Checkout Session id (unique)
 *   paymentStatus: 'paid',
 *   paidAt: Date
 * }
 */

import { ObjectId } from "mongodb";
import { connectDB } from "../config/db.js";

let indexed = false;
async function ensureIndexes(db) {
  if (indexed) return;
  const payments = db.collection("payments");
  await payments.createIndex({ stripeSessionId: 1 }, { unique: true }); // no duplicate payments
  await payments.createIndex({ bookingId: 1 });
  await payments.createIndex({ technicianEmail: 1 });
  indexed = true;
}

/**
 * Records a successful Stripe Checkout payment and marks the booking paid.
 * Idempotent — the webhook and the success-page verification can both call it:
 *   - the payment row is upserted on the unique stripeSessionId (never duplicated)
 *   - the booking only changes while it is still "unpaid"
 * Returns true if this call changed the booking.
 */
export async function markBookingPaid(bookingId, session) {
  if (!ObjectId.isValid(bookingId)) return false;

  const db = await connectDB();
  await ensureIndexes(db);

  const booking = await db
    .collection("bookings")
    .findOne({ _id: new ObjectId(bookingId) });
  if (!booking) return false;

  const paidAt = new Date();
  const transactionId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // 1) payment record (insert once per Checkout Session)
  await db.collection("payments").updateOne(
    { stripeSessionId: session.id },
    {
      $setOnInsert: {
        bookingId: String(booking._id),
        serviceTitle: booking.service?.title ?? null,
        customerName: booking.customer?.name ?? null,
        customerEmail: booking.customer?.email ?? null,
        technicianName: booking.technician?.name ?? null,
        technicianEmail: booking.technician?.email ?? null,
        amount: Number(booking.finalAmount),
        currency: session.currency ?? "usd",
        transactionId,
        stripeSessionId: session.id,
        paymentStatus: "paid",
        paidAt,
      },
    },
    { upsert: true },
  );

  // 2) booking → paid (only if still unpaid)
  const result = await db.collection("bookings").updateOne(
    { _id: booking._id, paymentStatus: "unpaid" },
    {
      $set: {
        paymentStatus: "paid",
        paidAt,
        stripeSessionId: session.id,
        stripePaymentIntentId: transactionId,
        updatedAt: paidAt,
      },
    },
  );
  return result.modifiedCount === 1;
}
