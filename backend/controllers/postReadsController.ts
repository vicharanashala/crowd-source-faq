/**
 * postReadsController.ts — Public read endpoints for community posts.
 *
 * Routes (from routes/community.ts):
 *   GET /api/community                            — list (cursor-paginated, filterable, sortable, searchable)
 *   GET /api/community/:id                        — single post + nested comment tree
 *   GET /api/community/solved                     — recently resolved posts
 */

import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import CommunityPost from '../models/CommunityPost.js';
import User from '../models/User.js';
import { withProgramScope } from '../utils/db/scopedQuery.js';

function batchIdFromQuery(req: Request): string | null {
  const raw = req.query.batchId;
  return typeof raw === 'string' && Types.ObjectId.isValid(raw) ? raw : null;
}
import { communityLog } from '../utils/http/logger.js';
import { buildCommentTree, timeTrialHoursRemaining } from './postCore.js';

async function isRequesterPrivileged(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) {
    return false;
  }
  try {
    const decoded = jwt.verify(token, secret) as { id: string };
    if (!decoded?.id) return false;
    const user = await User.findById(decoded.id).select('role');
    return user?.role === 'admin' || user?.role === 'moderator';
  } catch {
    return false;
  }
}

// GET /api/community — All posts (cursor-paginated, filterable, sortable, searchable)
export const getAllPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const privileged = await isRequesterPrivileged(req);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
    const cursor = (req.query.cursor as string) || '';

    const filter = (req.query.filter as string) || 'all';
    const sortParam = (req.query.sort as string) || 'newest';
    const search = (req.query.search as string)?.trim() || '';

    // Build query filter
    const query: Record<string, unknown> = { isHidden: { $ne: true } };
    if (filter === 'unanswered') query.status = 'unanswered';
    else if (filter === 'answered') query.status = 'answered';
    // 'all' → no status filter

    // Text search on title
    if (search.length >= 2) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: escaped, $options: 'i' };
    }

    // v1.69 — Phase 3b: scope every read by program.
    const scoped = withProgramScope(query, batchIdFromQuery(req));

    const total = await CommunityPost.countDocuments(scoped);

    const populateFields = [
      { path: 'author', select: 'name' },
      { path: 'comments.author', select: 'name' },
      { path: 'comments.upvotes', select: 'name' },
      { path: 'comments.downvotes', select: 'name' },
      { path: 'comments.replies.upvotes', select: 'name' },
      { path: 'comments.replies.downvotes', select: 'name' },
    ];

    // Load matching posts (cap at 200 to keep it efficient)
    const allPosts = await CommunityPost.find(scoped)
      .select('-embedding')
      .populate(populateFields)
      .limit(200)
      .exec();

    // Priority sorting weights
    const getPriorityWeight = (p?: string) => {
      if (p === 'critical') return 4;
      if (p === 'urgent') return 3;
      if (p === 'medium') return 2;
      return 1; // 'low' or default
    };

    // Sort: priority first, then requested parameter
    const sorted = allPosts.sort((a, b) => {
      const wA = getPriorityWeight(a.priority);
      const wB = getPriorityWeight(b.priority);
      if (wA !== wB) {
        return wB - wA; // higher priority first
      }

      // Secondary sorting
      if (sortParam === 'popular') {
        return (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0);
      }
      if (sortParam === 'oldest') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB || a._id.toString().localeCompare(b._id.toString());
      }
      // default: newest
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA || b._id.toString().localeCompare(a._id.toString());
    });

    // Keyset pagination using index of cursor in sorted array
    let startIndex = 0;
    if (cursor) {
      const decodedId = Buffer.from(cursor, 'base64').toString('utf8');
      const idx = sorted.findIndex((p) => p._id.toString() === decodedId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const paged = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < sorted.length;
    const nextCursor = (hasMore && paged.length > 0)
      ? Buffer.from(paged[paged.length - 1]._id.toString()).toString('base64')
      : null;

    res.json({
      posts: paged.map((p) => {
        const doc = p.toObject() as unknown as Record<string, unknown>;
        doc.timeTrialHoursRemaining = timeTrialHoursRemaining(doc as never);
        if (doc.isAnonymous && !privileged) {
          doc.author = { _id: null, name: 'Anonymous User' };
        }
        return doc;
      }),
      total,
      limit,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    communityLog.error(`[post] getAllPosts failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/community/:id — Single post with nested comment tree
export const getPostById = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findById(req.params.id)
      .select('-embedding')
      .populate('author', 'name')
      .populate('comments.author', 'name')
      .populate('comments.upvotes', 'name')
      .populate('comments.downvotes', 'name')
      .populate('comments.replies.upvotes', 'name')
      .populate('comments.replies.downvotes', 'name');

    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    // Attach nested replies tree to the response
    const postObj = post.toObject() as unknown as Record<string, unknown>;
    const comments = postObj.comments as Array<Record<string, unknown>>;
    postObj.comments = buildCommentTree(comments);

    // Add timeTrialHoursRemaining for pending Time-Trial posts
    postObj.timeTrialHoursRemaining = timeTrialHoursRemaining(postObj as never, 24);

    const privileged = await isRequesterPrivileged(req);
    if (postObj.isAnonymous && !privileged) {
      postObj.author = { _id: null, name: 'Anonymous User' };
    }

    res.json(postObj);
  } catch (error) {
    communityLog.error(`[post] getPostById failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/community/solved — Get recently resolved posts (for "Top Solved Today" widget)
export const getSolvedPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 10);
    const hours = parseInt(req.query.hours as string) || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const scoped = withProgramScope({
      status: 'answered',
      updatedAt: { $gte: since },
    }, batchIdFromQuery(req));
    const posts = await CommunityPost.find(scoped)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('author', 'name')
      .lean();

    const privileged = await isRequesterPrivileged(req);
    const sanitizedPosts = posts.map((p: any) => {
      if (p.isAnonymous && !privileged) {
        p.author = { _id: null, name: 'Anonymous User' };
      }
      return p;
    });

    res.json({ posts: sanitizedPosts });
  } catch (error) {
    communityLog.error(`[post] getSolvedPosts failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
