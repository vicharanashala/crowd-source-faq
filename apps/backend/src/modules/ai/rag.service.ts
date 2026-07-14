/**
 * RAG pipeline for the AI assistant bar.
 *
 * 1. Embed the user's query.
 * 2. Search three sources in parallel (limit each to top-K).
 * 3. Build a numbered context block — each source gets an index [1], [2], ...
 *    the LLM is told to cite sources by these indices inline.
 * 4. Send to the LLM with a system prompt that enforces citation + honesty.
 * 5. Return { answer, sources[] } — sources carry id + title + url + snippet
 *    so the frontend can render them as inline cards.
 *
 * Sources searched:
 *   - FAQ (yaksha_faq_faqs)
 *   - Community posts (yaksha_faq_communityposts, answered+unanswered)
 *   - TranscriptKnowledge (Zoom meeting Q&A extractions)
 */

import mongoose from 'mongoose';
import { generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { resolveProviderAsync } from '../../utils/ai/aiProvider.js';
import { searchKnowledge } from '../knowledge/knowledge-base.service.js';
import { logger } from '../../utils/http/logger.js';

export interface RagSource {
  /** Stable id — the client uses this as a React key and to link out. */
  id: string;
  /** "faq" | "community" | "knowledge" */
  type: 'faq' | 'community' | 'knowledge';
  /** Display title. */
  title: string;
  /** Snippet shown in the source card (truncated body). */
  snippet: string;
  /** URL the client can deep-link to. */
  url: string;
  /** Confidence in [0, 1] (vector cosine + keyword overlap). */
  score: number;
}

export interface RagResult {
  answer: string;
  sources: RagSource[];
  /** The model that produced the answer (e.g. "gpt-4o-mini"). */
  model: string;
}

const TOP_K_PER_SOURCE = 4;
const MAX_CONTEXT_CHARS = 14000; // leave headroom under typical 16k context windows

interface FaqHit { _id: unknown; question: string; answer: string; category?: string; trustLevel?: string; score: number }
interface PostHit { _id: unknown; title: string; body: string; status: string; score: number }

/**
 * Search FAQs via Atlas vector search + native text search, merged with RRF.
 * Reuses the helper from the search controller (no behavior change — same
 * ordering + thresholds users already see on the FAQ page).
 */
async function searchFaqs(embedding: number[], query: string, limit: number): Promise<FaqHit[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const [vec, txt] = await Promise.all([
    db.collection('yaksha_faq_faqs')
      .aggregate([
        { $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: limit * 10,
          limit,
        } },
        { $project: {
          _id: 1, question: 1, answer: 1, category: 1, trustLevel: 1,
          score: { $meta: 'vectorSearchScore' },
        } },
        // Match the trust-level boost the search endpoint uses
        { $addFields: {
          score: {
            $add: [
              { $meta: 'vectorSearchScore' },
              { $switch: {
                branches: [
                  { case: { $eq: ['$trustLevel', 'high'] },   then: 0.15 },
                  { case: { $eq: ['$trustLevel', 'expert'] }, then: 0.07 },
                  { case: { $eq: ['$trustLevel', 'medium'] }, then: 0.02 },
                ],
                default: 0,
              } },
            ],
          },
        } },
      ]).toArray().catch((err) => {
        logger.warn(`[rag] searchFaqs aggregate vector search failed: ${(err as Error).message}`);
        return [];
      }),
    db.collection('yaksha_faq_faqs').find(
      { $text: { $search: query } },
      { projection: { score: { $meta: 'textScore' }, question: 1, answer: 1, category: 1, trustLevel: 1 } }
    ).sort({ score: { $meta: 'textScore' } }).limit(limit).toArray().catch((err) => {
      logger.warn(`[rag] searchFaqs text search failed: ${(err as Error).message}`);
      return [];
    }),
  ]);

  // Reciprocal Rank Fusion — same formula as the search controller.
  const rrf = (k: number) => 1 / (60 + k);
  const scoreMap = new Map<string, number>();
  const docs = new Map<string, Record<string, unknown>>();
  vec.forEach((d, i) => {
    const id = String(d._id);
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + rrf(i));
    docs.set(id, d as Record<string, unknown>);
  });
  txt.forEach((d, i) => {
    const id = String(d._id);
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + rrf(i));
    docs.set(id, d as Record<string, unknown>);
  });
  return [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, s]) => {
      const d = docs.get(id)!;
      return {
        _id: d._id,
        question: String(d.question ?? ''),
        answer: String(d.answer ?? ''),
        category: d.category as string | undefined,
        trustLevel: d.trustLevel as string | undefined,
        score: s,
      };
    });
}

