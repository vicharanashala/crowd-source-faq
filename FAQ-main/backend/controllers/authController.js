const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register a new user
const register = async (req, res) => {
    try {
        const { name, email, password, title, avatar, bio } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required",
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists",
                error: "Email is already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            title: title || "Undergraduate Scholar",
            avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`,
            bio: bio || "",
            bookmarks: []
        });

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                id: user._id.toString(),
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                title: user.title,
                bio: user.bio,
                bookmarks: user.bookmarks || []
            },
        });

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};


// Login a user
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
                error: "Email and password are required"
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(400).json({
                message: "Invalid credentials",
                error: "Invalid email or password"
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: "Invalid credentials",
                error: "Invalid email or password"
            });
        }

        // Ban check — banned users never receive a fresh token
        if (user.isBanned) {
            return res.status(403).json({
                message: "Your account has been suspended.",
                reason: user.banReason || "",
                error: "Account suspended"
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id.toString(),
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar || "",
                title: user.title || "Undergraduate Scholar",
                bio: user.bio || "",
                bookmarks: user.bookmarks || []
            },
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Get current user profile
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found",
                error: "User not found"
            });
        }

        res.json({
            user: {
                id: user._id.toString(),
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar || "",
                title: user.title || "Undergraduate Scholar",
                bio: user.bio || "",
                bookmarks: user.bookmarks || []
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update user profile
const updateProfile = async (req, res) => {
    try {
        const { name, title, avatar, bio } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (title !== undefined) updates.title = title;
        if (avatar !== undefined) updates.avatar = avatar;
        if (bio !== undefined) updates.bio = bio;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found",
                error: "User not found"
            });
        }

        res.json({
            user: {
                id: user._id.toString(),
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar || "",
                title: user.title || "Undergraduate Scholar",
                bio: user.bio || "",
                bookmarks: user.bookmarks || []
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    register,
    login,
    getMe,
    updateProfile,
};