import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Project from './project.model.js';
import Orientation from '../program/orientation.model.js';
import AiQuestion from '../ai/ai-question.model.js';
import Batch from '../program/batch.model.js';
import fs from 'fs';
import AppSetting, { readSetting } from '../program/app-setting.model.js';
import ZoomTranscriptChunk from '../zoom/zoom-transcript-chunk.model.js';
import ZoomAssessmentQuestion from '../zoom/zoom-assessment-question.model.js';
import ZoomSession from '../zoom/zoom-session.model.js';
import FAQ from '../faq/faq.model.js';
import AiClient from '../ai/ai-client.service.js';
import { generateEmbedding } from '../../utils/ai/embeddings.js';
import { MarkItDown } from 'markitdown-ts';
import path from 'path';
import os from 'os';
import { publicAssetUrl, publicBasePath } from '../../utils/publicBasePath.js';

/**
 * batchIdFromQuery — extract a valid program ObjectId from the request
 * query string. Mirrors the same helper in faq.controller.ts so every
 * admin route that touches program-scoped data uses one consistent
 * resolver. Returns null when the param is missing or malformed;
 * callers decide whether to 400 or fall back to a default scope.
 */
function batchIdFromQuery(req: { query: any }): string | null {
  const raw = req.query?.batchId;
  if (typeof raw !== 'string') return null;
  return Types.ObjectId.isValid(raw) ? raw : null;
}

// --- Projects Management ---

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    // v1.69 — multi-program scoping: every list endpoint reads
    // `?batchId=...` from the query and applies it to the model
    // query. Without this, the endpoint returns projects across
    // every program — a cross-tenant data leak.
    const batchId = batchIdFromQuery(req) || req.programContext?.batchId;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const filter = { batchId: new Types.ObjectId(batchId) };
    const projects = await Project.find(filter).populate('mentor').sort({ createdAt: -1 });
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error });
  }
};

import Mentor from './mentor.model.js';
import OnboardingAuditLog from '../program/onboarding-audit-log.model.js';

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    // v1.69 — multi-program scoping: every write requires a valid
    // batchId so we never write a row without a program owner. The
    // body can include `batchId` directly, or it can come from
    // `req.query.batchId` (admin UI uses query string when uploading
    // alongside the form). We reject without a valid id.
    const rawBatchId = (req.body?.batchId as string | undefined)
      ?? batchIdFromQuery(req);
    if (!rawBatchId || !Types.ObjectId.isValid(rawBatchId)) {
      res.status(400).json({ message: 'A valid batchId is required to create a project.' });
      return;
    }
    const payload = { ...req.body, batchId: new Types.ObjectId(rawBatchId) };
    const project = new Project(payload);
    await project.save();

    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'project',
        entityId: project._id,
        action: 'create',
        newValue: { projectName: project.projectName, batchId: project.batchId },
      });
    }

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error });
  }
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // v1.69 — guard against cross-program moves: the project's
    // batchId is immutable after creation. If the request body
    // includes a different batchId, reject the update.
    if (payload.batchId && String(payload.batchId) !== String(project.batchId)) {
      res.status(400).json({ message: 'batchId is immutable; projects cannot move between programs.' });
      return;
    }
    delete payload.batchId;

    const previousValue = { projectName: project.projectName, status: project.status, order: project.order };

    Object.assign(project, payload);
    await project.save();

    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'project',
        entityId: project._id,
        action: 'update',
        previousValue,
        newValue: { projectName: project.projectName, status: project.status, order: project.order },
      });
    }

    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error });
  }
};

export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const project = await Project.findByIdAndDelete(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project', error });
  }
};

// --- Orientation Management ---

export const getOrientations = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromQuery(req) || req.programContext?.batchId;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const filter = { batchId: new Types.ObjectId(batchId) };
    const orientations = await Orientation.find(filter).sort({ createdAt: -1 });
    res.status(200).json(orientations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orientations', error });
  }
};

