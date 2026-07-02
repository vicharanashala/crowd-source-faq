/**
 * Zoom Controller — per-user OAuth + webhook handler + admin CRUD.
 *
 * OAuth flow (per-user):
 *   User clicks "Connect Zoom" → /api/zoom/auth/connect → Zoom → /api/zoom/auth/callback
 *   → tokens stored in User document, linked via zoomUserId
 *
 * Webhook flow (per-user):
 *   Zoom fires POST /api/zoom/webhook with event + user_id
 *   → look up user by zoomUserId → use their stored token to download transcript
 *   → parse → store segments + insights
 *
 * Privacy: meetings matching ZOOM_TOPIC_BLACKLIST are skipped.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { ZoomMeeting, ZoomInsight } from './zoom-meeting.model.js';
import User from '../auth/user.model.js';
import { downloadTranscriptAsUser, getPastRecordings } from '../../integrations/zoom/zoomOAuth.js';
import { parseVTTWithSpeakers, isEmptyFromSegments } from '../../integrations/zoom/vttParser.js';
import { processZoomMeetingForKnowledge } from '../knowledge/knowledge-base.service.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { invalidateCache } from '../../utils/http/cache.js';
import { extractInsightsFromTranscript } from '../../integrations/zoom/zoomExtractor.js';
import { CircuitOpenError } from '../../utils/http/circuitBreaker.js';
import { sanitizeText } from '../../utils/http/sanitize.js';
import { httpLog } from '../../utils/http/logger.js';
import { getZoomHealth, recordZoomError } from '../../integrations/zoom/zoomHealth.js';
import { scheduleRetry, manualRetry } from './retry.service.js';

// ─── Webhook Signature Verification ─────────────────────────────────────────

/**
 * Zoom sends x-zm-signature: "v0=<hmac>" on every POST webhook.
 * We verify it against ZOOM_WEBHOOK_SECRET_TOKEN if configured.
 * If env var is missing, verification is skipped (dev mode).
 */
