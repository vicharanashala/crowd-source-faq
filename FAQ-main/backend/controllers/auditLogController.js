const AuditLog = require("../models/AuditLog");

/**
 * GET /api/audit-logs
 * Admin-only. Paginated, sorted newest-first. Optional ?action= filter.
 */
const getAuditLogs = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        const filter = {};
        if (req.query.action) {
            filter.action = req.query.action;
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            AuditLog.countDocuments(filter),
        ]);

        res.status(200).json({ logs, total });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getAuditLogs };
