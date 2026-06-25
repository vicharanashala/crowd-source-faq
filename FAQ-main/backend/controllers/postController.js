const Post = require("../models/Post");
const User = require("../models/User");

// Create a new post
const createPost = async (req, res) => {
    try {
        const { title, description, category, intro, structuredApproach, image, imageAlt } = req.body;

        if (!title || !category) {
            return res.status(400).json({ message: "Title and category are required" });
        }

        // Get full user info for the author field
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const postId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

        const post = await Post.create({
            id: postId,
            title,
            description: description || intro || "",
            intro: intro || description || "",
            structuredApproach: structuredApproach || {
                title: "The Structured Approach",
                description: "",
                bullets: [],
                proTip: ""
            },
            category: category.toUpperCase(),
            author: {
                id: user._id.toString(),
                name: user.name,
                title: user.title || "Undergraduate Scholar",
                avatar: user.avatar || ""
            },
            timestamp: "Just now",
            image: image || "",
            imageAlt: imageAlt || title,
            upvotes: 1,
            views: "1",
            commentsCount: 0,
            comments: [],
            upvotedBy: [user._id.toString()],
            downvotedBy: [],
            relatedQuestions: []
        });

        res.status(201).json(post);

        // Feature 2 — fire-and-forget repetition check (never blocks post creation)
        const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
        fetch(`${AI_SERVICE_URL}/check-repetition`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                post_id: post.id || post._id.toString(),
                title: post.title,
                intro: post.intro || post.description || ""
            })
        }).catch((err) => console.error("check-repetition call failed (non-blocking):", err.message));

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Get all posts with filtering and sorting
const getPosts = async (req, res) => {
    try {
        let query = {};
        const { category, search, sort, myQuestions, bookmarked } = req.query;

        if (category) {
            query.category = category.toUpperCase();
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { title: searchRegex },
                { intro: searchRegex },
                { description: searchRegex }
            ];
        }

        let sortOption = { upvotes: -1 }; // default: hot/best
        if (sort === 'new') {
            sortOption = { createdAt: -1 };
        } else if (sort === 'views') {
            sortOption = { views: -1 };
        }

        let posts = await Post.find(query).sort(sortOption);

        // Handle auth-specific filters
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let currentUser = null;

        if (token) {
            try {
                const jwt = require("jsonwebtoken");
                currentUser = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {}
        }

        if (currentUser) {
            if (myQuestions) {
                posts = posts.filter(p => {
                    const authorId = p.author?.id || (p.author?._id ? p.author._id.toString() : "");
                    return authorId === currentUser.id;
                });
            }
            if (bookmarked) {
                const dbUser = await User.findById(currentUser.id);
                if (dbUser) {
                    const userBookmarks = dbUser.bookmarks || [];
                    posts = posts.filter(p => userBookmarks.includes(p.id));
                }
            }

            // Add user-specific state to each post
            const dbUser = await User.findById(currentUser.id);
            posts = posts.map(p => {
                const postObj = p.toObject ? p.toObject() : p;
                let voted = null;
                if (postObj.upvotedBy?.includes(currentUser.id)) voted = 'up';
                if (postObj.downvotedBy?.includes(currentUser.id)) voted = 'down';
                return {
                    ...postObj,
                    voted,
                    bookmarked: dbUser?.bookmarks?.includes(postObj.id) || false
                };
            });
        } else {
            posts = posts.map(p => p.toObject ? p.toObject() : p);
        }

        res.status(200).json(posts);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Get a single post by ID (supports both MongoDB _id and custom string id)
const getPostById = async (req, res) => {
    try {
        let post = await Post.findOne({ id: req.params.id });
        if (!post) {
            // Fallback: try MongoDB ObjectId
            try {
                post = await Post.findById(req.params.id);
            } catch (e) {}
        }

        if (!post) {
            return res.status(404).json({
                message: "Post not found"
            });
        }

        // Check auth for vote/bookmark state
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let currentUser = null;
        if (token) {
            try {
                const jwt = require("jsonwebtoken");
                currentUser = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {}
        }

        const postObj = post.toObject();

        let voted = null;
        let isBookmarked = false;
        if (currentUser) {
            if (postObj.upvotedBy?.includes(currentUser.id)) voted = 'up';
            if (postObj.downvotedBy?.includes(currentUser.id)) voted = 'down';
            const dbUser = await User.findById(currentUser.id);
            isBookmarked = dbUser?.bookmarks?.includes(postObj.id) || false;
        }

        // Increment views
        let viewNum = parseInt(String(post.views).replace(/[^\d]/g, '')) || 0;
        viewNum += 1;
        const views = viewNum >= 1000 ? `${(viewNum / 1000).toFixed(1)}k` : `${viewNum}`;
        await Post.findByIdAndUpdate(post._id, { views });

        res.status(200).json({
            ...postObj,
            views,
            voted,
            bookmarked: isBookmarked
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Vote on a post
const votePost = async (req, res) => {
    try {
        const { dir } = req.body; // 'up' | 'down' | null
        let post = await Post.findOne({ id: req.params.id });
        if (!post) {
            try { post = await Post.findById(req.params.id); } catch (e) {}
        }

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const userId = req.user.id;
        let upvotedBy = post.upvotedBy || [];
        let downvotedBy = post.downvotedBy || [];

        // Remove user from both arrays first
        upvotedBy = upvotedBy.filter(id => id !== userId);
        downvotedBy = downvotedBy.filter(id => id !== userId);

        if (dir === 'up') {
            upvotedBy.push(userId);
        } else if (dir === 'down') {
            downvotedBy.push(userId);
        }

        const upvotes = upvotedBy.length - downvotedBy.length;
        await Post.findByIdAndUpdate(post._id, { upvotes, upvotedBy, downvotedBy });

        res.json({ upvotes, voted: dir });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add a comment to a post
const addComment = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ message: "Content is required" });
        }

        let post = await Post.findOne({ id: req.params.id });
        if (!post) {
            try { post = await Post.findById(req.params.id); } catch (e) {}
        }

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const newComment = {
            id: 'c-' + Date.now().toString(),
            authorName: user.name,
            authorTitle: user.title || "",
            authorAvatar: user.avatar || "",
            content,
            timestamp: "Just now",
            likes: 0,
            likedBy: [],
            replies: []
        };

        const comments = post.comments || [];
        comments.push(newComment);
        const totalComments = comments.length + comments.reduce((acc, c) => acc + (c.replies?.length || 0), 0);

        await Post.findByIdAndUpdate(post._id, { comments, commentsCount: totalComments });

        res.status(201).json(newComment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add a reply to a comment
const addReply = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ message: "Reply content is required" });
        }

        let post = await Post.findOne({ id: req.params.id });
        if (!post) {
            try { post = await Post.findById(req.params.id); } catch (e) {}
        }

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const newReply = {
            id: 'r-' + Date.now().toString(),
            authorName: user.name,
            authorTitle: user.title || "",
            authorAvatar: user.avatar || "",
            content,
            timestamp: "Just now",
            likes: 0,
            likedBy: []
        };

        const comments = post.comments || [];
        const parentIdx = comments.findIndex(c => c.id === req.params.commentId);
        if (parentIdx === -1) {
            return res.status(404).json({ message: "Parent comment not found" });
        }

        comments[parentIdx].replies = comments[parentIdx].replies || [];
        comments[parentIdx].replies.push(newReply);

        const totalComments = comments.length + comments.reduce((acc, c) => acc + (c.replies?.length || 0), 0);

        await Post.findByIdAndUpdate(post._id, { comments, commentsCount: totalComments });

        res.status(201).json(newReply);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Like a comment
const likeComment = async (req, res) => {
    try {
        let post = await Post.findOne({ id: req.params.id });
        if (!post) {
            try { post = await Post.findById(req.params.id); } catch (e) {}
        }

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const userEmail = req.user.email;
        const comments = post.comments || [];
        const commentIdx = comments.findIndex(c => c.id === req.params.commentId);

        if (commentIdx === -1) {
            return res.status(404).json({ message: "Comment not found" });
        }

        let likedBy = comments[commentIdx].likedBy || [];
        if (likedBy.includes(userEmail)) {
            likedBy = likedBy.filter(e => e !== userEmail);
        } else {
            likedBy.push(userEmail);
        }

        comments[commentIdx].likedBy = likedBy;
        comments[commentIdx].likes = likedBy.length;

        await Post.findByIdAndUpdate(post._id, { comments });
        res.json({ likes: comments[commentIdx].likes, likedByMe: likedBy.includes(userEmail) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Bookmark a post
const bookmarkPost = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let bookmarks = user.bookmarks || [];
        const postId = req.params.id;
        let isBookmarked = false;

        if (bookmarks.includes(postId)) {
            bookmarks = bookmarks.filter(id => id !== postId);
        } else {
            bookmarks.push(postId);
            isBookmarked = true;
        }

        await User.findByIdAndUpdate(user._id, { bookmarks });
        res.json({ bookmarked: isBookmarked });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete a post
const deletePost = async (req, res) => {
    try {
        const post = await Post.findOne({ id: req.params.id });
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const authorId = post.author?.id || (post.author?._id ? post.author._id.toString() : "");
        if (authorId !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to delete this post" });
        }

        await Post.findByIdAndDelete(post._id);

        // Audit log for admin deletions (fire-and-forget)
        if (req.user.role === "admin" && authorId !== req.user.id) {
            const { logAction } = require("../utils/auditLog");
            logAction({
                action: "DELETE_POST",
                actorId: req.user.id,
                actorName: req.user.name || "",
                targetType: "Post",
                targetId: post._id.toString(),
                details: `Deleted post: "${post.title?.slice(0, 80)}"`,
            });
        }

        res.json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createPost,
    getPosts,
    getPostById,
    votePost,
    addComment,
    addReply,
    likeComment,
    bookmarkPost,
    deletePost
};