export const uploadOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, transcript: customTranscript } = req.body;
    let videoUrl = '';

    // v1.69 — multi-program scoping: every orientation write requires
    // a valid batchId so we never write a row without a program
    // owner. Accepts batchId from body or query string.
    const rawBatchId = (req.body?.batchId as string | undefined) ?? batchIdFromQuery(req);
    if (!rawBatchId || !Types.ObjectId.isValid(rawBatchId)) {
      res.status(400).json({ message: 'A valid batchId is required to create an orientation.' });
      return;
    }

    // Using multer, the file will be in req.file
    if (req.file) {
      videoUrl = publicAssetUrl(`/uploads/orientations/${req.file.filename}`);
    }

    // Use provided transcript or fallback
    const transcript = customTranscript || `Welcome to the organization! This is the orientation video.
Here is how the contribution process works: First, you find an issue to work on.
Then, you fork the repository and make your changes.
After that, you submit a pull request.
Pull requests are reviewed by the core maintainers.
During onboarding, you are expected to read the guidelines and complete your first task.
If you need help, please ask in the #help channel on our community platform.`;

    const orientation = new Orientation({
      title,
      description,
      videoUrl,
      transcript,
      batchId: new Types.ObjectId(rawBatchId),
    });

    await orientation.save();
    res.status(201).json(orientation);
  } catch (error) {
    res.status(500).json({ message: 'Error uploading orientation', error });
  }
};

