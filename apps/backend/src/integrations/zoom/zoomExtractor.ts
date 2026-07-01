/**
 * Zoom transcript → LLM → structured FAQ + Announcement extraction.
 *
 * Uses the active AI provider resolved via aiProvider.ts (priority
 * Anthropic > OpenAI > xAI > MiniMax), with DB-configured keys/URLs/models
 * honoured when present, otherwise env vars. The transcript is sent as a
 * system + user message and we parse the JSON array response.
 *
 * Prompt design principles:
 *   1. Strict JSON output — model MUST return a JSON array, nothing else.
 *   2. Confidence score — model self-reports 0.0-1.0 so we can filter low-quality extractions.
 *   3. Transcript accuracy caveat — prompt tells model to ignore garbled text.
 *   4. Categorisation — each item is typed as 'FAQ' or 'Announcement'.
 */

import { ZoomInsightType, type InsightCategory, type InsightAudience } from '../../modules/zoom/zoom-meeting.model.js';
import { resolveProviderAsync } from '../../utils/ai/aiProvider.js';
// Single source of truth for the structural-metadata taxonomy — shared with
// the document-insight pipeline so categories/audiences never drift apart.
import { INSIGHT_CATEGORIES, INSIGHT_AUDIENCES, normalizeTags } from '../../utils/ai/documentAiPipeline.js';
import { parseVTTWithSpeakers, extractSnippet, isEmptyFromSegments, TranscriptSegment } from './vttParser.js';
import { logger } from '../../utils/http/logger.js';

export interface ExtractedItem {
  type: ZoomInsightType;
  question?: string;       // only for FAQ
  answer_or_content: string;
  confidence_score: number;
  // ── Structural metadata (tagged at ingestion) ──────────────────────────
  /** Single closest category from the closed taxonomy. */
  category: InsightCategory;
  /** Primary audience from the closed taxonomy. */
  audience: InsightAudience;
  /** Normalized long-tail keyword tags ([a-z0-9-]). */
  tags: string[];
  /** 1-3 sentence summary — also fed into the keyword index for recall. */
  summary: string;
  /** ISO 8601 wall-clock timestamp from the transcript when this Q&A appeared */
  transcriptTimestamp?: string;
  /** Speaker name from the transcript for this Q&A */
  speaker?: string;
  transcript_snippet?: string;
}

/**
 * Parse either raw VTT or plain text. Returns segments (or empty array for plain text).
 */
function parseTranscript(raw: string): TranscriptSegment[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('WEBVTT')) {
    // v1.70 — fix #10: parse VTT once, derive both the warning log AND
    // the segments from the same parse. Previously isEmptyTranscript
    // internally called parseVTT (→ parseVTTWithSpeakers), and then we
    // called parseVTTWithSpeakers again on the same content below.
    const segments = parseVTTWithSpeakers(raw);
    const { warning } = isEmptyFromSegments(segments);
    if (warning) logger.warn('[zoomExtractor] Transcript below 50 chars — processing anyway.');
    return segments;
  }
  // Plain .txt: one line = one paragraph
  return trimmed
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0)
    .map((text, i) => ({ speaker: '', text: text.trim(), startSec: i * 60 }));
}

/**
 * System prompt — instructs the model on strict output format.
 */
const SYSTEM_PROMPT = `You are a precise meeting-notes analyst. Your task is to carefully read the provided Zoom meeting transcript and extract:

1. **FAQs** — questions asked during the meeting along with their answers, if the answer was given in the meeting. Include "We don't know yet" or "This was not answered" if the question was raised but unanswered.

2. **Announcements** — definitive statements of decisions, policies, deadlines, or outcomes announced during the meeting.

Output rules (strictly follow these):
- Return ONLY a valid JSON array. No preamble, no explanation, no markdown.
- Each array item MUST have these exact fields: "type" ("FAQ" or "Announcement"), "question" (string, only for FAQ; omit or null for Announcement), "answer_or_content" (string), "confidence_score" (number 0.0 to 1.0, how certain you are this was correctly extracted), "category" (string, see list below), "audience" (string, see list below), "tags" (array of 2-6 short lowercase keyword strings), "summary" (string, 1-3 sentences packing the key searchable terms), "transcript_snippet" (string, MAX 150 chars, ONLY the exact transcript excerpt that answers THIS specific question or contains THIS announcement — do NOT include other questions/answers), "start_sec" (number, approximate seconds offset in the transcript where this item starts — used to locate the exact segment).
- "category" — pick the SINGLE closest value from this exact list (copy verbatim): ${INSIGHT_CATEGORIES.map((c) => `"${c}"`).join(', ')}. If nothing fits, use "General".
- "audience" — who this is primarily for. One of: ${INSIGHT_AUDIENCES.map((a) => `"${a}"`).join(', ')}. Use "All" if unsure.
- "tags" — specific terms a user would actually type (e.g. "offer-letter", "stipend", "deadline"). No sentences.
- For FAQs, "question" must be a natural question asked by a participant.
- For Announcements, "question" should be null.
- Set confidence_score to 0.0 if the text is garbled, ambiguous, or you're guessing.
- Ignore lines that are just background noise, laughter, or non-substantive filler.
- If nothing meaningful was found, return: []
- Maximum 20 items total.
- Maximum 500 characters in answer_or_content.
- Maximum 150 characters in transcript_snippet.`;

