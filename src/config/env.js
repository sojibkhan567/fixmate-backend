import "dotenv/config";

// Central place for environment variables.
// Other files import `env` from here instead of reading process.env directly.

const DB_URI = process.env.DB_URI;

if (!DB_URI) {
  throw new Error(
    "Missing required environment variable: DB_URI. Copy .env.example to .env and fill in your MongoDB connection string.",
  );
}

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  DB_URI,
  // Frontend origin allowed by CORS.
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
};
