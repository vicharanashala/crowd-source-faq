const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    // Public name shown on questions, answers, and profile views.
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    // Unique login/contact identity for the user.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Hashed password value. Hidden from normal query results by select: false.
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    // Permission level used by auth/admin middleware.
    role: {
      type: String,
      enum: ["student", "moderator", "admin"],
      default: "student",
      index: true,
    },
    // Gamification score increased by accepted answers, votes, and contributions.
    reputationScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    handle: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    title: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      trim: true,
    },
    // Lightweight achievement labels shown on user profiles.
    badges: {
      type: [String],
      default: [],
    },
    // Consecutive activity count for engagement features.
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    followedQuestions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
      default: [],
    },
    bookmarkedQuestions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpire;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpire;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpire;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpire;
        return ret;
      },
    },
  }
);

userSchema.virtual("password").set(function (password) {
  this._plainPassword = password;
});

userSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Backward-compatible virtual password input for seed scripts and older callers.
userSchema.pre("validate", async function () {
  if (this._plainPassword === undefined) {
    return;
  }

  if (!this._plainPassword || this._plainPassword.length < 6) {
    this.invalidate("password", "Password must be at least 6 characters");
    return;
  }

  this.passwordHash = await this.constructor.hashPassword(this._plainPassword);
});

// Compare entered password with hashed password in DB
userSchema.methods.verifyPassword = async function (enteredPassword) {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.passwordHash);
};

userSchema.methods.matchPassword = userSchema.methods.verifyPassword;

// Generate and hash password reset token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash the token and store in DB
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expiry to 10 minutes
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  // Return the unhashed token (to send to user)
  return resetToken;
};

// Generate and hash email verification token
userSchema.methods.getEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(20).toString("hex");

  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

  // Set expiry to 24 hours
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;

  return verificationToken;
};

module.exports = mongoose.model("User", userSchema);
