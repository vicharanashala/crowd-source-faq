import { Types } from 'mongoose';
import CommunityReminder, { ICommunityReminder, PriorityLevel } from './community-reminder.model.js';
import ImportantLink, { IImportantLink } from './important-link.model.js';
import ReminderBookmark from './reminder-bookmark.model.js';
import User from '../auth/user.model.js';
import ReputationLog from '../moderation/reputation-log.model.js';
import { communityLog } from '../../utils/http/logger.js';
import { sanitizeHtml } from '../../utils/http/sanitize.js';

export interface ListRemindersQuery {
  search?: string;
  tag?: string;
  priority?: PriorityLevel;
  sortBy?: 'date' | 'votes' | 'priority' | 'pinned';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateReminderDTO {
  title: string;
  description: string;
  eventDate?: string | Date;
  priority?: PriorityLevel;
  tags?: string[];
}

export interface CreateLinkDTO {
  title: string;
  url: string;
  category: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export class ReminderService {
  // ── Reminders ─────────────────────────────────────────────────────────────

  static async listReminders(query: ListRemindersQuery, batchId?: Types.ObjectId | null) {
    const {
      search,
      tag,
      priority,
      sortBy = 'date',
      order = 'desc',
      page = 1,
      limit = 20,
    } = query;

    const filter: Record<string, unknown> = {};

    if (batchId) {
      filter.batchId = batchId;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (tag) {
      filter.tags = tag.toLowerCase().trim();
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    let sortOptions: Record<string, 1 | -1> = { isPinned: -1 };

    switch (sortBy) {
      case 'votes':
        sortOptions = { isPinned: -1, score: sortOrder, createdAt: -1 };
        break;
      case 'priority':
        sortOptions = { isPinned: -1, priority: sortOrder, createdAt: -1 };
        break;
      case 'pinned':
        sortOptions = { isPinned: -1, pinnedAt: sortOrder, createdAt: -1 };
        break;
      case 'date':
      default:
        sortOptions = { isPinned: -1, createdAt: sortOrder };
        break;
    }

    const skip = (page - 1) * limit;

    const [reminders, total] = await Promise.all([
      CommunityReminder.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('author', 'name email avatar')
        .populate('pinnedBy', 'name')
        .populate('verifiedBy', 'name')
        .lean(),
      CommunityReminder.countDocuments(filter),
    ]);

    return {
      reminders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getReminderById(id: string, batchId?: Types.ObjectId | null) {
    const filter: Record<string, unknown> = { _id: id };
    if (batchId) filter.batchId = batchId;

    return CommunityReminder.findOne(filter)
      .populate('author', 'name email avatar')
      .populate('pinnedBy', 'name')
      .populate('verifiedBy', 'name');
  }

  static async createReminder(data: CreateReminderDTO, authorId: Types.ObjectId, batchId?: Types.ObjectId | null) {
    const safeTags = Array.isArray(data.tags)
      ? data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : [];

    const reminder = await CommunityReminder.create({
      title: sanitizeHtml(data.title.trim()),
      description: sanitizeHtml(data.description.trim()),
      eventDate: data.eventDate ? new Date(data.eventDate) : null,
      priority: data.priority || 'medium',
      tags: safeTags,
      author: authorId,
      batchId: batchId || null,
      upvotes: [],
      downvotes: [],
      score: 0,
    });

    await reminder.populate('author', 'name email avatar');
    communityLog.info(`[reminder] Created reminder ${reminder._id} by user ${authorId}`);
    return reminder;
  }

  static async updateReminder(id: string, data: Partial<CreateReminderDTO>, userId: Types.ObjectId, isPrivileged: boolean) {
    const reminder = await CommunityReminder.findById(id);
    if (!reminder) return null;

    if (reminder.author.toString() !== userId.toString() && !isPrivileged) {
      throw new Error('FORBIDDEN');
    }

    if (data.title !== undefined) reminder.title = sanitizeHtml(data.title.trim());
    if (data.description !== undefined) reminder.description = sanitizeHtml(data.description.trim());
    if (data.eventDate !== undefined) reminder.eventDate = data.eventDate ? new Date(data.eventDate) : null;
    if (data.priority !== undefined) reminder.priority = data.priority;
    if (data.tags !== undefined) {
      reminder.tags = Array.isArray(data.tags)
        ? data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5)
        : [];
    }

    await reminder.save();
    await reminder.populate('author', 'name email avatar');
    communityLog.info(`[reminder] Updated reminder ${reminder._id} by user ${userId}`);
    return reminder;
  }

  static async deleteReminder(id: string, userId: Types.ObjectId, isPrivileged: boolean) {
    const reminder = await CommunityReminder.findById(id);
    if (!reminder) return false;

    if (reminder.author.toString() !== userId.toString() && !isPrivileged) {
      throw new Error('FORBIDDEN');
    }

    await Promise.all([
      CommunityReminder.findByIdAndDelete(id),
      ReminderBookmark.deleteMany({ reminder: id }),
    ]);

    communityLog.info(`[reminder] Deleted reminder ${id} by user ${userId}`);
    return true;
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  static async voteReminder(id: string, userId: Types.ObjectId, voteType: 'up' | 'down') {
    const reminder = await CommunityReminder.findById(id);
    if (!reminder) return null;

    const userIdStr = userId.toString();
    const hasUpvoted = reminder.upvotes.some((u: Types.ObjectId) => u.toString() === userIdStr);
    const hasDownvoted = reminder.downvotes.some((d: Types.ObjectId) => d.toString() === userIdStr);

    let updateQuery: Record<string, unknown> = {};

    if (voteType === 'up') {
      if (hasUpvoted) {
        // Toggle off upvote
        updateQuery = { $pull: { upvotes: userId } };
      } else {
        // Add upvote, pull from downvote
        updateQuery = {
          $addToSet: { upvotes: userId },
          $pull: { downvotes: userId },
        };
      }
    } else {
      if (hasDownvoted) {
        // Toggle off downvote
        updateQuery = { $pull: { downvotes: userId } };
      } else {
        // Add downvote, pull from upvote
        updateQuery = {
          $addToSet: { downvotes: userId },
          $pull: { upvotes: userId },
        };
      }
    }

    const updated = await CommunityReminder.findByIdAndUpdate(id, updateQuery, { new: true })
      .populate('author', 'name email avatar');

    if (updated) {
      const newScore = updated.upvotes.length - updated.downvotes.length;
      updated.score = newScore;
      await updated.save();

      // Reputation adjustments for author (excluding self-votes)
      if (updated.author._id.toString() !== userIdStr) {
        const reputationDelta = voteType === 'up' ? (hasUpvoted ? -2 : 2) : (hasDownvoted ? 2 : -2);
        await User.findByIdAndUpdate(updated.author._id, {
          $inc: { points: reputationDelta, reputation: reputationDelta },
        });
        await ReputationLog.create({
          userId: updated.author._id,
          batchId: updated.batchId || null,
          delta: reputationDelta,
          reason: `Reminder ${voteType}vote: "${updated.title.slice(0, 40)}"`,
          action: voteType === 'up' ? 'upvote_received' : 'downvote_received',
          targetId: updated._id,
          targetType: 'community_reminder',
        });
      }
    }

    return updated;
  }

  // ── Bookmarks ─────────────────────────────────────────────────────────────

  static async toggleBookmark(reminderId: string, userId: Types.ObjectId) {
    const reminder = await CommunityReminder.findById(reminderId);
    if (!reminder) return null;

    const existing = await ReminderBookmark.findOne({ user: userId, reminder: reminderId });

    if (existing) {
      await ReminderBookmark.findByIdAndDelete(existing._id);
      communityLog.info(`[bookmark] Removed reminder bookmark ${reminderId} for user ${userId}`);
      return { isBookmarked: false };
    } else {
      await ReminderBookmark.create({ user: userId, reminder: reminderId });
      communityLog.info(`[bookmark] Saved reminder bookmark ${reminderId} for user ${userId}`);
      return { isBookmarked: true };
    }
  }

  static async getUserBookmarks(userId: Types.ObjectId) {
    const bookmarks = await ReminderBookmark.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'reminder',
        populate: { path: 'author', select: 'name email avatar' },
      })
      .lean();

    return bookmarks.map((b) => b.reminder).filter(Boolean);
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  static async togglePin(id: string, adminId: Types.ObjectId) {
    const reminder = await CommunityReminder.findById(id);
    if (!reminder) return null;

    reminder.isPinned = !reminder.isPinned;
    reminder.pinnedAt = reminder.isPinned ? new Date() : null;
    reminder.pinnedBy = reminder.isPinned ? adminId : null;

    await reminder.save();
    await reminder.populate('author', 'name email avatar');
    communityLog.info(`[moderation] Toggled pin state for reminder ${id} to ${reminder.isPinned} by admin ${adminId}`);
    return reminder;
  }

  static async toggleVerify(id: string, adminId: Types.ObjectId) {
    const reminder = await CommunityReminder.findById(id);
    if (!reminder) return null;

    reminder.isVerified = !reminder.isVerified;
    reminder.verifiedAt = reminder.isVerified ? new Date() : null;
    reminder.verifiedBy = reminder.isVerified ? adminId : null;

    await reminder.save();
    await reminder.populate('author', 'name email avatar');
    communityLog.info(`[moderation] Toggled star badge verification for reminder ${id} to ${reminder.isVerified} by admin ${adminId}`);
    return reminder;
  }

  // ── Important Links ───────────────────────────────────────────────────────

  static async listImportantLinks(batchId?: Types.ObjectId | null, includeInactive = false) {
    const filter: Record<string, unknown> = {};
    if (batchId) filter.batchId = batchId;
    if (!includeInactive) filter.isActive = true;

    return ImportantLink.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .populate('createdBy', 'name')
      .lean();
  }

  static async createImportantLink(data: CreateLinkDTO, adminId: Types.ObjectId, batchId?: Types.ObjectId | null) {
    const link = await ImportantLink.create({
      title: sanitizeHtml(data.title.trim()),
      url: data.url.trim(),
      category: sanitizeHtml(data.category.trim()),
      description: data.description ? sanitizeHtml(data.description.trim()) : undefined,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
      batchId: batchId || null,
      createdBy: adminId,
    });

    await link.populate('createdBy', 'name');
    communityLog.info(`[important-link] Created link ${link._id} by admin ${adminId}`);
    return link;
  }

  static async updateImportantLink(id: string, data: Partial<CreateLinkDTO>) {
    const link = await ImportantLink.findById(id);
    if (!link) return null;

    if (data.title !== undefined) link.title = sanitizeHtml(data.title.trim());
    if (data.url !== undefined) link.url = data.url.trim();
    if (data.category !== undefined) link.category = sanitizeHtml(data.category.trim());
    if (data.description !== undefined) link.description = sanitizeHtml(data.description.trim());
    if (data.order !== undefined) link.order = data.order;
    if (data.isActive !== undefined) link.isActive = data.isActive;

    await link.save();
    await link.populate('createdBy', 'name');
    communityLog.info(`[important-link] Updated link ${link._id}`);
    return link;
  }

  static async deleteImportantLink(id: string) {
    const deleted = await ImportantLink.findByIdAndDelete(id);
    if (deleted) {
      communityLog.info(`[important-link] Deleted link ${id}`);
    }
    return !!deleted;
  }
}
