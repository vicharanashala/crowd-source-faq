import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IFaqSatisfactionRating extends Document {
  faqId: Types.ObjectId;
  userId?: Types.ObjectId;
  guestId?: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

const faqSatisfactionRatingSchema = new MongooseSchema(
  {
    faqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
      required: true,
    },

    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
    },

    guestId: {
      type: String,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

faqSatisfactionRatingSchema.index(
  { faqId: 1, userId: 1 },
  { unique: true, sparse: true }
);

faqSatisfactionRatingSchema.index(
  { faqId: 1, guestId: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model<IFaqSatisfactionRating>(
  'FaqSatisfactionRating',
  faqSatisfactionRatingSchema,
  'yaksha_faq_satisfaction_ratings'
);