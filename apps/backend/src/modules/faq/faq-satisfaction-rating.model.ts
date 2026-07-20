import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IFaqSatisfactionRating extends Document {
  faqId: Types.ObjectId;
  userId: Types.ObjectId | null;
  guestId: string | null;
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
      default: null,
    },

    guestId: {
      type: String,
      default: null,
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
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
  }
);

faqSatisfactionRatingSchema.index(
  { faqId: 1, guestId: 1 },
  {
    unique: true,
    partialFilterExpression: { guestId: { $type: 'string' } },
  }
);

export default mongoose.model<IFaqSatisfactionRating>(
  'FaqSatisfactionRating',
  faqSatisfactionRatingSchema,
  'yaksha_faq_satisfaction_ratings'
);
