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
 */

import AiConfig from '../models/AiConfig.js';
import { logger } from './logger.js';

// Names of supported AI vendors/providers (used throughout the backend).
export type AIProvider = 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

/**
 * Optional env var overrides per pipeline.
 * If set, they force which provider/model to use for that pipeline.
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
 * Resolve effective AIProvider for a pipeline.
 * Checks PIPELINE_PROVIDER_KEY first, then falls back to DEFAULT_PROVIDER.
 */
export function resolvePipelineProvider(pipeline: string): AIProvider {
  const override = PIPELINE_PROVIDER_KEY[pipeline] as AIProvider | '';
  if (override && isValidProvider(override)) return override;
  // Fall back to the first provider that has an API key configured
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
export function getModelForProvider(model: string, provider: AIProvider): string {
  const defaults: Record<AIProvider, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o-mini',
    xai: 'grok-3',
    minimax: 'MiniMax-Text-01',
    gemini: 'gemini-1.5-flash',
    custom: 'custom-model',
  };

  const lowerModel = model.toLowerCase();
  let modelProvider: AIProvider | null = null;
  if (lowerModel.includes('claude')) modelProvider = 'anthropic';
  else if (lowerModel.includes('gpt')) modelProvider = 'openai';
  else if (lowerModel.includes('grok')) modelProvider = 'xai';
  else if (lowerModel.includes('minimax')) modelProvider = 'minimax';
  else if (lowerModel.includes('gemini')) modelProvider = 'gemini';

  if (modelProvider && modelProvider !== provider) {
    return defaults[provider];
  }
  return model;
}

/**
 * Build a full ProviderConfig for a named pipeline.
 * Reads provider/model from per-pipeline env vars, falls back to global defaults.
 * Does NOT round-trip through getProviderConfig to avoid duplicate async overhead.
 */
export async function getPipelineProviderConfig(pipeline: string): Promise<ProviderConfig> {
  const db = await loadDbOverrides();
  const hasKey = (p: AIProvider) => !!(db[p].apiKey || process.env[ENV_KEY[p]]);

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

  const model = resolvePipelineModel(pipeline, provider);
  const keyEnv = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    xai: 'XAI_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    gemini: 'GEMINI_API_KEY',
    custom: 'CUSTOM_API_KEY'
  }[provider];
  const apiKey = (db[provider].apiKey || process.env[keyEnv] || '') as string;
  const baseURL = db[provider].baseURL || envBaseUrl(provider);
  return {
    ...PROVIDER_DEFAULTS[provider],
    provider,
    apiKey,
    baseURL,
    model: getModelForProvider(model, provider),
  };
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  authHeader: 'x-api-key' | 'Authorization';
  needsAnthropicVersion: boolean;
}

const PROVIDER_DEFAULTS: Record<AIProvider, Omit<ProviderConfig, 'apiKey' | 'baseURL' | 'model'>> = {
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
  gemini: 'gemini-1.5-flash',
  custom: 'custom-model',
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
  anthropic: { apiKey: string; baseURL: string; model: string };
  openai: { apiKey: string; baseURL: string; model: string };
  xai: { apiKey: string; baseURL: string; model: string };
  minimax: { apiKey: string; baseURL: string; model: string };
  gemini: { apiKey: string; baseURL: string; model: string };
  custom: { apiKey: string; baseURL: string; model: string };
};