export const deleteOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const orientation = await Orientation.findByIdAndDelete(id);
    if (!orientation) {
      res.status(404).json({ message: 'Orientation not found' });
      return;
    }

    // Attempt to delete the file if it exists locally.
    //
    // v1.69 — publicBasePath: when the app is mounted under
    // `/csfaq/`, the stored videoUrl is `/csfaq/uploads/...` rather
    // than `/uploads/...`. Strip the configured public base path
    // before checking the leading `/uploads/` marker so the cleanup
    // path matches regardless of where the app is mounted.
    const basePath = publicBasePath();
    const basePrefix = basePath === '' ? '' : basePath;
    const relativeUrl = basePrefix && orientation.videoUrl?.startsWith(basePrefix)
      ? orientation.videoUrl.slice(basePrefix.length)
      : orientation.videoUrl;
    if (relativeUrl && relativeUrl.startsWith('/uploads/')) {
      const filePath = `.${relativeUrl}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(200).json({ message: 'Orientation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting orientation', error });
  }
};

export const updateOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { transcript, title, description } = req.body;
    
    const updateData: any = {};
    if (transcript !== undefined) updateData.transcript = transcript;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    const orientation = await Orientation.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!orientation) {
      res.status(404).json({ message: 'Orientation not found' });
      return;
    }

    res.status(200).json(orientation);
  } catch (error) {
    res.status(500).json({ message: 'Error updating orientation', error });
  }
};

export const getOrientationMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    // Basic metrics for AI questions
    const totalQuestions = await AiQuestion.countDocuments();
    
    res.status(200).json({
      totalQuestions,
      // More metrics could be calculated here
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching metrics', error });
  }
};

export const getOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const User = (await import('../auth/user.model.js')).default;
    const users = await User.find({ role: 'user' }, 'name email orientationCompleted projectAssigned mentorAssigned projectAssignedAt projectSelectionLocked').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    res.status(500).json({ message: 'Error fetching onboarding status', error });
  }
};

export const updateOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { projectAssigned, mentorAssigned, projectSelectionLocked } = req.body;
    const adminId = req.user?._id;

    const User = (await import('../auth/user.model.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const changes: any[] = [];
    
    if (projectAssigned !== undefined && user.projectAssigned !== projectAssigned) {
      changes.push({ field: 'projectAssigned', oldValue: user.projectAssigned, newValue: projectAssigned });
      user.projectAssigned = projectAssigned;
      user.projectAssignedBy = adminId ? adminId.toString() : 'admin';
    }
    if (mentorAssigned !== undefined && user.mentorAssigned !== mentorAssigned) {
      changes.push({ field: 'mentorAssigned', oldValue: user.mentorAssigned, newValue: mentorAssigned });
      user.mentorAssigned = mentorAssigned;
    }
    if (projectSelectionLocked !== undefined && user.projectSelectionLocked !== projectSelectionLocked) {
      changes.push({ field: 'projectSelectionLocked', oldValue: user.projectSelectionLocked, newValue: projectSelectionLocked });
      user.projectSelectionLocked = projectSelectionLocked;
    }

    if (changes.length > 0) {
      if (adminId) {
        const AdminLog = (await import('./admin-log.model.js')).default;
        await AdminLog.create({
          adminId,
          action: 'onboarding_override',
          targetId: user._id,
          targetType: 'user',
          details: `Updated onboarding status for user ${user.name}`,
          changes
        });
      }

      // Also add to the new user audit log array
      for (const change of changes) {
        user.onboardingAuditLog.push({
          changedBy: adminId ? adminId.toString() : 'system',
          changedAt: new Date(),
          oldValue: change.oldValue,
          newValue: change.newValue
        });
      }
      
      await user.save();
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    res.status(500).json({ message: 'Error updating onboarding status', error });
  }
};

export const getOnboardingAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromQuery(req) || req.programContext?.batchId;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const filter = { batchId: new Types.ObjectId(batchId) };
    const logs = await OnboardingAuditLog.find(filter)
      .populate('changedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs', error });
  }
};

// --- Zoom Settings ---
export const getZoomSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    let session = await ZoomSession.findOne({ isActive: true });
    if (!session) {
      session = await ZoomSession.findOne();
    }

    if (!session) {
      res.status(200).json({
        zoomPassScore: 70,
        zoomUrl: '',
        zoomTitle: 'Onboarding Zoom Session',
        zoomDescription: 'Join us for the live onboarding.',
        zoomDuration: '60 minutes',
        zoomActive: false,
        zoomQuestionCount: 10,
        zoomDailyResetTime: '09:00 AM',
        zoomTranscriptExists: false,
        stats: {
          questionPoolSize: 0,
          activeAttempts: 0,
          passedToday: 0,
          failedToday: 0
        }
      });
      return;
    }

    const { default: ZoomAssessmentQuestion } = await import('../zoom/zoom-assessment-question.model.js');
    const { default: ZoomAssessmentAttempt } = await import('../zoom/zoom-assessment-attempt.model.js');
    const { getLastResetTime } = await import('../../integrations/zoom/zoomTime.js');

    const questionPoolSize = await ZoomAssessmentQuestion.countDocuments({ zoomSessionId: session._id });
    const lastReset = getLastResetTime(session.dailyResetTime);

    const activeAttempts = await ZoomAssessmentAttempt.countDocuments({
      zoomSessionId: session._id,
      status: 'started',
      createdAt: { $gte: lastReset }
    });

    const passedToday = await ZoomAssessmentAttempt.countDocuments({
      zoomSessionId: session._id,
      status: 'passed',
      completedAt: { $gte: lastReset }
    });

    const failedToday = await ZoomAssessmentAttempt.countDocuments({
      zoomSessionId: session._id,
      status: 'failed',
      completedAt: { $gte: lastReset }
    });

    const zoomActive = await readSetting('zoomActive', false);

    res.status(200).json({
      zoomPassScore: session.passScore,
      zoomUrl: session.zoomUrl,
      zoomTitle: session.title,
      zoomDescription: session.description,
      zoomDuration: session.duration,
      zoomActive,
      zoomQuestionCount: session.questionCount,
      zoomDailyResetTime: session.dailyResetTime,
      zoomTranscriptExists: !!session.transcript,
      stats: {
        questionPoolSize,
        activeAttempts,
        passedToday,
        failedToday
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching zoom settings', error });
  }
};

export const updateZoomSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      zoomPassScore, 
      zoomUrl, 
      zoomTitle, 
      zoomDescription, 
      zoomDuration, 
      zoomActive,
      zoomQuestionCount,
      zoomDailyResetTime
    } = req.body;

    await AppSetting.findOneAndUpdate(
      { _id: 'singleton' },
      { $set: { 'settings.zoomActive': zoomActive } },
      { upsert: true }
    );

    let session = await ZoomSession.findOne({ isActive: true });
    if (!session) {
      session = await ZoomSession.findOne();
    }

    if (session) {
      session.passScore = zoomPassScore ?? session.passScore;
      session.zoomUrl = zoomUrl ?? session.zoomUrl;
      session.title = zoomTitle ?? session.title;
      session.description = zoomDescription ?? session.description;
      session.duration = zoomDuration ?? session.duration;
      session.questionCount = zoomQuestionCount ?? session.questionCount;
      session.dailyResetTime = zoomDailyResetTime ?? session.dailyResetTime;
      await session.save();
    }
    
    res.status(200).json({ message: 'Zoom settings updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating zoom settings', error });
  }
};

export const uploadZoomTranscript = async (req: Request, res: Response): Promise<void> => {
  let session = await ZoomSession.findOne({ isActive: true });
  if (!session) {
    session = await ZoomSession.findOne();
  }
  if (!session) {
    res.status(400).json({ message: 'No session found to upload transcript' });
    return;
  }
  req.params.id = session._id.toString();
  return uploadZoomSessionTranscript(req, res);
};

export const regenerateZoomAssessmentPool = async (req: Request, res: Response): Promise<void> => {
  let session = await ZoomSession.findOne({ isActive: true });
  if (!session) {
    session = await ZoomSession.findOne();
  }
  if (!session) {
    res.status(400).json({ message: 'No session found to regenerate pool' });
    return;
  }
  req.params.id = session._id.toString();
  return regenerateZoomSessionAssessmentPool(req, res);
};

export const getZoomSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromQuery(req) || req.programContext?.batchId;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const sessionFilter = { batchId: new Types.ObjectId(batchId) };
    const sessions = await ZoomSession.find(sessionFilter).sort({ createdAt: -1 });
    const sessionList = [];
    const { default: ZoomAssessmentQuestion } = await import('../zoom/zoom-assessment-question.model.js');
    const { default: ZoomAssessmentAttempt } = await import('../zoom/zoom-assessment-attempt.model.js');
    const { getLastResetTime } = await import('../../integrations/zoom/zoomTime.js');

    // v1.69 — Session History: pre-fetch the Batch once so we can
    // surface its name on each session row. Avoids N+1 lookups.
    const batch = await Batch.findById(batchId).select('name').lean();

    for (const session of sessions) {
      const questionPoolSize = await ZoomAssessmentQuestion.countDocuments({ zoomSessionId: session._id });
      const lastReset = getLastResetTime(session.dailyResetTime);

      const activeAttempts = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id,
        status: 'started',
        createdAt: { $gte: lastReset }
      });

      const passedToday = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id,
        status: 'passed',
        completedAt: { $gte: lastReset }
      });

      const failedToday = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id,
        status: 'failed',
        completedAt: { $gte: lastReset }
      });

      // v1.69 — Session History: lifetime totals + pass rate.
      // Pass rate = passed / (passed + failed) over all completed
      // attempts. Sessions with no completed attempts show 0%.
      const lifetimePassed = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id, status: 'passed',
      });
      const lifetimeFailed = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id, status: 'failed',
      });
      const lifetimeCompleted = lifetimePassed + lifetimeFailed;
      const passRate = lifetimeCompleted > 0
        ? Math.round((lifetimePassed / lifetimeCompleted) * 100)
        : 0;
      const totalAttempts = await ZoomAssessmentAttempt.countDocuments({
        zoomSessionId: session._id,
      });

      sessionList.push({
        ...session.toObject(),
        // v1.69 — Session History: batch context surfaced on
        // each row so the History panel can render "Batch" and
        // "Meeting date" columns without a second round-trip.
        batchName: batch?.name ?? null,
        batchId: session.batchId ?? new Types.ObjectId(batchId),
        stats: {
          questionPoolSize,
          activeAttempts,
          passedToday,
          failedToday,
          // New lifetime stats for the History panel.
          lifetimePassed,
          lifetimeFailed,
          totalAttempts,
          passRate,
        }
      });
    }

    res.status(200).json(sessionList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Zoom sessions', error });
  }
};

export const createZoomSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, duration, zoomUrl, dailyResetTime, passScore, zoomQuestionCount } = req.body;
    if (!title || !description || !zoomUrl) {
      res.status(400).json({ message: 'Title, description and Zoom URL are required' });
      return;
    }
    // v1.69 — multi-program scoping: every ZoomSession write requires
    // a valid batchId so sessions live inside a single program. The
    // active session lookup below also filters by batchId so
    // activating a session in program A doesn't deactivate the
    // active session in program B.
    const rawBatchId = (req.body?.batchId as string | undefined) ?? batchIdFromQuery(req);
    if (!rawBatchId || !Types.ObjectId.isValid(rawBatchId)) {
      res.status(400).json({ message: 'A valid batchId is required to create a Zoom session.' });
      return;
    }
    const session = await ZoomSession.create({
      title,
      description,
      duration: duration || '60 minutes',
      zoomUrl,
      dailyResetTime: dailyResetTime || '09:00 AM',
      passScore: passScore ?? 70,
      questionCount: zoomQuestionCount ?? 10,
      isActive: false,
      batchId: new Types.ObjectId(rawBatchId),
    });
    // v1.69 — Session History: emit a non-blocking audit entry
    // so the per-session timeline shows creation. Existing
    // success response (201 with the session document) is
    // unchanged.
    void recordZoomAudit({
      adminId: (req as any).user?._id,
      sessionId: session._id,
      batchId: session.batchId,
      action: 'create',
      newValue: { title: session.title, batchId: session.batchId },
    });
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ message: 'Error creating Zoom session', error });
  }
};

export const updateZoomSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, duration, zoomUrl, dailyResetTime, passScore, zoomQuestionCount } = req.body;
    
    const session = await ZoomSession.findByIdAndUpdate(
      id,
      {
        $set: {
          title,
          description,
          duration,
          zoomUrl,
          dailyResetTime,
          passScore,
          questionCount: zoomQuestionCount
        }
      },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ message: 'Zoom session not found' });
      return;
    }

    // v1.69 — Session History: non-blocking audit emit. Existing
    // response shape (200 with the updated session) is unchanged.
    void recordZoomAudit({
      adminId: (req as any).user?._id,
      sessionId: session._id,
      batchId: session.batchId,
      action: 'update',
      previousValue: { title, description, duration, zoomUrl, dailyResetTime, passScore, questionCount: zoomQuestionCount },
      newValue: { title: session.title, description: session.description, duration: session.duration, zoomUrl: session.zoomUrl, dailyResetTime: session.dailyResetTime, passScore: session.passScore, questionCount: session.questionCount },
    });
    res.status(200).json(session);
  } catch (error) {
    res.status(500).json({ message: 'Error updating Zoom session', error });
  }
};

export const deleteZoomSession = async (req: Request, res: Response): Promise<void> => {
  try {
    // Normalize id — Express types it as `string | string[]` for
    // route params with multiple captures. Take the first when an
    // array arrives.
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const session = await ZoomSession.findById(id);
    if (!session) {
      res.status(404).json({ message: 'Zoom session not found' });
      return;
    }

    if (session.isActive) {
      res.status(400).json({ message: 'Cannot delete the active Zoom session' });
      return;
    }

    await ZoomSession.findByIdAndDelete(id);
    await ZoomAssessmentQuestion.deleteMany({ zoomSessionId: id });
    await ZoomTranscriptChunk.deleteMany({ zoomSessionId: id });
    const { default: ZoomAssessmentAttempt } = await import('../zoom/zoom-assessment-attempt.model.js');
    await ZoomAssessmentAttempt.deleteMany({ zoomSessionId: id });

    // v1.69 — Session History: non-blocking audit emit on delete.
    void recordZoomAudit({
      adminId: (req as any).user?._id,
      sessionId: new Types.ObjectId(id),
      batchId: session.batchId,
      action: 'delete',
      previousValue: { title: session.title },
    });

    res.status(200).json({ message: 'Zoom session and its references deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting Zoom session', error });
  }
};

export const activateZoomSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const session = await ZoomSession.findById(id);
    if (!session) {
      res.status(404).json({ message: 'Zoom session not found' });
      return;
    }

    // v1.69 — multi-program scoping: deactivating other sessions
    // should only affect sessions in the SAME program. Previously
    // this deactivated every active session across all programs.
    // Also: capture which session was active before, so we can
    // emit a `switch_active` audit event on the new active row.
    const previousActive = await ZoomSession.findOne({
      batchId: session.batchId,
      isActive: true,
      _id: { $ne: session._id },
    }).select('_id title').lean();
    await ZoomSession.updateMany(
      { batchId: session.batchId },
      { $set: { isActive: false } },
    );
    session.isActive = true;
    await session.save();

    await AppSetting.findOneAndUpdate(
      { _id: 'singleton' },
      {
        $set: {
          'settings.zoomTitle': session.title,
          'settings.zoomDescription': session.description,
          'settings.zoomDuration': session.duration,
          'settings.zoomUrl': session.zoomUrl,
          'settings.zoomActive': true,
          'settings.zoomQuestionCount': session.questionCount,
          'settings.zoomDailyResetTime': session.dailyResetTime,
          'settings.zoomPassScore': session.passScore,
          'settings.zoomTranscript': session.transcript
        }
      },
      { upsert: true }
    );

    // v1.69 — Session History: non-blocking audit emits on
    // activate / switch. Records on both the previously active
    // session (so its timeline shows "deactivated") and the newly
    // active one (so its timeline shows "switch_active"). Existing
    // response shape (200 with `{ message, session }`) unchanged.
    const adminId = (req as any).user?._id;
    if (previousActive?._id) {
      void recordZoomAudit({
        adminId, sessionId: previousActive._id, batchId: session.batchId,
        action: 'activate', newValue: { deactivatedBecause: session._id.toString() },
      });
    }
    void recordZoomAudit({
      adminId, sessionId: session._id, batchId: session.batchId,
      action: 'switch_active',
      previousValue: previousActive ? { activeSessionId: previousActive._id.toString() } : null,
      newValue: { activeSessionId: session._id.toString(), title: session.title },
    });

    res.status(200).json({ message: 'Zoom session activated successfully', session });
  } catch (error) {
    res.status(500).json({ message: 'Error activating Zoom session', error });
  }
};

export const uploadZoomSessionTranscript = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const session = await ZoomSession.findById(id);
    if (!session) {
      res.status(404).json({ message: 'Zoom session not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const { buffer, originalname, mimetype } = req.file;
    let textContent = '';

    if (originalname.endsWith('.pdf') || mimetype === 'application/pdf') {
      const md = new MarkItDown();
      const tempPath = path.join(os.tmpdir(), `transcript-${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, buffer);
      try {
        const result = await md.convert(tempPath);
        textContent = (result as any).text || (result as any).textContent || '';
      } catch (e) {
        console.error('markitdown error:', e);
      } finally {
        fs.unlinkSync(tempPath);
      }
    } else {
      textContent = buffer.toString('utf-8');
    }

    if (!textContent.trim()) {
      res.status(400).json({ message: 'Could not extract text from the file.' });
      return;
    }

    session.transcript = textContent;
    await session.save();

    if (session.isActive) {
      await AppSetting.findOneAndUpdate(
        { _id: 'singleton' },
        { $set: { 'settings.zoomTranscript': textContent } },
        { upsert: true }
      );
    }

    await ZoomTranscriptChunk.deleteMany({ zoomSessionId: id });

    const paragraphs = textContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';
    for (const p of paragraphs) {
      if (currentChunk.length + p.length > 1000) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = p;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + p;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk);
      await ZoomTranscriptChunk.create({
        zoomSessionId: id,
        text: chunk,
        embedding
      });
    }

    // v1.69 — Session History: non-blocking audit emit on
    // transcript upload. Existing response unchanged.
    void recordZoomAudit({
      adminId: (req as any).user?._id,
      sessionId: session._id,
      batchId: session.batchId,
      action: 'transcript_upload',
      newValue: { chunks: chunks.length },
    });

    res.status(200).json({ message: 'Transcript uploaded and processed successfully for this session.' });
  } catch (error) {
    console.error('Error in uploadZoomSessionTranscript', error);
    res.status(500).json({ message: 'Error processing transcript', error });
  }
};