function verifyZoomSignature(req: Request): boolean {
  const secret = process.env['ZOOM_WEBHOOK_SECRET_TOKEN'];
  if (!secret) {
    // Fail closed in production — accepting unsigned webhooks in prod would
    // let anyone create fake ZoomMeeting records and drain the AI quota.
    // In dev/staging, fall open with a loud log so the developer notices.
    if (process.env['NODE_ENV'] === 'production') {
      httpLog.error('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN missing in production — rejecting webhook');
      return false;
    }
    httpLog.warn('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN not set — skipping signature verification (dev only)');
    return true;
  }
  const header = req.headers['x-zm-signature'] as string | undefined;
  if (!header) return false;
  
  // Use rawBody buffer if available, falling back to JSON.stringify
  const payloadStr = (req as any).rawBody 
    ? (req as any).rawBody.toString('utf8') 
    : JSON.stringify(req.body);

  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  
  const headerBuf = Buffer.from(header, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (headerBuf.length !== expectedBuf.length) return false;
  
  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

// ─── Webhook Validation ──────────────────────────────────────────────────────

export async function handleZoomChallenge(req: Request, res: Response): Promise<void> {
  const { challenge } = req.query;
  if (!challenge || typeof challenge !== 'string') {
    res.status(400).send('Missing challenge');
    return;
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send(challenge);
}

// ─── Progress helper ──────────────────────────────────────────────────────────

type ProgressStage = 'queued' | 'parsing' | 'extracting' | 'embedding' | 'storing' | 'done' | 'failed';

/** Lightweight helper to update the meeting's progress field (written to DB each stage) */
async function setProgress(
  meetingId: mongoose.Types.ObjectId,
  stage: ProgressStage,
  percent: number,
  message: string,
): Promise<void> {
  await ZoomMeeting.findByIdAndUpdate(meetingId, { progress: { stage, percent, message } });
}

// ─── Webhook Event Handler ────────────────────────────────────────────────────

export async function handleZoomWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyZoomSignature(req)) {
    httpLog.warn('[Zoom] Rejected webhook with invalid signature');
    res.status(403).json({ message: 'Invalid signature' });
    return;
  }

  res.status(200).json({ received: true });

  const body = req.body as ZoomWebhookPayload;
  const event = body.event;

  httpLog.info(`[Zoom Webhook] event=${event}`, { zoomEvent: body });

  if (event === 'recording.transcript_completed' || event === 'recording.completed') {
    processRecordingEvent(body).catch((err) => {
      httpLog.error('[Zoom Webhook] Background processing failed', { error: err.message });
    });
  }
}

// ─── Manual Transcript Upload (robustness fallback) ──────────────────────────

/**
 * POST /api/zoom/upload-transcript
 *
 * Admin fallback when Zoom webhook fails (network outage, rate-limit, Zoom-side
 * glitch, or missing Zoom OAuth). Accepts a raw .vtt or .txt file upload.
 *
 * Body (multipart/form-data):
 *   file          — .vtt or .txt transcript file
 *   meetingTopic  — human-readable topic/title for this meeting (optional)
 *   meetingId     — Zoom meeting ID if known (optional, for deduplication)
 */
export async function uploadTranscript(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  if (!['admin', 'moderator'].includes((req.user as { role?: string }).role ?? '')) {
    res.status(403).json({ message: 'Admin or moderator only' }); return;
  }

  // Support both multipart file upload and JSON raw text
  const rawFile = (req as Request & { file?: { buffer?: Buffer; originalname?: string } }).file;
  const body = req.body as { meetingTopic?: string; meetingId?: string; rawText?: string };

  let rawContent: string;
  let filename: string;
  let meeting: InstanceType<typeof ZoomMeeting> | undefined;

  if (rawFile) {
    // Multipart file upload
    filename = rawFile.originalname ?? 'transcript';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext !== 'vtt' && ext !== 'txt') {
      res.status(400).json({ message: 'File must be .vtt or .txt' }); return;
    }
    rawContent = rawFile.buffer?.toString('utf-8') ?? '';
  } else if (body.rawText) {
    // Raw text body (for API clients / curl)
    rawContent = body.rawText;
    filename = 'transcript.txt';
  } else {
    res.status(400).json({ message: 'Provide a .vtt/.txt file or rawText in body' }); return;
  }

  if (!rawContent.trim()) {
    res.status(400).json({ message: 'Transcript file is empty' }); return;
  }

  if (!body.meetingTopic?.trim()) {
    res.status(400).json({ message: 'Meeting topic is required — please name this meeting.' }); return;
  }
  const meetingTopic = body.meetingTopic.trim();
  const meetingId = body.meetingId?.trim() || `manual-${Date.now()}`;

  try {
    // Determine how the transcript entered the system
    let sourcing: 'manual_vtt' | 'manual_txt' | 'manual_raw' = 'manual_txt';
    let sourceType: 'vtt' | 'txt' | 'manual' = 'txt';
    if (rawFile) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'vtt') { sourcing = 'manual_vtt'; sourceType = 'vtt'; }
      else               { sourcing = 'manual_txt'; sourceType = 'txt';  }
    } else {
      sourcing = 'manual_raw'; sourceType = 'manual';
    }

    // Create a meeting record so the pipeline is identical to webhook
    meeting = await ZoomMeeting.create({
      userId: req.user!._id,
      zoomMeetingId: meetingId,
      topic: meetingTopic,
      startTime: new Date(),
      status: 'pending',
      sourcing,
      sourceType,
      manualUploadedBy: req.user!._id,
    });

    // Await the full pipeline — AI extraction + KB embedding + insight creation.
    // Errors are returned to the user as HTTP 500 with the actual message.
    // This is acceptable because the file is already in memory (multipart) or
    // already provided as rawText; there's no additional network I/O here.
    // Pass sourcing/sourceType from the upload call
    await processTranscriptPayloadInternal(meeting, rawContent, sourcing,
      sourcing === 'manual_vtt' ? 'vtt_file' :
      sourcing === 'manual_txt' ? 'txt_file' : 'manual_upload');

    res.json({
      message: 'Transcript processed successfully.',
      meetingId: meeting._id.toString(), // MongoDB _id — use this for progress polling
      zoomMeetingId: meetingId,          // display string (manual-xxx)
      topic: meetingTopic,
    });
  } catch (err) {
    httpLog.error('[Zoom] Manual upload processing failed', { error: (err as Error).message, meetingId });
    res.status(500).json({
      message: 'Processing failed: ' + (err as Error).message,
      meetingId: meeting?._id?.toString(),
      zoomMeetingId: meetingId,
    });
  }
}

