/**
 * fallbackChain.ts — v1.85 — automatic provider failover for chat calls.
 *
 * Problem
 * -------
 * `getPipelineProviderConfig()` already does static resolution: it
 * walks the per-pipeline env override, then the active AiConfig
 * doc, then a hard-coded provider priority list. But it commits to
 * ONE provider. When that provider returns 401 (key revoked), 429
 * (rate-limited), 5xx, or a network error, the pipeline just
 * throws and the cron / user sees a failure.
 *
 * Solution
 * --------
 * `runWithFallback()` wraps `chatWithConfig()` in a try/except and,
 * on a retriable failure, walks through a per-pipeline priority
 * list of fallbacks until one returns a non-empty reply. The
 * priority list is resolved in this order:
 *
 *   1. The pipeline-specific `features.{pipeline}.fallbackProviders[]`
 *      array on the active AiConfig doc (admin-set per pipeline).
 *   2. The `FALLBACK_PROVIDERS` env var, parsed as a JSON array.
 *   3. The hard-coded default order: anthropic → openai → xai →
 *      minimax → gemini → custom.
 *
 * "Retriable" failure detection
 * -----------------------------
 * HTTP 401, 403, 408, 429, 5xx, and network/timeout errors
 * (econnrefused, etimedout, enotfound) trigger the next provider.
 * HTTP 400 / 404 (validation, bad request) are NOT retried — the
 * prompt is malformed and switching providers won't help; the
 * caller should see the real error.
 *
 * Each attempt — success or failure — is already recorded by
 * `chatWithConfig` in the `AiApiCall` collection, so the AI Logs
 * page surfaces the chain automatically (with timestamps, status
 * codes, and durations). No additional logging needed here.
 *
 * Disabled fallback
 * -----------------
 * `ENABLE_AI_FALLBACK=false` (env) or
 * `features.{pipeline}.allowFallback=false` (admin) disables the
 * chain entirely — single attempt, original error propagates.
 * Default is ON.
 */
import { Types } from 'mongoose';
import {
  AIProvider,
  ProviderConfig,
  chatWithConfig,
  getPipelineProviderConfig,
} from '../../utils/ai/aiProvider.js';
import { adminLog } from '../../utils/http/logger.js';

// ─── Configuration ─────────────────────────────────────────────────────────

/** Hard-coded fallback priority used when neither the env var nor
 *  the admin's per-feature override is set. Anthropic first
 *  (highest quality) → progressively cheaper/larger-context
 *  providers → custom last (so the custom proxy is only used
 *  when nothing else is configured). */
export const DEFAULT_FALLBACK_CHAIN: readonly AIProvider[] = [
  'anthropic',
  'openai',
  'xai',
  'minimax',
  'gemini',
  'custom',
] as const;

/** HTTP status codes that trigger a fallback. Anything else
 *  (especially 400/404) is treated as a permanent error. */
const RETRIABLE_STATUSES = new Set<number>([
  401, // unauthorized — key revoked, billing issue
  403, // forbidden — sometimes returned by Azure/proxies on a stale key
  408, // request timeout — the prompt is too long, try a faster provider
  429, // rate limited — quota exhausted on this provider
  500, // upstream error
  502, // bad gateway
  503, // unavailable
  504, // gateway timeout
]);

function isRetriableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // chatWithConfig throws `new Error(\`${provider} error: ${body}\`)`
  // for HTTP failures. The original status code is also passed
  // to `logAiApiFailure`, so we look for a numeric `status` field
  // attached by the apiUsageLog path. Fall back to message parsing
  // for direct network errors and other thrown types.
  const e = err as { status?: number; message?: string; cause?: { code?: string } };
  if (typeof e.status === 'number' && RETRIABLE_STATUSES.has(e.status)) return true;
  const msg = (e.message ?? '').toLowerCase();
  const code = (e.cause && typeof e.cause === 'object' ? e.cause.code : '') ?? '';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') return true;
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('etimedout')) return true;
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('socket hang up')) return true;
  if (msg.includes('fetch failed')) return true;
  return false;
}

