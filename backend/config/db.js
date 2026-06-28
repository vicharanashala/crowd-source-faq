// Imports Mongoose for MongoDB connection management.
const mongoose = require("mongoose");

// Reads MongoDB URI from the centralized environment config.
const env = require("./env");

// Tracks connection state for the /api/v1/health endpoint.
let databaseStatus = "disconnected";
const LOCAL_FALLBACK_URI = "mongodb://localhost:27017/CrowdFAQ";

// Returns the latest known database connection status.
const getDatabaseStatus = () => databaseStatus;

// Builds connection options differently for local MongoDB vs Atlas.
const buildMongoOptions = (uri) => {
  // Local MongoDB should not use Atlas-only TLS options.
  const isLocalMongo =
    uri.includes("localhost") || uri.includes("127.0.0.1");

  // Fail quickly when MongoDB is unreachable.
  const options = {
    serverSelectionTimeoutMS: 10000,
  };

  // Atlas connections need retry/write settings and TLS handling.
  if (!isLocalMongo) {
    options.tls = true;
    options.tlsAllowInvalidCertificates = true;
    options.retryWrites = true;
    options.w = "majority";
  }

  return options;
};

const isLocalMongoUri = (uri) =>
  uri.includes("localhost") || uri.includes("127.0.0.1");

const connectWithUri = async (uri) => {
  await mongoose.connect(uri, buildMongoOptions(uri));
  databaseStatus = "connected";
  console.log(
    `Database connected: ${mongoose.connection.host}/${mongoose.connection.name}`
  );
  return mongoose.connection;
};

// Connects to MongoDB and updates health-check status.
const connectToDatabase = async (uri = env.mongodbUri) => {
  // Allow the API to boot without DB config, but report that clearly.
  if (!uri) {
    databaseStatus = "not_configured";
    return null;
  }

  try {
    return await connectWithUri(uri);
  } catch (error) {
    const shouldTryLocalFallback =
      !isLocalMongoUri(uri) && uri !== LOCAL_FALLBACK_URI;

    if (shouldTryLocalFallback) {
      console.warn(
        "Primary database connection failed. Falling back to local MongoDB."
      );

      try {
        return await connectWithUri(LOCAL_FALLBACK_URI);
      } catch (fallbackError) {
        databaseStatus = "connection_failed";
        console.log(
          "Database not connected - check Atlas or local MongoDB is running."
        );
        throw fallbackError;
      }
    }

    databaseStatus = "connection_failed";
    console.log("Database not connected - check MongoDB is running or not!");
    throw error;
  }
};

// Export connection helpers for server startup and health routes.
module.exports = {
  connectToDatabase,
  getDatabaseStatus,
};
