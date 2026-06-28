const express = require("express");

const {
  updateMe,
  getUserById,
  getUserQuestions,
  getUserAnswers,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.patch("/me", protect, updateMe);
router.get("/:id/questions", getUserQuestions);
router.get("/:id/answers", getUserAnswers);
router.get("/:id", getUserById);

module.exports = router;
