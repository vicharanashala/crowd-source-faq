import { Request, Response } from 'express';
import AppSetting, { readSetting } from '../program/app-setting.model.js';
import User from '../auth/user.model.js';
import ZoomAssessmentAttempt from './zoom-assessment-attempt.model.js';
import ZoomSession from './zoom-session.model.js';
import { Types } from 'mongoose';
import { getLastResetTime } from '../../integrations/zoom/zoomTime.js';

/**
 * resolveActiveSession — find the active onboarding Zoom session
 * for THIS request.
 *
 * Why this exists:
 *   The legacy implementation used `ZoomSession.findOne({ isActive: true })`
 *   which is a GLOBAL query. With multi-program isolation, more than one
 *   program can have `isActive: true` set on a session at the same
 *   time (the activate handler only deactivates same-program sessions),
 *   so the legacy query returned whichever document MongoDB happened
 *   to surface first — students in program B could be served the
 *   questions generated for program A.
 *
 * Resolution order (matches the admin-side convention):
 *   1. If `req.headers['x-program-id']` is set (the frontend's
 *      axios interceptor attaches this on every authenticated
 *      request), prefer the active session in THAT program.
 *   2. Otherwise fall back to the legacy global query — preserves
 *      backward compatibility for any caller that doesn't send the
 *      header (e.g. legacy curl flows, the welcome / status check
 *      before login in some flows).
 *
 * Returns `null` when no active session exists at all. The caller
 * is expected to translate that to a 400 / "no active session"
 * response — same shape as before.
 */
async function resolveActiveSession(req: Request): Promise<any | null> {
  // v1.69 — student assessment isolation: scope to the student's
  // active program when the header is present.
  const fromHeader =
    (req.headers['x-program-id'] as string | undefined) ||
    (req.headers['x-batch-id'] as string | undefined) ||
    (req.headers['x-workspace-id'] as string | undefined);
  if (fromHeader && Types.ObjectId.isValid(fromHeader)) {
    const scoped = await ZoomSession.findOne({
      isActive: true,
      batchId: new Types.ObjectId(fromHeader),
    });
    if (scoped) return scoped;
    // No active session in that program — DON'T fall through to a
    // different program's session. That was the bug: returning a
    // cross-program session here made students see the wrong
    // questions. Return null and let the caller respond with the
    // standard "no active session" error.
    return null;
  }
  // Backwards-compatible path: caller didn't tell us which program.
  // Pick the most recently updated active session.
  return ZoomSession.findOne({ isActive: true }).sort({ updatedAt: -1 });
}

