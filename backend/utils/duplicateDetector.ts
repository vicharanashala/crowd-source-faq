/**
 * Multi-provider AI client for duplicate question detection.
 *
 * Provider priority: Anthropic > OpenAI > xAI (Grok) > MiniMax
 * Uses aiProvider.ts for shared provider resolution.
 * If NO provider key is configured, detectDuplicatesWithAI() returns [].
 */

import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';
import { generateEmbedding } from './embeddings.js';
import { resolveProvider } from './aiProvider.js';

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

IMPORTANT RULES:
- Answer ONLY with a valid JSON array. No preamble, no explanation, no markdown.
- Each item must have: "id" (string), "score" (0.0–1.0), "reason" (string, 1 sentence max).
- Score guide: 1.0 = identical intent, 0.8-0.99 = same topic, 0.5-0.79 = likely related, <0.5 = not a duplicate.
- Different specific details are NOT duplicates (e.g. "offer letter for role X" vs "offer letter for role Y").
- Different topics are NOT duplicates.
- Prefer fewer high-confidence matches over many low-confidence ones.

Output: [{"id": "...", "score": 0.92, "reason": "Both ask about..."}]`;

// ─── AI call ─────────────────────────────────────────────────────────────────

async function aiChat(userQuestion: string, candidateList: string): Promise<string> {
  const cfg = resolveProvider();

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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: cfg.apiKey,
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
    console.warn(`[duplicateDetector] ${err}`);
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
  const [faqs, posts] = await Promise.all([
    FAQ.find({ embedding: { $exists: true, $ne: null }, status: 'approved' })
      .select('_id question')
      .lean(),
    CommunityPost.find().select('_id title body').lean(),
  ]);

  const queryEmb = await generateEmbedding(query).catch(() => null);
  if (!queryEmb) return [];

  const faqCandidates = faqs
    .filter((f) => (f.embedding as unknown as number[] | undefined))
    .map((f) => ({
      _id: f._id.toString(),
      title: f.question,
      source: 'faq' as const,
      score: (f.embedding as unknown as number[])!.reduce(
        (s: number, v: number, i: number) => s + v * queryEmb[i], 0
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const postCandidates: Candidate[] = [];
  for (const p of posts) {
    const emb = await generateEmbedding(`${p.title} ${p.body ?? ''}`).catch(() => null);
    if (!emb) continue;
    postCandidates.push({
      _id: p._id.toString(),
      title: p.title,
      source: 'community' as const,
      score: emb.reduce((s: number, v: number, i: number) => s + v * queryEmb[i], 0),
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
      const i = item as Record<string, unknown>;
      const id = String(i.id ?? '');
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
  } catch {
    return [];
  }
}