async function searchCommunity(embedding: number[], query: string, limit: number): Promise<PostHit[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const [vec, txt] = await Promise.all([
    db.collection('yaksha_faq_communityposts')
      .aggregate([
        { $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: limit * 10,
          limit,
        } },
        { $project: { _id: 1, title: 1, body: 1, status: 1, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray().catch((err) => {
        logger.warn(`[rag] searchCommunity aggregate vector search failed: ${(err as Error).message}`);
        return [];
      }),
    db.collection('yaksha_faq_communityposts').find(
      { $text: { $search: query } },
      { projection: { score: { $meta: 'textScore' }, title: 1, body: 1, status: 1 } }
    ).sort({ score: { $meta: 'textScore' } }).limit(limit).toArray().catch((err) => {
      logger.warn(`[rag] searchCommunity text search failed: ${(err as Error).message}`);
      return [];
    }),
  ]);

  const rrf = (k: number) => 1 / (60 + k);
  const scoreMap = new Map<string, number>();
  const docs = new Map<string, Record<string, unknown>>();
  vec.forEach((d, i) => {
    const id = String(d._id);
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + rrf(i));
    docs.set(id, d as Record<string, unknown>);
  });
  txt.forEach((d, i) => {
    const id = String(d._id);
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + rrf(i));
    docs.set(id, d as Record<string, unknown>);
  });
  return [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, s]) => {
      const d = docs.get(id)!;
      return {
        _id: d._id,
        title: String(d.title ?? ''),
        body: String(d.body ?? ''),
        status: String(d.status ?? ''),
        score: s,
      };
    });
}

