import { Router, Request, Response } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import KnowledgeGapReport from './knowledge-gap.model.js';
import { runKnowledgeGapAnalysis } from './knowledge-gap.service.js';

const router = Router();

// GET /api/admin/knowledge-gaps
// Fetch the latest knowledge gap reports
router.get('/', protect, authorize('admin', 'moderator'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const reports = await KnowledgeGapReport.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch knowledge gap reports' });
  }
});

// POST /api/admin/knowledge-gaps/trigger
// Manually trigger a knowledge gap analysis run
router.post('/trigger', protect, authorize('admin', 'moderator'), async (req: Request, res: Response) => {
  try {
    // Run it asynchronously so we don't block the request if it takes a while
    runKnowledgeGapAnalysis().catch((err) => {
      console.error('Manual knowledge gap analysis failed:', err);
    });
    res.json({ message: 'Knowledge gap analysis triggered.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger knowledge gap analysis' });
  }
});

export default router;