let _cache: { value: DbOverrides; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

async function loadDbOverrides(): Promise<DbOverrides> {
  if (_cache && _cache.expiresAt > Date.now()) return _cache.value;
  try {
    const config = await AiConfig.findOne({ isActive: true });
    const v: DbOverrides = {
      anthropic: { apiKey: config?.getApiKey('anthropic') ?? '', baseURL: config?.providers?.anthropic?.baseURL ?? '', model: config?.providers?.anthropic?.model ?? '' },
      openai: { apiKey: config?.getApiKey('openai') ?? '', baseURL: config?.providers?.openai?.baseURL ?? '', model: config?.providers?.openai?.model ?? '' },
      xai: { apiKey: config?.getApiKey('xai') ?? '', baseURL: config?.providers?.xai?.baseURL ?? '', model: config?.providers?.xai?.model ?? '' },
      minimax: { apiKey: config?.getApiKey('minimax') ?? '', baseURL: config?.providers?.minimax?.baseURL ?? '', model: config?.providers?.minimax?.model ?? '' },
      gemini: { apiKey: config?.getApiKey('gemini') ?? '', baseURL: config?.providers?.gemini?.baseURL ?? '', model: config?.providers?.gemini?.model ?? '' },
      custom: { apiKey: config?.getApiKey('custom') ?? '', baseURL: config?.providers?.custom?.baseURL ?? '', model: config?.providers?.custom?.model ?? '' },
    };
    _cache = { value: v, expiresAt: Date.now() + CACHE_TTL_MS };
    return v;
  } catch (err) {
    // DB unavailable — log warning and return empty overrides so we fall back to env
    logger.warn(`[aiProvider] Failed to load DbOverrides from AiConfig (using env fallbacks): ${(err as Error).message}`);
    return {
      anthropic: { apiKey: '', baseURL: '', model: '' },
      openai: { apiKey: '', baseURL: '', model: '' },
      xai: { apiKey: '', baseURL: '', model: '' },
      minimax: { apiKey: '', baseURL: '', model: '' },
      gemini: { apiKey: '', baseURL: '', model: '' },
      custom: { apiKey: '', baseURL: '', model: '' },
    };
  }
}

/** Invalidate the DB override cache. Call after admin updates config. */
export function invalidateProviderCache(): void {
  _cache = null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a full ProviderConfig for a given provider, applying DB → env → default order.
 */
export async function resolveProviderAsync(provider?: AIProvider): Promise<ProviderConfig> {
  const db = await loadDbOverrides();
  const hasKey = (p: AIProvider) => !!(db[p].apiKey || process.env[ENV_KEY[p]]);

  let chosen: AIProvider;
  if (provider && hasKey(provider)) {
    chosen = provider;
  } else {
    if (hasKey('anthropic')) chosen = 'anthropic';
    else if (hasKey('openai')) chosen = 'openai';
    else if (hasKey('xai')) chosen = 'xai';
    else if (hasKey('minimax')) chosen = 'minimax';
    else {
      chosen = provider || 'minimax';
    }
  }

  const override = db[chosen];
  const apiKey = override.apiKey || process.env[ENV_KEY[chosen]] || '';
  const baseURL = (override.baseURL || process.env[ENV_BASE_URL[chosen]] || DEFAULT_BASE_URLS[chosen]).replace(/\/$/, '');
  const model = getModelForProvider(override.model || process.env[ENV_MODEL[chosen]] || DEFAULT_MODELS[chosen], chosen);

  return {
    ...PROVIDER_DEFAULTS[chosen],
    provider: chosen,
    apiKey,
    baseURL,
    model,
  };
}

/**
 * Synchronous resolve — only uses env vars (no DB). Used by legacy sync code paths
 * and during initial module load. New code should prefer resolveProviderAsync().
 */
export function resolveProvider(): ProviderConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    return { ...PROVIDER_DEFAULTS.anthropic, provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, baseURL: envBaseUrl('anthropic'), model: envModel('anthropic') };
  }
  if (process.env.OPENAI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.openai, provider: 'openai', apiKey: process.env.OPENAI_API_KEY, baseURL: envBaseUrl('openai'), model: envModel('openai') };
  }
  if (process.env.XAI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.xai, provider: 'xai', apiKey: process.env.XAI_API_KEY, baseURL: envBaseUrl('xai'), model: envModel('xai') };
  }
  if (process.env.MINIMAX_API_KEY || process.env.MINIMAX_BASE_URL) {
    return { ...PROVIDER_DEFAULTS.minimax, provider: 'minimax', apiKey: process.env.MINIMAX_API_KEY ?? '', baseURL: envBaseUrl('minimax'), model: envModel('minimax') };
  }
  if (process.env.GEMINI_API_KEY) {
    return { ...PROVIDER_DEFAULTS.gemini, provider: 'gemini', apiKey: process.env.GEMINI_API_KEY, baseURL: envBaseUrl('gemini'), model: envModel('gemini') };
  }
  if (process.env.CUSTOM_API_KEY) {
    return { ...PROVIDER_DEFAULTS.custom, provider: 'custom', apiKey: process.env.CUSTOM_API_KEY, baseURL: envBaseUrl('custom'), model: envModel('custom') };
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
    model: envModel(provider),
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
): Promise<string> {
  const config = await resolveProviderAsync(provider);
  const modelName = model || config.model;

  if (provider === 'anthropic') {
    const res = await fetch(`${config.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: modelName, messages, max_tokens: 4 }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }
    const data = await res.json() as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  // OpenAI / xAI / MiniMax all use chat completions
  const body: Record<string, unknown> = { model: modelName, messages };
  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      [config.authHeader]: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} error: ${err}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

// Backward-compat export — used by aiController.testProvider via dynamic import
export const chat = chatWithProvider;

/**
 * Direct chat using an already-resolved ProviderConfig.
 * Does NOT re-resolve — uses exactly what getPipelineProviderConfig returned.
 * Used by pipeline controllers (faqAudit, autoAnswer) that need per-pipeline
 * provider/model overrides from env vars.
 */
export async function chatWithConfig(
  config: ProviderConfig,
  messages: { role: string; content: string }[],
): Promise<string> {
  const { provider, baseURL, apiKey, model, authHeader, needsAnthropicVersion } = config;
  if (!apiKey) throw new Error(`No API key for provider '${provider}' — set ${provider.toUpperCase()}_API_KEY`);

  if (provider === 'anthropic') {
    const res = await fetch(`${baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(needsAnthropicVersion ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      body: JSON.stringify({ model, messages, max_tokens: 512 }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${provider} error: ${err}`);
    }
    const data = await res.json() as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  // OpenAI / xAI / MiniMax — all use chat/completions
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      [authHeader]: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} error: ${err}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}
