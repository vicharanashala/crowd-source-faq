const express = require("express");
const router = express.Router();

const {
    register,
    login,
    getMe,
    updateProfile
} = require("../controllers/authController");

const protect = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/signup", register);  // Alias for frontend compatibility
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);

module.exports = router;