// ─── Auto Backfill (on first connect + periodic) ─────────────────────────────

/**
 * Called after a user connects their Zoom account via OAuth.
 * Fetches past cloud recordings (last 90 days) and queues them for processing
 * so no knowledge is missed from the gap between Zoom connect and webhook setup.
 *
 * Runs non-blocking — the user is redirected immediately; backfill continues
 * in the background without blocking the HTTP response.
 */
export async function backfillPastMeetings(userId: string, zoomUserId: string): Promise<void> {
  try {
    const meetings = await getPastRecordings(userId);

    if (meetings.length === 0) {
      httpLog.info(`[Zoom Backfill] No past recordings found for user ${userId}`);
      return;
    }

    httpLog.info(`[Zoom Backfill] Found ${meetings.length} past recordings for user ${userId}`);

    // Deduplicate against already-processed meetings
    const existingIds = new Set(
      await ZoomMeeting.find({ zoomMeetingId: { $in: meetings.map(m => m.id) } })
        .select('zoomMeetingId')
        .lean()
        .then(docs => docs.map((d: any) => d.zoomMeetingId))
    );

    let queued = 0;
    for (const meeting of meetings) {
      if (existingIds.has(meeting.id)) continue; // already processed

      const transcriptFile = (meeting.recordingFiles ?? []).find(
        (f) => f.fileType === 'TRANSCRIPT' || f.fileType === 'CC'
      );
      const downloadUrl = transcriptFile?.downloadUrl;
      if (!downloadUrl) continue; // no transcript file

      const sanitizedTopic = sanitizeText(meeting.topic ?? 'Untitled Meeting');
      if (isBlacklisted(sanitizedTopic)) continue;

      const meetingRecord = await ZoomMeeting.create({
        userId: new mongoose.Types.ObjectId(userId),
        zoomMeetingId: meeting.id,
        topic: sanitizedTopic,
        startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(),
        duration: meeting.duration,
        rawTranscriptUrl: downloadUrl,
        status: 'pending',
        sourcing: 'webhook',
        sourceType: 'zoom',
      });

      processTranscriptForUser(meetingRecord, userId).catch((err) => {
        httpLog.error(`[Zoom Backfill] Failed to process meeting ${meeting.id}: ${err instanceof Error ? err.message : err}`);
      });

      queued++;
    }

    httpLog.info(`[Zoom Backfill] Queued ${queued} past meetings for user ${userId}`);
  } catch (err) {
    // Non-fatal: backfill failure should not surface as an error to the user
    httpLog.error(`[Zoom Backfill] Backfill failed for user ${userId}: ${err instanceof Error ? err.message : err}`);
  }
}

