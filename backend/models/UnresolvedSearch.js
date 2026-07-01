import mongoose, { Schema as MongooseSchema } from 'mongoose';
const unresolvedSearchSchema = new mongoose.Schema({
    query: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    faqId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'FAQ',
        default: null,
    },
    userId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    feedback: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
    status: {
        type: String,
        enum: ['pending', 'addressed'],
        default: 'pending',
    },
    resolvedBy: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    resolution: {
        type: String,
        enum: ['faq_updated', 'community_post_created', 'dismissed', null],
        default: null,
    },
    // v1.69 — every unresolved search is now tagged with the program
    // it was issued from so the admin "Unresolved searches" view
    // can filter by program.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
}, { timestamps: { createdAt: true, updatedAt: false } });
unresolvedSearchSchema.index({ status: 1, createdAt: -1 });
unresolvedSearchSchema.index({ faqId: 1 });
export default mongoose.model('UnresolvedSearch', unresolvedSearchSchema);
