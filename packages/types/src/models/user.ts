import type { UserTier } from '../enums/status.js';
import type { UserRole } from '../enums/roles.js';

// ── User Model Interface ─────────────────────────────────────────
export interface IUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  sp: number;
  isBanned: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  suspendedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── User Profile (safe for frontend) ─────────────────────────────
export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  sp: number;
  createdAt: string;
}
