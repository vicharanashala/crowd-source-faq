const mongoose = require("mongoose");
const dns = require("dns");

// Use Google DNS for SRV record resolution (fixes ECONNREFUSED on some Windows setups)
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri || uri === "your_mongo_uri") {
        console.log("⚠ No MONGO_URI configured. Backend DB features will be limited.");
        console.log("  Set MONGO_URI in backend/.env to connect to MongoDB.");
        return;
    }

    try {
        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,  // Fail fast if DB unreachable
            family: 4,  // Force IPv4
        });

        console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("✗ MongoDB Connection Failed:", error.message);
        console.log("  Backend will start but DB operations will fail.");
        console.log("  Fix: ensure MongoDB is running or update MONGO_URI in .env");
        // Don't exit — let the server run for health checks and non-DB routes
    }
};

module.exports = connectDB;