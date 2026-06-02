import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'ai_moderator' | 'expert';

export type Tier = 'newcomer' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'legend';

export type ReputationAction =
  | 'faq_post'
  | 'faq_approved'
  | 'faq_helpful'
  | 'answer_accepted'
  | 'upvote_received'
  | 'report_valid'
  | 'badge_awarded'
  | 'admin_point_award'
  | 'faq_rejected'
  | 'answer_downvoted'
  | 'report_rejected'
  | 'badge_revoked'
  | 'admin_point_deduct';

// ─── Badge subdocument ────────────────────────────────────────────────────────

export interface IUserBadge {
  badgeId: mongoose.Types.ObjectId;
  awardedAt?: Date;
  awardedBy?: mongoose.Types.ObjectId;
  reason?: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
  // Reputation system
  reputation: number;
  points: number;
  tier: Tier;
  positiveBadges: IUserBadge[];
  negativeBadges: IUserBadge[];
  // Moderation
  isBanned: boolean;
  banReason?: string;
  bannedAt?: Date;
  bannedBy?: mongoose.Types.ObjectId;
  suspendedUntil?: Date;
  isDeleted: boolean;
    deletedAt?: Date;
    // Zoom OAuth (per-user)
    zoomConnected: boolean;
    zoomUserId?: string;
    zoomAccessToken?: string;
    zoomRefreshToken?: string;
    zoomTokenExpiry?: Date;
    zoomConnectedAt?: Date;
    // Admin 2FA / TOTP
    totpEnabled: boolean;
    totpSecret?: string; // AES-256-GCM encrypted
    // Methods
    comparePassword(candidatePassword: string): Promise<boolean>;
}

// ─── Tier thresholds ──────────────────────────────────────────────────────────

export const TIER_THRESHOLDS: Record<Tier, number> = {
  newcomer: 0,
  bronze: 50,
  silver: 200,
  gold: 500,
  platinum: 1000,
  legend: 2500,
};

export const TIER_ORDER: Tier[] = ['newcomer', 'bronze', 'silver', 'gold', 'platinum', 'legend'];

export function calculateTier(points: number): Tier {
  let tier: Tier = 'newcomer';
  for (const t of TIER_ORDER) {
    if (points >= TIER_THRESHOLDS[t]) tier = t;
    else break;
  }
  return tier;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const userSchema = new MongooseSchema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'] },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'moderator', 'admin', 'ai_moderator', 'expert'] as UserRole[], default: 'user' },

    // Reputation
    reputation: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    tier: { type: String, enum: ['newcomer', 'bronze', 'silver', 'gold', 'platinum', 'legend'] as Tier[], default: 'newcomer' },
    positiveBadges: [{
      badgeId: { type: MongooseSchema.Types.ObjectId, ref: 'Badge' },
      awardedAt: { type: Date, default: Date.now },
      awardedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      reason: { type: String },
    }],
    negativeBadges: [{
      badgeId: { type: MongooseSchema.Types.ObjectId, ref: 'Badge' },
      awardedAt: { type: Date, default: Date.now },
      awardedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      reason: { type: String },
    }],

    // Moderation
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    bannedAt: { type: Date },
    bannedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
    suspendedUntil: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },

    // Zoom OAuth (per-user)
    zoomConnected:    { type: Boolean, default: false },
    zoomUserId:       { type: String },
    zoomAccessToken:  { type: String },
    zoomRefreshToken: { type: String },
    zoomTokenExpiry:  { type: Date },
    zoomConnectedAt:  { type: Date },

    // Admin 2FA / TOTP
    totpEnabled:   { type: Boolean, default: false },
    totpSecret:    { type: String },   // AES-256-GCM encrypted; only stored after 2FA is set up
  },
  { timestamps: true }
);

// ─── Pre-save ────────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Methods ────────────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ─── Indexes ────────────────────────────────────────────────────────────────

userSchema.index({ points: -1 });
userSchema.index({ reputation: -1 });
userSchema.index({ tier: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ isDeleted: 1 });

export default mongoose.model<IUser>('User', userSchema, 'yaksha_faq_users');
