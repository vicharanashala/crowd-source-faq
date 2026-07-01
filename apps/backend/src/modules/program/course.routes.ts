import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import { listPublicCourses, listAdminCourses, createCourse, updateCourse, archiveCourse, deleteCourse } from './course.controller.js';

const router = Router();

const listLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

// v1.69 — public list of courses in a program. Filtered by
// `?batchId=...` so a user landing on / sees only the courses for
// the active program.
router.get('/', listLimiter, listPublicCourses);

// Admin (guarded) — same CRUD shape as Batch.
router.get('/admin/all', protect, authorize('admin', 'moderator'), listAdminCourses);
router.post('/', protect, authorize('admin', 'moderator'), createCourse);
router.patch('/:id', protect, authorize('admin', 'moderator'), updateCourse);
router.post('/:id/archive', protect, authorize('admin', 'moderator'), archiveCourse);
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteCourse);

export default router;
