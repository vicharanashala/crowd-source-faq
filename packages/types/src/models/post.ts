import type { PostStatus } from '../enums/status.js';

// ── Community Post Interface ─────────────────────────────────────
export interface ICommunityPost {
  _id: string;
  title: string;
  body: string;
  author: string;
  authorName: string;
  status: PostStatus;
  upvotes: string[];
  downvotes: string[];
  views: number;
  batchId?: string;
  isEscalated: boolean;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Comment Interface ────────────────────────────────────────────
export interface IComment {
  _id: string;
  body: string;
  author: string;
  authorName: string;
  parentId?: string;
  isAccepted: boolean;
  isVerified: boolean;
  upvotes: string[];
  downvotes: string[];
  createdAt: Date;
  updatedAt: Date;
}
