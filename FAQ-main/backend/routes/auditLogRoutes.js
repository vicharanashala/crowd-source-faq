const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const { getAuditLogs } = require("../controllers/auditLogController");

// Read-only — logs are never edited via API
router.get("/", protect, adminOnly, getAuditLogs);

module.exports = router;
