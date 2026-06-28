// Socket.IO provides real-time browser/server communication.
const { Server } = require("socket.io");

// Reuse the same CORS rules as the REST API.
const { corsOptions } = require("./cors");

const EVENT_ALIASES = {
  "answer:created": ["new_answer"],
  "answer:accepted": ["answer_accepted"],
  "answer:official_created": ["official_answer_created"],
  "answer:updated": ["new_answer"],
};

const createSocketEventBridge = (io) => ({
  emit(event, payload) {
    io.emit(event, payload);
    (EVENT_ALIASES[event] || []).forEach((alias) => io.emit(alias, payload));
  },
  to(room) {
    const emitter = io.to(room);
    return {
      emit(event, payload) {
        emitter.emit(event, payload);
        (EVENT_ALIASES[event] || []).forEach((alias) =>
          emitter.emit(alias, payload)
        );
      },
    };
  },
});

// Attaches Socket.IO to the HTTP server and stores it on the Express app.
const configureSocket = (server, app) => {
  // Create a Socket.IO server on top of the existing HTTP server.
  const io = new Server(server, {
    cors: corsOptions,
  });

  // Make io available inside controllers through req.app.get("io").
  app.set("io", createSocketEventBridge(io));

  // Runs whenever a browser/client opens a socket connection.
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Lets a user subscribe to updates for one question detail page.
    socket.on("join_question", (questionId) => {
      socket.join(`question_${questionId}`);
      console.log(`User ${socket.id} joined room for question_${questionId}`);
    });

    // Runs when the browser closes, refreshes, or loses connection.
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Return io for tests or future startup integrations.
  return io;
};

// Export socket setup function for server.js.
module.exports = {
  configureSocket,
  createSocketEventBridge,
};
