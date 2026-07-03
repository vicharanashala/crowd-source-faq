/**
 * Knowledge Base Service
 *
 * Maintains a searchable fact database sourced from:
 * 1. Zoom meeting transcripts — AI extracts Q&A pairs
 * 2. High-upvote community questions — prioritized for review
 *
 * All knowledge entries have vector embeddings for semantic search.
 */

import mongoose, { Types } from 'mongoose';
import { TranscriptKnowledge, type KnowledgeStatus, type KnowledgeSource } from './transcript-knowledge.model.js';
import { ZoomMeeting } from '../zoom/zoom-meeting.model.js';
import CommunityPost from '../community/community-post.model.js';
import FAQ from '../faq/faq.model.js';
import { generateEmbedding, generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { invalidateCache } from '../../utils/http/cache.js';
import { resolveProviderAsync } from '../../utils/ai/aiProvider.js';
import { dispatchNotification } from '../../utils/http/notificationDispatcher.js';
import { logger } from '../../utils/http/logger.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const COMMUNITY_UPVOTE_THRESHOLD = 3;
const KNOWLEDGE_EMBEDDING_BATCH = 10;

// ─── Shared AI call ───────────────────────────────────────────────────────────

/**
 * Low-level chat completion using the active provider.
 * Uses aiProvider.ts to avoid duplicating provider detection logic.
 */
export async function aiChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens = 1024,
  temperature = 0.1
): Promise<string> {
  const cfg = await resolveProviderAsync();

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: maxTokens,
  };
  if (!cfg.needsAnthropicVersion) {
    (body as Record<string, unknown>).temperature = temperature;
  }

  // Build auth header — Bearer prefix required by all non-Anthropic providers
  const authValue = cfg.provider === 'anthropic' ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: authValue,
  };
  if (cfg.needsAnthropicVersion) {
    headers['anthropic-version'] = '2023-06-01';
    // Anthropic uses /messages, not /chat/completions
    const res = await fetch(`${cfg.baseURL}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: false }),
    });
    if (!res.ok) throw new Error(`AI API error (${res.status})`);
    const data = (await res.json()) as Record<string, unknown>;
    const content = ((data as Record<string, unknown>).content as Array<Record<string, unknown>>)?.[0]?.['text'] as string | null;
    if (!content) throw new Error('No content in AI response');
    return content;
  } else {
    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI API error (${res.status})`);
    const data = (await res.json()) as Record<string, unknown>;
    const choices = (data as Record<string, unknown>).choices as Array<Record<string, unknown>>;
    const content = (choices?.[0]?.message as Record<string, unknown>)?.content as string | null;
    if (!content) throw new Error('No content in AI response');
    return content;
  }
}

// ─── Extract knowledge from a Zoom meeting ────────────────────────────────────

export interface ExtractedQA {
  question: string;
  answer: string;
  confidence: number;
  transcriptSnippet: string;
}

export async function extractKnowledgeFromTranscript(
  meetingId: string,
  transcriptText: string,
  topic: string
): Promise<ExtractedQA[]> {
  const SYSTEM = `You are an expert at extracting factual Q&A pairs from meeting transcripts.

Given a Zoom meeting transcript, extract all meaningful questions that were asked AND answered during the meeting.

Rules:
- Only extract questions where the answer is actually in the transcript
- Each Q&A must be self-contained and make sense without the full transcript
- Rate your confidence: 1.0 = exact answer in transcript, 0.6 = inferred from context
- Questions about logistics (links, schedules, documents) count if answered
- Skip: greetings, small talk, off-topic tangents, incomplete answers

Return a JSON array (no markdown), each item:
[{"question":"...","answer":"...","confidence":0.8,"snippet":"exact 2-sentence excerpt"}]`;

  const userContent = `Meeting topic: "${topic}"\n\nTranscript:\n${transcriptText.slice(0, 15000)}`;

  try {
    const raw = await aiChat(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      2048,
      0.1
    );

    const match = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim().match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]) as Array<{
      question: string;
      answer: string;
      confidence: number;
      snippet: string;
    }>;

    return parsed
      .filter((q) => q.question && q.answer && q.confidence >= 0.5)
      .map((q) => ({
        question: q.question,
        answer: q.answer,
        confidence: q.confidence,
        transcriptSnippet: q.snippet ?? '',
      }));
  } catch (err) {
    logger.error(`[knowledgeBase] AI extraction failed: ${(err as Error).message}`);
    return [];
  }
}

// ─── Process a Zoom meeting: extract + store knowledge ────────────────────────

