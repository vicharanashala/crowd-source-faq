// Loads variables from backend/.env into process.env.
const dotenv = require("dotenv");
// Builds a reliable path to backend/.env from this config folder.
const path = require("path");

// Load environment values before any other config module reads them.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Centralized environment config used by the rest of the backend.
const env = {
  // Frontend origin allowed to call this API with browser credentials.
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3001",
  // Secret used to sign and verify JWT auth tokens.
  jwtSecret: process.env.JWT_SECRET,
  // MongoDB connection string for local MongoDB or MongoDB Atlas.
  mongodbUri: process.env.MONGODB_URI,
  // Current runtime mode, such as development, test, or production.
  nodeEnv: process.env.NODE_ENV || "development",
  // Gemini API key used for embeddings, FAQ assistant answers, and AI drafts.
  geminiApiKey: process.env.GEMINI_API_KEY,
  // HTTP port used by server.js.
  port: process.env.PORT || 5000,
};

// Export one shared config object so app code does not read process.env directly.
module.exports = env;
