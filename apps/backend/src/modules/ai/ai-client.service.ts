/**
 * AiClient — Unified multi-provider AI client for the Yaksha FAQ Portal.
 *
 * Architecture:
 *  - AiConfig model stores per-feature model selection + settings (admin-configurable)
 *  - AiClient resolves the active provider from AiConfig, falls back to env vars for keys
 *  - aiChat() is the low-level HTTP call — handles Anthropic / OpenAI-compatible / xAI / MiniMax
 *  - Per-feature helpers (summarize, extract, generate) build prompts and parse responses
 *
 * Usage:
 *   const client = new AiClient();
 *   const result = await client.summarize(query, faqResults);
 *   const answer  = await client.answerQuestion(question);
 */

import AiConfig from './ai-config.model.js';
import { generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { logger } from '../../utils/http/logger.js';

// ─── Provider definitions ───────────────────────────────────────────────────

type AIProvider = 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

interface ProviderDef {
  label: string;
  baseURL: string;           // base endpoint (without /chat/completions)
  authHeader: string;        // 'Authorization' or 'x-api-key'
  needsAnthropicVersion: boolean;
  modelEnvVar: string;       // env var that overrides the configured model
  keyEnvVar: string;
}

const PROVIDERS: Record<AIProvider, ProviderDef> = {
  anthropic: {
    label: 'Anthropic Claude',
    baseURL: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    needsAnthropicVersion: true,
    modelEnvVar: 'ANTHROPIC_MODEL',
    keyEnvVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
    modelEnvVar: 'OPENAI_MODEL',
    keyEnvVar: 'OPENAI_API_KEY',
  },
  xai: {
    label: 'xAI Grok',
    baseURL: 'https://api.x.ai/v1',
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
    modelEnvVar: 'XAI_MODEL',
    keyEnvVar: 'XAI_API_KEY',
  },
  minimax: {
    label: 'MiniMax',
    baseURL: (process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1').replace(/\/$/, ''),
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
    modelEnvVar: 'MINIMAX_MODEL',
    keyEnvVar: 'MINIMAX_API_KEY',
  },
  gemini: {
    label: 'Google Gemini',
    baseURL: (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
    modelEnvVar: 'GEMINI_MODEL',
    keyEnvVar: 'GEMINI_API_KEY',
  },
  custom: {
    label: 'Custom Provider',
    baseURL: (process.env.CUSTOM_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, ''),
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
    modelEnvVar: 'CUSTOM_MODEL',
    keyEnvVar: 'CUSTOM_API_KEY',
  },
};

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  xai: 'xAI Grok',
  minimax: 'MiniMax',
  gemini: 'Google Gemini',
  custom: 'Custom Provider',
};

// ─── Feature types ─────────────────────────────────────────────────────────

export type AIFeature =
  | 'duplicateDetection'
  | 'knowledgeExtraction'
  | 'searchSummarization'
  | 'faqGeneration';

export interface AIResult {
  content: string;
  provider: AIProvider;
  model: string;
  tokensUsed: number;
  estimatedCost: number; // USD
  rawResponse?: unknown;
}

export interface SummarizeOptions {
  query: string;
  faqs: Array<{ question: string; answer: string; _id?: string }>;
  communityPosts?: Array<{ title: string; body?: string; _id?: string }>;
  maxLength?: number;
}

export interface ExtractKnowledgeOptions {
  source: 'transcript' | 'community_post';
  rawText: string;
  context?: string; // e.g. meeting title, post title
}

export interface DetectDuplicatesOptions {
  userQuestion: string;
  candidates: Array<{ _id: string; title: string; source: 'faq' | 'community'; answer?: string }>;
}

export interface DuplicateMatch {
  _id: string;
  score: number;
  reason: string;
}

// ─── Cost constants (approximate per-provider pricing per 1M tokens) ──────────

const COST_PER_MILLION_TOKENS: Record<AIProvider, number> = {
  anthropic: 3.00,    // Claude Sonnet 4
  openai: 0.15,       // GPT-4o Mini
  xai: 5.00,          // Grok 3 (estimate)
  minimax: 0.10,      // MiniMax Text-01
  gemini: 0.075,      // Gemini 1.5 Flash (estimate)
  custom: 0.00,       // Custom (usually self-hosted / free)
};

// ─── AiClient ──────────────────────────────────────────────────────────────

export class AiClient {
  private apiKey: string;
  private provider: AIProvider;
  private modelOverrides: Partial<Record<AIProvider, string>> = {};

  constructor() {
    try {
      this.apiKey = this.loadApiKey();
      this.provider = this.detectProvider();
    } catch (err) {
      this.apiKey = '';
      this.provider = 'minimax';
      logger.warn(`[aiClient] Constructor failed to load API key/detect provider: ${(err as Error).message}. Falling back to minimax.`);
    }
  }

  private loadApiKey(): string {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
    if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
    throw new Error(
      'No AI API key configured. Set one of:\n' +
      '  ANTHROPIC_API_KEY — https://console.anthropic.com/settings/keys\n' +
      '  OPENAI_API_KEY   — https://platform.openai.com/api-keys\n' +
      '  XAI_API_KEY      — https://console.x.ai/\n' +
      '  MINIMAX_API_KEY  — https://platform.minimax.io'
    );
  }

  private detectProvider(): AIProvider {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.XAI_API_KEY) return 'xai';
    return 'minimax';
  }

  /**
   * Override the model for a specific provider (from AiConfig settings).
   * Call this after loading AiConfig in the request path.
   */
  setModelOverride(provider: AIProvider, model: string): void {
    this.modelOverrides[provider] = model;
  }

  private getModel(feature: AIFeature, configuredModel?: string): string {
    if (configuredModel) return configuredModel;
    const providerOverride = this.modelOverrides[this.provider];
    if (providerOverride) return providerOverride;
    // Defaults per provider
    const defaults: Record<AIProvider, string> = {
      anthropic: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o-mini',
      xai: 'grok-3',
      minimax: 'MiniMax-Text-01',
      gemini: 'gemini-1.5-flash',
      custom: '',
    };
    return defaults[this.provider];
  }

  private getBaseURL(): string {
    return PROVIDERS[this.provider].baseURL;
  }

  // ─── Low-level chat ────────────────────────────────────────────────────────

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    feature: AIFeature,
    overrides?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
      batchId?: string;
    }
  ): Promise<AIResult> {
    if (process.env.NODE_ENV === 'test') {
      if (feature === 'knowledgeExtraction') {
        return {
          content: JSON.stringify({
            insights: [
              {
                question: 'How do I request an NOC?',
                answer: 'You can request an NOC by submitting the NOC form on the student dashboard.',
                category: 'Administrative',
                tags: ['NOC', 'docs'],
                confidenceScore: 0.9,
                hallucinationFlags: [],
                grammarIssues: [],
              }
            ]
          }),
          provider: 'openai',
          model: 'gpt-4o',
          tokensUsed: 100,
          estimatedCost: 0,
        };
      }
      if (feature === 'duplicateDetection') {
        return {
          content: JSON.stringify({ isDuplicate: false, matches: [] }),
          provider: 'openai',
          model: 'gpt-4o',
          tokensUsed: 50,
          estimatedCost: 0,
        };
      }
      if (feature === 'faqGeneration') {
        return {
          content: JSON.stringify({
            question: 'Mock Question?',
            answer: 'Mock Answer.',
            category: 'Mock Category',
            tags: ['mock'],
            confidenceScore: 0.95,
            hallucinationFlags: [],
            grammarIssues: [],
          }),
          provider: 'openai',
          model: 'gpt-4o',
          tokensUsed: 100,
          estimatedCost: 0,
        };
      }
      return {
        content: 'This is a mock AI response for testing.',
        provider: 'openai',
        model: 'gpt-4o',
        tokensUsed: 50,
        estimatedCost: 0,
      };
    }

    const { resolveProviderAsync, getModelForProvider, resolveActiveAiConfig } = await import('../../utils/ai/aiProvider.js');
    const { default: AiConfig } = await import('./ai-config.model.js');

    const batchId = overrides?.batchId ?? null;
    const resolvedOverrides = await resolveActiveAiConfig(batchId);
    let dbConfig = await AiConfig.findOne({ batchId: batchId || null, isActive: true });
    // Fallback to global config if the batch-specific one is not found or is inactive
    if (!dbConfig && batchId) {
      dbConfig = await AiConfig.findOne({ batchId: null, isActive: true });
    }

    const requestedProvider = dbConfig?.activeProvider ?? this.provider;
    const config = await resolveProviderAsync(requestedProvider);

    if (!config.apiKey) {
      throw new Error(`No AI API key configured for provider '${config.provider}'.`);
    }

    const featureConfig = dbConfig?.features?.[feature];
    // BUGFIX (Phase 0 §2.3): the AiConfig schema has `features[feature].enabled`
    // but the dispatcher in chat() never read it, so per-program feature
    // toggles in the admin UI were silently ignored. Now honour the flag:
    // if an operator sets `enabled: false` for this feature, surface a clear
    // error so the caller (and the logs) know the gate, rather than letting
    // the call proceed with the fallback config.
    if (featureConfig && featureConfig.enabled === false) {
      throw new Error(
        `AI feature '${feature}' is disabled in the active AiConfig. ` +
        `Enable it in Admin Settings → AI Config, or pick a different batch with it enabled.`
      );
    }
    const rawModel = overrides?.model || featureConfig?.model || config.model;
    const model = getModelForProvider(rawModel, config.provider, config.model);

    if (!model) {
      throw new Error(`No AI model configured for provider '${config.provider}'. Please configure a model in Admin Settings.`);
    }

    const temperature = overrides?.temperature ?? featureConfig?.temperature ?? 0.3;
    const maxTokens = overrides?.maxTokens ?? featureConfig?.maxTokens ?? 1024;

    const authValue = config.provider === 'anthropic' ? config.apiKey : `Bearer ${config.apiKey}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [config.authHeader]: authValue,
    };
    if (config.needsAnthropicVersion) {
      headers['anthropic-version'] = '2023-06-01';
    }

    // Log configuration immediately before AI request
    const apiKeySource = config.apiKey ? 'Admin Settings / DB' : 'Environment Variable / Default';
    console.log('--- AI Request Configuration ---');
    console.log('provider =', config.provider);
    console.log('model =', model);
    console.log('task =', feature);
    console.log('apiKeyPresent =', !!config.apiKey);
    console.log('apiKeySource =', apiKeySource);
    console.log('baseUrl =', config.baseURL);
    console.log('--------------------------------');

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    let url: string;
    if (config.provider === 'anthropic') {
      url = `${config.baseURL}/messages`;
    } else {
      url = `${config.baseURL}/chat/completions`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${config.provider} API error (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Extract content
    let content = '';
    let tokensUsed = 0;

    if (config.provider === 'anthropic') {
      const usage = (data as any).usage ?? {};
      tokensUsed = ((usage as any).input_tokens ?? 0) + ((usage as any).output_tokens ?? 0);
      content = ((data as any).content ?? [])[0]?.text ?? '';
    } else {
      tokensUsed = (data as any).usage?.total_tokens ?? 0;
      content = (data as any).choices?.[0]?.message?.content ?? '';
    }

    const estimatedCost = (tokensUsed / 1_000_000) * COST_PER_MILLION_TOKENS[config.provider];

    // Track usage in DB (best effort — don't block on this)
    this.trackUsage(tokensUsed, estimatedCost).catch((err) => {
      logger.warn(`[aiClient] Failed to track usage asynchronously: ${(err as Error).message}`);
    });

    return { content, provider: config.provider, model, tokensUsed, estimatedCost, rawResponse: data };
  }

  // ─── Usage tracking ───────────────────────────────────────────────────────

  private async trackUsage(tokens: number, cost: number): Promise<void> {
    try {
      const { default: AiConfig } = await import('./ai-config.model.js');
      await AiConfig.findOneAndUpdate(
        { isActive: true },
        {
          $inc: {
            'usage.totalRequests': 1,
            'usage.totalEstimatedCost': cost,
          },
        }
      );
    } catch (err) {
      logger.warn(`[aiClient] trackUsage failed to update AiConfig: ${(err as Error).message}`);
    }
  }

  // ─── Feature: Duplicate detection ─────────────────────────────────────────

  async detectDuplicates(options: DetectDuplicatesOptions): Promise<DuplicateMatch[]> {
    const systemPrompt = `You are an expert at detecting duplicate questions in an internal Q&A system.
Given a user's question and a list of existing questions, determine which (if any) are TRUE duplicates.
Answer ONLY with a valid JSON array. No preamble, no markdown.
Each item must have: "id" (string), "score" (0.0–1.0), "reason" (string, 1 sentence max).
Score guide: 1.0 = identical intent, 0.8-0.99 = same topic, 0.5-0.79 = likely related, <0.5 = not a duplicate.
Output: [{"id": "...", "score": 0.92, "reason": "Both ask about..."}]`;

    const candidateList = options.candidates
      .map((c, i) => `  [${i}] id="${c._id}", source="${c.source}", question="${c.title.replace(/"/g, "'")}"`)
      .join('\n');

    const userContent =
      `User question: "${options.userQuestion.replace(/"/g, "'")}"\n\n` +
      `Candidate questions:\n${candidateList}\n\n` +
      `Respond with a JSON array only.`;

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      'duplicateDetection',
      { temperature: 0.1, maxTokens: 1024 }
    );

    return parseDuplicateResponse(result.content, options.candidates);
  }

  // ─── Feature: Search summarization ───────────────────────────────────────

  async summarize(options: SummarizeOptions): Promise<string> {
    if (!options.faqs.length && !options.communityPosts?.length) {
      return 'No relevant results found.';
    }

    const faqText = options.faqs
      .map((f, i) => `[${i + 1}] Q: ${f.question}\n   A: ${(f.answer ?? '').slice(0, 300)}`)
      .join('\n\n');

    const postText = (options.communityPosts ?? [])
      .map((p, i) => `[${i + 1}] "${p.title}" — ${(p.body ?? '').slice(0, 200)}`)
      .join('\n');

    const maxLen = options.maxLength ?? 200;
    const truncationNote = maxLen < 300 ? ' (answers truncated for brevity)' : '';

    const systemPrompt = `You are a helpful assistant that summarizes Q&A search results for an internal FAQ portal.
Keep answers concise and direct. If the answer is incomplete, say so.
Summaries should be no longer than ${maxLen} words.`;

    const userContent =
      `User asked: "${options.query.replace(/"/g, "'")}"\n\n` +
      (faqText ? `Relevant FAQs:\n${faqText}\n\n` : '') +
      (postText ? `Relevant community discussions:\n${postText}` : '') +
      `\n\nProvide a concise summary${truncationNote}. If nothing matches, say "No relevant results found."`;

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      'searchSummarization',
      { temperature: 0.3, maxTokens: 512 }
    );

    return result.content;
  }

  // ─── Feature: Knowledge extraction ───────────────────────────────────────

  /**
   * Extract structured Q&A pairs from raw text (Zoom transcript or community post).
   * Returns an array of { question, answer, confidence } objects.
   */
  async extractKnowledge(options: ExtractKnowledgeOptions): Promise<
    Array<{ question: string; answer: string; confidence: number; source: string }>
  > {
    const sourceLabel = options.source === 'transcript' ? 'Zoom transcript' : 'community post';

    const systemPrompt = `You are an expert at extracting question-and-answer pairs from raw text.
Given a ${sourceLabel}, extract all distinct Q&A pairs that are generally applicable (not overly specific to one person).
Each pair must have: question (what a student would ask), answer (clear and concise).
Return ONLY a valid JSON array of objects with: "question", "answer", "confidence" (0-1).
Do NOT include pairs that are: greetings, jokes, personal anecdotes, or too specific to be useful to others.
Output format: [{"question": "...", "answer": "...", "confidence": 0.9}]`;

    const userContent =
      `Extract Q&A pairs from this ${sourceLabel}${options.context ? ` (context: "${options.context}")` : ''}:\n\n` +
      options.rawText.slice(0, 8000); // token budget safety

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      'knowledgeExtraction',
      { temperature: 0.2, maxTokens: 2048 }
    );

    return parseKnowledgeResponse(result.content);
  }

  // ─── Feature: FAQ generation ───────────────────────────────────────────────

  /**
   * Generate a draft FAQ from a community post or question.
   * Returns { question, answer, category, confidence }.
   */
  async generateFAQ(
    question: string,
    contextText?: string,
    targetCategory?: string
  ): Promise<{ question: string; answer: string; category: string; confidence: number }> {
    const systemPrompt = `You are an expert FAQ writer for an internship Q&A portal.
Given a question (and optionally a discussion/context), generate a clear, accurate FAQ entry.
Output ONLY a valid JSON object with: "question" (refined), "answer" (clear and complete), "category" (one of: General, Internship, Offer Letter, NOC, Project, Certificate, Team, HR, IT, Other), "confidence" (0-1).
The answer should be direct and actionable. Do not add disclaimers.`;

    const userContent =
      `Question: "${question}"\n` +
      (contextText ? `Context / discussion:\n${contextText.slice(0, 4000)}\n\n` : '') +
      (targetCategory ? `Target category: ${targetCategory}` : '');

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      'faqGeneration',
      { temperature: 0.4, maxTokens: 1024 }
    );

    return parseFAQResponse(result.content);
  }

  // ─── Vector pre-filter ─────────────────────────────────────────────────────

  /**
   * Pre-filter candidates by vector similarity, returning topK results.
   * Used to reduce token cost — AI only sees the most relevant candidates.
   */
  async vectorFilter(
    query: string,
    candidates: Array<{ _id: string; text: string; source: 'faq' | 'community' }>,
    topK = 15
  ): Promise<typeof candidates> {
    if (!candidates.length) return candidates;

    try {
      const queryEmb = await generateQueryEmbedding(query);

      if (candidates[0]?.source === 'faq') {
        const { default: FAQ } = await import('../faq/faq.model.js');

        const faqs = await FAQ.find({
          _id: { $in: candidates.filter((c) => c.source === 'faq').map((c) => c._id) },
          embedding: { $exists: true, $ne: null },
        }).select('_id embedding').lean();

        const embMap = new Map(faqs.map((f) => [f._id.toString(), f.embedding as number[]]));

        return candidates
          .map((c) => {
            const emb = embMap.get(c._id);
            if (!emb) return { candidate: c, score: -1 };
            const dot = emb.reduce((s: number, v: number, i: number) => s + v * queryEmb[i], 0);
            return { candidate: c, score: dot };
          })
          .filter((x) => x.score > 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)
          .map((x) => x.candidate);
      }

      return candidates.slice(0, topK);
    } catch (err) {
      logger.warn(`[aiClient] Embedding fallback calculation in findDuplicatesByVector failed: ${(err as Error).message}`);
      return candidates.slice(0, topK);
    }
  }
}

