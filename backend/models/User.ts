import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'ai_moderator' | 'expert';

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
  | 'admin_point_deduct'
  | 'faq_converted'        // question author: question → FAQ (+15)
  | 'faq_answer_used'      // answer author: answer used in FAQ (+25)
  | 'admin_approval_bonus' // question author: admin approved (+10)
  | 'spam_confirmed'       // user: spam report confirmed (-20)
  // v1.65 — Golden Ticket / Spurti Points (SP) ledger entries.
  // SP is a separate currency from `points`; these actions do NOT
  // touch the tier system. The Golden controller routes through
  // promotionService.ts (which writes the SP delta) and tags the
  // log row with one of these action values for audit / reversal.
  | 'sp_awarded'           // admin awarded SP (e.g. helpful contributor bonus)
  | 'sp_spent'             // user spent SP to create / convert a Golden ticket
  | 'sp_refunded'          // SP returned (golden ticket rolled back by admin)
  | 'sp_deducted'          // SP removed as a penalty (admin rejected a Golden ticket)
  | 'golden_converted';    // admin converted an existing ticket to Golden (audit trail)

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
  // Profile picture (Cloudinary) — `url` is the secure_url; `publicId`
  // is what we'd send to Cloudinary's `destroy` API if we ever need to
  // delete the asset server-side. Both optional so existing users still
  // fall back to the initial-based avatar in the navbar.
  avatar?: { url: string; publicId: string };
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
  // v1.66 — Golden Ticket admin "Ban User + Reject" state. When
  // set, the user is restricted from creating any new content
  // (support tickets, golden tickets, community posts, answers,
  // comments, document uploads) until that date. They can still
  // log in, browse, and read. See `utils/banUtils.ts` for the
  // gate logic. The auto-unban is implicit: content-creation
  // endpoints check `goldenBannedUntil > now`. A cron in
  // escalationController clears the field once expired.
  goldenBannedUntil?: Date | null;
  goldenBanReason?: string;
  goldenBannedBy?: mongoose.Types.ObjectId | null;
  goldenBannedAt?: Date | null;
    // Zoom OAuth (per-user)
    zoomConnected: boolean;
    zoomUserId?: string;
    zoomAccessToken?: string;
    zoomRefreshToken?: string;
    zoomTokenExpiry?: Date;
    zoomConnectedAt?: Date;
  // Bookmarked community posts — NOT used for reputation scoring
  bookmarks: MongooseSchema.Types.ObjectId[];
  // Denormalized counts for leaderboard trust score (updated on write, not computed per-request)
  acceptedAnswers: number;
  faqContributions: number;
  // ── Spurti Points (SP) — Golden Ticket currency (additive, v1.65) ──
  // `points` above is reputation for the existing tier system
  // (newcomer / contributor / helper / expert / champion / knowledge_master).
  // `sp` is a separate, spendable currency used only by the Golden
  // Ticket feature. Default 0; never auto-credited, only changed via
  // `awardSpurtiPoints()` / `spendSpurtiPoints()` helpers in
  // promotionService.ts. The two fields never feed each other.
  sp: number;
  // Cooldown provenance for the Golden Ticket creation / self-delete
  // gates. NULL means "no active cooldown". Stamps on both admin
  // resolution AND admin rejection — the cooldown is a spam throttle,
  // not a punishment (a resolved ticket still costs the user their
  // next submission slot, which is fair because the admin's time
  // is non-renewable). v1.65.1: removed the separate rejection-only
  // timestamp and the goldenBannedUntil ban field — the spec now
  // is "cooldown only, never ban, never deduct beyond the SP spend".
  lastGoldenTicketAt: Date | null;
  lastGoldenRejectionAt: Date | null;
  // Welcome Package tracking
  welcomePackageOnboarded: boolean;
  orientationCompleted: boolean;
  projectAssigned?: string;
  mentorAssigned?: string;
  projectAssignedAt?: Date;
  projectAssignedBy?: string;
  projectSelectionLocked: boolean;
  onboardingAuditLog: {
    changedBy: string;
    changedAt: Date;
    oldValue: any;
    newValue: any;
  }[];
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export type Tier = 'newcomer' | 'contributor' | 'helper' | 'expert' | 'champion' | 'knowledge_master';