export const getAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const activeSession = await resolveActiveSession(req);
    const zoomActive = activeSession ? await readSetting('zoomActive', false) : false;
    if (!zoomActive || !activeSession) {
      res.status(400).json({ message: 'Zoom onboarding is not currently active' });
      return;
    }

    const zoomDailyResetTime = activeSession.dailyResetTime || '09:00 AM';
    const lastReset = getLastResetTime(zoomDailyResetTime);

    // Look for an active attempt for this session started after the last reset
    let attempt = await ZoomAssessmentAttempt.findOne({
      zoomSessionId: activeSession._id,
      userId: user._id,
      status: 'started',
      createdAt: { $gte: lastReset }
    });

    if (attempt) {
      const answersObj: Record<string, number> = {};
      attempt.answers.forEach((val, key) => {
        answersObj[key] = val;
      });

      res.status(200).json({
        attemptId: attempt._id.toString(),
        questions: attempt.questions.map(q => ({
          id: q._id.toString(),
          question: q.question,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex
        })),
        answers: answersObj,
        currentIdx: attempt.currentIdx
      });
      return;
    }

    const { default: ZoomAssessmentQuestion } = await import('./zoom-assessment-question.model.js');

    const totalQuestions = await ZoomAssessmentQuestion.countDocuments({ zoomSessionId: activeSession._id });
    if (totalQuestions === 0) {
      res.status(400).json({ message: 'Assessment pool not generated' });
      return;
    }

    const zoomQuestionCount = activeSession.questionCount || 10;
    const seenSet = user.seenAssessmentQuestions || [];
    const pipeline: any[] = [];
    
    // Scoped to current session
    pipeline.push({ $match: { zoomSessionId: activeSession._id } });
    if (seenSet.length > 0) {
      pipeline.push({ $match: { question: { $nin: seenSet } } });
    }
    pipeline.push({ $sample: { size: zoomQuestionCount } });

    let newQuestions = await ZoomAssessmentQuestion.aggregate(pipeline);

    if (newQuestions.length < zoomQuestionCount) {
      newQuestions = await ZoomAssessmentQuestion.aggregate([
        { $match: { zoomSessionId: activeSession._id } },
        { $sample: { size: zoomQuestionCount } }
      ]);
    }

    const passScore = activeSession.passScore || 70;

    attempt = await ZoomAssessmentAttempt.create({
      zoomSessionId: activeSession._id,
      userId: user._id,
      questions: newQuestions.map(q => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        type: q.type,
        sourceType: q.sourceType
      })),
      answers: {},
      currentIdx: 0,
      status: 'started',
      passScore,
      zoomQuestionCount
    });

    res.status(200).json({
      attemptId: attempt._id.toString(),
      questions: attempt.questions.map(q => ({
        id: q._id.toString(),
        question: q.question,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex
      })),
      answers: {},
      currentIdx: 0
    });

  } catch (error) {
    console.error('getAssessment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const activeSession = await resolveActiveSession(req);
    if (!activeSession) {
      res.status(400).json({ message: 'No active Zoom onboarding session found.' });
      return;
    }

    const zoomDailyResetTime = activeSession.dailyResetTime || '09:00 AM';
    const lastReset = getLastResetTime(zoomDailyResetTime);

    // Find the current active attempt
    const attempt = await ZoomAssessmentAttempt.findOne({
      zoomSessionId: activeSession._id,
      userId: user._id,
      status: 'started',
      createdAt: { $gte: lastReset }
    });

    if (!attempt) {
      res.status(400).json({ message: 'No active assessment attempt found. It may have expired due to daily reset.' });
      return;
    }

    const { answers, currentIdx, progressOnly } = req.body;

    if (progressOnly) {
      if (answers) {
        attempt.answers = answers;
      }
      if (typeof currentIdx === 'number') {
        attempt.currentIdx = currentIdx;
      }
      await attempt.save();
      res.status(200).json({ success: true });
      return;
    }

    let correct = 0;
    const finalAnswers = answers || {};

    attempt.questions.forEach(q => {
      const userAns = finalAnswers[q._id.toString()];
      if (userAns === q.correctOptionIndex) {
        correct++;
      }
    });

    const score = Math.round((correct / attempt.questions.length) * 100);
    const passed = score >= attempt.passScore;

    attempt.score = score;
    attempt.status = passed ? 'passed' : 'failed';
    attempt.completedAt = new Date();
    
    if (answers) {
      attempt.answers = answers;
    }
    if (typeof currentIdx === 'number') {
      attempt.currentIdx = currentIdx;
    }
    await attempt.save();

    const questionsSeen = attempt.questions.map(q => q.question);
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { seenAssessmentQuestions: { $each: questionsSeen } }
    });

    if (passed) {
      await User.findByIdAndUpdate(user._id, { zoomAssessmentPassed: true });
      res.status(200).json({ 
        passed: true, 
        message: 'Congratulations! You passed the onboarding assessment.',
        zoomDetails: { 
          zoomUrl: activeSession.zoomUrl, 
          zoomTitle: activeSession.title, 
          zoomDescription: activeSession.description,
          zoomDuration: activeSession.duration
        }
      });
    } else {
      res.status(200).json({ 
        passed: false, 
        message: `You scored ${score}%. Passing score is ${attempt.passScore}%. Please try again.`,
        passScore: attempt.passScore
      });
    }

  } catch (error) {
    console.error('submitAssessment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getZoomStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const activeSession = await resolveActiveSession(req);
    if (!activeSession) {
      res.status(200).json({ active: false, status: 'no_config', message: 'No active Zoom onboarding session found' });
      return;
    }

    if (!activeSession.zoomUrl) {
      res.status(200).json({ active: false, status: 'no_config', message: 'No Zoom URL configured for this session' });
      return;
    }

    const zoomActive = await readSetting('zoomActive', false);
    if (!zoomActive) {
      res.status(200).json({ active: false, status: 'disabled', message: 'Zoom onboarding is disabled by admin' });
      return;
    }

    if (!activeSession.transcript) {
      res.status(200).json({ active: false, status: 'no_transcript', message: 'Transcript missing for this session' });
      return;
    }

    const { default: ZoomAssessmentQuestion } = await import('./zoom-assessment-question.model.js');
    const questionCount = await ZoomAssessmentQuestion.countDocuments({ zoomSessionId: activeSession._id });
    if (questionCount === 0) {
      res.status(200).json({ active: false, status: 'no_assessment', message: 'Assessment not generated for this session' });
      return;
    }

    const zoomDailyResetTime = activeSession.dailyResetTime || '09:00 AM';
    const lastReset = getLastResetTime(zoomDailyResetTime);

    // Look for a passed attempt completed after the last reset for this session
    const passedAttempt = await ZoomAssessmentAttempt.findOne({
      zoomSessionId: activeSession._id,
      userId: user._id,
      status: 'passed',
      completedAt: { $gte: lastReset }
    });

    if (passedAttempt) {
      res.status(200).json({
        active: true,
        passed: true,
        status: 'passed',
        message: 'User already passed',
        zoomDetails: { 
          zoomUrl: activeSession.zoomUrl, 
          zoomTitle: activeSession.title, 
          zoomDescription: activeSession.description, 
          zoomDuration: activeSession.duration 
        }
      });
      return;
    }

    res.status(200).json({
      active: true,
      passed: false,
      status: 'eligible',
      message: 'User eligible for Zoom'
    });

  } catch (error) {
    console.error('getZoomStatus error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