// ─── Response parsers ───────────────────────────────────────────────────────

function parseDuplicateResponse(
  raw: string,
  candidates: Array<{ _id: string; title: string; source: 'faq' | 'community' }>
): DuplicateMatch[] {
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\[[\s\S]*?\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    const results: DuplicateMatch[] = [];
    for (const item of parsed) {
      const i = item as Record<string, unknown>;
      const id = String(i.id ?? '');
      const score = Math.max(0, Math.min(1, Number(i.score) || 0));
      const reason = String(i.reason ?? '').slice(0, 200);
      if (score < 0.50) continue;
      if (!candidates.find((c) => c._id === id)) continue;
      results.push({ _id: id, score, reason });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (err) {
    logger.warn(`[aiClient] Failed to parse duplicate response JSON: ${(err as Error).message}. Raw response: ${raw.slice(0, 300)}`);
    return [];
  }
}

function parseKnowledgeResponse(
  raw: string
): Array<{ question: string; answer: string; confidence: number; source: string }> {
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\[[\s\S]*?\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        const i = item as Record<string, unknown>;
        return {
          question: String(i.question ?? '').trim(),
          answer: String(i.answer ?? '').trim(),
          confidence: Math.max(0, Math.min(1, Number(i.confidence ?? 0))),
          source: 'ai_extracted',
        };
      })
      .filter((x) => x.question.length > 10 && x.answer.length > 10);
  } catch (err) {
    logger.warn(`[aiClient] Failed to parse knowledge extraction response JSON: ${(err as Error).message}. Raw response: ${raw.slice(0, 300)}`);
    return [];
  }
}

function parseFAQResponse(
  raw: string
): { question: string; answer: string; category: string; confidence: number } {
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { question: '', answer: '', category: 'General', confidence: 0 };

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      question: String(parsed.question ?? '').trim(),
      answer: String(parsed.answer ?? '').trim(),
      category: String(parsed.category ?? 'General').trim(),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    };
  } catch (err) {
    logger.warn(`[aiClient] Failed to parse FAQ generation response JSON: ${(err as Error).message}. Raw response: ${raw.slice(0, 300)}`);
    return { question: '', answer: '', category: 'General', confidence: 0 };
  }
}

// ─── Default export ─────────────────────────────────────────────────────────

export default AiClient;