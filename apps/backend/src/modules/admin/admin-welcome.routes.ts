import express from 'express';
import { 
  getProjects, 
  createProject, 
  updateProject, 
  deleteProject,
  getOrientations,
  uploadOrientation,
  deleteOrientation,
  getOrientationMetrics,
  updateOrientation,
  getOnboardingStatus,
  updateOnboardingStatus,
  getOnboardingAuditLogs,
  getZoomSettings,
  updateZoomSettings,
  uploadZoomTranscript,
  regenerateZoomAssessmentPool,
  getZoomSessions,
  createZoomSession,
  updateZoomSession,
  deleteZoomSession,
  activateZoomSession,
  uploadZoomSessionTranscript,
  regenerateZoomSessionAssessmentPool,
  getSessionQuestions,
  createSessionQuestion,
  updateSessionQuestion,
  deleteSessionQuestion,
  // v1.69 — Session History: returns the per-session activity
  // log used by the SessionTimeline component on the frontend.
  // Mounted at GET /admin/welcome/zoom-sessions/:id/activity.
  getZoomSessionActivity,
} from './admin-welcome.controller.js';

// v1.69 — Welcome Package Management: re-export the additive
// resource + knowledge controller surface from a dedicated file
// (./onboarding-resources.controller.ts). This keeps the existing
// admin-welcome.controller.ts untouched while letting the route
// file mount the new admin endpoints under /admin/welcome/resources
// and /admin/welcome/knowledge.
import {
  listResources as _listResources,
  createResource as _createResource,
  updateResource as _updateResource,
  deleteResource as _deleteResource,
  reorderResources as _reorderResources,
  setResourceVisibility as _setResourceVisibility,
  listKnowledgeSources as _listKnowledgeSources,
  createKnowledgeSource as _createKnowledgeSource,
  deleteKnowledgeSource as _deleteKnowledgeSource,
  getKnowledgeChunks as _getKnowledgeChunks,
  generateFromKnowledge as _generateFromKnowledge,
  resourceUpload as _resourceUpload,
  knowledgeUpload as _knowledgeUpload,
} from '../program/onboarding-resources.controller.js';

// Bind the controller handlers so `this` and the named-export
// signatures match what the routes file expects. Each handler is
// already a top-level function (not a method), so we pass-through.
export const listResources = _listResources;
export const createResource = _createResource;
export const updateResource = _updateResource;
export const deleteResource = _deleteResource;
export const reorderResources = _reorderResources;
export const setResourceVisibility = _setResourceVisibility;
export const listKnowledgeSources = _listKnowledgeSources;
export const createKnowledgeSource = _createKnowledgeSource;
export const deleteKnowledgeSource = _deleteKnowledgeSource;
export const getKnowledgeChunks = _getKnowledgeChunks;
export const generateFromKnowledge = _generateFromKnowledge;
export const resourceUpload = _resourceUpload;
export const knowledgeUpload = _knowledgeUpload;
import { adminOnly } from '../../middleware/admin.js';
import { protect } from '../../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Setup multer for local file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/orientations';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });
const uploadMemory = multer({ storage: multer.memoryStorage() });

// All these routes require admin/moderator auth
router.use(protect);
router.use(adminOnly); // ensure this middleware exists or adjust based on actual codebase

// Projects
router.get('/projects', getProjects);
router.post('/projects', createProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

// Orientations
router.get('/orientations', getOrientations);
router.post('/orientations', upload.single('video'), uploadOrientation);
router.put('/orientations/:id', updateOrientation);
router.delete('/orientations/:id', deleteOrientation);
router.get('/orientations/metrics', getOrientationMetrics);

// Onboarding Tracking
router.get('/onboarding-status', getOnboardingStatus);
router.put('/onboarding-override/:userId', updateOnboardingStatus);
// Audit Logs
router.get('/audit-logs', getOnboardingAuditLogs);

// Zoom Settings (Active session legacy adapters)
router.get('/zoom-settings', getZoomSettings);
router.put('/zoom-settings', updateZoomSettings);
router.post('/zoom-settings/transcript', uploadMemory.single('transcript'), uploadZoomTranscript);
router.post('/zoom-settings/regenerate', regenerateZoomAssessmentPool);

// Zoom Onboarding Sessions CRUD
router.get('/zoom-sessions', getZoomSessions);
router.post('/zoom-sessions', createZoomSession);
router.put('/zoom-sessions/:id', updateZoomSession);
router.delete('/zoom-sessions/:id', deleteZoomSession);
router.post('/zoom-sessions/:id/activate', activateZoomSession);
router.post('/zoom-sessions/:id/transcript', uploadMemory.single('transcript'), uploadZoomSessionTranscript);
router.post('/zoom-sessions/:id/regenerate', regenerateZoomSessionAssessmentPool);

// Question Pool Management CRUD
router.get('/zoom-sessions/:id/questions', getSessionQuestions);
router.post('/zoom-sessions/:id/questions', createSessionQuestion);
router.put('/zoom-sessions/:id/questions/:qId', updateSessionQuestion);
router.delete('/zoom-sessions/:id/questions/:qId', deleteSessionQuestion);

// v1.69 — Session History / Activity Log: per-session timeline.
router.get('/zoom-sessions/:id/activity', getZoomSessionActivity);

// v1.69 — Welcome Package Management: additive general-resource CMS.
// Every route below is brand-new — no existing route was touched.
// Mounted under /admin/welcome/resources and /admin/welcome/knowledge
// so they don't shadow the legacy /admin/welcome/orientations
// routes used by AdminOrientationTab.

// Onboarding Resources (general: video / pdf / pptx / svg / md / txt / link)
router.get('/resources', listResources);
router.post('/resources', resourceUpload.single('file'), createResource);
router.put('/resources/:id', updateResource);
router.delete('/resources/:id', deleteResource);
router.put('/resources/reorder', reorderResources);
router.put('/resources/:id/visibility', setResourceVisibility);

// Onboarding Knowledge Sources
router.get('/knowledge', listKnowledgeSources);
router.post('/knowledge', knowledgeUpload.single('file'), createKnowledgeSource);
router.delete('/knowledge/:id', deleteKnowledgeSource);
router.get('/knowledge/:id/chunks', getKnowledgeChunks);
router.post('/knowledge/:id/generate', generateFromKnowledge);

export default router;
