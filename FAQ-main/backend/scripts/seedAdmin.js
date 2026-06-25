/**
 * seedAdmin.js
 * Run: node backend/scripts/seedAdmin.js
 *
 * Creates a default admin account in MongoDB.
 * Safe to run multiple times — skips if the email already exists.
 *
 * Default credentials (change after first login):
 *   Email:    admin@iitrpr.ac.in
 *   Password: Admin@1234
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ADMIN = {
    name: "Admin",
    email: "admin@iitrpr.ac.in",
    password: "Admin@1234",
    role: "admin",
    title: "Platform Administrator",
    bio: "Vicharanashala admin account.",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=admin",
};

async function seed() {
    if (!process.env.MONGO_URI || process.env.MONGO_URI === "your_mongo_uri") {
        console.error("❌  MONGO_URI is not set in backend/.env");
        console.error("    Add: MONGO_URI=your_connection_string");
        process.exit(1);
    }

    console.log("🔌  Connecting to MongoDB…");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅  Connected.\n");

    const User = require("../models/User");

    const existing = await User.findOne({ email: ADMIN.email.toLowerCase() });
    if (existing) {
        console.log(`⚠   Admin account already exists (${ADMIN.email}).`);
        if (existing.role !== "admin") {
            await User.findByIdAndUpdate(existing._id, { role: "admin" });
            console.log("    Role was not 'admin' — updated to admin.");
        } else {
            console.log("    Nothing to do.");
        }
        await mongoose.disconnect();
        process.exit(0);
    }

    const hashed = await bcrypt.hash(ADMIN.password, 10);

    await User.create({
        name: ADMIN.name,
        email: ADMIN.email.toLowerCase(),
        password: hashed,
        role: ADMIN.role,
        title: ADMIN.title,
        bio: ADMIN.bio,
        avatar: ADMIN.avatar,
        bookmarks: [],
    });

    console.log("✅  Admin account created!\n");
    console.log("    Email   :", ADMIN.email);
    console.log("    Password:", ADMIN.password);
    console.log("\n⚠   Change this password after your first login.\n");

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌  Seed failed:", err.message);
    process.exit(1);
});