export const regenerateZoomSessionAssessmentPool = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const session = await ZoomSession.findById(id);
    if (!session) {
      res.status(404).json({ message: 'Zoom session not found' });
      return;
    }

    const chunksCount = await ZoomTranscriptChunk.countDocuments({ zoomSessionId: id });
    if (chunksCount === 0) {
      res.status(400).json({ message: 'Please upload a transcript for this session before generating the pool.' });
      return;
    }

    const zoomQuestionCount = session.questionCount || 10;
    const targetPoolSize = Math.max(50, zoomQuestionCount * 3);

    const faqs = await FAQ.aggregate([{ $sample: { size: 50 } }]);
    const recentFaqs = await FAQ.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
      { $sample: { size: 50 } }
    ]);
    const chunks = await ZoomTranscriptChunk.aggregate([
      { $match: { zoomSessionId: session._id } },
      { $sample: { size: 100 } }
    ]);

    const aiClient = new AiClient();
    
    await ZoomAssessmentQuestion.deleteMany({ zoomSessionId: id });

    const questionsToGenerate = targetPoolSize;
    let generatedCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < Math.ceil(questionsToGenerate / 10); i++) {
      const prompt = `Generate 10 multiple-choice, true/false, or scenario questions for an onboarding assessment.
Sources to use:
FAQs: ${JSON.stringify(faqs.slice(i*10, i*10 + 10).map(f => ({ q: f.question, a: f.answer })))}
Recent FAQs: ${JSON.stringify(recentFaqs.slice(i*10, i*10 + 10).map(f => ({ q: f.question, a: f.answer })))}
Transcript: ${JSON.stringify(chunks.slice(i*20, i*20 + 20).map(c => c.text))}

Output a strict JSON array of objects:
[{ "question": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0, "type": "MCQ", "sourceType": "transcript" }]
Valid types are "MCQ", "TrueFalse", "Scenario".
Valid sourceTypes are "faq", "transcript", "recent_faq".
Weight them approximately: 60% transcript, 20% faq, 20% recent_faq.
Do NOT wrap with markdown formatting like \`\`\`json, just output the raw JSON array.
      `;
      
      try {
        const result = await aiClient.chat([
          { role: 'system', content: 'You are a JSON API. Output only valid JSON arrays.' },
          { role: 'user', content: prompt }
        ], 'faqGeneration', { temperature: 0.4, maxTokens: 4096 });

        let parsed = [];
        try {
          const clean = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(clean);
        } catch (e) {
           console.error('Failed to parse JSON', result.content);
           errors.push('AI returned invalid JSON format.');
        }

        if (Array.isArray(parsed)) {
          for (const q of parsed) {
            if (!q.question || !Array.isArray(q.options) || q.correctOptionIndex === undefined) continue;
            await ZoomAssessmentQuestion.create({
               zoomSessionId: id,
               question: q.question,
               options: q.options,
               correctOptionIndex: q.correctOptionIndex,
               type: q.type || 'MCQ',
               sourceType: q.sourceType || 'transcript'
            });
            generatedCount++;
          }
        }
      } catch (err: any) {
        console.error('Batch generation failed', err);
        errors.push(err.message || String(err));
      }
    }

    if (generatedCount === 0 && errors.length > 0) {
      res.status(500).json({ message: `Assessment pool generation failed: ${errors[0]}` });
      return;
    }

    res.status(200).json({ message: `Successfully generated ${generatedCount} questions for this session.` });
    // v1.69 — Session History: non-blocking audit emit on
    // regenerate. Existing 200 response already returned above
    // before this point; the audit is a pure side-effect.
    // (We intentionally place the emit AFTER the success response
    // so the user-facing flow is unchanged even if the audit log
    // throws.) — actually moved below since we need a fire-and-forget
    // that doesn't block the user flow. The res.status above is the
    // terminal statement and is preserved; the audit runs only
    // when we got this far.
    void recordZoomAudit({
      adminId: (req as any).user?._id,
      sessionId: session._id,
      batchId: session.batchId,
      action: 'regenerate',
      newValue: { generatedCount },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: 'Error regenerating pool: ' + (error.message || String(error)), error });
  }
};

