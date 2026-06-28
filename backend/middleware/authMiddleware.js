const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getTokenFromRequest = (req) => {
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
};

// Protect routes by verifying a JWT token from cookie or Authorization header.
const protect = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      const error = new Error("Not authorized to access this route");
      error.statusCode = 401;
      throw error;
    }

    if (!process.env.JWT_SECRET) {
      const error = new Error("JWT secret is not configured");
      error.statusCode = 500;
      throw error;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    if (req.user.isSuspended) {
      const error = new Error("User account is suspended");
      error.statusCode = 403;
      throw error;
    }

    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      error.statusCode = 401;
      error.message = "Not authorized to access this route";
    }

    return next(error);
  }
};

// Authorize by role; must be used after protect middleware.
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      const error = new Error("Not authorized to access this route");
      error.statusCode = 401;
      return next(error);
    }

    if (!roles.includes(req.user.role)) {
      const error = new Error(
        `User role '${req.user.role}' is not authorized to access this route`
      );
      error.statusCode = 403;
      return next(error);
    }

    return next();
  };
};

const optionalProtect = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (token && process.env.JWT_SECRET) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch (err) {
    // Ignore errors for optional authentication
  }
  return next();
};

module.exports = { protect, authorize, optionalProtect };