/** Render source snippets — the LLM only sees these, plus the question. */
function buildContext(sources: RagSource[]): string {
  const blocks: string[] = [];
  let total = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const block = `[${i + 1}] (${s.type}) ${s.title}\n${s.snippet}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join('\n\n');
}

function buildPrompt(question: string, context: string): string {
  return `You are the Yaksha FAQ assistant. Answer the user's question using ONLY the sources provided below. Be honest about uncertainty — if the sources don't contain the answer, say so plainly and suggest they ask the community.

Cite sources inline by their bracketed index, e.g. "The NOC is required by your HOD before you sign it [1][3]." Use one citation per fact, multiple citations are fine when sources agree.

Keep the answer under 8 sentences unless the user explicitly asks for a longer explanation. Be specific. Use the user's tone (English / Hinglish mix is fine).

SOURCES
${context}

USER QUESTION
${question}

ANSWER (cite sources inline):`;
}

/** File/image attachment passed in from the controller. */
export interface RagAttachment {
  /** Image (vision-capable) or text (read as part of context). */
  kind: 'image' | 'text';
  mimeType: string;
  /** For images: base64-encoded data. For text: UTF-8 string content. */
  data: string;
  /** Original filename, shown to the model. */
  filename: string;
}

/**
 * Main entry — runs the full RAG pipeline. Returns the answer + the
 * sources the LLM saw, in citation order. The caller (controller) just
 * forwards this as JSON.
 *
 * When `attachments` is provided, text files have their content inlined
 * into the prompt and images are sent as multi-part content (vision input)
 * to the LLM. Both Anthropic and OpenAI support this.
 */
export async function runRag(question: string, attachments: RagAttachment[] = []): Promise<RagResult> {
  const t0 = Date.now();
  const embedding = await generateQueryEmbedding(question);
  logger.info('rag.embedding.done', { ms: Date.now() - t0 });

  // Fan out — 3 sources, top-K each, in parallel.
  const [faqHits, postHits, knowledgeHits] = await Promise.all([
    searchFaqs(embedding, question, TOP_K_PER_SOURCE).catch((e) => {
      logger.warn('rag.faq.search.failed', { error: (e as Error).message });
      return [] as FaqHit[];
    }),
    searchCommunity(embedding, question, TOP_K_PER_SOURCE).catch((e) => {
      logger.warn('rag.community.search.failed', { error: (e as Error).message });
      return [] as PostHit[];
    }),
    searchKnowledge(question, TOP_K_PER_SOURCE, { embedQuery: true }).catch((e) => {
      logger.warn('rag.knowledge.search.failed', { error: (e as Error).message });
      return [] as Awaited<ReturnType<typeof searchKnowledge>>;
    }),
  ]);

  // Normalize each source into the common shape.
  const sources: RagSource[] = [
    ...faqHits.map((h) => ({
      id: `faq:${String(h._id)}`,
      type: 'faq' as const,
      title: h.question,
      snippet: h.answer.slice(0, 600),
      url: `/faq/${String(h._id)}`,
      score: h.score,
    })),
    ...postHits.map((h) => ({
      id: `community:${String(h._id)}`,
      type: 'community' as const,
      title: h.title,
      snippet: h.body.slice(0, 600),
      url: `/community?post=${String(h._id)}`,
      score: h.score,
    })),
    ...knowledgeHits.map((h) => ({
      id: `knowledge:${h._id}`,
      type: 'knowledge' as const,
      title: h.question,
      snippet: h.answer.slice(0, 600),
      // Knowledge isn't a public page yet — link to the post that sourced it,
      // or to the admin KB if we know the meeting. For now, a stable
      // deep-link to a future /knowledge/:id is best-effort.
      url: `/community?post=${h._id}`,
      score: h.score,
    })),
  ];

  // Re-rank by score so the LLM sees the strongest sources first.
  sources.sort((a, b) => b.score - a.score);

  // If we found nothing at all, skip the LLM call — just say "no answer".
  if (sources.length === 0) {
    return {
      answer: "I couldn't find anything relevant in the FAQ, community, or your team's Zoom knowledge base. Try rephrasing, or post a new question to the community.",
      sources: [],
      model: 'none',
    };
  }

  const context = buildContext(sources);
  const prompt = buildPrompt(question, context);

  // Build the user-message content. When there are attachments we send a
  // multi-part content array (text + image parts) instead of a plain string.
  // Text-file attachments are inlined into the prompt itself so the LLM sees
  // them as part of the question context.
  const attachmentNote = attachments.length > 0
    ? `\n\n[Attached files (${attachments.length}): ${attachments.map((a) => a.filename).join(', ')}]`
    : '';
  const textAttachments = attachments
    .filter((a) => a.kind === 'text')
    .map((a) => `\n\n--- Attached file: ${a.filename} ---\n${a.data}\n--- end ---`)
    .join('');
  const imageAttachments = attachments.filter((a) => a.kind === 'image');

  // Call the LLM. We use the same provider resolution as duplicate detection
  // and knowledge extraction so the same AI key chain powers the assistant.
  // If the AI fails (provider down / 403 / rate-limited), we still return
  // the sources so the frontend can show the top snippet as a fallback.
  let answer = '';
  let model = 'fallback';
  try {
    const cfg = await resolveProviderAsync();
    const t1 = Date.now();
    answer = await chatCompletion(cfg, prompt + attachmentNote + textAttachments, imageAttachments);
    model = cfg.model;
    logger.info('rag.completion.done', { ms: Date.now() - t1, model: cfg.model, sources: sources.length, attachments: attachments.length });
  } catch (llmErr) {
    logger.warn('rag.completion.failed', { error: (llmErr as Error).message });
    answer = sources[0]?.snippet ?? '';
  }

  return { answer, sources, model };
}

/**
 * Tiny chat completion helper — same shape as the one in knowledgeBase
 * but lifted here so the RAG pipeline doesn't pull in extra imports.
 *
 * When `images` is non-empty, the user message is sent as a multi-part
 * content array (text + image parts). The exact shape depends on the
 * provider: Anthropic uses `{type:'image', source:{type:'base64',...}}`,
 * OpenAI-compatible uses `{type:'image_url', image_url:{url:'data:...'}}`.
 */
async function chatCompletion(
  cfg: { apiKey: string; baseURL: string; model: string; provider: string; needsAnthropicVersion: boolean; authHeader: 'x-api-key' | 'Authorization' },
  prompt: string,
  images: RagAttachment[] = []
): Promise<string> {
  const authValue = cfg.provider === 'anthropic' ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: authValue,
  };

  // Build the user message content. If no images, send the prompt as a
  // plain string (cheaper, works with every model). If images are present,
  // send a content array — the prompt becomes the first text part.
  const buildContent = (): unknown => {
    if (images.length === 0) return prompt;
    if (cfg.provider === 'anthropic') {
      return [
        { type: 'text', text: prompt },
        ...images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mimeType, data: img.data },
        })),
      ];
    }
    // OpenAI-compatible (openai, xai, minimax) — all use image_url with a data URI.
    return [
      { type: 'text', text: prompt },
      ...images.map((img) => ({
        type: 'image_url' as const,
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      })),
    ];
  };

  if (cfg.needsAnthropicVersion) {
    headers['anthropic-version'] = '2023-06-01';
    const res = await fetch(`${cfg.baseURL}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: buildContent() }],
        max_tokens: 800,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? '';
  }

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: buildContent() }],
      max_tokens: 800,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`${cfg.provider} error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}