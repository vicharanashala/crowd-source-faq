/**
 * cascade-delete.service — wipe every piece of program-scoped data.
 *
 * `deleteBatch` previously only cascaded into FAQs. That orphaned
 * ProgramConfig, ProgramSettings, FeatureFlag overrides, Zoom
 * meetings + transcript chunks, uploaded documents, community
 * posts, projects, courses, mentors, timeline steps, and every
 * audit / log / search / notification entry. This service walks
 * every batchId-scoped collection in one place so the controller
 * stays a thin wrapper.
 *
 * Idempotency: each step is `deleteMany({ batchId: id })` which is
 * inherently idempotent — calling twice deletes the same zero rows
 * the second time. Safe to retry.
 *
 * Non-scope: things that are NOT deleted:
 *   - Users (they may be enrolled in other programs too)
 *   - Auth tokens (refresh, revoked) — global per-user
 *   - Job records — these are infra, not program-scoped
 *   - RegistrationConfig singleton — global
 *
 * Returns a per-collection count so admins can see exactly what was
 * wiped in the audit log.
 */

import Batch from './batch.model.js';
import ProgramConfig from './program-config.model.js';
import ProgramSettings from './program-settings.model.js';
import FeatureFlag from './feature-flag.model.js';
import ProgramEnrollment from './program-enrollment.model.js';
import AppSetting from './app-setting.model.js';
import CategoryCluster from './category-cluster.model.js';
import GuestEvent from './guest-event.model.js';
import FAQ from '../faq/faq.model.js';
import Category from '../faq/category.model.js';
import CommunityPost from '../community/community-post.model.js';
import DocumentRecord from '../knowledge/document-record.model.js';
import DocumentInsight from '../knowledge/document-insight.model.js';
import { TranscriptKnowledge } from '../knowledge/transcript-knowledge.model.js';
import { ZoomMeeting } from '../zoom/zoom-meeting.model.js';
import ZoomSession from '../zoom/zoom-session.model.js';
import ZoomTranscriptChunk from '../zoom/zoom-transcript-chunk.model.js';
import ZoomAssessmentQuestion from '../zoom/zoom-assessment-question.model.js';
import ZoomAssessmentAttempt from '../zoom/zoom-assessment-attempt.model.js';
import SupportRequest from '../support/support-request.model.js';
import SupportCategory from '../support/support-category.model.js';
import SearchLog from '../search/search-log.model.js';
import UnresolvedSearch from '../search/unresolved-search.model.js';
import AiConfig from '../ai/ai-config.model.js';
import AiQuestion from '../ai/ai-question.model.js';
import { PipelineResult } from '../ai/pipeline-result.model.js';
import Notification from '../notification/notification.model.js';
import TeaNotification from '../notification/tea-notification.model.js';
import ProgramReputation from '../moderation/program-reputation.model.js';
import ReputationLog from '../moderation/reputation-log.model.js';
import Badge from '../moderation/badge.model.js';
import ModerationLog from '../moderation/moderation-log.model.js';
import FreshReviewLog from '../faq/fresh-review-log.model.js';
import FreshReviewVote from '../faq/fresh-review-vote.model.js';
import Project from '../admin/project.model.js';
import Mentor from '../admin/mentor.model.js';
import TimelineStep from '../admin/timeline-step.model.js';
import Course from './course.model.js';
import Orientation from './orientation.model.js';
// v1.69 — Welcome Package Management: additive — the new
// OnboardingResource + OnboardingKnowledgeSource + their chunks
// live in dedicated collections. Cascade-delete picks them up too
// so a program's resources + knowledge are wiped together with
// everything else when the program is hard-deleted.
import OnboardingResource from './onboarding-resource.model.js';
import {
  default as OnboardingKnowledgeSource,
  OnboardingKnowledgeChunk,
} from './onboarding-knowledge.model.js';
import ResourceCompletion from './resource-completion.model.js';
import { logger } from '../../utils/http/logger.js';

export interface CascadeResult {
  batchId: string;
  deleted: Record<string, number>;
  errors: string[];
}

