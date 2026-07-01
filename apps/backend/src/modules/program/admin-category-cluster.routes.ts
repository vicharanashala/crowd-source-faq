/**
 * Admin Dynamic Categories routes. Mounted at
 * /api/admin/programs/:batchId/category-clusters.
 *
 * The :batchId comes from the program selector. All endpoints
 * require admin/moderator auth via the protect + authorize
 * middleware.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  listClusters,
  getCluster,
  updateCluster,
  deleteCluster,
  recomputeClusters,
} from './admin-category-cluster.controller.js';

const router = Router({ mergeParams: true });

router.get('/', protect, authorize('admin', 'moderator'), listClusters);
router.get('/:id', protect, authorize('admin', 'moderator'), getCluster);
router.patch('/:id', protect, authorize('admin', 'moderator'), updateCluster);
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteCluster);
router.post('/recompute', protect, authorize('admin', 'moderator'), recomputeClusters);

export default router;
