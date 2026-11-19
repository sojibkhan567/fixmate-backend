import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Builds the Express app. Does not start listening (see src/index.js).

const app = express();
// Only the frontend origin may call this API from a browser.
app.use(cors({ origin: env.CLIENT_URL }));

// Parse JSON request bodies.
app.use(express.json());

app.use("/", routes);

// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;
