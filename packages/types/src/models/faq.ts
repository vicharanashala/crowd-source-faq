import type { FreshnessTier, FreshnessStatus } from '../enums/status.js';

// ── FAQ Model Interface ──────────────────────────────────────────
export interface IFAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  batchId?: string;
  freshnessTier: FreshnessTier;
  freshnessStatus: FreshnessStatus;
  reviewIntervalDays?: number;
  nextReviewDate?: Date;
  popularityScore: number;
  viewCount: number;
  upvotes: number;
  downvotes: number;
  isArchived: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