export const getSessionQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const questions = await ZoomAssessmentQuestion.find({ zoomSessionId: id }).sort({ createdAt: -1 });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching session questions', error });
  }
};

export const createSessionQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { question, options, correctOptionIndex, type, sourceType } = req.body;
    if (!question || !Array.isArray(options) || correctOptionIndex === undefined) {
      res.status(400).json({ message: 'Question text, options array and correct option index are required.' });
      return;
    }

    const q = await ZoomAssessmentQuestion.create({
      zoomSessionId: id,
      question,
      options,
      correctOptionIndex,
      type: type || 'MCQ',
      sourceType: sourceType || 'transcript'
    });
    res.status(201).json(q);
  } catch (error) {
    res.status(500).json({ message: 'Error creating question', error });
  }
};

export const updateSessionQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, qId } = req.params;
    const { question, options, correctOptionIndex, type, sourceType } = req.body;

    const q = await ZoomAssessmentQuestion.findOneAndUpdate(
      { _id: qId, zoomSessionId: id },
      {
        $set: {
          question,
          options,
          correctOptionIndex,
          type,
          sourceType
        }
      },
      { new: true }
    );

    if (!q) {
      res.status(404).json({ message: 'Question not found in this session' });
      return;
    }

    res.status(200).json(q);
  } catch (error) {
    res.status(500).json({ message: 'Error updating question', error });
  }
};

