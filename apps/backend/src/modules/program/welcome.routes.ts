import express from 'express';
import { 
  getActiveOrientation, 
  getTimelineProjects, 
  askOrientationQuestion,
  trackWelcomeOnboarding,
  completeOrientation,
  selectProject,
  getMyProject
} from './welcome.controller.js';
import { protect } from '../../middleware/auth.js';
import TimelineStep from '../admin/timeline-step.model.js';
import Mentor from '../admin/mentor.model.js';
import { getAssessment, submitAssessment, getZoomStatus } from '../zoom/zoom-assessment.controller.js';
import {
  listPublicResources,
  completeResource,
  getMyCompletions,
  askKnowledgeQuestion,
} from './onboarding-resources.controller.js';

const router = express.Router();

router.get('/orientation', getActiveOrientation);
router.get('/projects', getTimelineProjects);
router.get('/my-project', protect, getMyProject);

// Requires auth to ask questions so we can track the user
router.post('/orientation/ask', protect, askOrientationQuestion);

// Track user exploration of the welcome package
router.post('/track', protect, trackWelcomeOnboarding);

// Onboarding and Project Selection
router.post('/orientation-complete', protect, completeOrientation);
router.post('/select-project', protect, selectProject);

// Zoom Assessment
router.get('/zoom-assessment/status', protect, getZoomStatus);
router.get('/zoom-assessment/questions', protect, getAssessment);
router.post('/zoom-assessment/submit', protect, submitAssessment);

// User-facing: get active timeline steps (ordered)
router.get('/timeline-steps', protect, async (req, res) => {
  try {
    const steps = await TimelineStep.find({ status: 'active' }).sort({ order: 1 });
    res.status(200).json(steps);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching timeline steps', error });
  }
});

// User-facing: get mentor details
router.get('/mentors/:id', protect, async (req, res) => {
  try {
    const mentor = await Mentor.findById(req.params.id).select('-__v');
    if (!mentor) {
      res.status(404).json({ message: 'Mentor not found' });
      return;
    }
    res.status(200).json(mentor);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mentor', error });
  }
});

// v1.69 — Welcome Package Management: student-facing endpoints.
// These are additive — the legacy /orientation* routes above remain
// untouched. The new endpoints serve the generalized
// OnboardingResource / OnboardingKnowledgeSource collections.
router.get('/resources', protect, listPublicResources);
router.post('/resources/:id/complete', protect, completeResource);
router.get('/resources/completions', protect, getMyCompletions);
router.post('/resources/ask', protect, askKnowledgeQuestion);

export default router;