async function processRecordingEvent(payload: ZoomWebhookPayload): Promise<void> {
  const obj = payload.payload?.object ?? {};

  // Sanitize all user-provided strings
  const zoomUserId    = sanitizeText(obj.host_id    ?? '');
  const zoomEmail     = sanitizeText(obj.host_email ?? '').toLowerCase().trim();
  const zoomMeetingId = sanitizeText(obj.id         ?? '');
  const topic         = sanitizeText(obj.topic      ?? 'Untitled Meeting');

  // ── Privacy: skip blacklisted meetings ──────────────────────────────────
  if (isBlacklisted(topic)) {
    httpLog.info(`[Zoom] Skipping blacklisted meeting: "${topic}"`);
    return;
  }

  // ── Find our user by Zoom user ID OR host email ────────────────────────
  // (host_email fallback handles the case where zoomUserId wasn't captured at OAuth time)
  let user = zoomUserId
    ? await User.findOne({ zoomUserId, zoomConnected: true })
    : null;

  if (!user && zoomEmail) {
    user = await User.findOne({ email: zoomEmail, zoomConnected: true });
  }

  if (!user) {
    httpLog.warn(`[Zoom] No connected user found for Zoom user ID: ${zoomUserId} / email: ${zoomEmail}`);
    return;
  }

  // ── Deduplication: skip if already processed ─────────────────────────────
  const existing = await ZoomMeeting.findOne({ zoomMeetingId, userId: user._id });
  if (existing) {
    httpLog.info(`[Zoom] Meeting ${zoomMeetingId} already processed for user ${user._id}`);
    return;
  }

  // ── Find transcript file URL ───────────────────────────────────────────
  const transcriptFile = (obj.recording_files ?? []).find(
    (f: RecordingFile) => f.file_type === 'TRANSCRIPT' || f.file_type === 'CC'
  ) as RecordingFile | undefined;
  const downloadUrl = transcriptFile?.download_url;
  if (!downloadUrl) {
    httpLog.warn(`[Zoom] No transcript URL in meeting ${zoomMeetingId}`);
    return;
  }

  const startTime = obj.start_time ? new Date(obj.start_time) : new Date();
  const duration = obj.duration;

  // ── Create meeting record ───────────────────────────────────────────────
  const meeting = await ZoomMeeting.create({
    userId: user._id,
    zoomMeetingId,
    topic,
    startTime,
    duration,
    rawTranscriptUrl: downloadUrl,
    status: 'pending',
    sourcing: 'webhook',
    sourceType: 'zoom',
  });

  httpLog.info(`[Zoom] Created meeting record ${meeting._id} for Zoom ID ${zoomMeetingId} (user: ${user._id})`);

  // ── Async: download + parse + extract using user's token ────────────────
  processTranscriptForUser(meeting, user._id.toString()).catch((err) => {
    const msg = err instanceof CircuitOpenError
      ? 'Circuit breaker open — Zoom API temporarily unavailable'
      : (err instanceof Error ? err.message : String(err));
    httpLog.error(`[Zoom] processTranscript failed for meeting ${meeting._id}: ${msg}`);
    recordZoomError(msg);
  });
}

/**
 * Shared pipeline that parses a raw transcript string and stores insights + KB entries.
 * Used by both the webhook path (download with user token) and the manual upload path
 * (content already in memory).
 *
 * @param meeting    — already-created ZoomMeeting doc
 * @param rawContent — raw VTT or plain-text transcript content
 * @param sourcing   — how the transcript entered the system
 * @param sourceType — carried forward to ZoomInsight as sourceType metadata
 */
