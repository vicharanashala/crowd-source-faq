import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../auth/user.model.js';
import CommunityPost from './community-post.model.js';
import { communityLog } from '../../utils/http/logger.js';

/** GET /api/community/bookmarks — get current user's bookmarked posts */
export async function getBookmarks(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'bookmarks',
      populate: [
        { path: 'author', select: 'name avatar' },
        { path: 'comments.author', select: 'name avatar' },
      ],
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const posts = (user.bookmarks as unknown as mongoose.Document[])
      .filter(p => p && (p as any)._id)
      .map(p => ({ ...(p as any).toObject(), bookmarks: (p as any).bookmarks ?? [] }));
    res.json({ bookmarks: posts, total: posts.length });
  } catch (err) {
    communityLog.error(`getBookmarks: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to load bookmarks' });
  }
}

/** POST /api/community/:id/bookmark — toggle bookmark for a post */
export async function toggleBookmark(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const postId = req.params.id as string;
    const userId = req.user._id;

    const post = await CommunityPost.findById(postId);
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const postObjectId = new mongoose.Types.ObjectId(postId);
    // v1.68 — H3 fix: was read-modify-write on
    //   user.bookmarks.push / splice + user.save()
    // Two concurrent bookmark toggles on the same post could
    // both read the same state, both push/splice, and both
    // save() — losing the other's toggle. Same fix shape as
    // the badge award (C2): atomic findOneAndUpdate with the
    // right filter to make each op idempotent.
    //
    //   - if not bookmarked: $addToSet (idempotent — adds
    //     only if not present)
    //   - if already bookmarked: $pull (idempotent — no-op
    //     if not present)
    const alreadyBookmarked = (user.bookmarks as unknown as mongoose.Types.ObjectId[])
      .some(b => b.toString() === postId);
    const bookmarked = !alreadyBookmarked;
    if (bookmarked) {
      await User.findOneAndUpdate(
        { _id: userId, 'bookmarks': { $ne: postObjectId } },
        { $addToSet: { bookmarks: postObjectId } },
      );
      await CommunityPost.findOneAndUpdate(
        { _id: postObjectId, 'bookmarks': { $ne: userId } },
        { $addToSet: { bookmarks: userId } },
      );
    } else {
      await User.findOneAndUpdate(
        { _id: userId, 'bookmarks': postObjectId },
        { $pull: { bookmarks: postObjectId } },
      );
      await CommunityPost.findOneAndUpdate(
        { _id: postObjectId, 'bookmarks': userId },
        { $pull: { bookmarks: userId } },
      );
    }

    res.json({ bookmarked, postId });
  } catch (err) {
    communityLog.error(`toggleBookmark: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
}