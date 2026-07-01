import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IRefreshToken extends Document {
  tokenHash: string;
  userId: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

const refreshTokenSchema = new MongooseSchema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() }
  },
  { timestamps: false }
);

// TTL index to automatically delete expired refresh tokens.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema, 'yaksha_faq_refresh_tokens');
