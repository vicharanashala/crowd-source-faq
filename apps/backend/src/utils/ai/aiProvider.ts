/**
 * Shared AI provider resolution.
 *
 * Used by any module that makes direct AI API calls (duplicateDetector,
 * knowledgeBase, etc.) BEFORE AiClient is available or when you just need
 * the provider config without instantiating a full client.
 *
 * Provider priority: Anthropic > OpenAI > xAI > MiniMax
 *
 * Resolution order for API key / base URL:
 *   1. Admin-configured value in the AiConfig DB document (set via the dashboard)
 *   2. Environment variable fallback
 *   3. Provider default
 *
 * The DB value is read fresh on every call (no module-level caching) so that
 * an admin change in the dashboard takes effect immediately for new requests.
 *
 * v1.82 — `custom` provider's wire-format model field name is exposed as
 * `customModelField` on the resolved ProviderConfig. Resolution chain
 * (first non-empty wins):
 *   1. AiConfig.providers.custom.customModelField (admin dashboard)
 *   2. process.env.CUSTOM_MODEL_FIELD          (legacy escape hatch)
 *   3. 'model'                                  (hard default)
 */

import AiConfig from '../../modules/ai/ai-config.model.js';
import { logAiApiSuccess, logAiApiFailure } from './apiUsageLog.js';
import { logger } from '../http/logger.js';

// Names of supported AI vendors/providers (used throughout the backend).
export type AIProvider = 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

// AI_KEYS_FROM_DB_ONLY (set in .env / .env.local) — when truthy, every AI
// provider resolver below treats process.env.{VENDOR}_API_KEY as if it
// were unset. The AiConfig document in MongoDB becomes the *only* source
// of API keys. Useful for proving the Mongo round-trip end-to-end, and
// for production deploys where the env-var fallback is considered a
// footgun (e.g. multiple deploys sharing one .env but different DB rows).
// Off by default — current behaviour preserved.
export const AI_KEYS_FROM_DB_ONLY =
  ['1', 'true', 'yes', 'on'].includes(
    (process.env.AI_KEYS_FROM_DB_ONLY ?? '').toLowerCase()
  );

/** Read the env-var key for a provider, unless DB-only mode is on. */
function envKey(p: AIProvider): string {
  if (AI_KEYS_FROM_DB_ONLY) return '';
  return process.env[ENV_KEY[p]] ?? '';
}

/**
 * v1.80 — Two override surfaces per pipeline:
 *   (a) explicit env-var overrides (force mode — useful for staging canaries)
 *   (b) per-feature overrides from the admin AiConfig doc, resolved
 *       by `resolveFeatureModel()` below. The admin's per-feature
 *       model field on the AiConfig (e.g. features.categoryRecategorize.model)
 *       is the primary override path; the env var is the escape hatch.
 *
 * Pipeline name → env var name. Pipeline names match the keys of
 * AiConfig['features'] plus two pipeline-only names (faq_audit,
 * auto_answer) that don't have an AiConfig entry — those still use
 * the env var.
 */
export const PIPELINE_PROVIDER_KEY: Record<string, string> = {
  faq_audit: process.env.FAQ_AUDIT_PROVIDER ?? '',
  auto_answer: process.env.AUTO_ANSWER_PROVIDER ?? '',
};
export const PIPELINE_MODEL_KEY: Record<string, string> = {
  faq_audit: process.env.FAQ_AUDIT_MODEL ?? '',
  auto_answer: process.env.AUTO_ANSWER_MODEL ?? '',
};

/**
 * v1.80 — Resolution chain for the model a pipeline uses:
 *   1. env PIPELINE_MODEL_KEY[pipeline]  (admin/ops force-mode escape hatch)
 *   2. db[provider].model                                  (admin's per-provider saved override)
 *   3. process.env.{PROVIDER}_MODEL                        (legacy env-var fallback)
 *   4. DEFAULT_MODELS[provider]                            (last-ditch default)
 *
 * Steps 2→3→4 only run if step 1 is empty. Step 2 is what the
 * `Admin → AI Settings → Default Model` field on each provider card
 * writes via the AiConfig.providers.{provider}.model path.
 *
 * The previous implementation went 1→3→4 (env var then default),
 * which silently dropped the admin's saved model. Cron-triggered
 * calls (autoAnswer, categoryRecategorize, faqAudit, embedding-warm,
 * etc.) routed through this function and therefore used the env-var
 * model regardless of what the admin had set in the dashboard.
 */
async function resolvePipelineModelAsync(
  pipeline: string,
  provider: AIProvider,
  dbOverrideForProvider?: string,
): Promise<string> {
  const override = PIPELINE_MODEL_KEY[pipeline];
  if (override) return override;
  if (dbOverrideForProvider && dbOverrideForProvider.trim().length > 0) {
    return dbOverrideForProvider;
  }
  return envModel(provider);
}
/**
 * v1.80 — Async resolver that consults the admin's saved per-provider
 * model. Cron callers should use this instead of the sync
 * resolvePipelineModel. Returns the env-var model name when nothing
 * is saved in the DB.
 */