export async function processZoomMeetingForKnowledge(meetingId: string): Promise<number> {
  const meeting = await ZoomMeeting.findById(meetingId);
  if (!meeting || !meeting.rawTranscriptText) {
    logger.warn(`[knowledgeBase] Meeting ${meetingId} has no transcript`);
    return 0;
  }

  const existing = await TranscriptKnowledge.countDocuments({
    source: 'zoom_transcript',
    sourceId: meeting._id,
  });
  if (existing > 0) {
    logger.info(`[knowledgeBase] Meeting ${meetingId} already processed (${existing} entries)`);
    return 0;
  }

  const qaPairs = await extractKnowledgeFromTranscript(
    meetingId,
    meeting.rawTranscriptText,
    meeting.topic
  );

  if (qaPairs.length === 0) return 0;

  const entries = qaPairs.map((qa) => ({
    question: qa.question,
    answer: qa.answer,
    source: 'zoom_transcript' as KnowledgeSource,
    sourceId: meeting._id,
    sourceTitle: meeting.topic,
    confidence: qa.confidence,
    // Zero-human path: auto-approve so these are immediately available for
    // RAG + search fallback. Admin review is reserved for the curated
    // ZoomInsight → FAQ pipeline.
    status: 'approved' as KnowledgeStatus,
    transcriptSnippet: qa.transcriptSnippet,
    keywords: [],
  }));

  const inserted = await TranscriptKnowledge.insertMany(entries, { ordered: false });

  // Inline embedding — ensures entries are vector-searchable the moment
  // the webhook returns, with no separate worker required. Fails are
  // logged but don't block the main pipeline; the dedicated
  // embedUnprocessedKnowledge() worker is a safety net.
  await Promise.all(inserted.map(async (doc) => {
    try {
      const text = `${doc.question} ${doc.answer}`;
      const emb = await generateEmbedding(text);
      await TranscriptKnowledge.updateOne({ _id: doc._id }, { embedding: emb });
    } catch (err) {
      logger.warn(`[knowledgeBase] Inline embed failed for ${(doc as Record<string, unknown>)._id}: ${(err as Error).message}`);
    }
  }));

  await ZoomMeeting.updateOne({ _id: meeting._id }, { insightCount: qaPairs.length });

  logger.info(`[knowledgeBase] Extracted + embedded ${qaPairs.length} QA pairs from meeting ${meetingId}`);
  return qaPairs.length;
}

// ─── Process high-upvote community posts ──────────────────────────────────────

export async function processHighUpvotePosts(): Promise<number> {
  const posts = await CommunityPost.find({
    upvotes: { $size: COMMUNITY_UPVOTE_THRESHOLD },
    status: 'active',
  }).lean();

  if (posts.length === 0) return 0;

  const sourceIds = posts.map((p) => p._id);

  const processed = new Set(
    (
      await TranscriptKnowledge.find({
        source: 'community_high_upvote',
        sourceId: { $in: sourceIds },
      }).select('sourceId')
    ).map((k) => k.sourceId?.toString())
  );

  const unprocessed = posts.filter((p) => !processed.has(p._id.toString()));
  if (unprocessed.length === 0) return 0;

  logger.info(`[knowledgeBase] Processing ${unprocessed.length} high-upvote posts`);

  const entries = unprocessed.map((post) => ({
    question: post.title,
    answer: 'This is a common community question. An answer should be added based on community discussion.',
    source: 'community_high_upvote' as KnowledgeSource,
    sourceId: post._id,
    sourceTitle: post.title,
    confidence: 0.5,
    status: 'pending' as KnowledgeStatus,
    upvoteCount: (post.upvotes as Types.ObjectId[])?.length ?? 0,
    keywords: [],
  }));

  await TranscriptKnowledge.insertMany(entries, { ordered: false });
  return entries.length;
}

// ─── Search knowledge base ────────────────────────────────────────────────────

export interface KnowledgeMatch {
  _id: string;
  question: string;
  answer: string;
  source: string;
  sourceTitle: string;
  confidence: number;
  score: number;
  reason?: string; // optional reason for why this matched
}

/**
 * Semantic search over the FAQ collection. Returns the top-K FAQs that
 * semantically match the query, scored by vector similarity. Used by the
 * auto-answer pipeline to find relevant FAQs for a community post.
 *
 * Failures are non-fatal: returns []. Callers can fall back to other
 * sources (Knowledge base, Community posts) on empty/error.
 */
export interface FaqMatch {
  _id: string;
  question: string;
  answer: string;
  tags: string[];
  score: number;
}

