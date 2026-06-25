const User = require("../models/User");
const Post = require("../models/Post");
const { logAction } = require("../utils/auditLog");

/**
 * GET /api/users
 * Admin-only. Supports ?search=, ?role=, ?banned=true|false filters.
 */
const getUsers = async (req, res) => {
    try {
        const filter = {};

        if (req.query.search) {
            const re = new RegExp(req.query.search, "i");
            filter.$or = [{ name: re }, { email: re }];
        }
        if (req.query.role) {
            filter.role = req.query.role;
        }
        if (req.query.banned !== undefined) {
            filter.isBanned = req.query.banned === "true";
        }

        const users = await User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * GET /api/users/:id
 * Admin-only. Returns user (no password) plus post count.
 */
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        const postCount = await Post.countDocuments({ "author.id": req.params.id });

        res.status(200).json({ ...user.toObject(), postCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * PUT /api/users/:id/ban
 * Admin-only. Body: { reason }
 */
const banUser = async (req, res) => {
    try {
        const { reason } = req.body;

        // Guard: cannot ban yourself
        if (req.params.id === req.user.id) {
            return res.status(403).json({ message: "Cannot ban your own account" });
        }

        const target = await User.findById(req.params.id).select("role name email isBanned");
        if (!target) return res.status(404).json({ message: "User not found" });

        // Guard: cannot ban another admin
        if (target.role === "admin") {
            return res.status(403).json({ message: "Cannot ban an admin account" });
        }

        if (target.isBanned) {
            return res.status(400).json({ message: "User is already banned" });
        }

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            {
                isBanned: true,
                banReason: reason || "",
                bannedAt: new Date(),
                bannedBy: req.user.id,
            },
            { new: true }
        ).select("-password");

        logAction({
            action: "BAN_USER",
            actorId: req.user.id,
            actorName: req.user.name || "",
            targetType: "User",
            targetId: req.params.id,
            details: `Banned ${target.name} (${target.email}). Reason: ${reason || "No reason given"}`,
        });

        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * PUT /api/users/:id/unban
 * Admin-only.
 */
const unbanUser = async (req, res) => {
    try {
        const target = await User.findById(req.params.id).select("name email isBanned");
        if (!target) return res.status(404).json({ message: "User not found" });

        if (!target.isBanned) {
            return res.status(400).json({ message: "User is not currently banned" });
        }

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { isBanned: false, banReason: "", bannedAt: null, bannedBy: "" },
            { new: true }
        ).select("-password");

        logAction({
            action: "UNBAN_USER",
            actorId: req.user.id,
            actorName: req.user.name || "",
            targetType: "User",
            targetId: req.params.id,
            details: `Unbanned ${target.name} (${target.email})`,
        });

        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getUsers, getUserById, banUser, unbanUser };