export async function resolvePipelineModelWithDb(
  pipeline: string,
  provider: AIProvider,
  dbOverrideForProvider?: string,
): Promise<string> {
  return resolvePipelineModelAsync(pipeline, provider, dbOverrideForProvider);
}

/**
 * v1.80 — Resolve the per-feature model from the active AiConfig doc.
 *
 * Used by `getPipelineProviderConfig` to surface the admin's
 * per-feature override (Admin → AI Settings → Feature Configuration
 * → Model). Pipeline name matches the keys of `AiConfig['features']`
 * (duplicateDetection, knowledgeExtraction, searchSummarization,
 * faqGeneration) plus cron-only names (faq_audit, auto_answer).
 *
 * Order:
 *   1. explicit per-feature model override (admin set this in dashboard)
 *   2. empty / blank → caller should chain into resolvePipelineModelAsync
 */
export async function resolveFeatureModel(
  pipeline: string,
  batchId: string | null = null,
): Promise<string> {
  try {
    const db = await resolveActiveAiConfig(batchId);
    if (!db) return '';
    // Look up features.{pipeline} for the four chat-feature pipelines.
    // For faq_audit / auto_answer there's no feature entry — caller
    // will fall through to env var.
    const all: Record<string, { model?: string } | undefined> = ((db as any).features) ?? {};
    const featureConf = all[pipeline];
    const m = featureConf?.model;
    if (m && m.trim().length > 0) return m;
  } catch (err) {
    logger.warn(`[resolveFeatureModel] db lookup failed for ${pipeline}: ${(err as Error).message}`);
  }
  return '';
}

/**
 * Resolve effective AIProvider for a pipeline.
 * Checks PIPELINE_PROVIDER_KEY first, then falls back to DEFAULT_PROVIDER.
 */
export function resolvePipelineProvider(pipeline: string): AIProvider {
  const override = PIPELINE_PROVIDER_KEY[pipeline] as AIProvider | '';
  if (override && isValidProvider(override)) return override;
  // Fall back to the first provider that has an API key configured
  if (AI_KEYS_FROM_DB_ONLY) {
    // DB-only mode: caller should use resolveProviderForPipeline (async) —
    // it has the per-batchId AiConfig doc. This sync path has no DB access,
    // so the only honest answer here is "no provider resolved" — the
    // async resolver will pick the right one.
    return 'minimax'; // will fail at chat() with a clean error if DB is empty
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.MINIMAX_API_KEY) return 'minimax';
  return 'minimax'; // default — will fail gracefully at chat() with a clear error
}

/**
 * Resolve effective model for a pipeline.
 * Checks PIPELINE_MODEL_KEY first, then falls back to resolved provider's default model.
 */
export function resolvePipelineModel(pipeline: string, provider: AIProvider): string {
  const override = PIPELINE_MODEL_KEY[pipeline];
  if (override) return override;
  return envModel(provider);
}

function isValidProvider(p: string): p is AIProvider {
  return (PROVIDER_DEFAULTS as Record<string, unknown>)[p] !== undefined;
}

/**
 * Map model names to resolved provider defaults in case of provider mismatch.
 */
export function getModelForProvider(model: string, provider: AIProvider, fallbackModel?: string): string {
  const defaults: Record<AIProvider, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o-mini',
    xai: 'grok-3',
    minimax: 'MiniMax-Text-01',
    gemini: 'gemini-3.5-flash',
    custom: '',
  };

  if (model === 'gemini-1.5-flash' || model === 'gemini-2.5-flash') {
    model = 'gemini-3.5-flash';
  }

  const lowerModel = model.toLowerCase();
  let modelProvider: AIProvider | null = null;
  if (lowerModel.includes('claude')) modelProvider = 'anthropic';
  else if (lowerModel.includes('gpt')) modelProvider = 'openai';
  else if (lowerModel.includes('grok')) modelProvider = 'xai';
  else if (lowerModel.includes('minimax')) modelProvider = 'minimax';
  else if (lowerModel.includes('gemini')) modelProvider = 'gemini';

  if (modelProvider && modelProvider !== provider) {
    return fallbackModel || defaults[provider];
  }
  return model;
}

/**
 * Build a full ProviderConfig for a named pipeline.
 * Reads provider/model from per-pipeline env vars, falls back to global defaults.
 * Does NOT round-trip through getProviderConfig to avoid duplicate async overhead.
 */
