# FixMate — Backend API

REST API for **FixMate**, a repair-service marketplace where customers request repairs from verified technicians and pay after the job is completed.

**Frontend repository:** see [`https://github.com/sojibkhan567/fixmate-frontend`](https://github.com/sojibkhan567/fixmate-frontend)

## Purpose

Handles authentication (Better Auth), services, the booking lifecycle (request → accept → in progress → completed), Stripe payments, and admin approval of services.

## Live URL

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| API base URL | `https://your-api.example.com/api` _(replace with your deployed URL)_  |
| Frontend     | `https://your-frontend.example.com` _(replace with your deployed URL)_ |

## Admin credentials

| Email               | Password              |
| ------------------- | --------------------- |
| `admin@example.com` | `your-admin-password` |

> Replace with your real demo admin and use a throw-away password. The `role` field can't be set from the browser (`input: false` in the Better Auth config). To create an admin, register normally, then set `role: "admin"` on that user's document in MongoDB.

## Key features

- **Auth:** Better Auth with email and password, plus extra user fields `role`, `phone`, `area`, `bio`. Express middleware (`requireAuth`, `optionalAuth`, `requireRole`) protects routes.
- **Services:** public list of the latest approved and available services, and service details with technician info.
- **Bookings:**
  - The server builds each booking itself (it never trusts `status`, `paymentStatus` or `finalAmount` from the client).
  - A service can only have one booking in progress. It is "taken" while a booking is `requested`, `accepted` or `inprogress`, or `completed` but unpaid.
  - Customers can cancel a request while it is `requested`.
- **Technician workflow:** accept / reject → start work → complete with a final amount. Each step is an atomic update that checks the current status.
- **Stripe payments:** Checkout Session creation, webhook (source of truth), and success-page verification. Every payment is saved in a `payments` collection with a unique `stripeSessionId`.
- **Admin:** list all services and approve or reject any of them.

## API endpoints

| Method | Path                                           | Access     | Description                                                            |
| ------ | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `*`    | `/api/auth/*`                                  | Public     | Better Auth (sign-up, sign-in, session, sign-out)                      |
| GET    | `/api/services/featured`                       | Public     | 6 latest approved and available services                               |
| GET    | `/api/services/:id`                            | Public     | Service details (404 if not approved or unavailable)                   |
| GET    | `/api/bookings/status?serviceId=`              | Public     | `{ booked, mine }` for the Request Repair button                       |
| POST   | `/api/bookings`                                | Customer   | Create a repair request                                                |
| GET    | `/api/bookings/my`                             | Customer   | The customer's bookings                                                |
| PATCH  | `/api/bookings/:id/cancel`                     | Customer   | Cancel (only while `requested`)                                        |
| POST   | `/api/bookings/:id/checkout`                   | Customer   | Create a Stripe Checkout Session → `{ url }`                           |
| GET    | `/api/bookings/:id/verify-payment?session_id=` | Customer   | Confirm a payment after Stripe redirects back                          |
| GET    | `/api/bookings/technician`                     | Technician | Bookings assigned to the technician                                    |
| PATCH  | `/api/bookings/:id/status`                     | Technician | `accepted` · `rejected` · `inprogress` · `completed` (+ `finalAmount`) |
| POST   | `/api/stripe/webhook`                          | Stripe     | Marks bookings paid, records the payment                               |
| GET    | `/api/admin/services`                          | Admin      | All services, all technicians                                          |
| PATCH  | `/api/admin/services/:id/approval`             | Admin      | `approved` or `rejected`                                               |

## Data collections

- `services`: `title`, `image`, `category`, `basePrice`, `serviceMode`, `serviceArea`, `technicianName`, `technicianEmail`, `approvalStatus`, `isAvailable`, `createdAt`
- `bookings`: `serviceId`, `service{title,image,category}`, `basePrice`, `technician{name,email}`, `customer{id,name,email}`, `phone`, `address`, `preferredDate`, `problemDescription`, `finalAmount`, `status`, `paymentStatus`, timestamps
- `payments`: `bookingId`, `serviceTitle`, `customerName/Email`, `technicianName/Email`, `amount`, `currency`, `transactionId`, `stripeSessionId` (unique), `paymentStatus`, `paidAt`
- Better Auth collections: `user` (with `role`, `phone`, `area`, `bio`), `session`, `account`

## npm packages used

| Package           | Used for                                                   |
| ----------------- | ---------------------------------------------------------- |
| `express`         | HTTP server and routing                                    |
| `mongodb`         | Database driver                                            |
| `better-auth`     | Authentication (`better-auth/node`, MongoDB adapter)       |
| `stripe`          | Checkout Sessions, webhook signature check, session lookup |
| `cors`            | Lets the frontend call the API with cookies                |
| `dotenv`          | Loads environment variables                                |
| `nodemon` _(dev)_ | Auto-restart during development                            |

## Getting started

```bash
npm install express mongodb better-auth stripe cors dotenv
npm install -D nodemon
```

**Environment variables (`.env`)**

```env
PORT=5000
MONGODB_URI=mongodb+srv://...
CLIENT_URL=http://localhost:3000

BETTER_AUTH_SECRET=<long random string>
BETTER_AUTH_URL=http://localhost:5000

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=usd
BDT_PER_STRIPE_UNIT=120
```

**Mount the routes in `app.js`**

```js
// Webhook BEFORE express.json() (Stripe needs the raw body)
app.use("/api/stripe/webhook", require("./routes/webhook.routes"));
app.all("/api/auth/*splat", toNodeHandler(auth)); // Better Auth (Express v5; v4 uses "/api/auth/*")
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.use("/api/services", require("./routes/services.routes"));
app.use("/api/bookings", require("./routes/bookings.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
```

> Register the CORS middleware before the Better Auth handler if your frontend is on a different origin.

**Recommended index** (one active booking per service):

```js
db.bookings.createIndex(
  { serviceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["requested", "accepted", "inprogress"] },
    },
  },
);
```

**Test Stripe locally**

```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
# Test card: 4242 4242 4242 4242, any future expiry, any CVC
```

> Stripe can't charge BDT. Set `STRIPE_CURRENCY` and `BDT_PER_STRIPE_UNIT` (how many ৳ equal one unit) to convert prices at checkout.
