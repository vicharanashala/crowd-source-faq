const express = require("express");
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getNotifications);
router.patch("/mark-all-read", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

module.exports = router;
