import AppSetting from '../modules/program/app-setting.model.js';
import ZoomSession from '../modules/zoom/zoom-session.model.js';
import ZoomAssessmentQuestion from '../modules/zoom/zoom-assessment-question.model.js';
import ZoomTranscriptChunk from '../modules/zoom/zoom-transcript-chunk.model.js';
import ZoomAssessmentAttempt from '../modules/zoom/zoom-assessment-attempt.model.js';
import { logger } from './http/logger.js';

export async function migrateZoomSettingsToSessions() {
  try {
    const sessionCount = await ZoomSession.countDocuments();
    if (sessionCount > 0) {
      return;
    }

    logger.info('[zoom-migration] No Zoom sessions found. Checking singleton settings for migration...');
    const appSetting = await AppSetting.findById('singleton').lean();
    
    // Create a default session
    let defaultSessionData = {
      title: 'Onboarding Zoom Session',
      description: 'Join us for the live onboarding.',
      duration: '60 minutes',
      zoomUrl: 'https://zoom.us',
      isActive: false,
      transcript: '',
      questionCount: 10,
      passScore: 70,
      dailyResetTime: '09:00 AM'
    };

    if (appSetting && appSetting.settings) {
      const s = appSetting.settings;
      defaultSessionData = {
        title: s.zoomTitle || 'Onboarding Zoom Session',
        description: s.zoomDescription || 'Join us for the live onboarding.',
        duration: s.zoomDuration || '60 minutes',
        zoomUrl: s.zoomUrl || 'https://zoom.us',
        isActive: s.zoomActive ?? false,
        transcript: s.zoomTranscript || '',
        questionCount: s.zoomQuestionCount ?? 10,
        passScore: s.zoomPassScore ?? 70,
        dailyResetTime: s.zoomDailyResetTime ?? '09:00 AM'
      };
    }

    const defaultSession = await ZoomSession.create(defaultSessionData);
    const sessionId = defaultSession._id;
    logger.info(`[zoom-migration] Created default Zoom session "${defaultSession.title}" with ID ${sessionId}`);

    // Update existing orphaned collections
    const questionsResult = await ZoomAssessmentQuestion.updateMany(
      { zoomSessionId: { $exists: false } },
      { $set: { zoomSessionId: sessionId } }
    );
    logger.info(`[zoom-migration] Linked ${questionsResult.modifiedCount} questions to default session.`);

    const chunksResult = await ZoomTranscriptChunk.updateMany(
      { zoomSessionId: { $exists: false } },
      { $set: { zoomSessionId: sessionId } }
    );
    logger.info(`[zoom-migration] Linked ${chunksResult.modifiedCount} transcript chunks to default session.`);

    const attemptsResult = await ZoomAssessmentAttempt.updateMany(
      { zoomSessionId: { $exists: false } },
      { $set: { zoomSessionId: sessionId } }
    );
    logger.info(`[zoom-migration] Linked ${attemptsResult.modifiedCount} attempts to default session.`);

    logger.info('[zoom-migration] Migration complete!');
  } catch (error) {
    logger.error('[zoom-migration] Migration failed:', { error });
  }
}
