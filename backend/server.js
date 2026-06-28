// Creates the HTTP server that Express and Socket.IO share.
const http = require("http");

// Loads validated/defaulted environment values from one shared config file.
const env = require("./config/env");
// Imports the configured Express app from app.js.
const app = require("./app");
// Imports the shared MongoDB connection function.
const { connectToDatabase } = require("./config/db");
// Imports the Socket.IO setup function.
const { configureSocket } = require("./config/socket");

// Uses the configured port, or falls back to 5000 for local development.
const PORT = env.port;

// Wraps the Express app in a Node HTTP server.
const server = http.createServer(app);
// Attaches Socket.IO to the same HTTP server and stores io on the app.
configureSocket(server, app);

// Starts database connection first, then starts listening for HTTP requests.
const startServer = async () => {
  try {
    // Connects to MongoDB using backend/config/db.js.
    await connectToDatabase();
  } catch (error) {
    // Logs DB connection failure without preventing the API from starting.
    console.error("MongoDB connection failed:");
    // Prints the actual MongoDB/Mongoose error message.
    console.error("- Error:", error.message);
    // Gives a helpful hint for common Atlas/network-related failures.
    if (error.message.includes("SSL") || error.message.includes("IP")) {
      console.error("- Tip: Check your Atlas IP Whitelist and your local network firewall.");
    }
  }

  // Starts the HTTP server and returns it so tests/scripts can close it.
  return server.listen(PORT, () => {
    // Confirms the API is running and shows the active port.
    console.log(`AQ Portal API listening on port ${PORT}`);
  });
};

// Starts the server only when this file is run directly with node.
if (require.main === module) {
  // Boots the API for normal local/deployed runtime.
  startServer();
}

// Exports the Express app for tests and tools like Supertest.
module.exports = app;
// Exports the startup function for controlled smoke tests and scripts.
module.exports.startServer = startServer;
