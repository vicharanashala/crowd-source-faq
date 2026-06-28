const express = require("express");

const {
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  getAdminQuestions,
  updateQuestionStatus,
  deleteQuestion,
  getAdminAnswers,
  updateAnswerOfficialStatus,
  deleteAnswer,
  getAdminReports,
  updateReportStatus,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const {
  requireAdmin,
  requireModeratorOrAdmin,
} = require("../middleware/adminMiddleware");

const router = express.Router();

router.use(protect);
router.use(requireModeratorOrAdmin);

router.get("/stats", getAdminStats);
router.get("/users", getAdminUsers);
router.patch("/users/:id/role", requireAdmin, updateUserRole);
router.get("/questions", getAdminQuestions);
router.patch("/questions/:id/status", updateQuestionStatus);
router.delete("/questions/:id", requireAdmin, deleteQuestion);
router.get("/answers", getAdminAnswers);
router.patch("/answers/:id/official", updateAnswerOfficialStatus);
router.delete("/answers/:id", requireAdmin, deleteAnswer);
router.get("/reports", getAdminReports);
router.patch("/reports/:id", updateReportStatus);

module.exports = router;
