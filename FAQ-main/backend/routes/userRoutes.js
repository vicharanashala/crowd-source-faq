const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const { getUsers, getUserById, banUser, unbanUser } = require("../controllers/userController");

router.get("/", protect, adminOnly, getUsers);
router.get("/:id", protect, adminOnly, getUserById);
router.put("/:id/ban", protect, adminOnly, banUser);
router.put("/:id/unban", protect, adminOnly, unbanUser);

module.exports = router;
