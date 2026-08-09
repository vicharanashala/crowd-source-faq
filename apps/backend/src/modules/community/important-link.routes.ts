import { Router } from 'express';
import {
  listImportantLinks,
  createImportantLink,
  updateImportantLink,
  deleteImportantLink,
} from './important-link.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import { validateBody } from '../../utils/auth/validation.js';
import {
  createImportantLinkSchema,
  updateImportantLinkSchema,
} from '@csfaq/validation';

const router = Router();

// Public Read
router.get('/', listImportantLinks);

// Admin-Managed Mutations
router.post('/', protect, authorize('admin', 'moderator'), validateBody(createImportantLinkSchema), createImportantLink);
router.patch('/:id', protect, authorize('admin', 'moderator'), validateObjectId('id'), validateBody(updateImportantLinkSchema), updateImportantLink);
router.delete('/:id', protect, authorize('admin', 'moderator'), validateObjectId('id'), deleteImportantLink);

export default router;