export async function processTranscriptPayloadInternal(
  meeting: InstanceType<typeof ZoomMeeting>,
  rawContent: string,
  sourcing: 'webhook' | 'manual_vtt' | 'manual_txt' | 'manual_raw',
  sourceType: 'zoom_transcript' | 'vtt_file' | 'txt_file' | 'manual_upload'
): Promise<void> {
  // Resolve AI provider once so we can record it on the meeting doc
  const providerCfg = await import('../../utils/ai/aiProvider.js').then(m => m.resolveProviderAsync());
  const processedBy = `${providerCfg.provider}:${providerCfg.model}`;

  // Update status + progress stage
  await ZoomMeeting.findByIdAndUpdate(meeting._id, {
    status: 'processing',
    processedBy,
    processingStartedAt: new Date(),
    progress: { stage: 'parsing', percent: 15, message: 'Parsing transcript…' },
  });

  try {
    // Empty check (both formats).
    // v1.70 — fix #10: parse VTT ONCE, derive both the empty-check
    // AND the segments from the same parse. Previously isEmptyTranscript
    // internally called parseVTT (→ parseVTTWithSpeakers), and then
    // we called parseVTTWithSpeakers again on the same content to
    // extract segments. Double work for every ingested transcript.
    const segments = parseVTTWithSpeakers(rawContent);
    const { empty, warning } = isEmptyFromSegments(segments);
    if (empty) {
      await ZoomMeeting.findByIdAndUpdate(meeting._id, {
        status: 'failed',
        errorMessage: 'Transcript is empty or too short to process.',
        processingCompletedAt: new Date(),
        progress: { stage: 'failed', percent: 0, message: 'Transcript is empty.' },
      });
      return;
    }
    if (warning) {
      httpLog.warn(`[Zoom] Transcript for meeting ${meeting._id} is short (<50 chars) — processing anyway`);
    }

    const plainText = segments.map(s => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n');

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      rawTranscriptText: plainText.slice(0, 50_000),
      progress: { stage: 'extracting', percent: 35, message: `Extracting insights from ${segments.length} segments…` },
    });

    // Extract structured insights (handles both VTT and plain text)
    const items = await extractInsightsFromTranscript(rawContent, meeting.topic);

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      progress: { stage: 'storing', percent: 65, message: `Storing ${items.length} insights…` },
    });

    const insightDocs = items.map((item) => ({
      meetingId: meeting._id,
      batchId: meeting.batchId,
      type: item.type,
      question: item.question,
      answer_or_content: item.answer_or_content,
      confidence_score: item.confidence_score,
      // Structural metadata tagged at ingestion by the AI pipeline.
      category: item.category,
      audience: item.audience,
      tags: item.tags,
      summary: item.summary,
      transcript_snippet: item.transcript_snippet,
      // ── Provenance ─────────────────────────────────────────────────────────
      sourcing,
      processedBy,
      transcriptTimestamp: item.transcriptTimestamp,
      speaker: item.speaker,
      sourceType,
      sourceTitle: meeting.topic,
      status: 'pending_review' as const,
    }));

    if (insightDocs.length > 0) {
      await ZoomInsight.insertMany(insightDocs);
    }

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      status: 'completed',
      insightCount: insightDocs.length,
      processingCompletedAt: new Date(),
      progress: { stage: 'embedding', percent: 80, message: 'Generating knowledge base embeddings…' },
    });

    httpLog.info(`[Zoom] Processed meeting ${meeting._id}: ${insightDocs.length} insights extracted.`);

    // ── Also extract knowledge for the knowledge base (non-blocking) ─────────
    await processZoomMeetingForKnowledge(meeting._id.toString());

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      progress: { stage: 'done', percent: 100, message: `Done — ${insightDocs.length} insights extracted.` },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stage = meeting.progress?.stage ?? 'unknown';
    await scheduleRetry(meeting._id, msg, stage);
    recordZoomError(msg);
    throw err;
  }
}

// ─── Progress Polling Endpoint ────────────────────────────────────────────────

/**
 * GET /api/zoom/meetings/:id/progress
 * Lightweight endpoint the frontend polls to update a meeting's progress bar.
 * Returns { stage, percent, message } or 404.
 */
export async function getMeetingProgress(req: Request, res: Response): Promise<void> {
  const meeting = await ZoomMeeting.findById(req.params.id).select('progress status');
  if (!meeting) { res.status(404).json({ message: 'Meeting not found' }); return; }
  res.json({ stage: meeting.progress?.stage ?? 'queued', percent: meeting.progress?.percent ?? 0, message: meeting.progress?.message ?? 'Queued', status: meeting.status });
}

/**
 * Full pipeline using the authenticated user's token (webhook path).
 * Zoom meeting transcripts arrive via webhook → download → extract.
 */