// ─── Configuration lookups ─────────────────────────────────────────────────

const ENV_KEY: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  gemini: 'GEMINI_API_KEY',
  custom: 'CUSTOM_API_KEY',
};

/** Read FALLBACK_PROVIDERS env. Returns null when unset/empty/
 *  invalid. */
function readFallbackEnv(): AIProvider[] | null {
  const raw = (process.env.FALLBACK_PROVIDERS ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid: AIProvider[] = [];
    for (const item of parsed) {
      if (typeof item === 'string' && (DEFAULT_FALLBACK_CHAIN as readonly string[]).includes(item)) {
        valid.push(item as AIProvider);
      }
    }
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

interface AiConfigFeatureShape {
  allowFallback?: boolean;
  fallbackProviders?: string[];
  model?: string;
}

interface AiConfigDocShape {
  features?: Record<string, AiConfigFeatureShape>;
  providers?: Record<string, { apiKeyCipher?: string; baseURL?: string; model?: string; customModelField?: string; keys?: unknown[] }>;
}

/** Single DB read for both the feature-shape (allowFallback +
 *  fallbackProviders) and the provider-shape (decrypted key
 *  presence). */
async function readAiConfig(batchId: string | null): Promise<AiConfigDocShape | null> {
  try {
    const { default: AiConfig } = await import('../../modules/ai/ai-config.model.js');
    const filter: Record<string, unknown> = { isActive: true };
    if (batchId) filter.batchId = new Types.ObjectId(batchId);
    else filter.batchId = null;
    return await AiConfig.findOne(filter).lean() as AiConfigDocShape | null;
  } catch {
    return null;
  }
}

function providerHasKey(doc: AiConfigDocShape | null, provider: AIProvider): boolean {
  // Env var path.
  if (process.env[ENV_KEY[provider]]) return true;
  // DB path — legacy apiKeyCipher OR a non-empty keys[].
  const prov = doc?.providers?.[provider];
  if (!prov) return false;
  if (prov.apiKeyCipher) return true;
  if (Array.isArray(prov.keys) && prov.keys.length > 0) return true;
  return false;
}

/** Build a ProviderConfig for a specific candidate provider by
 *  asking the existing resolver to treat it as the primary. The
 *  resolver reads PIPELINE_PROVIDER_KEY_<PIPELINE> as an override
 *  (the same env-var path the per-pipeline override already
 *  uses), so we set it for the duration of the call. Stash and
 *  restore so concurrent resolvers for *different* pipelines
 *  don't trample each other. (Same-process Node is single-threaded
 *  for JS, so there's no actual concurrency — this is a defensive
 *  pattern.) */
async function forceProviderConfig(
  pipeline: string,
  provider: AIProvider,
): Promise<ProviderConfig> {
  const envKey = `PIPELINE_PROVIDER_KEY_${pipeline.toUpperCase()}`;
  const original = process.env[envKey];
  process.env[envKey] = provider;
  try {
    return await getPipelineProviderConfig(pipeline, null);
  } finally {
    if (original === undefined) delete process.env[envKey];
    else process.env[envKey] = original;
  }
}

// ─── Fallback-chain resolution ─────────────────────────────────────────────

/** Master resolution: returns the ordered list of providers the
 *  caller should try, with the primary first. */
export async function resolveFallbackChain(
  pipeline: string,
  primary: ProviderConfig,
  batchId: string | null = null,
): Promise<ProviderConfig[]> {
  // Honour the global kill switch.
  if ((process.env.ENABLE_AI_FALLBACK ?? '').toLowerCase() === 'false') {
    return [primary];
  }
  // Read the active AiConfig doc once — used both for the
  // per-feature override and the per-provider config below.
  const doc = await readAiConfig(batchId);

  // Per-feature kill switch.
  const feat = doc?.features?.[pipeline];
  if (feat?.allowFallback === false) {
    return [primary];
  }

  // Chain order: per-feature override → env → default.
  const fromFeature = Array.isArray(feat?.fallbackProviders) && feat!.fallbackProviders!.length > 0
    ? feat!.fallbackProviders!.filter(
        (p): p is AIProvider =>
          typeof p === 'string' &&
          (DEFAULT_FALLBACK_CHAIN as readonly string[]).includes(p),
      )
    : null;
  const chain = fromFeature ?? readFallbackEnv() ?? [...DEFAULT_FALLBACK_CHAIN];

  // Build the list. Primary always first; remaining providers
  // are added only if they're configured (key present) AND aren't
  // the primary itself.
  const result: ProviderConfig[] = [primary];
  for (const candidate of chain) {
    if (candidate === primary.provider) continue;
    if (!providerHasKey(doc, candidate)) continue;
    try {
      result.push(await forceProviderConfig(pipeline, candidate));
    } catch { /* skip unresolvable */ }
  }
  return result;
}

// ─── Public entry point ────────────────────────────────────────────────────

export interface FallbackAttempt {
  provider: AIProvider;
  ok: boolean;
  reason?: string;
  durationMs: number;
}

export interface FallbackResult {
  reply: string;
  attempts: FallbackAttempt[];
  /** The provider that actually returned the reply. */
  usedProvider: AIProvider;
  /** Total wall time across all attempts. */
  totalMs: number;
}

/**
 * Try `messages` against the primary provider, then walk the
 * fallback chain on retriable failure. Returns the first non-empty
 * reply. If every attempt fails, throws the last error (already
 * logged to AiApiCall by `chatWithConfig`).
 */
export async function runWithFallback(
  pipeline: string,
  messages: { role: string; content: string }[],
  opts: { batchId?: string | null; feature?: string; primaryOverride?: ProviderConfig } = {},
): Promise<FallbackResult> {
  const startedAt = Date.now();
  const primary =
    opts.primaryOverride ?? (await getPipelineProviderConfig(pipeline, opts.batchId ?? null));
  const chain = await resolveFallbackChain(pipeline, primary, opts.batchId ?? null);
  const feature = opts.feature ?? pipeline;

  const attempts: FallbackAttempt[] = [];
  let lastError: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const cfg = chain[i];
    const t0 = Date.now();
    try {
      const reply = await chatWithConfig(cfg, messages, feature);
      attempts.push({ provider: cfg.provider, ok: true, durationMs: Date.now() - t0 });
      if (i > 0) {
        adminLog.info(
          `[ai-fallback] ${pipeline}: primary ${chain[0].provider} failed, ` +
            `succeeded on ${cfg.provider} after ${i + 1} attempt(s) ` +
            `(${(Date.now() - startedAt)}ms total)`,
          { pipeline, attempts: attempts.map((a) => a.provider) },
        );
      }
      return { reply, attempts, usedProvider: cfg.provider, totalMs: Date.now() - startedAt };
    } catch (err) {
      const durationMs = Date.now() - t0;
      const reason = (err as Error)?.message ?? 'unknown error';
      attempts.push({ provider: cfg.provider, ok: false, reason, durationMs });
      lastError = err;
      if (i === chain.length - 1) {
        adminLog.warn(
          `[ai-fallback] ${pipeline}: all ${chain.length} provider(s) failed. ` +
            `Last error: ${reason}`,
          {
            pipeline,
            chain: chain.map((c) => c.provider),
            attempts: attempts.map((a) => ({ provider: a.provider, ok: a.ok, reason: a.reason, ms: a.durationMs })),
          },
        );
      } else if (!isRetriableError(err)) {
        adminLog.warn(
          `[ai-fallback] ${pipeline}: ${cfg.provider} returned non-retriable error, ` +
            `aborting chain. ${reason}`,
          { pipeline, abortedAt: cfg.provider },
        );
        throw err;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`[ai-fallback] ${pipeline}: all providers failed (${attempts.length})`);
}