// v1.69 — Phase 4: getPipelineProviderConfig now accepts an
// optional batchId. When supplied, the per-program override is
// consulted first (via resolveActiveAiConfig), falling back to
// the global default. The call site can also omit batchId to
// get the prior (global-only) behaviour.
export async function getPipelineProviderConfig(
  pipeline: string,
  batchId: string | null = null
): Promise<ProviderConfig> {
  const db       = await resolveActiveAiConfig(batchId) ?? await loadDbOverrides();
  const hasKey = (p: AIProvider) => !!(db[p].apiKey || envKey(p));

  let provider: AIProvider;
  const override = PIPELINE_PROVIDER_KEY[pipeline] as AIProvider | '';
  if (override && isValidProvider(override) && hasKey(override)) {
    provider = override;
  } else {
    let dbActive: AIProvider | undefined;
    try {
      const config = await AiConfig.findOne({ isActive: true });
      dbActive = config?.activeProvider;
    } catch (err) {
      logger.warn(`[aiProvider] Failed to find active AiConfig in getPipelineProviderConfig: ${(err as Error).message}`);
    }

    if (dbActive && hasKey(dbActive)) {
      provider = dbActive;
    } else {
      if (hasKey('anthropic')) provider = 'anthropic';
      else if (hasKey('openai')) provider = 'openai';
      else if (hasKey('xai')) provider = 'xai';
      else if (hasKey('minimax')) provider = 'minimax';
      else if (hasKey('gemini')) provider = 'gemini';
      else if (hasKey('custom')) provider = 'custom';
      else provider = 'minimax';
    }
  }

  // v1.80 — model resolution chain. The key change: consult the
  // admin's saved per-feature override FIRST, then per-provider,
  // then env-var overrides. Previously this only looked at the
  // env vars, silently dropping anything the admin set in the
  // dashboard for cron-triggered pipelines.
  //
  // Precedence (first non-empty wins):
  //   1. features.{pipeline}.model  — admin set this in dashboard for the specific feature
  //   2. db[provider].model         — admin set this in the provider card "Default Model" field
  //   3. PIPELINE_MODEL_KEY env     — ops force-mode override for the pipeline
  //   4. {PROVIDER}_MODEL env       — legacy fallback
  //   5. hard-coded DEFAULT_MODELS[provider]
  //
  // Steps 1+2 already handled by `resolveFeatureModel` and
  // `resolvePipelineModelWithDb(dbOverrideForProvider)`.
  const perFeatureModel = await resolveFeatureModel(pipeline, batchId);
  const model = perFeatureModel
    || await resolvePipelineModelWithDb(pipeline, provider, db[provider].model);

  const keyEnv = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    xai: 'XAI_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    gemini: 'GEMINI_API_KEY',
    custom: 'CUSTOM_API_KEY'
  }[provider];
  const apiKey = (db[provider].apiKey || envKey(provider) || '') as string;
  const baseURL = db[provider].baseURL || envBaseUrl(provider);

  // Sanity check: if the resolved model looks like it belongs to a
  // different provider (legacy cross-model sanity guard), fall back
  // to the admin-saved per-provider model, then env, then hard default.
  const resolvedModel = getModelForProvider(
    model || '',
    provider,
    db[provider].model || envModel(provider) || DEFAULT_MODELS[provider],
  );
  if (!resolvedModel) {
    throw new Error(`No AI model configured for provider '${provider}' on pipeline '${pipeline}'. Please configure a model in Admin Settings.`);
  }

  // v1.82 — custom-provider customModelField resolved alongside the
  // rest of the provider config so the call sites downstream can read
  // it from a single object.
  const customModelField: 'model' | 'modelName' = provider === 'custom'
    ? resolveCustomModelField(db.custom.customModelField)
    : 'model';

  return {
    ...PROVIDER_DEFAULTS[provider],
    provider,
    apiKey,
    baseURL,
    modelName: resolvedModel,
    customModelField,
  };
}

/**
 * v1.82 — resolve the wire-format model field name for the `custom`
 * provider. Empty string is treated as "unset" so admins can clear an
 * override back to the default without dropping the document.
 */
function resolveCustomModelField(dbOverride: string | undefined): 'model' | 'modelName' {
  if (dbOverride === 'modelName' || dbOverride === 'model') {
    return dbOverride;
  }
  if (process.env.CUSTOM_MODEL_FIELD === 'modelName') return 'modelName';
  return 'model';
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL: string;
  modelName: string;
  authHeader: 'x-api-key' | 'Authorization';
  needsAnthropicVersion: boolean;
  /**
   * v1.82 — name of the JSON field used to carry the model identifier
   * on the wire for the `custom` provider's chat/completions body.
   * Defaults to `'model'` (standard OpenAI); flip to `'modelName'` for
   * proxies that expect camelCase. Undefined-equivalent for non-custom
   * providers — the call sites only consult it when `provider === 'custom'`.
   */
  customModelField?: 'model' | 'modelName';
}