export async function processTranscriptForUser(
  meeting: InstanceType<typeof ZoomMeeting>,
  userId: string
): Promise<void> {
  // Download using the user's token
  const rawVtt = await downloadTranscriptAsUser(userId, meeting.rawTranscriptUrl!);
  await processTranscriptPayloadInternal(meeting, rawVtt, 'webhook', 'zoom_transcript');
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function getZoomHealthStatus(_req: Request, res: Response): Promise<void> {
  try {
    const health = await getZoomHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get Zoom health', error: (err as Error).message });
  }
}

// ─── Public Stats (HomePage "From Zoom Meetings" section) ──────────────────
// Returns anonymized aggregate stats. No user info, no transcript content.
export async function getZoomPublicStats(_req: Request, res: Response): Promise<void> {
  try {
    const [meetingsProcessed, insightsExtracted, knowledgeExtracted, faqsPromoted] = await Promise.all([
      ZoomMeeting.countDocuments({ status: 'completed' }),
      ZoomInsight.countDocuments({}),
      Promise.resolve(0), // TranscriptKnowledge uses a different model — count separately
      ZoomMeeting.countDocuments({ status: 'completed', insightCount: { $gt: 0 } }),
    ]);

    // Count TranscriptKnowledge separately (different model import)
    const { TranscriptKnowledge } = await import('../knowledge/transcript-knowledge.model.js');
    const tkCount = await TranscriptKnowledge.countDocuments({});

    res.json({
      meetingsProcessed,
      insightsExtracted,
      knowledgeExtracted: tkCount,
      faqsPromoted,
    });
  } catch (err) {
    // Don't 500 the homepage — return zeros and let the UI hide the section, but log warning
    httpLog.warn(`[zoom] Failed to get homepage stats: ${(err as Error).message}`);
    res.json({ meetingsProcessed: 0, insightsExtracted: 0, knowledgeExtracted: 0, faqsPromoted: 0 });
  }
}

// ─── Admin Endpoints ────────────────────────────────────────────────────────────

export async function listMeetings(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status && ['pending', 'processing', 'completed', 'failed', 'dead_letter'].includes(status)) {
    filter.status = status;
  }

  const [meetings, total] = await Promise.all([
    ZoomMeeting.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit),
    ZoomMeeting.countDocuments(filter),
  ]);

  res.json({ meetings, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function getMeeting(req: Request, res: Response): Promise<void> {
  const meeting = await ZoomMeeting.findById(req.params.id);
  if (!meeting) {
    res.status(404).json({ message: 'Meeting not found' });
    return;
  }
  const insights = await ZoomInsight.find({ meetingId: meeting._id }).sort({ confidence_score: -1 });
  res.json({ meeting, insights });
}

export async function listInsights(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type)    filter.type    = req.query.type;
  if (req.query.meetingId) filter.meetingId = new (await import('mongoose')).default.Types.ObjectId(req.query.meetingId as string);

  const [insights, total] = await Promise.all([
    ZoomInsight.find(filter)
      .populate('meetingId', 'topic startTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ZoomInsight.countDocuments(filter),
  ]);

  res.json({ insights, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function updateInsight(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status?: 'approved' | 'rejected' };
  const insight = await ZoomInsight.findById(req.params.id);
  if (!insight) {
    res.status(404).json({ message: 'Insight not found' });
    return;
  }

  // v1.68 — H3 fix: was in-memory mutate + save(). Atomic
  // findOneAndUpdate with the same filter as the read so a
  // concurrent updateInsight on the same insight doesn't lose
  // the other's fields.
  if (status) {
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    const reviewedBy = userId ? new mongoose.Types.ObjectId(userId) : null;
    const reviewedAt = new Date();
    await ZoomInsight.findOneAndUpdate(
      { _id: insight._id },
      {
        $set: {
          status,
          ...(reviewedBy ? { reviewedBy } : {}),
          reviewedAt,
        },
      },
    );
  }

  httpLog.info(`[Zoom Insight] ${status} by user ${(req as Request & { user?: { id: string } }).user?.id}: ${insight._id}`);
  res.json({ insight });
}

// POST /api/zoom/insights/:id/convert-to-faq — Admin: promote approved insight → official FAQ
export async function convertInsightToFAQ(req: Request, res: Response): Promise<void> {
  try {
    const insight = await ZoomInsight.findById(req.params.id).populate('meetingId');
    if (!insight) { res.status(404).json({ message: 'Insight not found' }); return; }
    if (insight.status !== 'approved') { res.status(400).json({ message: 'Only approved insights can be converted to FAQ' }); return; }
    if (insight.publishedFaqId) { res.status(409).json({ message: 'Insight already promoted to FAQ' }); return; }

    const { default: FAQ } = await import('../faq/faq.model.js');
    const { generateEmbedding } = await import('../../utils/ai/embeddings.js');

    // Prefer the LLM-generated structural tags; fall back to a naive
    // word-split of the question for legacy insights with no tags. The
    // tags feed the FAQ text index so they power search/RAG retrieval.
    let tags: string[] = Array.isArray(insight.tags) ? insight.tags : [];
    if (tags.length === 0 && insight.question) {
      const words = insight.question.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
      tags = words.slice(0, 5);
    }

    const faq = await FAQ.create({
      question: insight.question ?? insight.answer_or_content.slice(0, 200),
      answer: insight.answer_or_content,
      batchId: insight.batchId || (insight.meetingId as any)?.batchId,
      tags,
      category: insight.category ?? 'General',
      status: 'approved',
      sourceType: 'zoom_transcript',
      sourceMeetingId: (insight.meetingId as any)?._id ?? null,
      sourceMeetingTopic: (insight.meetingId as any)?.topic ?? null,
      sourceInsightId: insight._id as mongoose.Types.ObjectId,
      promotedAt: new Date(),
    });

    // Async: generate embedding (non-blocking)
    generateEmbedding(faq.question).then(emb => {
      if (emb) {
        FAQ.findByIdAndUpdate(faq._id, { embedding: emb }).catch((err) => {
          httpLog.warn(`[zoom] Failed to save generated FAQ embedding for ${faq._id}: ${(err as Error).message}`);
        });
      }
    }).catch((err) => {
      httpLog.warn(`[zoom] Failed to generate embedding for FAQ ${faq._id}: ${(err as Error).message}`);
    });

    // v1.68 — H3 fix: atomic $set for publishedFaqId.
    await ZoomInsight.findOneAndUpdate(
      { _id: insight._id },
      { $set: { publishedFaqId: faq._id as mongoose.Types.ObjectId } },
    );

    await invalidateCache();
    invalidatePublicCaches();

    httpLog.info(`[Zoom] Insight ${insight._id} promoted to FAQ ${faq._id}`);
    res.json({ faq });
  } catch (err) {
    res.status(500).json({ message: 'Failed to convert insight to FAQ', error: (err as Error).message });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBlacklisted(topic: string): boolean {
  const raw = process.env.ZOOM_TOPIC_BLACKLIST ?? '';
  if (!raw.trim()) return false;
  return raw.split(',').some((pattern) => {
    try {
      return new RegExp(pattern.trim(), 'i').test(topic);
    } catch (err) {
      httpLog.warn(`[zoom] Invalid regex in blacklist pattern '${pattern}': ${(err as Error).message}`);
      return false;
    }
  });
}

// ─── Admin: Dead-Letter Queue ─────────────────────────────────────────────────

/**
 * GET /api/zoom/dead-letter
 * Returns a paginated list of meetings in the dead-letter queue.
 */
export async function listDeadLetterMeetings(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
  const skip = (page - 1) * limit;

  const [meetings, total] = await Promise.all([
    ZoomMeeting.find({ status: 'dead_letter' })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('topic zoomMeetingId status retryCount maxRetries errorMessage failureHistory startTime updatedAt sourcing'),
    ZoomMeeting.countDocuments({ status: 'dead_letter' }),
  ]);

  res.json({ meetings, total, page, limit, pages: Math.ceil(total / limit) });
}

/**
 * POST /api/zoom/meetings/:id/retry
 * Admin endpoint to manually retry a failed or dead-letter meeting.
 * Resets retry state and re-queues for immediate processing.
 */
export async function retryMeeting(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  const meeting = await ZoomMeeting.findById(req.params.id);
  if (!meeting) {
    res.status(404).json({ message: 'Meeting not found' });
    return;
  }

  if (!['failed', 'dead_letter'].includes(meeting.status)) {
    res.status(400).json({ message: `Cannot retry meeting with status '${meeting.status}'` });
    return;
  }

  try {
    await manualRetry(meeting._id.toString());
    httpLog.info(`[Zoom] Admin ${(req.user as unknown as { _id: string })._id} manually retried meeting ${meeting._id}`);
    res.json({
      message: 'Meeting re-queued for processing.',
      meetingId: meeting._id.toString(),
      previousStatus: meeting.status,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retry meeting', error: (err as Error).message });
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ZoomWebhookPayload {
  event: string;
  payload?: {
    account_id?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      topic?: string;
      start_time?: string;
      duration?: number;
      host_id?: string;       // Zoom user ID — key for per-user lookup
      host_email?: string;    // Zoom host email — fallback lookup
      recording_files?: RecordingFile[];
    };
  };
}

interface RecordingFile {
  id?: string;
  file_type?: string;
  download_url?: string;
}
