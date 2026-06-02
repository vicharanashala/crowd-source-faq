/**
 * Knowledge Base Service
 *
 * Maintains a searchable fact database sourced from:
 * 1. Zoom meeting transcripts — AI extracts Q&A pairs
 * 2. High-upvote community questions — prioritized for review
 *
 * All knowledge entries have vector embeddings for semantic search.
 */

import { Types } from 'mongoose';
import { TranscriptKnowledge, type KnowledgeStatus, type KnowledgeSource } from '../models/TranscriptKnowledge.js';
import { ZoomMeeting } from '../models/ZoomMeeting.js';
import CommunityPost from '../models/CommunityPost.js';
import FAQ from '../models/FAQ.js';
import { generateEmbedding } from '../utils/embeddings.js';
import { resolveProvider } from '../utils/aiProvider.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const COMMUNITY_UPVOTE_THRESHOLD = 3;
const KNOWLEDGE_EMBEDDING_BATCH = 10;

// ─── Shared AI call ───────────────────────────────────────────────────────────

/**
 * Low-level chat completion using the active provider.
 * Uses aiProvider.ts to avoid duplicating provider detection logic.
 */
async function aiChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens = 1024,
  temperature = 0.1
): Promise<string> {
  const cfg = resolveProvider();

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: maxTokens,
  };
  if (!cfg.needsAnthropicVersion) {
    (body as Record<string, unknown>).temperature = temperature;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: cfg.apiKey,
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
[{\"question\":\"...\",\"answer\":\"...\",\"confidence\":0.8,\"snippet\":\"exact 2-sentence excerpt\"}]`;

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
    console.error('[knowledgeBase] AI extraction failed:', (err as Error).message);
    return [];
  }
}

// ─── Process a Zoom meeting: extract + store knowledge ────────────────────────

export async function processZoomMeetingForKnowledge(meetingId: string): Promise<number> {
  const meeting = await ZoomMeeting.findById(meetingId);
  if (!meeting || !meeting.rawTranscriptText) {
    console.warn(`[knowledgeBase] Meeting ${meetingId} has no transcript`);
    return 0;
  }

  const existing = await TranscriptKnowledge.countDocuments({
    source: 'zoom_transcript',
    sourceId: meeting._id,
  });
  if (existing > 0) {
    console.log(`[knowledgeBase] Meeting ${meetingId} already processed (${existing} entries)`);
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
    status: 'pending' as KnowledgeStatus,
    transcriptSnippet: qa.transcriptSnippet,
    keywords: [],
  }));

  await TranscriptKnowledge.insertMany(entries, { ordered: false });
  await ZoomMeeting.updateOne({ _id: meeting._id }, { insightCount: qaPairs.length });

  console.log(`[knowledgeBase] Extracted ${qaPairs.length} QA pairs from meeting ${meetingId}`);
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

  console.log(`[knowledgeBase] Processing ${unprocessed.length} high-upvote posts`);

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

export async function searchKnowledge(
  query: string,
  topK = 5
): Promise<KnowledgeMatch[]> {
  const qEmb = await generateEmbedding(query).catch(() => null);

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
    category: 'General',
    status: 'approved',
    createdBy: new Types.ObjectId(createdBy),
    sourceType: isFromZoom ? 'zoom_transcript' : 'manual',
    sourceMeetingId: isFromZoom ? (knowledge.sourceId as Types.ObjectId) : null,
    sourceMeetingTopic: isFromZoom ? (knowledge.sourceTitle ?? null) : null,
    promotedAt: new Date(),
  });
  await faq.save();

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
      console.warn(`[knowledgeBase] Embed failed for ${(entry as Record<string, unknown>)._id}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return embedded;
}