/**
 * Sends cleaned transcript to the active AI provider and returns parsed structured items.
 */
export async function extractInsightsFromTranscript(
  rawTranscript: string,
  meetingTopic: string
): Promise<ExtractedItem[]> {
  if (process.env.NODE_ENV === 'test') {
    return [
      {
        type: 'FAQ',
        question: 'How do I request an NOC?',
        answer_or_content: 'You can request an NOC by submitting the NOC form on the student dashboard.',
        confidence_score: 0.95,
        category: 'Logistics & Access',
        audience: 'Intern',
        tags: ['noc', 'dashboard'],
        summary: 'Interns request an NOC via the NOC form on the student dashboard.',
        transcript_snippet: 'John: You can request NOC by emailing NOC coordinator or submit NOC form.',
      }
    ];
  }

  // Default empty topic so the LLM prompt is never "Meeting topic: "
  const topic = meetingTopic?.trim() || 'Untitled meeting';

  const cfg = await resolveProviderAsync();
  if (!cfg.apiKey) {
    throw new Error(
      'No AI API key configured. Set ANTHROPIC_API_KEY / OPENAI_API_KEY / XAI_API_KEY / MINIMAX_API_KEY ' +
      'or configure a provider in the admin AI dashboard.'
    );
  }

  // Parse the raw input (VTT or plain text) to get timed segments
  const segments = parseTranscript(rawTranscript);
  const transcript = segments.map(s => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n');

  if (!transcript.replace(/\s/g, '')) {
    logger.warn('[zoomExtractor] Transcript is empty after parsing, returning no insights.');
    return [];
  }

  // Truncate transcript to ~8 000 tokens to stay within context limits
  const truncated = transcript.length > 60_000 ? transcript.slice(0, 60_000) + '\n[...transcript truncated...]' : transcript;

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Meeting topic: ${meetingTopic}\n\nTranscript:\n${truncated}`,
    },
  ];

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: 2048,
  };
  // temperature is not honoured by Anthropic on /messages; skip it for that provider
  if (!cfg.needsAnthropicVersion) {
    body.temperature = 0.1;
  }

  // Build auth header — Bearer prefix is required by all supported providers
  const authValue = cfg.provider === 'anthropic' ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: authValue,
  };

  let rawContent = '';

  if (cfg.needsAnthropicVersion) {
    headers['anthropic-version'] = '2023-06-01';
    const res = await fetch(`${cfg.baseURL}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI extraction API error (${res.status}) [anthropic]: ${text}`);
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    rawContent = data.content?.[0]?.text ?? '';
  } else {
    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI extraction API error (${res.status}) [${cfg.provider}]: ${text}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    rawContent = data.choices?.[0]?.message?.content ?? '';
  }

  return parseExtractedItems(rawContent, segments);
}

/**
 * Parse the raw model output, being defensive about malformed responses.
 * Uses actual timed segments to produce accurate transcript snippets.
 */
/**
 * Keyword-based snippet: find the segment in the transcript that best matches
 * a few keywords from the question/answer, then return that segment + 1 neighbour.
 * Used as a fallback when the AI doesn't provide `start_sec`.
 */
function keywordSnippet(
  segments: TranscriptSegment[],
  question: string | undefined,
  answer: string,
  maxChars = 220,
): string {
  if (segments.length === 0) return '';
  // Build keyword set from the question + first words of the answer
  const stop = new Set(['the','a','an','is','are','was','were','be','been','being','do','does','did','have','has','had','will','would','should','can','could','may','might','of','in','on','at','to','for','with','by','from','as','it','this','that','these','those','i','you','we','they','he','she','them','our','your','my','me','us','what','when','where','why','how','who','which']);
  const tokens = (question ? question + ' ' : '') + answer.slice(0, 120);
  const keywords = tokens
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  if (keywords.length === 0) {
    return segments[0] ? `${segments[0].speaker ? segments[0].speaker + ': ' : ''}${segments[0].text}`.slice(0, maxChars) : '';
  }
  // Score each segment by how many distinct keywords appear in its text
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < segments.length; i++) {
    const t = segments[i].text.toLowerCase();
    const s = new Set<string>();
    for (const k of keywords) if (t.includes(k)) s.add(k);
    if (s.size > bestScore) { bestScore = s.size; bestIdx = i; }
  }
  if (bestScore === 0) {
    return segments[0] ? `${segments[0].speaker ? segments[0].speaker + ': ' : ''}${segments[0].text}`.slice(0, maxChars) : '';
  }
  // Pick the best segment + (optionally) one neighbour for context
  const lo = Math.max(0, bestIdx - 1);
  const hi = Math.min(segments.length, bestIdx + 2);
  const out: string[] = [];
  let total = 0;
  for (let i = lo; i < hi; i++) {
    const seg = segments[i];
    const line = `${seg.speaker ? seg.speaker + ': ' : ''}${seg.text}`;
    if (total + line.length + 1 > maxChars && out.length > 0) break;
    out.push(line);
    total += line.length + 1;
  }
  return out.join(' ').slice(0, maxChars);
}

function parseExtractedItems(raw: string, segments: TranscriptSegment[]): ExtractedItem[] {  // Try to find a JSON array in the response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is ExtractedItem => {
        if (typeof item !== 'object' || item === null) return false;
        const i = item as Record<string, unknown>;
        return (
          (i.type === 'FAQ' || i.type === 'Announcement') &&
          typeof i.answer_or_content === 'string' &&
          i.answer_or_content.length > 0
        );
      })
      .map((item) => {
        const raw = item as unknown as Record<string, unknown>;
        const confidence = Math.max(0, Math.min(1, Number(raw['confidence_score'] ?? 0)));
        // Use timed snippet extraction if the model reported a rough time offset
        const ts    = String(raw['transcript_timestamp'] ?? '').trim();
        const spkr  = String(raw['speaker']              ?? '').trim();
        // otherwise grab the first segment as a fallback
        const snippetStartSec = typeof raw['start_sec'] === 'number' ? Number(raw['start_sec']) : NaN;
        const rawSnippet = !isNaN(snippetStartSec) ? extractSnippet(segments, snippetStartSec, 120) : '';
        // Fall back to keyword-based extraction if time-based didn't apply
        const finalSnippet = rawSnippet || keywordSnippet(segments, item.question, String(item.answer_or_content ?? ''));
        // Structural metadata — validate against the closed taxonomy, fall
        // back to the safe defaults when the model returns an off-list value.
        const rawCategory = String(raw['category'] ?? '').trim();
        const category: InsightCategory = (INSIGHT_CATEGORIES as readonly string[]).includes(rawCategory)
          ? (rawCategory as InsightCategory)
          : 'General';
        const rawAudience = String(raw['audience'] ?? '').trim();
        const audience: InsightAudience = (INSIGHT_AUDIENCES as readonly string[]).includes(rawAudience)
          ? (rawAudience as InsightAudience)
          : 'All';
        return {
          type: item.type,
          question: item.question ?? undefined,
          answer_or_content: String(item.answer_or_content).slice(0, 500),
          confidence_score: confidence,
          category,
          audience,
          tags: normalizeTags(raw['tags']),
          summary: String(raw['summary'] ?? '').slice(0, 600),
          transcriptTimestamp: ts || undefined,
          speaker: spkr || undefined,
          transcript_snippet: (finalSnippet || String(item.transcript_snippet ?? '')).slice(0, 220),
        };
      });
  } catch (err) {
    logger.warn(`[zoomExtractor] Failed to parse AI extractions response JSON: ${(err as Error).message}. Raw response snippet: ${raw.slice(0, 300)}`);
    return [];
  }
}
