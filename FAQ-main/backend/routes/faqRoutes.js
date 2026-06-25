const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const {
    createFAQ,
    getFAQs,
    getFAQById,
    searchFAQs
} = require("../controllers/faqController");

router.post("/", protect, adminOnly, createFAQ);
router.get("/", getFAQs);
router.get("/search", searchFAQs);
router.get("/:id", getFAQById);

module.exports = router;