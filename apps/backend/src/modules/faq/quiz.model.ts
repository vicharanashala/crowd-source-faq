import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IQuizLog extends Document {
  category: string;
  score: number;
  totalQuestions: number;
  batchId: Types.ObjectId | null;
  createdAt: Date;
}

const quizLogSchema = new MongooseSchema<IQuizLog>({
  category: { type: String, required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null },
  createdAt: { type: Date, default: Date.now },
});

export const QuizLog = mongoose.model<IQuizLog>('QuizLog', quizLogSchema, 'yaksha_faq_quiz_logs');
export default QuizLog;