const PROVIDER_DEFAULTS: Record<AIProvider, Omit<ProviderConfig, 'apiKey' | 'baseURL' | 'modelName'>> = {
  anthropic: { provider: 'anthropic', authHeader: 'x-api-key', needsAnthropicVersion: true },
  openai: { provider: 'openai', authHeader: 'Authorization', needsAnthropicVersion: false },
  xai: { provider: 'xai', authHeader: 'Authorization', needsAnthropicVersion: false },
  minimax: { provider: 'minimax', authHeader: 'Authorization', needsAnthropicVersion: false },
  gemini: { provider: 'gemini', authHeader: 'Authorization', needsAnthropicVersion: false },
  custom: { provider: 'custom', authHeader: 'Authorization', needsAnthropicVersion: false },
};

const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  minimax: 'https://api.minimax.io/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  custom: 'http://localhost:11434/v1',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  xai: 'grok-3',
  minimax: 'MiniMax-Text-01',
  gemini: 'gemini-2.5-flash',
  custom: '',
};

const ENV_KEY: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  gemini: 'GEMINI_API_KEY',
  custom: 'CUSTOM_API_KEY',
};
const ENV_MODEL: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_MODEL',
  openai: 'OPENAI_MODEL',
  xai: 'XAI_MODEL',
  minimax: 'MINIMAX_MODEL',
  gemini: 'GEMINI_MODEL',
  custom: 'CUSTOM_MODEL',
};
const ENV_BASE_URL: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  xai: 'XAI_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  gemini: 'GEMINI_BASE_URL',
  custom: 'CUSTOM_BASE_URL',
};

// ── DB override cache (TTL 5s) ──────────────────────────────────────────────
// Saves a Mongo roundtrip per call when the dashboard hasn't been touched recently.

interface DbOverrides {
  // Per-provider DB override. `apiKey` is ALWAYS the empty string
  // here — we never keep decrypted material in the cache. To get
  // the actual key, call `config.getApiKey(p)` on the AiConfig
  // document. `hasKey` is the decrypted-check result, used by
  // `resolveProviderAsync` to decide which provider is usable.
  anthropic: { apiKey: '', baseURL: string; model: string; hasKey: boolean };
  openai:    { apiKey: '', baseURL: string; model: string; hasKey: boolean };
  xai:       { apiKey: '', baseURL: string; model: string; hasKey: boolean };
  minimax:   { apiKey: '', baseURL: string; model: string; hasKey: boolean };
  gemini:    { apiKey: '', baseURL: string; model: string; hasKey: boolean };
  // v1.82 — custom provider carries an extra override that controls
  // the wire-format model field name (see PROVIDER_DEFAULTS /
  // customModelField). Other providers ignore it.
  custom:    { apiKey: '', baseURL: string; model: string; customModelField: string; hasKey: boolean };
}

