const hasRole = (user, roles) => user && roles.includes(user.role);

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Not authorized to access this route",
      },
    });
  }

  if (!hasRole(req.user, ["admin"])) {
    return res.status(403).json({
      success: false,
      error: {
        message: "Admin access required",
      },
    });
  }

  return next();
};

const requireModeratorOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Not authorized to access this route",
      },
    });
  }

  if (!hasRole(req.user, ["moderator", "admin"])) {
    return res.status(403).json({
      success: false,
      error: {
        message: "Moderator or admin access required",
      },
    });
  }

  return next();
};

module.exports = {
  requireAdmin,
  requireModeratorOrAdmin,
};
