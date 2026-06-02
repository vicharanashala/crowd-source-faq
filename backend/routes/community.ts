import { Router } from 'express';
import {
  getAllPosts,
  createPost,
  getPostById,
  toggleUpvote,
  resolvePost,
  deletePost,
  getSolvedPosts,
  requestExpertHelp,
  reportPost,
  checkDuplicateController,
  convertCommunityPostToFAQ,
  setPostDNA,
  setPostTags,
} from '../controllers/postController.js';
import {
  getAnswersList,
  addComment,
  toggleCommentUpvote,
  toggleCommentDownvote,
  verifyComment,
  setCommentDNA,
  clearCommentDNA,
} from '../controllers/commentController.js';
import { searchCommunityPosts } from '../controllers/communitySearchController.js';
import { getReviewQueue } from '../controllers/freshnessController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/search', protect, searchCommunityPosts);
router.get('/review-queue', protect, authorize('admin', 'moderator'), getReviewQueue);
router.get('/solved', protect, getSolvedPosts);
router.get('/answers/list', protect, getAnswersList);

router.get('/', protect, getAllPosts);
router.post('/check-duplicate', protect, checkDuplicateController);
router.get('/:id', protect, getPostById);
router.post('/', protect, createPost);
router.post('/:id/upvote', protect, toggleUpvote);
router.post('/:id/comments', protect, addComment);
router.post('/:id/comments/:commentId/upvote', protect, toggleCommentUpvote);
router.post('/:id/comments/:commentId/downvote', protect, toggleCommentDownvote);
router.patch('/:id/comments/:commentId/verify', protect, authorize('admin', 'moderator'), verifyComment);
router.patch('/:id/comments/:commentId/dna', protect, authorize('admin', 'moderator'), setCommentDNA);
router.delete('/:id/comments/:commentId/dna', protect, authorize('admin', 'moderator'), clearCommentDNA);
router.patch('/:id/resolve', protect, resolvePost);
router.post('/:id/request-expert', protect, requestExpertHelp);
router.post('/:id/report', protect, reportPost);
router.post('/:id/convert-to-faq', protect, authorize('admin'), convertCommunityPostToFAQ);
router.patch('/:id/dna', protect, setPostDNA);
router.patch('/:id/tags', protect, setPostTags);
router.delete('/:id', protect, authorize('admin', 'moderator'), deletePost);

export default router;