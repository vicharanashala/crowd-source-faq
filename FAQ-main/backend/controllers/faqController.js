const FAQ = require("../models/FAQ");
const { logAction } = require("../utils/auditLog");

// Create FAQ
const createFAQ = async (req, res) => {
    try {
        const faq = await FAQ.create(req.body);

        // Audit log — req.user is set because protect + adminOnly guard this route
        logAction({
            action: "CREATE_FAQ",
            actorId: req.user?.id || "",
            actorName: req.user?.name || "",
            targetType: "FAQ",
            targetId: faq._id.toString(),
            details: `Created FAQ: "${(faq.question || "").slice(0, 80)}"`,
        });

        res.status(201).json(faq);
    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Get all FAQs
const getFAQs = async (req, res) => {
    try {
        const faqs = await FAQ.find();

        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Get FAQ by ID
const getFAQById = async (req, res) => {
    try {
        const faq = await FAQ.findById(req.params.id);

        if (!faq) {
            return res.status(404).json({
                message: "FAQ not found"
            });
        }

        res.status(200).json(faq);
    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Search FAQs
const searchFAQs = async (req, res) => {
    try {
        const query = req.query.q;

        const faqs = await FAQ.find({
            question: {
                $regex: query,
                $options: "i"
            }
        });

        res.json(faqs);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};


module.exports = {
    createFAQ,
    getFAQs,
    getFAQById,
    searchFAQs
};