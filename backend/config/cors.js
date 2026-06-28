// Reads frontend origin and runtime mode from the shared environment config.
const env = require("./env");

// Origins that are allowed to call the API from a browser.
const allowedOrigins = new Set([
  // Primary frontend origin from backend/.env.
  env.clientOrigin,
  // Common local frontend ports for development.
  "http://localhost:3000",
  "http://localhost:3001",
  // Localhost variants used by browsers/tools.
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  // LAN addresses used during team/device testing.
  "http://192.168.55.103:3000",
  "http://192.168.55.103:3001",
]);

// CORS options reused by Express and Socket.IO.
const corsOptions = {
  // Decides whether a browser origin is allowed.
  origin: (origin, callback) => {
    // Allow requests without an Origin header, such as curl/Postman/server-to-server.
    if (!origin) {
      return callback(null, true);
    }

    // Allow known frontend origins.
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    // Be permissive during local development to avoid blocking LAN/dev tools.
    if (env.nodeEnv !== "production") {
      return callback(null, true);
    }

    // In production, reject unknown browser origins.
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  // Allows cookies/auth credentials to be sent by the frontend.
  credentials: true,
};

// Export both the full set and middleware options for reuse/testing.
module.exports = {
  allowedOrigins,
  corsOptions,
};
