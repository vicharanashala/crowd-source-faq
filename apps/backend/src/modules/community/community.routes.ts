import { Router } from 'express';
import {
  getAllPosts,
  getPostById,
} from './post-reads.controller.js';
import {
  createPost,
  toggleUpvote,
  deletePost,
  reportPost,
  updatePost,
} from './post-mutations.controller.js';
import {
  resolvePost,
  requestExpertHelp,
  convertCommunityPostToFAQ,
  setPostDNA,
  setPostTags,
} from './post-lifecycle.controller.js';
import {
  objectToPromotion,
  confirmSpam,
  hidePost,
  unhidePost,
  lockPost,
  unlockPost,
  mergePost,
} from './post-moderation.controller.js';
import { getSolvedPosts } from './post-reads.controller.js';
import { checkDuplicateController } from './post-duplicate.controller.js';
import {
  getAnswersList,
  addComment,
  verifyComment,
  setCommentDNA,
  clearCommentDNA,
  acceptCommentAnswer,
  updateComment,
  deleteComment,
} from './comment.controller.js';
import { toggleCommentUpvote, toggleCommentDownvote } from './comment-vote.controller.js';
import { searchCommunityPosts } from './community-search.controller.js';
import { getReviewQueue } from '../faq/freshness.controller.js';
import { getBookmarks, toggleBookmark } from './bookmark.controller.js';
import { getCommunityStats } from './community-stats.controller.js';
import { getRelatedForPost } from '../faq/related.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { validateBody, createPostSchema, addCommentSchema, resolvePostSchema, reportPostSchema, checkDuplicateSchema } from '../../utils/auth/validation.js';

const router = Router();

// Public read-only routes — anonymous users can browse community posts freely.
// (User-specific actions like bookmarks and admin/moderator actions like
//  review-queue remain protected below.)
router.get('/search', searchCommunityPosts);
router.get('/solved', getSolvedPosts);
router.get('/answers/list', getAnswersList);
router.get('/stats', getCommunityStats);

// Protected non-parameterised routes must come BEFORE /:id to avoid the
// wildcard swallowing "bookmarks" / "review-queue" as a post ID.
router.get('/review-queue', protect, authorize('admin', 'moderator'), getReviewQueue);
router.get('/bookmarks', protect, getBookmarks);

router.get('/', getAllPosts);
// Audit fix: frontend calls `/community/posts` (literal); without this
// entry, Express falls through to `/:id` and tries ObjectId('posts') → 500.
router.get('/posts', getAllPosts);
router.get('/:id', getPostById);
router.get('/:id/related', getRelatedForPost);

router.post('/check-duplicate', protect, validateBody(checkDuplicateSchema), checkDuplicateController);
router.post('/', protect, validateBody(createPostSchema), createPost);
router.post('/:id/upvote', protect, toggleUpvote);
router.post('/:id/comments', protect, validateBody(addCommentSchema), addComment);
router.post('/:id/comments/:commentId/upvote', protect, toggleCommentUpvote);
router.post('/:id/comments/:commentId/downvote', protect, toggleCommentDownvote);
router.patch('/:id/comments/:commentId/verify', protect, authorize('admin', 'moderator'), verifyComment);
router.patch('/:id/comments/:commentId/accept-answer', protect, acceptCommentAnswer);
router.patch('/:id/comments/:commentId', protect, updateComment);
router.delete('/:id/comments/:commentId', protect, deleteComment);
router.patch('/:id/comments/:commentId/dna', protect, authorize('admin', 'moderator'), setCommentDNA);
router.delete('/:id/comments/:commentId/dna', protect, authorize('admin', 'moderator'), clearCommentDNA);
router.patch('/:id/resolve', protect, validateBody(resolvePostSchema), resolvePost);
router.post('/:id/request-expert', protect, requestExpertHelp);
router.post('/:id/report', protect, validateBody(reportPostSchema), reportPost);
router.post('/:id/bookmark', protect, toggleBookmark);
router.post('/:id/object-to-promotion', protect, authorize('admin', 'moderator'), objectToPromotion);
router.post('/:id/confirm-spam', protect, authorize('admin', 'moderator'), confirmSpam);
router.post('/:id/hide', protect, authorize('admin', 'moderator'), hidePost);
router.post('/:id/unhide', protect, authorize('admin', 'moderator'), unhidePost);
router.post('/:id/lock', protect, authorize('admin', 'moderator'), lockPost);
router.post('/:id/unlock', protect, authorize('admin', 'moderator'), unlockPost);
router.post('/:id/merge', protect, authorize('admin', 'moderator'), mergePost);
router.post('/:id/convert-to-faq', protect, authorize('admin'), convertCommunityPostToFAQ);
router.patch('/:id/dna', protect, setPostDNA);
router.patch('/:id/tags', protect, setPostTags);
router.patch('/:id', protect, updatePost);
router.delete('/:id', protect, deletePost);

export default router;
