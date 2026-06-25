const AuditLog = require("../models/AuditLog");

/**
 * Non-blocking helper to record an admin action in the audit log.
 * Never throws — logs the error and returns silently so it never
 * blocks the actual action endpoint.
 */
const logAction = async ({ action, actorId, actorName, targetType, targetId, details }) => {
    try {
        await AuditLog.create({ action, actorId, actorName: actorName || "", targetType: targetType || "", targetId: targetId || "", details: details || "" });
    } catch (err) {
        console.error("Audit log write failed (non-blocking):", err.message);
    }
};

module.exports = { logAction };