export async function searchRelevantFaqs(query: string, topK = 5): Promise<FaqMatch[]> {
  const qEmb = await generateQueryEmbedding(query).catch((err) => {
    logger.warn(`[knowledgeBase] FAQ search: embedding failed: ${(err as Error).message}`);
    return null;
  });
  if (!qEmb) return [];

  // Find candidates via keyword overlap first (cheap, narrows the search),
  // then re-rank with the embedding. If keyword search yields nothing, fall
  // back to a $vectorSearch over the whole FAQ collection.
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const keywordFilter = queryWords.length > 0
    ? { $or: [
        { question: { $regex: queryWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), $options: 'i' } },
        { answer: { $regex: queryWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), $options: 'i' } },
      ] }
    : {};

  let candidates: Array<Record<string, unknown>> = [];
  try {
    const db = mongoose.connection.db;
    if (db) {
      // Vector search over the whole FAQ collection (most relevant, no keyword gate).
      const vectorHits = await db.collection('yaksha_faq_faqs').aggregate([
        { $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: qEmb,
            numCandidates: topK * 20,
            limit: topK,
          } },
        { $project: { _id: 1, question: 1, answer: 1, tags: 1, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray();
      candidates = vectorHits as Array<Record<string, unknown>>;
    }
  } catch (vecErr) {
    logger.warn(`[knowledgeBase] FAQ vector search failed: ${(vecErr as Error).message}`);
  }

  // Fallback: keyword-only if vector search returned nothing.
  if (candidates.length === 0 && Object.keys(keywordFilter).length > 0) {
    candidates = (await FAQ.find({ ...keywordFilter, status: 'approved' })
      .select('question answer tags')
      .limit(topK)
      .lean()) as unknown as Array<Record<string, unknown>>;
    // Assign a synthetic score based on keyword match length.
    for (const c of candidates) {
      const text = `${c.question ?? ''} ${c.answer ?? ''}`.toLowerCase();
      const hits = queryWords.filter((w) => text.includes(w)).length;
      c.score = Math.min(0.5 + hits * 0.1, 0.85);
    }
  }

  return candidates.map((c) => ({
    _id: String(c._id),
    question: String(c.question ?? ''),
    answer: String(c.answer ?? ''),
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    score: Number(c.score ?? 0),
  }));
}

/**
 * Semantic search over the Community posts collection. Returns the top-K
 * community posts (by question + answer) that semantically match the query.
 * Used by the auto-answer pipeline to surface prior community Q&A that may
 * already answer a new post.
 */
export interface CommunityMatch {
  _id: string;
  title: string;
  answer: string;
  tags: string[];
  score: number;
}

export async function searchRelevantCommunityPosts(query: string, topK = 5): Promise<CommunityMatch[]> {
  const qEmb = await generateQueryEmbedding(query).catch((err) => {
    logger.warn(`[knowledgeBase] Community search: embedding failed: ${(err as Error).message}`);
    return null;
  });
  if (!qEmb) return [];

  let candidates: Array<Record<string, unknown>> = [];
  try {
    const db = mongoose.connection.db;
    if (db) {
      const vectorHits = await db.collection('yaksha_faq_communityposts').aggregate([
        { $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: qEmb,
            numCandidates: topK * 20,
            limit: topK,
          } },
        // Prefer posts with an accepted answer — those are the "answered" ones
        // most likely to help a sibling post.
        { $match: { 'answer.0': { $exists: true } } },
        { $project: { _id: 1, title: 1, body: 1, answer: 1, tags: 1, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray();
      candidates = vectorHits as Array<Record<string, unknown>>;
    }
  } catch (vecErr) {
    logger.warn(`[knowledgeBase] Community vector search failed: ${(vecErr as Error).message}`);
  }

  return candidates.map((c) => ({
    _id: String(c._id),
    title: String(c.title ?? ''),
    // `answer` is the accepted answer (an array of embedded comment docs)
    // — we pull the body text out and join if there are multiple accepted.
    answer: Array.isArray(c.answer)
      ? (c.answer as Array<Record<string, unknown>>).map((a) => String(a.body ?? a.text ?? '')).join('\n\n').trim()
      : String(c.answer ?? ''),
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    score: Number(c.score ?? 0),
  }));
}

export async function searchKnowledge(
  query: string,
  topK = 5
): Promise<KnowledgeMatch[]> {
  const qEmb = await generateQueryEmbedding(query).catch((err) => {
    logger.warn(`[knowledgeBase] Failed to generate embedding for query '${query}': ${(err as Error).message}`);
    return null;
  });

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  let candidates = await TranscriptKnowledge.find({
    status: { $in: ['approved', 'pending'] },
    ...(queryWords.length > 0 && { keywords: { $in: queryWords } }),
  }).lean();

  if (candidates.length === 0) {
    candidates = await TranscriptKnowledge.find({
      status: { $in: ['approved', 'pending'] },
    }).lean();
  }

  if (candidates.length === 0) return [];

  return scoreAndSort(candidates, qEmb, query, topK);
}

function scoreAndSort(
  candidates: Record<string, unknown>[],
  qEmb: number[] | null,
  query: string,
  topK: number
): KnowledgeMatch[] {
  const scored = candidates.map((k) => {
    let vectorScore = 0;
    const kEmb = k.embedding as number[] | undefined;
    if (qEmb && kEmb && kEmb.length === qEmb.length) {
      vectorScore = qEmb.reduce((s, v, i) => s + v * kEmb[i], 0);
    }

    const kWords = new Set((k.keywords as string[]) ?? []);
    const queryWordsSet = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    const overlap = queryWordsSet.filter((w) => kWords.has(w)).length;
    const keywordScore = queryWordsSet.length > 0 ? overlap / queryWordsSet.length : 0;

    const score = qEmb ? vectorScore * 0.7 + keywordScore * 0.3 : keywordScore;

    return {
      _id: (k._id as Types.ObjectId).toString(),
      question: k.question as string,
      answer: k.answer as string,
      source: k.source as string,
      sourceTitle: k.sourceTitle as string,
      confidence: k.confidence as number,
      score: Math.min(1, score),
    };
  });

  return scored
    .filter((k) => k.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── Answer a community question from knowledge ───────────────────────────────

export async function answerFromKnowledge(
  postId: string
): Promise<{ answered: boolean; answer?: string; knowledgeId?: string }> {
  const post = await CommunityPost.findById(postId);
  if (!post) return { answered: false };

  const matches = await searchKnowledge(post.title, 1);
  const best = matches.find((m) => m.score >= 0.6);
  if (!best) return { answered: false };

  const knowledgeId = new Types.ObjectId(best._id);
  post.answeredFromKnowledgeId = knowledgeId;
  post.answer = `Based on our knowledge base: ${best.answer}`;
  await post.save();

  await TranscriptKnowledge.updateOne(
    { _id: best._id },
    { answeredFromKnowledgeId: post._id, upvoteCount: (post.upvotes as Types.ObjectId[])?.length ?? 0 }
  );

  // Notify the post author that the knowledge base answered their question.
  // Best-effort — failure to notify does not block the answer write above.
  dispatchNotification({
    recipientId: post.author as Types.ObjectId,
    eventType: 'faq_match_found',
    link: `/community?post=${post._id}`,
    title: 'A matching FAQ answered your question!',
  }).catch((err) => {
    logger.warn(`[knowledgeBase] Failed to dispatch match notification to user ${post.author} for post ${post._id}: ${(err as Error).message}`);
  });

  return { answered: true, answer: post.answer, knowledgeId: best._id };
}

// ─── Promote knowledge to FAQ ─────────────────────────────────────────────────

export async function promoteToFAQ(
  knowledgeId: string,
  createdBy: string
): Promise<string> {
  const knowledge = await TranscriptKnowledge.findById(knowledgeId);
  if (!knowledge) throw new Error('Knowledge entry not found');

  // Carry provenance: if the knowledge came from a Zoom transcript, mark the
  // promoted FAQ so the homepage can surface it as "from a meeting".
  const isFromZoom = knowledge.source === 'zoom_transcript';

  const faq = new FAQ({
    question: knowledge.question,
    answer: knowledge.answer,
    batchId: knowledge.batchId,
    category: 'General',
    status: 'approved',
    createdBy: new Types.ObjectId(createdBy),
    sourceType: isFromZoom ? 'zoom_transcript' : 'manual',
    sourceMeetingId: isFromZoom ? (knowledge.sourceId as Types.ObjectId) : null,
    sourceMeetingTopic: isFromZoom ? (knowledge.sourceTitle ?? null) : null,
    promotedAt: new Date(),
  });
  await faq.save();

  await invalidateCache();
  invalidatePublicCaches();

  knowledge.status = 'promoted';
  knowledge.promotedFaqId = faq._id as Types.ObjectId;
  await knowledge.save();

  return faq._id.toString();
}

// ─── Auto-embed unprocessed knowledge entries ─────────────────────────────────

export async function embedUnprocessedKnowledge(): Promise<number> {
  const unembedded = await TranscriptKnowledge.find({
    embedding: { $exists: false },
    status: { $ne: 'rejected' },
  })
    .limit(KNOWLEDGE_EMBEDDING_BATCH * 5)
    .lean();

  if (unembedded.length === 0) return 0;

  let embedded = 0;
  for (const entry of unembedded) {
    try {
      const text = `${(entry as Record<string, unknown>).question} ${(entry as Record<string, unknown>).answer}`;
      const emb = await generateEmbedding(text);
      await TranscriptKnowledge.updateOne(
        { _id: (entry as Record<string, unknown>)._id },
        { embedding: emb }
      );
      embedded++;
    } catch (err) {
      logger.warn(`[knowledgeBase] Embed failed for ${(entry as Record<string, unknown>)._id}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return embedded;
}