const mongoose = require("mongoose");
const Notification = require("../models/Notification");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .populate("actor", "displayName email avatar title role reputationScore")
      .populate("target", "title slug status")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        notifications,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Notification id must be a valid MongoDB ObjectId",
        },
      });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Notification not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });

    return res.status(200).json({
      success: true,
      data: {
        message: "All notifications marked as read",
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
