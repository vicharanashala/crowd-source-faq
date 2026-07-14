/**
 * Multi-provider AI client for duplicate question detection.
 *
 * Provider priority: Anthropic > OpenAI > xAI (Grok) > MiniMax
 * Uses aiProvider.ts for shared provider resolution.
 * If NO provider key is configured, detectDuplicatesWithAI() returns [].
 */

import FAQ from '../../modules/faq/faq.model.js';
import CommunityPost from '../../modules/community/community-post.model.js';
import { generateEmbedding, generateQueryEmbedding } from './embeddings.js';
import { resolveProviderAsync } from './aiProvider.js';
import { logger } from '../http/logger.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DuplicateMatch {
  _id: string;
  title: string;
  question?: string;
  answer?: string;
  body?: string;
  score: number;
  source: 'faq' | 'community' | 'knowledge';
  sourceTitle?: string;
  confidence?: number;
  matchType: 'vector' | 'text' | 'ai';
  reason?: string;
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at detecting duplicate questions in an internal Q&A system.

Given a user's question and a list of existing questions, determine which (if any) are TRUE duplicates.

OUTPUT FORMAT (very important — follow exactly):
Return a JSON array of objects. Each object MUST have all three fields:
  - "id": a string, copied VERBATIM from the candidate's id field
  - "score": a number between 0 and 1
  - "reason": a one-sentence string

If there are no duplicates, return an empty array: []

Do NOT return a bare number, do NOT return a string, do NOT return an object.
Return ONLY the JSON array. No preamble, no markdown fences, no explanation.

SCORING GUIDE:
  - 0.95 to 1.00: questions ask the same thing, just worded differently
  - 0.80 to 0.94: clearly the same topic with minor differences
  - 0.50 to 0.79: related topic but meaningfully different
  - below 0.50: not a duplicate

Rules:
- Different specific details are NOT duplicates (e.g. "offer letter for role X" vs "offer letter for role Y").
- Different topics are NOT duplicates.
- When in doubt, return the match — it's better to flag a possible duplicate than miss a real one.

