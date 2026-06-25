const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "BAN_USER",
        "UNBAN_USER",
        "ANSWER_DIRECT_QUESTION",
        "DISMISS_DIRECT_QUESTION",
        "CONVERT_TO_FAQ",
        "PROMOTE_REPETITION_CLUSTER",
        "DISMISS_REPETITION_CLUSTER",
        "DELETE_POST",
        "CREATE_FAQ",
      ],
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    details: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
