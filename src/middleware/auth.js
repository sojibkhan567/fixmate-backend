import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "../utils/ApiError.js"; // your existing ApiError

/**
 * Where Better Auth runs (your Next.js app), e.g. https://fixmate.vercel.app
 * - must be EXACTLY the Better Auth baseURL (BETTER_AUTH_URL on the Next.js project):
 *   same https/http, same www / non-www, no trailing slash
 * - AUTH_URL is preferred; CLIENT_URL keeps working as a fallback
 */
const AUTH_URL = (process.env.AUTH_URL || process.env.CLIENT_URL || "").replace(
  /\/+$/,
  "",
);

if (!AUTH_URL) {
  throw new Error(
    "Set AUTH_URL (or CLIENT_URL) to the URL where Better Auth runs",
  );
}

// Created ONCE at startup (not per request) so the signing keys are cached
const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`), {
  timeoutDuration: 8000,
  cooldownDuration: 30000,
});

export const checkAuthenticatedUser = async (req, res, next) => {
  const header = req.headers.authorization;

  // Use next(err), not throw: an async middleware that throws never reaches
  // Express 4's error handler, so the request hangs / crashes instead of returning 401
  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(401, "Unauthorized: No token provided"));
  }

  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: AUTH_URL, // Better Auth's default issuer = its baseURL
      audience: AUTH_URL, // Better Auth's default audience = its baseURL
    });

    req.user = {
      name: payload.name,
      email: payload.email,
      role: payload.role,
      id: payload.id,
    };
    return next();
  } catch (e) {
    //console.error("JWT verification failed:", e.code || e.name, "-", e.message);
    return next(new ApiError(401, "Unauthorized: Invalid token"));
  }
};

export const verifyRole = (roles) => {
  return (req, res, next) => {
    // Authenticated user role from the token
    const role = req.user?.role;

    if (roles.includes(role)) {
      next();
    } else {
      throw new ApiError(
        403,
        "Forbidden: You do not have the required role to access this resource",
      );
    }
  };
};