Example correct response: [{"id":"abc123","score":0.85,"reason":"Both ask about taking leave for exams."}]`;

// ─── AI call ─────────────────────────────────────────────────────────────────

/**
 * Make a single “AI judgment” call to decide which candidates are duplicates.
 * Returns the raw text response (expected to be JSON array).
 */
async function aiChat(userQuestion: string, candidateList: string): Promise<string> {
  const cfg = await resolveProviderAsync();

  const userContent =
    `User question: "${userQuestion.replace(/"/g, "'")}"\n\n` +
    `Candidate questions:\n${candidateList}\n\n` +
    `Respond with a JSON array only.`;

  const messages = cfg.needsAnthropicVersion
    ? [{ role: 'user' as const, content: SYSTEM_PROMPT + '\n\n' + userContent }]
    : [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userContent },
    ];

  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 1024,
    temperature: 0.1,
    messages,
  };

  const authValue = cfg.provider === 'anthropic' ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: authValue,
  };
  if (cfg.needsAnthropicVersion) {
    headers['anthropic-version'] = '2023-06-01';
  }

  let url: string;
  let parsedBody: Record<string, unknown>;

  if (cfg.needsAnthropicVersion) {
    url = `${cfg.baseURL}/messages`;
    parsedBody = { ...body, stream: false };
  } else {
    url = `${cfg.baseURL}/chat/completions`;
    parsedBody = body;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(parsedBody) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${cfg.provider} API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  let content: string | null = null;
  if (cfg.needsAnthropicVersion) {
    content = ((data as Record<string, unknown>).content as Array<Record<string, unknown>>)?.[0]?.['text'] as string | null;
  } else {
    const msg = ((data as Record<string, unknown>).choices as Array<Record<string, unknown>>)?.[0]?.['message'] as Record<string, unknown> | undefined;
    content = msg?.['content'] as string | null;
  }

  if (!content) throw new Error(`No content in ${cfg.provider} response`);
  return content;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function detectDuplicatesWithAI(userQuestion: string): Promise<DuplicateMatch[]> {
  try {
    const candidates = await getVectorCandidates(userQuestion, 20);
    if (candidates.length === 0) return [];

    const candidateList = candidates
      .map((c, i) => `  [${i}] id="${c._id}", type="${c.source}", question="${c.title.replace(/"/g, "'")}"`)
      .join('\n');

    const raw = await aiChat(userQuestion, candidateList);
    return parseAIMatches(raw, candidates);
  } catch (err) {
    logger.warn(`[duplicateDetector] ${(err as Error).message}`);
    return [];
  }
}

// ─── Vector pre-filter ────────────────────────────────────────────────────────

interface Candidate {
  _id: string;
  title: string;
  source: 'faq' | 'community';
  score: number;
}

async function getVectorCandidates(query: string, topK: number): Promise<Candidate[]> {
  // CRITICAL: 'embedding' MUST be in the select. The previous version used
  // .select('_id question') which silently stripped the embedding field,
  // causing the .filter() below to drop every FAQ — so the AI semantic
  // detection ran against ZERO candidates and returned no matches. The
  // knowledge base fallback then dominated with low-score garbage.
  const [faqs, posts] = await Promise.all([
    FAQ.find({ embedding: { $exists: true, $ne: null }, status: 'approved' })
      .select('_id question embedding')
      .lean(),
    CommunityPost.find().select('_id title body embedding').lean(),
  ]);

  const queryEmb = await generateQueryEmbedding(query).catch((err) => {
    logger.warn(`[duplicateDetector] Failed to generate embedding for query '${query}': ${(err as Error).message}`);
    return null;
  });
  if (!queryEmb) return [];

  // Use stored embeddings directly. This is O(n) but synchronous after
  // queryEmb is built — way faster than the previous version that
  // generated an embedding per post on the fly (~8s for 32 posts).
  const faqCandidates = (faqs as unknown as Array<{ _id: unknown; question: string; embedding?: number[] }>)
    .filter((f) => Array.isArray(f.embedding) && f.embedding.length === queryEmb.length)
    .map((f) => ({
      _id: String(f._id),
      title: f.question,
      source: 'faq' as const,
      score: (f.embedding as number[]).reduce(
        (s, v, i) => s + v * queryEmb[i], 0
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const postCandidates: Candidate[] = [];
  for (const p of posts as unknown as Array<{ _id: unknown; title: string; body?: string; embedding?: number[] }>) {
    let emb: number[] | null = null;
    if (Array.isArray(p.embedding) && p.embedding.length === queryEmb.length) {
      // Use stored embedding (fast path)
      emb = p.embedding;
    } else {
      // Legacy fallback for posts without stored embedding
      emb = await generateEmbedding(`${p.title} ${p.body ?? ''}`).catch((err) => {
        logger.warn(`[duplicateDetector] Failed to generate embedding for post ${String(p._id)}: ${(err as Error).message}`);
        return null;
      });
    }
    if (!emb) continue;
    postCandidates.push({
      _id: String(p._id),
      title: p.title,
      source: 'community' as const,
      score: emb.reduce((s, v, i) => s + v * queryEmb[i], 0),
    });
  }
  postCandidates.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const merged: Candidate[] = [];
  for (const c of [...faqCandidates, ...postCandidates]) {
    if (!seen.has(c._id)) { seen.add(c._id); merged.push(c); }
  }
  return merged.slice(0, topK);
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function parseAIMatches(raw: string, candidates: Candidate[]): DuplicateMatch[] {
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\[[\s\S]*?\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    const matches: DuplicateMatch[] = [];
    for (const item of parsed) {
      // The model sometimes returns a bare number (e.g. "[0]") instead of
      // the expected array of match objects. Skip any non-object items so
      // they don't silently drop real matches and so a single malformed
      // entry doesn't break the whole parse.
      if (typeof item !== 'object' || item === null) continue;
      const i = item as Record<string, unknown>;
      const id = String(i.id ?? '');
      // Skip items with no id — the candidate lookup will fail anyway.
      if (!id) continue;
      const score = Math.max(0, Math.min(1, Number(i.score) || 0));
      const reason = String(i.reason ?? '').slice(0, 200);
      if (score < 0.50) continue;
      const candidate = candidates.find((c) => c._id === id);
      if (!candidate) continue;
      matches.push({
        _id: id,
        title: candidate.title,
        score,
        source: candidate.source,
        matchType: 'vector',
        reason,
      });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (err) {
    logger.warn(`[duplicateDetector] Failed to parse AI duplicate detection response JSON: ${(err as Error).message}. Raw response: ${raw.slice(0, 300)}`);
    return [];
  }
}