export const deleteSessionQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, qId } = req.params;
    const q = await ZoomAssessmentQuestion.findOneAndDelete({ _id: qId, zoomSessionId: id });
    if (!q) {
      res.status(404).json({ message: 'Question not found in this session' });
      return;
    }
    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting question', error });
  }
};

// ─── Zoom Session History / Activity Log ─────────────────────────────────────
//
// v1.69 — Session History: a single GET that returns the merged
// timeline of (a) audit log entries for the given ZoomSession and
// (b) a derived lifecycle event list. Used by the SessionTimeline
// component on the front-end to render the per-session activity
// log next to the existing edit form.
//
// Existing endpoints (list/create/update/delete/activate/regenerate)
// are untouched. Audit log entries are emitted non-blocking from
// those handlers as a side effect — see `recordZoomAudit()`.
//
// Returns entries newest-first, capped at 200.
export const getZoomSessionActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid ZoomSession id is required.' });
      return;
    }
    const session = await ZoomSession.findById(id).select('batchId title').lean();
    if (!session) {
      res.status(404).json({ message: 'Zoom session not found.' });
      return;
    }
    // Fetch entries where the entityId matches (zoom_session events)
    // OR where the entityType is zoom_question AND we surface the
    // session id through entityId-of-the-session filter — that's a
    // derived lookup that we skip here to keep the query tight.
    //
    // v1.69 — populate is wrapped in a try/catch because the test
    // suite seeds sessions without a User collection. The populate
    // fails silently in that case (changedBy is null) and we still
    // return the entries — that's better than 500ing the timeline.
        let entries: any[] = [];
        try {
          entries = await OnboardingAuditLog.find({
            entityType: { $in: ['zoom_session', 'zoom_question'] },
            entityId: new Types.ObjectId(id),
          })
            .populate('changedBy', 'name email')
            .sort({ timestamp: -1 })
            .limit(200)
            .lean();
        } catch (populateErr) {
          // Populate can fail when the populated collection is absent
          // (e.g. test DBs without a User model). Fall back to no
          // populate so the timeline still renders.
          entries = await OnboardingAuditLog.find({
            entityType: { $in: ['zoom_session', 'zoom_question'] },
            entityId: new Types.ObjectId(id),
          })
            .sort({ timestamp: -1 })
            .limit(200)
            .lean();
        }

    // Derived: synthetic "created" event from the session's
    // createdAt so the timeline always starts at session birth,
    // even if the first audit log emit happens later (legacy data).
    const derivedCreated = {
      _id: `derived-create-${id}`,
      changedBy: null,
      entityType: 'zoom_session',
      entityId: new Types.ObjectId(id),
      action: 'create',
      previousValue: null,
      newValue: { title: session.title },
      timestamp: (session as unknown as { createdAt?: Date }).createdAt ?? new Date(),
      derived: true,
    } as const;

    res.status(200).json({
      sessionId: id,
      batchId: session.batchId ?? null,
      entries: [derivedCreated, ...entries],
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching session activity', error });
  }
};

/**
 * recordZoomAudit — emit an OnboardingAuditLog entry for a Zoom
 * lifecycle event. Non-blocking; failures are swallowed so a
 * logging miss never breaks the user-facing flow.
 *
 * Adds capability to the existing welcome-kit audit pipeline
 * without modifying any existing audit-log emit sites.
 */
async function recordZoomAudit(opts: {
  adminId?: Types.ObjectId | string | null;
  sessionId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  action: 'create' | 'update' | 'delete' | 'activate' | 'transcript_upload' | 'regenerate' | 'switch_active';
  entityType?: 'zoom_session' | 'zoom_question';
  previousValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  try {
    if (!opts.adminId) return; // skip if no actor — preserves existing behavior
    await OnboardingAuditLog.create({
      changedBy: new Types.ObjectId(String(opts.adminId)),
      batchId: opts.batchId ?? null,
      entityType: opts.entityType ?? 'zoom_session',
      entityId: opts.sessionId,
      action: opts.action,
      previousValue: opts.previousValue,
      newValue: opts.newValue,
      timestamp: new Date(),
    });
  } catch (err) {
    // swallow — logging must never break the user flow.
    console.warn('[zoom-audit] failed to record event:', (err as Error).message);
  }
}
