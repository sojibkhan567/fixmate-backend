import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "../utils/ApiError.js";

// export const checkAuthenticatedUser = async (req, res, next) => {
//   const token = req.headers.authorization;

//   if (!token) {
//     throw new ApiError(401, "Unauthorized: No token provided");
//   }

//   const parseToken = token.split(" ")[1]; // Assuming the token is in the format "Bearer <token>"

//   //console.log({ parseToken });

//   try {
//     const JWKS = createRemoteJWKSet(
//       new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
//     );
//     const { payload } = await jwtVerify(parseToken, JWKS, {
//       issuer: process.env.CLIENT_URL, // Should match your JWT issuer, which is the BASE_URL
//       audience: process.env.CLIENT_URL, // Should match your JWT audience, which is the BASE_URL by default
//     });
//     // console.log(payload, "payload");
//     req.user = {
//       name: payload.name,
//       email: payload.email,
//       role: payload.role,
//       id: payload.id,
//     };
//   } catch (e) {
//     throw new ApiError(401, "Unauthorized: Invalid token");
//   }
//   next();
// };

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

export const checkAuthenticatedUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token required.",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };

    next();
  } catch (error) {
    console.error("JWT error:", error.code, error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
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