let _cache: { value: DbOverrides; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

// v1.69 — Phase 4: per-program config resolver. Walks the chain
// (1) per-program override, (2) global default. Returns null if
// neither exists (the caller falls back to env-var defaults).
// Cache key includes batchId so per-program lookups don't leak
// across programs. Cache TTL is the same 5s as the legacy cache.
let _configCache: { key: string; value: DbOverrides | null; config: any | null; expiresAt: number } | null = null;

export async function resolveActiveAiConfig(batchId: string | null = null): Promise<DbOverrides | null> {
  const cacheKey = batchId ?? '__global__';
  if (_configCache && _configCache.key === cacheKey && _configCache.expiresAt > Date.now()) {
    return _configCache.value;
  }
  // v1.69 — Phase 4: walk the per-program → global resolver
  // chain. We use `any` for the merged config type because
  // mongoose's type narrowing doesn't flow through the
  // `override ?? await ...` chain (the override and the
  // fallback return different MongooseDocument variants).
  let config: any = null;
  try {
    if (batchId) {
      // Try per-program override first, then global fallback.
      const override = await AiConfig.findOne({ batchId, isActive: true });
      config = override
        ?? await AiConfig.findOne({ batchId: null, isActive: true });
    } else {
      config = await AiConfig.findOne({ batchId: null, isActive: true });
    }
  } catch (err) {
    logger.warn(`[aiProvider] resolveActiveAiConfig failed: ${(err as Error).message}`);
    _configCache = { key: cacheKey, value: null, config: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
  if (!config) {
    _configCache = { key: cacheKey, value: null, config: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
  const v: DbOverrides = {
    // `hasKey` is computed here so `resolveProviderAsync` can pick
    // the right provider without round-tripping to Mongoose on every
    // call. `apiKey` stays empty in the cache — we never keep
    // decrypted material in memory longer than the single call that
    // uses it. The actual key is fetched via `config.getApiKey(p)` at
    // the final resolution site (see `resolveProviderAsync`).
    anthropic: { apiKey: '', baseURL: config?.providers?.anthropic?.baseURL ?? '', model: config?.providers?.anthropic?.model ?? '', hasKey: !!(config?.getApiKey?.('anthropic') || process.env.ANTHROPIC_API_KEY) },
    openai:    { apiKey: '', baseURL: config?.providers?.openai?.baseURL    ?? '', model: config?.providers?.openai?.model    ?? '', hasKey: !!(config?.getApiKey?.('openai')    || process.env.OPENAI_API_KEY) },
    xai:       { apiKey: '', baseURL: config?.providers?.xai?.baseURL       ?? '', model: config?.providers?.xai?.model       ?? '', hasKey: !!(config?.getApiKey?.('xai')       || process.env.XAI_API_KEY) },
    minimax:   { apiKey: '', baseURL: config?.providers?.minimax?.baseURL   ?? '', model: config?.providers?.minimax?.model   ?? '', hasKey: !!(config?.getApiKey?.('minimax')   || process.env.MINIMAX_API_KEY) },
    gemini:    { apiKey: '', baseURL: config?.providers?.gemini?.baseURL    ?? '', model: config?.providers?.gemini?.model    ?? '', hasKey: !!(config?.getApiKey?.('gemini')    || process.env.GEMINI_API_KEY) },
    // v1.82 — custom provider carries an extra override. Legacy
    // docs (pre-v1.82) won't have the field set; treat missing as
    // empty string so the resolver chain falls through to the env
    // / default.
    custom:    {
      apiKey: '',
      baseURL: config?.providers?.custom?.baseURL ?? '',
      model:   config?.providers?.custom?.model   ?? '',
      customModelField: config?.providers?.custom?.customModelField ?? '',
      hasKey: !!(config?.getApiKey?.('custom') || process.env.CUSTOM_API_KEY),
    },
  };
  _configCache = { key: cacheKey, value: v, config, expiresAt: Date.now() + CACHE_TTL_MS };
  return v;
}

// v1.69 — Phase 4: legacy loadDbOverrides keeps the same name and
// signature so the rest of the codebase doesn't need to thread
// batchId through every call site on day one. The (batchId=null)
// resolution path is the global default, matching the prior
// behaviour. The cache key is __global__ so per-program lookups
// (added below) have a separate cache slot.
export async function loadDbOverrides(): Promise<DbOverrides> {
  const r = await loadDbOverridesWithConfig();
  return r.db;
}

/**
 * v1.82 — Same as `loadDbOverrides()` but also returns the live
 * `config` mongoose doc alongside the parsed `DbOverrides`. The doc
 * is needed to call `config.getApiKey(p)` for the actual decrypted
 * API key (we never cache decrypted material in `DbOverrides`).
 *
 * Falls back to `config: null` when the DB is empty — the call site
 * then uses env-var keys only.
 */
export async function loadDbOverridesWithConfig(): Promise<{ db: DbOverrides; config: any }> {
  // Belt-and-braces. Check the legacy _cache first so we don't
  // round-trip Mongo when the cache is warm.
  if (_cache && _cache.expiresAt > Date.now()) {
    return { db: _cache.value, config: _configCache?.config ?? null };
  }
  const resolved = await resolveActiveAiConfig(null);
  if (resolved) {
    return { db: resolved, config: _configCache?.config ?? null };
  }
  const empty: DbOverrides = {
    anthropic: { apiKey: '', baseURL: '', model: '', hasKey: false },
    openai:    { apiKey: '', baseURL: '', model: '', hasKey: false },
    xai:       { apiKey: '', baseURL: '', model: '', hasKey: false },
    minimax:   { apiKey: '', baseURL: '', model: '', hasKey: false },
    gemini:    { apiKey: '', baseURL: '', model: '', hasKey: false },
    custom:    { apiKey: '', baseURL: '', model: '', customModelField: '', hasKey: false },
  };
  return { db: empty, config: null };
}

/** Invalidate the DB override cache. Call after admin updates config. */
export function invalidateProviderCache(): void {
  _cache = null;
  _configCache = null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a full ProviderConfig for a given provider, applying DB → env → default order.
 */
export async function resolveProviderAsync(provider?: AIProvider): Promise<ProviderConfig> {
  // v1.82 — use the with-config variant so we can decrypt the
  // cipher at the final apiKey resolution step (we never cache
  // decrypted material in `DbOverrides`).
  const { db, config } = await loadDbOverridesWithConfig();
  // hasKey now consults the per-provider boolean we computed in
  // resolveActiveAiConfig (which decodes the cipher). The
  // fallback to envKey handles the no-DB case.
  const hasKey = (p: AIProvider) => !!(db[p].hasKey || envKey(p));

  let chosen: AIProvider;
  if (provider && hasKey(provider)) {
    chosen = provider;
  } else {
    if (hasKey('anthropic')) chosen = 'anthropic';
    else if (hasKey('openai')) chosen = 'openai';
    else if (hasKey('xai')) chosen = 'xai';
    else if (hasKey('minimax')) chosen = 'minimax';
    else if (hasKey('gemini')) chosen = 'gemini';
    else if (hasKey('custom')) chosen = 'custom';
    else {
      chosen = provider || 'minimax';
    }
  }

  const override = db[chosen] as { apiKey: '', baseURL: string; model: string; customModelField?: string };
  // Real key resolution. `db[chosen].apiKey` is the empty string
  // (the cache never stores decrypted material) so we always go
  // through `config.getApiKey(chosen)` (which decrypts the cipher)
  // and fall back to the env var.
  const apiKey = (config?.getApiKey?.(chosen) as string | null | undefined)
    || override.apiKey
    || envKey(chosen)
    || '';
  const baseURL = (override.baseURL || process.env[ENV_BASE_URL[chosen]] || DEFAULT_BASE_URLS[chosen]).replace(/\/$/, '');
  const model = getModelForProvider(override.model || process.env[ENV_MODEL[chosen]] || DEFAULT_MODELS[chosen], chosen, override.model);
  if (!model) {
    throw new Error(`No AI model configured for provider '${chosen}'. Please configure a model in Admin Settings.`);
  }

  // v1.82 — custom-provider customModelField. Only meaningful for
  // `chosen === 'custom'`; other providers get `'model'` (a
  // placeholder — call sites ignore it for non-custom).
  const customModelField: 'model' | 'modelName' = chosen === 'custom'
    ? resolveCustomModelField(override.customModelField)
    : 'model';

  return {
    ...PROVIDER_DEFAULTS[chosen],
    provider: chosen,
    apiKey,
    baseURL,
    modelName: model,
    customModelField,
  };
}

/**
 * Synchronous resolve — only uses env vars (no DB). Used by legacy sync code paths
 * and during initial module load. New code should prefer resolveProviderAsync().
 */
export function resolveProvider(): ProviderConfig {
  // AI_KEYS_FROM_DB_ONLY: this sync resolver can't read the DB. If the
  // flag is on, refuse rather than return a config that contradicts the
  // async resolver.
  if (AI_KEYS_FROM_DB_ONLY) {
    throw new Error(
      'resolveProvider() called while AI_KEYS_FROM_DB_ONLY=true. ' +
      'Use resolveProviderAsync() so the DB can be consulted.'
    );
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { ...PROVIDER_DEFAULTS.anthropic, provider: 'anthropic', apiKey: process.env[ENV_KEY.anthropic] ?? '', baseURL: envBaseUrl('anthropic'), modelName: envModel('anthropic'), customModelField: 'model' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.openai, provider: 'openai', apiKey: process.env[ENV_KEY.openai] ?? '', baseURL: envBaseUrl('openai'), modelName: envModel('openai'), customModelField: 'model' };
  }
  if (process.env.XAI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.xai, provider: 'xai', apiKey: process.env[ENV_KEY.xai] ?? '', baseURL: envBaseUrl('xai'), modelName: envModel('xai'), customModelField: 'model' };
  }
  if (process.env.MINIMAX_API_KEY || process.env.MINIMAX_BASE_URL) {
    return { ...PROVIDER_DEFAULTS.minimax, provider: 'minimax', apiKey: process.env[ENV_KEY.minimax] ?? '', baseURL: envBaseUrl('minimax'), modelName: envModel('minimax'), customModelField: 'model' };
  }
  if (process.env.GEMINI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.gemini, provider: 'gemini', apiKey: process.env[ENV_KEY.gemini] ?? '', baseURL: envBaseUrl('gemini'), modelName: envModel('gemini'), customModelField: 'model' };
  }
  if (process.env.CUSTOM_API_KEY) {
    return { ...PROVIDER_DEFAULTS.custom, provider: 'custom', apiKey: process.env[ENV_KEY.custom] ?? '', baseURL: envBaseUrl('custom'), modelName: envModel('custom'), customModelField: resolveCustomModelField(undefined) };
  }
  throw new Error(
    'No AI API key configured. Set one of:\n' +
    '  ANTHROPIC_API_KEY  — https://console.anthropic.com/settings/keys\n' +
    '  OPENAI_API_KEY     — https://platform.openai.com/api-keys\n' +
    '  XAI_API_KEY        — https://console.x.ai/\n' +
    '  MINIMAX_API_KEY    — https://platform.minimax.io\n' +
    '  GEMINI_API_KEY     — https://aistudio.google.com/app/apikey\n' +
    '  CUSTOM_API_KEY     — Custom self-hosted endpoint'
  );
}

function envBaseUrl(p: AIProvider): string {
  return (process.env[ENV_BASE_URL[p]] ?? DEFAULT_BASE_URLS[p]).replace(/\/$/, '');
}
function envModel(p: AIProvider): string {
  return process.env[ENV_MODEL[p]] ?? DEFAULT_MODELS[p];
}

/** Returns true if at least one AI API key is configured (env or DB). */
export async function hasAIKeyAsync(): Promise<boolean> {
  const db = await loadDbOverrides();
  if (AI_KEYS_FROM_DB_ONLY) {
    // DB-only mode: only count keys that live in the AiConfig document.
    return !!(
      db.anthropic.apiKey || db.openai.apiKey || db.xai.apiKey ||
      db.minimax.apiKey || db.gemini.apiKey || db.custom.apiKey
    );
  }
  return !!(
    db.anthropic.apiKey || process.env.ANTHROPIC_API_KEY ||
    db.openai.apiKey || process.env.OPENAI_API_KEY ||
    db.xai.apiKey || process.env.XAI_API_KEY ||
    db.minimax.apiKey || process.env.MINIMAX_API_KEY ||
    db.gemini.apiKey || process.env.GEMINI_API_KEY ||
    db.custom.apiKey || process.env.CUSTOM_API_KEY
  );
}

/** Returns true if at least one AI API key is configured in env (sync). */
export function hasAIKey(): boolean {
  if (AI_KEYS_FROM_DB_ONLY) {
    // DB-only mode: this sync function can't read the DB. Return false
    // so any code that gates AI features on `hasAIKey()` correctly
    // waits for an explicit DB read.
    return false;
  }
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.MINIMAX_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.CUSTOM_API_KEY
  );
}

/** Resolve config for a specific provider from env (sync, no DB). */
export function getProvider(provider: AIProvider): ProviderConfig {
  return {
    ...PROVIDER_DEFAULTS[provider],
    provider,
    apiKey: process.env[ENV_KEY[provider]] ?? '',
    baseURL: envBaseUrl(provider),
    modelName: envModel(provider),
    // v1.82 — sync resolver can't read DB. Honour env override for
    // `custom` only; other providers always use `'model'`.
    customModelField: provider === 'custom'
      ? resolveCustomModelField(undefined)
      : 'model',
  };
}

/**
 * Async resolve for a specific provider.
 * Order: try DB (AiConfig active provider) first, then fall back to env vars.
 */
export async function getProviderAsync(provider: AIProvider): Promise<ProviderConfig> {
  return resolveProviderAsync(provider);
}

// ── Chat (low-level, uses async resolution) ─────────────────────────────────

/**
 * Chat against a specific provider. Always checks the DB first for keys/URLs.
 * Used by test connections and by call-sites that have already chosen a provider.
 */
export async function chatWithProvider(
  provider: AIProvider,
  messages: { role: string; content: string }[],
  model?: string,
  // v1.80 — cron callers now pass the real pipeline name as the
  // `feature` so AI API Logs page filter can show them grouped
  // under the correct name (categoryRecategorize, auto_answer,
  // faq_audit, embedding-warm) instead of the catch-all
  // 'chatWithProvider'. Defaults to 'chatWithProvider' for any
  // untagged caller.
  feature: string = 'chatWithProvider',
): Promise<string> {
  const config = await resolveProviderAsync(provider);
  const modelName = model || config.modelName;
  const startedAt = Date.now();
  // Tag is captured in a closure for the log helpers to consume
  // without threading it through every catch block.
  const logTag = { provider, modelName, feature, startedAt };

  if (provider === 'anthropic') {
    let res: Response;
    try {
      res = await fetch(`${config.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: modelName, messages, max_tokens: 4 }),
      });
    } catch (err) {
      logAiApiFailure({
        kind: 'inference',
        provider,
        modelName: modelName,
        feature: logTag.feature,
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
      });
      throw err;
    }
    if (!res.ok) {
      const err = await res.text();
      const wrapped = new Error(`Anthropic error: ${err}`);
      logAiApiFailure({
        kind: 'inference',
        provider,
        modelName: modelName,
        feature: logTag.feature,
        durationMs: Date.now() - startedAt,
        error: wrapped.message,
        status: res.status,
        requestBody: { model: modelName, messages },
      });
      throw wrapped;
    }
    const data = await res.json() as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text ?? '';
    logAiApiSuccess({
      kind: 'inference',
      provider,
      modelName: modelName,
      feature: logTag.feature,
      durationMs: Date.now() - startedAt,
      httpStatus: res.status,
    });
    return text;
  }

  // OpenAI / xAI / MiniMax / custom — all use chat completions.
  // v1.82 — custom provider's wire-format model field name is
  // resolved alongside the rest of the provider config in
  // resolveProviderAsync. For non-custom providers this is
  // always `'model'` (set by the resolver).
  const customModelField = provider === 'custom'
    ? (config.customModelField ?? 'model')
    : 'model';
  const customBody = { [customModelField]: modelName, messages };
  let res: Response;
  try {
    res = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        [config.authHeader]: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(customBody),
    });
  } catch (err) {
    logAiApiFailure({
      kind: 'inference',
      provider,
      modelName: modelName,
      feature: logTag.feature,
      durationMs: Date.now() - startedAt,
      error: (err as Error).message,
    });
    throw err;
  }
  if (!res.ok) {
    const err = await res.text();
    const wrapped = new Error(`${provider} error: ${err}`);
    logAiApiFailure({
      kind: 'inference',
      provider,
      modelName: modelName,
      feature: logTag.feature,
      durationMs: Date.now() - startedAt,
      error: wrapped.message,
      status: res.status,
      requestBody: customBody,
    });
    throw wrapped;
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  logAiApiSuccess({
    kind: 'inference',
    provider,
    modelName: modelName,
    feature: logTag.feature,
    durationMs: Date.now() - startedAt,
    httpStatus: res.status,
  });
  return text;
}

// Backward-compat export — used by aiController.testProvider via dynamic import
export const chat = chatWithProvider;

/**
 * Direct chat using an already-resolved ProviderConfig.
 * Does NOT re-resolve — uses exactly what getPipelineProviderConfig returned.
 * Used by pipeline controllers (faqAudit, autoAnswer) that need per-pipeline
 * provider/model overrides from env vars.
 *
 * USER-FACING call sites should prepend the assistant persona:
 *   import { getAssistantPersona } from './assistantPersona.js';
 *   messages = [{ role: 'system', content: getAssistantPersona() + '\n\n' + taskPrompt }, ...]
 *
 * Back-office / admin call sites (extraction, audit, dedup) should NOT
 * add the persona — their task prompts stand alone.
 */
// v1.80 — chatWithConfig now logs to the AiApiCall collection so
// cron-driven pipelines (autoAnswer, faqAudit, documentAiPipeline,
// ragService) show up in the AI API Logs observability page.
// Defaults `feature` to 'chatWithConfig' for any caller that doesn't
// pass one; cron controllers should pass their pipeline name.
export async function chatWithConfig(
  config: ProviderConfig,
  messages: { role: string; content: string }[],
  feature: string = 'chatWithConfig',
): Promise<string> {
  const { provider, baseURL, apiKey, modelName, authHeader, needsAnthropicVersion } = config;
  if (!apiKey) throw new Error(`No API key for provider '${provider}' — set ${provider.toUpperCase()}_API_KEY`);
  const startedAt = Date.now();

  if (provider === 'anthropic') {
    let res: Response;
    try {
      res = await fetch(`${baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          ...(needsAnthropicVersion ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        body: JSON.stringify({ model: modelName, messages, max_tokens: 512 }),
      });
    } catch (err) {
      logAiApiFailure({
        kind: 'inference',
        provider,
        modelName,
        feature,
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
      });
      throw err;
    }
    if (!res.ok) {
      const err = await res.text();
      logAiApiFailure({
        kind: 'inference', provider, modelName, feature,
        durationMs: Date.now() - startedAt,
        error: `${provider} error: ${err}`, status: res.status,
      });
      throw new Error(`${provider} error: ${err}`);
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text ?? '';
    logAiApiSuccess({
      kind: 'inference', provider, modelName, feature,
      durationMs: Date.now() - startedAt, httpStatus: res.status,
      tokensUsed: 0, estimatedCostUsd: 0,
    });
    return text;
  }

  // OpenAI / xAI / MiniMax / custom — all use chat/completions.
  // v1.82 — read customModelField from the resolved config instead of
  // hitting the env var every time. Non-custom providers fall through
  // to `'model'` for safety.
  const customModelField: 'model' | 'modelName' = provider === 'custom'
    ? (config.customModelField ?? 'model')
    : 'model';
  const customBody = {
    [customModelField]: modelName,
    messages,
  };
  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        [authHeader]: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(customBody),
    });
  } catch (err) {
    logAiApiFailure({
      kind: 'inference', provider, modelName, feature,
      durationMs: Date.now() - startedAt,
      error: (err as Error).message,
    });
    throw err;
  }
  if (!res.ok) {
    const err = await res.text();
    logAiApiFailure({
      kind: 'inference', provider, modelName, feature,
      durationMs: Date.now() - startedAt,
      error: `${provider} error: ${err}`, status: res.status,
      requestBody: customBody,
    });
    throw new Error(`${provider} error: ${err}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  // v1.80 — pull token usage off the response for the OpenAI shape
  // (works for minimax / xAI / openai / gemini / custom) so the
  // log table can show real costs. Anthropic path already returned
  // earlier; this block only runs for the OpenAI-compat branch.
  const usage = (data as any).usage ?? {};
  const COST_PER_M_TOKENS: Record<string, number> = {
    openai: 0.15, xai: 5.0, minimax: 0.10, gemini: 0.075, custom: 0,
  };
  const totalTokens = Number(usage.total_tokens ?? 0);
  logAiApiSuccess({
    kind: 'inference', provider, modelName, feature,
    durationMs: Date.now() - startedAt, httpStatus: res.status,
    tokensUsed: totalTokens,
    estimatedCostUsd: (totalTokens / 1_000_000) * (COST_PER_M_TOKENS[provider] ?? 0),
  });
  return text;
}
