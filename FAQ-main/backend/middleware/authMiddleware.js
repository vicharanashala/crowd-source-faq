const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect middleware — verifies JWT and performs a lightweight DB check.
 * Re-checks ban status on every authenticated request so a banned user
 * cannot continue using a valid token mid-session.
 */
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        try {
            token = req.headers.authorization.split(" ")[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Lightweight DB check — only fetch the fields we need
            const dbUser = await User.findById(decoded.id).select("role isBanned banReason");

            if (!dbUser) {
                return res.status(401).json({ message: "Not authorized" });
            }

            if (dbUser.isBanned) {
                return res.status(403).json({
                    message: "Your account has been suspended.",
                    reason: dbUser.banReason || "",
                });
            }

            // Attach decoded token payload but refresh role from DB in case it changed
            req.user = { ...decoded, role: dbUser.role };

            next();
        } catch (error) {
            return res.status(401).json({ message: "Not authorized" });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }
};

module.exports = protect;
