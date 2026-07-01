import mongoose, { Schema as MongooseSchema } from 'mongoose';
const aiQuestionSchema = new MongooseSchema({
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    orientationId: { type: MongooseSchema.Types.ObjectId, ref: 'Orientation', required: true },
    // v1.69 — orientation is program-scoped; carry the program
    // forward on the question log so admins can audit AI answers
    // per cohort.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
    question: { type: String, required: true },
    answer: { type: String, required: true },
}, { timestamps: true });
aiQuestionSchema.index({ orientationId: 1 });
aiQuestionSchema.index({ userId: 1 });
aiQuestionSchema.index({ batchId: 1, createdAt: -1 });
export default mongoose.model('AiQuestion', aiQuestionSchema, 'yaksha_faq_ai_questions');