// ─── Tier thresholds (knowledge-lifecycle-design.md) ─────────────────────────
// Points-based badges auto-awarded by reputationController.autoAwardBadges

export const TIER_THRESHOLDS: Record<Tier, number> = {
  newcomer:       0,
  contributor:   50,
  helper:       150,
  expert:       300,
  champion:     600,
  knowledge_master: 1000,
};

export const TIER_ORDER: Tier[] = ['newcomer', 'contributor', 'helper', 'expert', 'champion', 'knowledge_master'];

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

    // Profile picture (Cloudinary). Both fields are optional — a user
    // without one falls back to the initial-based avatar rendered in the
    // navbar/comment/post cards.
    avatar: {
      url: { type: String },
      publicId: { type: String },
    },

    // Reputation
    reputation: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    tier: { type: String, enum: ['newcomer', 'contributor', 'helper', 'expert', 'champion', 'knowledge_master'] as Tier[], default: 'newcomer' },
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


    // Bookmarked community posts — NOT used for reputation scoring.
    // v1.68 — schema fix: was double-nested
    //   { type: [{ type: ObjectId, ref: '...' }] }
    // which Mongo happily accepted but broke
    // `find({ bookmarks: { $size: N } })` (silently matched 0).
    bookmarks: [{ type: MongooseSchema.Types.ObjectId, ref: 'CommunityPost' }],
    // Denormalized counts for leaderboard trust score (updated on write, not computed per-request)
    acceptedAnswers: { type: Number, default: 0 },
    faqContributions: { type: Number, default: 0 },

    // ── Spurti Points (SP) + Golden Ticket cooldowns (v1.65, additive) ──
    // sp is independent of `points` (which drives the tier system). It
    // is a spendable currency awarded by admins / earned through
    // specific actions, and only consumed by the Golden Ticket flow.
    // v1.65.1 — Default starting balance. New users register with
    // 100 SP. The default doesn't retroactively update existing
    // users — they keep whatever they had; a one-off backfill
    // (see backfillStartingSp.ts) lifts anyone at sp=0 up to 100.
    sp: { type: Number, default: 100, min: 0 },
    // Cooldown provenance for the Golden flow. NULL = no active cooldown.
    // v1.65.1: now stamps on BOTH admin resolution AND admin
    // rejection (one unified cooldown rule, no ban / no penalty).
    lastGoldenTicketAt:     { type: Date, default: null },
    lastGoldenRejectionAt:  { type: Date, default: null },

    // v1.66 — Golden Ticket admin "Ban User + Reject" action. When
    // set to a future date, the user is restricted from creating any
    // new content (support tickets, golden tickets, community posts,
    // answers, comments, document uploads) until that date. They can
    // still log in, browse, and read. The auth middleware does NOT
    // check this field — content-creation endpoints do, individually,
    // via `assertCanCreateContent()`. The auto-unban is implicit (the
    // check is `goldenBannedUntil > now`, not `isBanned: true`). A
    // cron in escalationController clears the field once expired so
    // the DB doesn't accumulate stale values.
    goldenBannedUntil:  { type: Date, default: null },
    goldenBanReason:    { type: String, default: '', maxlength: 500 },
    goldenBannedBy:     { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    goldenBannedAt:     { type: Date, default: null },
    // Welcome Package Tracking (PR #62)
    welcomePackageOnboarded: { type: Boolean, default: false },
    orientationCompleted: { type: Boolean, default: false },
    projectAssigned: { type: String, default: null },
    mentorAssigned: { type: String, default: null },
    projectAssignedAt: { type: Date, default: null },
    projectAssignedBy: { type: String, default: null },
    projectSelectionLocked: { type: Boolean, default: false },
    onboardingAuditLog: {
      type: [{
        changedBy: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        oldValue: { type: MongooseSchema.Types.Mixed },
        newValue: { type: MongooseSchema.Types.Mixed }
      }],
      default: []
    },
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
// v1.65 — SP leaderboard: sort by sp desc for the "Spurti Points" rank.
userSchema.index({ sp: -1 });

export default mongoose.model<IUser>('User', userSchema, 'yaksha_faq_users');