/**
 * Delete every program-scoped record for the given batch.
 *
 * Order matters at the edges: we delete children before parents
 * where the child has its own batchId and references the parent
 * (e.g. DocumentInsight before DocumentRecord, FreshReviewVote
 * before FreshReviewLog). For most collections, the order is
 * irrelevant because each collection is independently batchId-scoped
 * — but doing it cleanly avoids any future FK-style check surprises.
 */
export async function cascadeDeleteProgram(batchId: string): Promise<CascadeResult> {
  const result: CascadeResult = {
    batchId,
    deleted: {},
    errors: [],
  };

  // Helper: run a delete + capture count or error.
  const step = async (label: string, model: { deleteMany: (q: Record<string, unknown>) => Promise<{ deletedCount?: number }> }): Promise<void> => {
    try {
      const r = await model.deleteMany({ batchId });
      result.deleted[label] = r.deletedCount ?? 0;
    } catch (err) {
      const msg = `${label} delete failed: ${(err as Error).message}`;
      logger.error(`[cascade-delete] ${msg}`);
      result.errors.push(msg);
    }
  };

  // ── Children (children-of-collection rows) first ────────────────────
  await step('freshReviewVote', FreshReviewVote);
  await step('freshReviewLog', FreshReviewLog);
  await step('documentInsight', DocumentInsight);
  await step('documentRecord', DocumentRecord);
  await step('transcriptKnowledge', TranscriptKnowledge);
  await step('zoomTranscriptChunk', ZoomTranscriptChunk);
  await step('zoomAssessmentAttempt', ZoomAssessmentAttempt);
  await step('communityPost', CommunityPost);
  await step('zoomMeeting', ZoomMeeting);
  await step('zoomSession', ZoomSession);
  await step('zoomAssessmentQuestion', ZoomAssessmentQuestion);
  await step('supportRequest', SupportRequest);
  await step('supportCategory', SupportCategory);
  await step('searchLog', SearchLog);
  await step('unresolvedSearch', UnresolvedSearch);
  await step('pipelineResult', PipelineResult);
  await step('reputationLog', ReputationLog);
  await step('programReputation', ProgramReputation);
  await step('badge', Badge);
  await step('moderationLog', ModerationLog);
  await step('teaNotification', TeaNotification);
  await step('notification', Notification);
  await step('aiQuestion', AiQuestion);
  await step('aiConfig', AiConfig);

  // ── Welcome kit (now batchId-scoped after Phase 1b) ──────────────────
  await step('orientation', Orientation);
  await step('project', Project);
  await step('mentor', Mentor);
  await step('timelineStep', TimelineStep);
  await step('course', Course);
  await step('categoryCluster', CategoryCluster);
  await step('guestEvent', GuestEvent);

  // v1.69 — Welcome Package Management: additive cascade coverage.
  // Chunks first (FK to source), then sources, then resources,
  // then completions — order matters for foreign-key style refs.
  await step('onboardingKnowledgeChunk', OnboardingKnowledgeChunk);
  await step('onboardingKnowledgeSource', OnboardingKnowledgeSource);
  await step('onboardingResource', OnboardingResource);
  await step('resourceCompletion', ResourceCompletion);

  // ── FAQs / categories (the only thing the previous code cascaded) ──
  await step('faq', FAQ);
  await step('category', Category);

  // ── Per-program config (singletons) ─────────────────────────────────
  await step('programEnrollment', ProgramEnrollment);
  await step('programConfig', ProgramConfig);
  await step('programSettings', ProgramSettings);
  await step('appSetting', AppSetting);
  // FeatureFlag uses {key, batchId} — delete only per-program overrides.
  // Global defaults (batchId: null) are shared across programs and stay.
  try {
    const r = await FeatureFlag.deleteMany({ batchId });
    result.deleted['featureFlag'] = r.deletedCount ?? 0;
  } catch (err) {
    const msg = `featureFlag delete failed: ${(err as Error).message}`;
    logger.error(`[cascade-delete] ${msg}`);
    result.errors.push(msg);
  }

  // ── Finally the Batch row itself ────────────────────────────────────
  try {
    const r = await Batch.deleteOne({ _id: batchId });
    result.deleted['batch'] = r.deletedCount ?? 0;
  } catch (err) {
    const msg = `batch delete failed: ${(err as Error).message}`;
    logger.error(`[cascade-delete] ${msg}`);
    result.errors.push(msg);
  }

  return result;
}