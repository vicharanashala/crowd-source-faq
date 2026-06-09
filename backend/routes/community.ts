import { Router } from 'express';
import {
  getAllPosts,
  getPostById,
  createPost,
  toggleUpvote,
  resolvePost,
  requestExpertHelp,
  deletePost,
  convertCommunityPostToFAQ,
  reportPost,
  getSolvedPosts,
  setPostDNA,
  setPostTags,
  objectToPromotion,
  confirmSpam,
  hidePost,
  unhidePost,
  lockPost,
  unlockPost,
} from '../controllers/postController.js';
import { checkDuplicateController } from '../controllers/postDuplicateController.js';
import {
  getAnswersList,
  addComment,
  verifyComment,
  setCommentDNA,
  clearCommentDNA,
  acceptCommentAnswer,
  updateComment,
  deleteComment,
} from '../controllers/commentController.js';
import { toggleCommentUpvote, toggleCommentDownvote } from '../controllers/commentVoteController.js';
import { searchCommunityPosts } from '../controllers/communitySearchController.js';
import { getReviewQueue } from '../controllers/freshnessController.js';
import { getBookmarks, toggleBookmark } from '../controllers/bookmarkController.js';
import { getCommunityStats } from '../controllers/communityStatsController.js';
import { getRelatedForPost } from '../controllers/relatedController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateBody, createPostSchema, addCommentSchema, resolvePostSchema, reportPostSchema, checkDuplicateSchema } from '../utils/validation.js';

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
router.post('/:id/convert-to-faq', protect, authorize('admin'), convertCommunityPostToFAQ);
router.patch('/:id/dna', protect, setPostDNA);
router.patch('/:id/tags', protect, setPostTags);
router.delete('/:id', protect, authorize('admin', 'moderator'), deletePost);

export default router;