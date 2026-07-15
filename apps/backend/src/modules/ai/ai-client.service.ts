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

import AiConfig, { type IProviderKey } from './ai-config.model.js';
import { generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { logAiApiSuccess, logAiApiFailure } from '../../utils/ai/apiUsageLog.js';
import { logger } from '../../utils/http/logger.js';
import { decrypt } from '../../utils/auth/crypto.js';

// v1.83 — in-memory unhealthy key tracker. Mirrors the same
// information that AiConfig.provider.keys[i].unhealthyUntil would
// carry, but skips the DB round-trip on every 429. Reset on server
// restart (acceptable — the DB field is still authoritative, this
// is the hot-path cache). Keyed by `${provider}:${label}`.
const UNHEALTHY_UNTIL = new Map<string, number>();
const UNHEALTHY_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function unhealthyKey(provider: string, label: string): string {
  return `${provider}:${label}`;
}

function markUnhealthy(provider: string, label: string) {
  const key = unhealthyKey(provider, label);
  UNHEALTHY_UNTIL.set(key, Date.now() + UNHEALTHY_DURATION_MS);
  // Best-effort persistence so a fresh resolver sees the same hint.
  AiConfig.findOne({ isActive: true, batchId: null }).then((cfg) => {
    if (!cfg) return;
    const arr = (cfg as any).getApiKeys?.(provider);
    if (!Array.isArray(arr)) return;
    const until = new Date(Date.now() + UNHEALTHY_DURATION_MS);
    let mutated = false;
    const next = arr.map((k: any) => {
      if (k?.label === label && (!k.unhealthyUntil || new Date(k.unhealthyUntil).getTime() < until.getTime())) {
        mutated = true;
        return { ...k, unhealthyUntil: until };
      }
      return k;
    });
    if (mutated) {
      AiConfig.updateOne(
        { _id: cfg._id },
        { $set: { [`providers.${provider}.keys`]: next } },
      ).catch((err) => {
        logger.warn(`[aiClient] Failed to persist unhealthyUntil for ${provider}:${label}: ${(err as Error).message}`);
      });
    }
  }).catch((err) => {
    logger.warn(`[aiClient] Failed to load config while marking unhealthy: ${(err as Error).message}`);
  });
}

function clearUnhealthy(provider: string, label: string) {
  const key = unhealthyKey(provider, label);
  UNHEALTHY_UNTIL.delete(key);
  // Best-effort persistence — wipe any persisted unhealthyUntil for
  // this label so future reads see the key as healthy.
  AiConfig.findOne({ isActive: true, batchId: null }).then((cfg) => {
    if (!cfg) return;
    const arr = (cfg as any).getApiKeys?.(provider);
    if (!Array.isArray(arr)) return;
    let mutated = false;
    const next = arr.map((k: any) => {
      if (k?.label === label && k.unhealthyUntil) {
        mutated = true;
        return { ...k, unhealthyUntil: null };
      }
      return k;
    });
    if (mutated) {
      AiConfig.updateOne(
        { _id: cfg._id },
        { $set: { [`providers.${provider}.keys`]: next } },
      ).catch((err) => {
        logger.warn(`[aiClient] Failed to clear unhealthyUntil for ${provider}:${label}: ${(err as Error).message}`);
      });
    }
  }).catch((err) => {
    logger.warn(`[aiClient] Failed to load config while clearing unhealthy: ${(err as Error).message}`);
  });
}

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
  modelName: string;
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
          modelName: 'gpt-4o',
          tokensUsed: 100,
          estimatedCost: 0,
        };
      }
      if (feature === 'duplicateDetection') {
        return {
          content: JSON.stringify({ isDuplicate: false, matches: [] }),
          provider: 'openai',
          modelName: 'gpt-4o',
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
          modelName: 'gpt-4o',
          tokensUsed: 100,
          estimatedCost: 0,
        };
      }
      return {
        content: 'This is a mock AI response for testing.',
        provider: 'openai',
        modelName: 'gpt-4o',
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
    const rawModel = overrides?.model || featureConfig?.model || config.modelName;
    const model = getModelForProvider(rawModel, config.provider, config.modelName);

    if (!model) {
      throw new Error(`No AI model configured for provider '${config.provider}'. Please configure a model in Admin Settings.`);
    }

    const temperature = overrides?.temperature ?? featureConfig?.temperature ?? 0.3;
    const maxTokens = overrides?.maxTokens ?? featureConfig?.maxTokens ?? 1024;

    // v1.83 — multi-key rotation. Build the ordered candidates[]
    // list for the active provider by decrypting every keys[] slot
    // that isn't currently marked unhealthy. When the legacy
    // single-key field is the only source, a single "Primary"
    // candidate is synthesised (matching the resolver's behaviour
    // for legacy docs). The first candidate is used for the
    // initial request; 429s rotate to the next healthy one.
    const candidates: Array<{
      label: string;
      key: string;
      baseURL: string;
      authHeader: 'x-api-key' | 'Authorization';
      needsAnthropicVersion: boolean;
    }> = (() => {
      try {
        const raw: IProviderKey[] = dbConfig && typeof (dbConfig as any).getApiKeys === 'function'
          ? ((dbConfig as any).getApiKeys(config.provider) as IProviderKey[])
          : [];
        const defaultBaseURL = (dbConfig?.providers as any)?.[config.provider]?.baseURL
          || config.baseURL;
        const out: typeof candidates = [];
        for (const k of raw) {
          if (!k || !k.valueEnc) continue;
          const memUntil = UNHEALTHY_UNTIL.get(unhealthyKey(config.provider, k.label || ''));
          const dbUntil = k.unhealthyUntil ? new Date(k.unhealthyUntil).getTime() : 0;
          const until = Math.max(memUntil ?? 0, dbUntil);
          if (until > Date.now()) continue; // skip unhealthy
          let plain = '';
          try { plain = decrypt(k.valueEnc); } catch { continue; }
          if (!plain) continue;
          out.push({
            label: k.label || 'Primary',
            key: plain,
            baseURL: (k.baseURL && k.baseURL.length > 0) ? k.baseURL : defaultBaseURL,
            authHeader: config.authHeader === 'x-api-key' ? 'x-api-key' : 'Authorization',
            needsAnthropicVersion: !!config.needsAnthropicVersion,
          });
        }
        // Always at least one candidate — fall back to the resolved
        // env/legacy single-key so callers that haven't yet adopted
        // multi-key still get a working request.
        if (out.length === 0 && config.apiKey) {
          out.push({
            label: 'Primary',
            key: config.apiKey,
            baseURL: config.baseURL,
            authHeader: config.authHeader === 'x-api-key' ? 'x-api-key' : 'Authorization',
            needsAnthropicVersion: !!config.needsAnthropicVersion,
          });
        }
        return out;
      } catch {
        return [{
          label: 'Primary',
          key: config.apiKey,
          baseURL: config.baseURL,
          authHeader: config.authHeader === 'x-api-key' ? 'x-api-key' : 'Authorization',
          needsAnthropicVersion: !!config.needsAnthropicVersion,
        }];
      }
    })();

    if (candidates.length === 0) {
      throw new Error(`No AI API key configured for provider '${config.provider}'.`);
    }

    // The currently-selected candidate's authHeader / baseURL /
    // needsAnthropicVersion may differ from the resolved provider
    // defaults (per-key baseURL), so we rebuild headers per
    // rotation. `currentCandidate` is mutated by the retry loop.
    let currentCandidateIdx = 0;
    const buildHeadersFor = (cand: typeof candidates[number]): Record<string, string> => {
      const authValue = cand.authHeader === 'x-api-key' ? cand.key : `Bearer ${cand.key}`;
      const h: Record<string, string> = {
        'Content-Type': 'application/json',
        [cand.authHeader]: authValue,
      };
      if (cand.needsAnthropicVersion) h['anthropic-version'] = '2023-06-01';
      return h;
    };
    let headers: Record<string, string> = buildHeadersFor(candidates[currentCandidateIdx]);

    // v1.79 — replaced the previous ad-hoc `console.log('--- AI
    // Request Configuration ---')` block (and its companion
    // `logger.warn` on failure) with a single structured audit
    // log via `logAiApiSuccess` / `logAiApiFailure`. Captures
    // provider, model, feature, duration, tokens, and HTTP
    // status uniformly across all three call sites.
    const requestStartedAt = Date.now();

    // v1.80 — per-provider request-body shape. The 5 OpenAI-
    // compatible providers all use `{ model, messages, temperature,
    // max_tokens }`, but the field names and edge cases have
    // diverged across vendors as their APIs evolved. This block
    // constructs the body each provider actually wants, instead
    // of sending the same blob to all of them.
    //
    // Reference: research July 2026.
    //   - OpenAI:     `max_tokens` is DEPRECATED in favour of
    //                 `max_completion_tokens` (o1, o3, GPT-5 ignore
    //                 `max_tokens`). Older models still accept
    //                 `max_tokens`. Send BOTH — `max_completion_tokens`
    //                 is ignored by legacy models, and `max_tokens`
    //                 is still accepted by everything pre-2025.
    //   - MiniMax:    OpenAI-compat shim. Canonical field is
    //                 `max_completion_tokens`; `max_tokens` is
    //                 deprecated for M2/M1/M3.
    //   - Gemini:     OpenAI-compat shim silently DROPS `max_tokens`
    //                 (see router-for-me/CLIProxyAPI#4108). Must
    //                 send `max_completion_tokens`.
    //   - xAI Grok:   Full OpenAI-compat. `max_tokens` is the
    //                 supported field name; no `max_completion_tokens`
    //                 documented. Use the legacy name.
    //   - Anthropic:  Different schema entirely — `system` is a
    //                 TOP-LEVEL field, not a `role:'system'` message.
    //                 (Claude Sonnet 4.8+ accepts mid-conversation
    //                 system messages, but the canonical first-turn
    //                 shape is top-level. Extract and send as `system`.)
    //   - Custom:     Best-effort OpenAI-compat — send `max_tokens`
    //                 (most third-party servers understand it; the
    //                 OpenAI client SDK still emits it by default).
    let body: Record<string, unknown>;
    if (config.provider === 'anthropic') {
      // Extract leading system message(s) into a top-level `system`
      // field. All four current call sites pass exactly one
      // `role:'system'` message as element 0, so a single extract
      // is the common case — but we handle the multi-system case
      // for forward-compat.
      const systemParts: string[] = [];
      const remaining: typeof messages = [];
      for (const m of messages) {
        if (m.role === 'system') systemParts.push(m.content);
        else remaining.push(m);
      }
      body = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: remaining,
        ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
      };
    } else if (config.provider === 'openai') {
      // Send both — `max_completion_tokens` is the new canonical,
      // `max_tokens` keeps backward compat with pre-2025 models
      // that don't yet understand the new name.
      body = {
        model,
        max_tokens: maxTokens,
        max_completion_tokens: maxTokens,
        temperature,
        messages,
      };
    } else if (config.provider === 'minimax' || config.provider === 'gemini') {
      // Canonical field for both: `max_completion_tokens`.
      body = {
        model,
        max_completion_tokens: maxTokens,
        temperature,
        messages,
      };
    } else {
      // xai + custom — classic OpenAI shape, `max_tokens` is the
      // widely understood name on third-party servers.
      //
      // v1.82 — custom-provider field-name compatibility. Some
      // admins route their `custom` provider through an in-house
      // proxy or third-party gateway that translates OpenAI fields
      // (e.g. snake_case `model`) into that tool's native schema
      // (e.g. camelCase `modelName`), but the upstream (Groq-style)
      // then rejects the non-OpenAI field with `400 property
      // 'modelName' is unsupported`. The field name is resolved
      // from the resolved provider config (`config.customModelField`)
      // — see `resolveCustomModelField()` in aiProvider.ts for the
      // DB → env → default chain. xAI (and the rest) always use
      // the standard `'model'` field.
      const modelField = (
        config.provider === 'custom'
          ? (config.customModelField ?? 'model')
          : 'model'
      );
      body = {
        [modelField]: model,
        max_tokens: maxTokens,
        temperature,
        messages,
      };
    }

    // v1.83 — URL is now built PER CANDIDATE because each key slot
    // may carry its own baseURL override. We define a helper and
    // also wrap the v1.80 custom-baseURL normalisation so each
    // rotation still benefits from the leading-/v1 fix-up.
    const buildUrlFor = (cand: typeof candidates[number]): string => {
      let u: string;
      if (config.provider === 'anthropic') {
        u = `${cand.baseURL}/messages`;
      } else {
        u = `${cand.baseURL}/chat/completions`;
      }
      if (config.provider === 'custom') {
        try {
          const parsed = new URL(u);
          const parts = parsed.pathname.split('/').filter(Boolean);
          const idx = parts.indexOf('chat');
          if (idx >= 0) {
            if (idx === 0) {
              parts.unshift('v1');
              parsed.pathname = '/' + parts.join('/');
              u = parsed.toString();
            } else if (parts[idx - 1] !== 'v1') {
              parts.splice(idx, 0, 'v1');
              parsed.pathname = '/' + parts.join('/');
              u = parsed.toString();
            }
          }
        } catch {
          // Malformed URL — let the fetch fail naturally with a
          // clear network error rather than masking it.
        }
      }
      return u;
    };
    let url: string = buildUrlFor(candidates[currentCandidateIdx]);

    // ── 429 retry with multi-key rotation (v1.83) ────────────────────────────
    // v1.83 — extended from "same key, fixed backoff" to "rotate to
    // the next healthy candidate on 429". On a 429:
    //   1. Mark the current key unhealthy (in-memory + persisted).
    //   2. Step to the next candidate. If none remain, surface the
    //      last error to the caller.
    // The pre-v1.83 fixed-backoff loop is preserved for the LEGACY
    // single-key path (candidates.length === 1 with the resolved
    // env/legacy key) so a single admin-managed key still gets the
    // advertised-backoff retry that admins rely on.
    const MAX_429_ATTEMPTS = candidates.length > 1 ? candidates.length : 3;
    let attempt = 0;
    let lastError: Error | null = null;
    let res: Response;
    let rotatedThisLoop = false;
    while (true) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Network-level failure (DNS, TLS, abort, etc.) — no HTTP status.
        logAiApiFailure({
          kind: 'inference',
          provider: config.provider,
          modelName: model,
          feature,
          durationMs: Date.now() - requestStartedAt,
          batchId,
          error: (err as Error).message,
        });
        throw err;
      }
      if (res.status !== 429) {
        // Success or non-retriable failure — clear this candidate's
        // unhealthy hint (in case it was previously set) and exit.
        clearUnhealthy(config.provider, candidates[currentCandidateIdx].label);
        break;
      }
      // Mark current key unhealthy — admins expect this candidate to
      // be skipped on subsequent requests until the cooldown expires.
      const failedLabel = candidates[currentCandidateIdx].label;
      markUnhealthy(config.provider, failedLabel);
      // Drain the body so the connection is freed before we sleep.
      await res.text().catch(() => undefined);

      // Try to rotate to the next candidate.
      if (currentCandidateIdx + 1 < candidates.length) {
        currentCandidateIdx++;
        url = buildUrlFor(candidates[currentCandidateIdx]);
        headers = buildHeadersFor(candidates[currentCandidateIdx]);
        attempt++;
        rotatedThisLoop = true;
        logger.warn(
          `[aiClient] 429 from ${config.provider}/${model} (key="${failedLabel}"); rotating to next candidate "${candidates[currentCandidateIdx].label}" (attempt ${attempt}/${MAX_429_ATTEMPTS - 1}).`,
        );
        continue;
      }

      // No more candidates. Single-key path: respect the Retry-After
      // header (or exponential backoff) and retry the same key.
      if (candidates.length === 1 && attempt + 1 < MAX_429_ATTEMPTS) {
        attempt++;
        const retryAfterHeader = res.headers.get('retry-after');
        const headerSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const backoffMs =
          Number.isFinite(headerSec) && headerSec > 0
            ? Math.min(headerSec * 1000, 8000)
            : Math.min(1000 * 2 ** (attempt - 1), 8000);
        logger.warn(
          `[aiClient] 429 from ${config.provider}/${model}; retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_429_ATTEMPTS - 1}).`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      // All candidates exhausted AND no further single-key retries
      // — surface the last response as the error.
      lastError = new Error(
        `${config.provider} API rate-limited across ${candidates.length} key(s); last response ${res.status}.`,
      );
      break;
    }

    if (rotatedThisLoop && lastError) {
      // Reuse the post-loop error path so callers see the same
      // shape regardless of whether the failure was on the first
      // candidate or after rotating through all of them.
      logAiApiFailure({
        kind: 'inference',
        provider: config.provider,
        modelName: model,
        feature,
        durationMs: Date.now() - requestStartedAt,
        batchId,
        error: lastError.message,
        status: 429,
        requestBody: body,
      });
      throw lastError;
    }

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`${config.provider} API error (${res.status}): ${text.slice(0, 300)}`);
      logAiApiFailure({
        kind: 'inference',
        provider: config.provider,
        modelName: model,
        feature,
        durationMs: Date.now() - requestStartedAt,
        batchId,
        error: err.message,
        status: res.status,
        // Persist the outgoing body so admins can debug schema mismatches
        // with custom / proxied providers (e.g. relays that rename `model`
        // → `modelName` and forward to Groq). Cap at 2KB to keep docs small.
        requestBody: body,
      });
      throw err;
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

    logAiApiSuccess({
      kind: 'inference',
      provider: config.provider,
      modelName: model,
      feature,
      durationMs: Date.now() - requestStartedAt,
      tokensUsed,
      estimatedCostUsd: estimatedCost,
      batchId,
    });

    // Track usage in DB (best effort — don't block on this)
    this.trackUsage(tokensUsed, estimatedCost).catch((err) => {
      logger.warn(`[aiClient] Failed to track usage asynchronously: ${(err as Error).message}`);
    });

    return { content, provider: config.provider, modelName: model, tokensUsed, estimatedCost, rawResponse: data };
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