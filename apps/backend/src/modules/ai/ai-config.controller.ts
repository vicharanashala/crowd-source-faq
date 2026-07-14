/**
 * aiConfigController.ts
 *
 * Handles AI provider and model configuration for the platform.
 *
 * Routes:
 *   GET    /api/admin/ai/config              → get current config
 *   PATCH  /api/admin/ai/config              → update features / provider / overrides
 *   POST   /api/admin/ai/config/reset-usage  → reset usage stats
 *   GET    /api/admin/ai/providers           → list available providers + health
 *   GET    /api/admin/ai/providers/test      → test connection for a provider
 *   GET    /api/admin/ai/config/api-key/:provider → return decrypted key (one-time view)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import AiConfig, { type IAiConfig, type AIProviderType } from './ai-config.model.js';
import { logAction } from '../admin/admin.controller.js';
import { invalidateProviderCache } from '../../utils/ai/aiProvider.js';

// ─── GET /api/admin/ai/config ───────────────────────────────────────────────

// v1.69 — Phase 4: per-program AI config. The route reads
// `?batchId=...` (or the body's batchId on writes). When
// supplied, getAiConfig / updateAiConfig / resetAiUsage target
// the per-program override doc; when absent, they target the
// global default (the prior behaviour). The resolver chain in
// aiProvider.ts is the runtime source of truth.
function batchIdFromQueryOrBody(req: Request): string | null {
  const q = req.query.batchId;
  if (typeof q === 'string' && q.length > 0) return q;
  const b = (req.body as { batchId?: string } | undefined)?.batchId;
  if (typeof b === 'string' && b.length > 0) return b;
  return null;
}

function asObjectIdOrNull(id: string | null): Types.ObjectId | null {
  if (!id) return null;
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

export const getAiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchIdRaw = batchIdFromQueryOrBody(req);
    const batchIdObjectId = asObjectIdOrNull(batchIdRaw);

    // v1.69 — Phase 4: when batchId is supplied, look for the
    // per-program override doc. If none exists, return a
    // placeholder 'no override for this program' response so the
    // admin UI can show the "no per-program override, falling
    // back to global" hint.
    let config = batchIdObjectId
      ? await AiConfig.findOne({ batchId: batchIdObjectId, isActive: true })
      : await AiConfig.findOne({ batchId: null, isActive: true });

    if (!config && !batchIdObjectId) {
      // Bootstrap the global default on first read (backwards
      // compat with the singleton setup).
      config = await AiConfig.create({
        activeProvider: 'anthropic',
        providers: {
          anthropic: { apiKeyCipher: '', baseURL: '', model: '' },
          openai:    { apiKeyCipher: '', baseURL: '', model: '' },
          xai:       { apiKeyCipher: '', baseURL: '', model: '' },
          minimax:   { apiKeyCipher: '', baseURL: '', model: '' },
          gemini:    { apiKeyCipher: '', baseURL: '', model: '' },
          custom:    { apiKeyCipher: '', baseURL: '', model: '' },
        },
        features: {
          duplicateDetection:  { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 1024 },
          knowledgeExtraction: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 2048 },
          searchSummarization: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 },
          faqGeneration:       { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.4, maxTokens: 1024 },
        },
        embedding: {
          provider: 'local',
          model: 'mixedbread-ai/mxbai-embed-large-v1',
          dimensions: 1024,
          apiKeyCipher: '',
          baseURL: '',
        },
        usage: { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() },
        isActive: true,
        batchId: null,
      });
    }

    const activeProvider = await detectActiveProvider();
    // When a batchId is supplied but no per-program override exists,
    // we still return the GLOBAL config so the admin UI can render
    // the current feature toggles. hasOverride:false tells the UI
    // that the next save will create a new override doc.
    let view: Record<string, unknown>;
    if (config) {
      view = config.publicView();
    } else if (batchIdObjectId) {
      const global = await AiConfig.findOne({ batchId: null, isActive: true });
      view = global ? global.publicView() : { providers: {}, features: {} };
    } else {
      view = { providers: {}, features: {} };
    }
    res.json({
      ...view,
      activeProvider,
      ...(batchIdObjectId ? { hasOverride: !!config, batchId: batchIdObjectId } : { hasOverride: !!config }),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── PATCH /api/admin/ai/config ─────────────────────────────────────────────

interface ProviderOverrideUpdate {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export const updateAiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activeProvider, features, providers, embedding } = req.body as {
      activeProvider?: AIProviderType;
      features?: IAiConfig['features'];
      providers?: Partial<Record<AIProviderType, ProviderOverrideUpdate>>;
      embedding?: {
        provider?: 'local' | 'huggingface' | 'openai' | 'custom';
        model?: string;
        dimensions?: number;
        apiKey?: string;
        baseURL?: string;
      };
    };

    // v1.69 — Phase 4: per-program override on writes. When
    // batchId is in the body, find or create the per-program
    // override doc (the partial unique index lets us create
    // without deactivating the global default). When absent,
    // target the global default as before.
    const batchIdRaw = batchIdFromQueryOrBody(req);
    const batchIdObjectId = asObjectIdOrNull(batchIdRaw);

    const filter = batchIdObjectId
      ? { batchId: batchIdObjectId, isActive: true }
      : { batchId: null, isActive: true };

    let config = await AiConfig.findOne(filter);
    if (!config) {
      // v1.69 — Phase 4: bootstrap a fresh per-program override
      // when one doesn't exist yet. The pre-save hook deactivates
      // any other active doc in the same (batchId) bucket, so
      // the global default stays untouched.
      config = await AiConfig.create({
        activeProvider: 'anthropic',
        providers: {
          anthropic: { apiKeyCipher: '', baseURL: '', model: '' },
          openai:    { apiKeyCipher: '', baseURL: '', model: '' },
          xai:       { apiKeyCipher: '', baseURL: '', model: '' },
          minimax:   { apiKeyCipher: '', baseURL: '', model: '' },
          gemini:    { apiKeyCipher: '', baseURL: '', model: '' },
          custom:    { apiKeyCipher: '', baseURL: '', model: '' },
        },
        features: {
          duplicateDetection:  { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 1024 },
          knowledgeExtraction: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 2048 },
          searchSummarization: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 },
          faqGeneration:       { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.4, maxTokens: 1024 },
        },
        embedding: {
          provider: 'local',
          model: 'mixedbread-ai/mxbai-embed-large-v1',
          dimensions: 1024,
          apiKeyCipher: '',
          baseURL: '',
        },
        usage: { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() },
        isActive: true,
        batchId: batchIdObjectId,
      });
    }

    // Validate provider models
    if (providers && typeof providers === 'object') {
      for (const prov of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[]) {
        const update = providers[prov];
        if (!update || update.model === undefined) continue;
        const validation = validateModelForProvider(update.model, prov);
        if (!validation.isValid) {
          res.status(400).json({ message: `Invalid model for provider ${prov}: ${validation.error}` });
          return;
        }
      }
    }

    const targetProvider = activeProvider || config.activeProvider;
    // Validate feature models
    if (features && typeof features === 'object') {
      for (const [feat, featConf] of Object.entries(features)) {
        if (featConf && typeof featConf === 'object' && 'model' in featConf) {
          const featModel = (featConf as any).model;
          if (featModel) {
            const validation = validateModelForProvider(featModel, targetProvider);
            if (!validation.isValid) {
              res.status(400).json({ message: `Invalid model for feature ${feat}: ${validation.error}` });
              return;
            }
          }
        }
      }
    }

    if (activeProvider !== undefined) config.activeProvider = activeProvider;
    if (features !== undefined) config.features = { ...config.features, ...features } as IAiConfig['features'];

    // v1.68 — H3 fix: build a flat $set with dot-notation
    // paths so the whole update is a single atomic write
    // instead of in-memory mutate + save().
    const setOps: Record<string, unknown> = {};
    if (providers && typeof providers === 'object') {
      for (const prov of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[]) {
        const update = providers[prov];
        if (!update) continue;
        // apiKey uses the model's encrypt path (config.setApiKey)
        if (update.apiKey !== undefined) {
          // Use the model's setter so the cipher is applied
          // server-side, then read back the cipher to write.
          config.setApiKey(prov, update.apiKey);
          setOps[`providers.${prov}.apiKeyCipher`] = (config.providers as any)[prov]?.apiKeyCipher;
        }
        if (update.baseURL !== undefined) setOps[`providers.${prov}.baseURL`] = update.baseURL;
        if (update.model !== undefined)    setOps[`providers.${prov}.model`]    = update.model;
      }
    }
    for (const [k, v] of Object.entries(features ?? {})) {
      setOps[`features.${k}`] = v;
    }

    // Process embedding updates
    if (embedding && typeof embedding === 'object') {
      if (embedding.provider !== undefined) setOps['embedding.provider'] = embedding.provider;
      if (embedding.model !== undefined) setOps['embedding.model'] = embedding.model;
      if (embedding.dimensions !== undefined) setOps['embedding.dimensions'] = embedding.dimensions;
      if (embedding.baseURL !== undefined) setOps['embedding.baseURL'] = embedding.baseURL;
      if (embedding.apiKey !== undefined) {
        config.setEmbeddingApiKey(embedding.apiKey);
        setOps['embedding.apiKeyCipher'] = config.embedding.apiKeyCipher;
      }
    }

    if (Object.keys(setOps).length > 0) {
      await AiConfig.findOneAndUpdate(
        { _id: config._id },
        { $set: setOps },
        { new: true },
      );
    }
    invalidateProviderCache();
    await logAction(
      (req as any).user?.id ?? 'system',
      'update_ai_config',
      config._id.toString(),
      'ai_config',
      JSON.stringify({ activeProvider, providersChanged: providers ? Object.keys(providers) : [], featuresChanged: features ? Object.keys(features) : [], embeddingChanged: !!embedding })
    );

    res.json({ message: 'AI config updated.', config: config.publicView() });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── POST /api/admin/ai/config/reset-usage ───────────────────────────────────

export const resetAiUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await AiConfig.findOne({ isActive: true });
    if (config) {
      // v1.68 — H3 fix: atomic reset via $set.
      await AiConfig.findOneAndUpdate(
        { _id: config._id },
        { $set: { usage: { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() } } },
      );
    }
    await logAction((req as any).user?.id ?? 'system', 'reset_ai_usage', 'ai_config', 'ai_config', 'Usage statistics reset');
    res.json({ message: 'Usage statistics reset.' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET /api/admin/ai/providers ─────────────────────────────────────────────

export const getAiProviders = async (_req: Request, res: Response): Promise<void> => {
  type ProviderKey = AIProviderType;

  const config = await AiConfig.findOne({ isActive: true });
  const providerMeta: Record<ProviderKey, { label: string; defaultModel: string; hasKey: boolean; configuredModel: string }> = {
    anthropic: { label: 'Anthropic Claude', defaultModel: 'claude-sonnet-4-20250514', hasKey: false, configuredModel: 'claude-sonnet-4-20250514' },
    openai:    { label: 'OpenAI GPT',       defaultModel: 'gpt-4o-mini',              hasKey: false, configuredModel: 'gpt-4o-mini' },
    xai:       { label: 'xAI Grok',         defaultModel: 'grok-3',                    hasKey: false, configuredModel: 'grok-3' },
    minimax:   { label: 'MiniMax',          defaultModel: 'MiniMax-Text-01',           hasKey: false, configuredModel: 'MiniMax-Text-01' },
    gemini:    { label: 'Google Gemini',    defaultModel: 'gemini-1.5-flash',          hasKey: false, configuredModel: 'gemini-1.5-flash' },
    custom:    { label: 'Custom Provider',  defaultModel: '',                          hasKey: false, configuredModel: '' },
  };

  for (const key of Object.keys(providerMeta) as ProviderKey[]) {
    const dbKey = config ? config.getApiKey(key) : null;
    const envKey = process.env[envKeyName(key)] ?? '';
    providerMeta[key].hasKey = !!(dbKey || envKey);
    if (config?.providers?.[key]?.model) {
      providerMeta[key].configuredModel = config.providers[key].model;
    } else {
      providerMeta[key].configuredModel = process.env[envModelName(key)] ?? providerMeta[key].defaultModel;
    }
  }

  const activeProvider = await detectActiveProvider();
  const providers = (Object.keys(providerMeta) as ProviderKey[]).map((key) => ({
    id: key,
    ...providerMeta[key],
    isActive: key === activeProvider,
  }));

  res.json({ providers, activeProvider });
};

// ─── GET /api/admin/ai/providers/test?provider=X ─────────────────────────────

export const testProvider = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.query as { provider?: string };
  const validProviders = ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom', 'embedding'];

  if (!provider || !validProviders.includes(provider)) {
    res.status(400).json({ ok: false, message: 'Invalid provider' });
    return;
  }

  try {
    if (provider === 'embedding') {
      const { generateEmbedding } = await import('../../utils/ai/embeddings.js');
      // Generate a test embedding using the active configuration
      await generateEmbedding('test connection connection check');
      res.json({ ok: true, message: 'Embedding generation successful' });
      return;
    }

    const { chatWithProvider } = await import('../../utils/ai/aiProvider.js');
    await chatWithProvider(provider as AIProviderType, [{ role: 'user', content: 'ping' }]);
    res.json({ ok: true, message: 'Connection successful' });
  } catch (err: any) {
    res.json({ ok: false, message: err.message || 'Connection failed' });
  }
};

// ─── GET /api/admin/ai/config/api-key/:provider ──────────────────────────────

export const revealApiKey = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const validProviders = ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom', 'embedding'];

  if (typeof provider !== 'string' || !validProviders.includes(provider)) {
    res.status(400).json({ message: 'Invalid provider' });
    return;
  }

  const config = await AiConfig.findOne({ isActive: true });
  let key: string | null = null;
  if (provider === 'embedding') {
    key = config?.getEmbeddingApiKey() ?? null;
  } else {
    key = config?.getApiKey(provider as AIProviderType) ?? null;
  }

  await logAction(
    (req as any).user?.id ?? 'system',
    'reveal_ai_api_key',
    String(provider),
    'ai_config',
    `Reveal API key for ${provider} (hasKey=${!!key})`
  );

  res.json({ apiKey: key });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function validateModelForProvider(model: string, provider: string): { isValid: boolean; error?: string } {
  if (!model) {
    return { isValid: true };
  }
  const lowerModel = model.toLowerCase();
  if (provider === 'anthropic' && !lowerModel.includes('claude')) {
    return { isValid: false, error: "Anthropic models must contain 'claude'." };
  }
  if (provider === 'openai' && !(lowerModel.includes('gpt') || lowerModel.includes('o1') || lowerModel.includes('o3'))) {
    return { isValid: false, error: "OpenAI models must contain 'gpt', 'o1', or 'o3'." };
  }
  if (provider === 'xai' && !lowerModel.includes('grok')) {
    return { isValid: false, error: "xAI models must contain 'grok'." };
  }
  if (provider === 'minimax' && !(lowerModel.includes('minimax') || lowerModel.includes('abab'))) {
    return { isValid: false, error: "MiniMax models must contain 'minimax' or 'abab'." };
  }
  if (provider === 'gemini' && !lowerModel.includes('gemini')) {
    return { isValid: false, error: "Gemini models must contain 'gemini'." };
  }
  return { isValid: true };
}

function envKeyName(p: AIProviderType): string {
  return { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', xai: 'XAI_API_KEY', minimax: 'MINIMAX_API_KEY', gemini: 'GEMINI_API_KEY', custom: 'CUSTOM_API_KEY' }[p];
}
function envModelName(p: AIProviderType): string {
  return { anthropic: 'ANTHROPIC_MODEL', openai: 'OPENAI_MODEL', xai: 'XAI_MODEL', minimax: 'MINIMAX_MODEL', gemini: 'GEMINI_MODEL', custom: 'CUSTOM_MODEL' }[p];
}

/**
 * Determine the active provider: prefer DB-configured keys; fall back to env vars.
 * Priority: anthropic > openai > xai > minimax.
 */
export async function detectActiveProvider(): Promise<AIProviderType> {
  const config = await AiConfig.findOne({ isActive: true });
  const hasKey = (p: AIProviderType) => {
    const keyEnv = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', xai: 'XAI_API_KEY', minimax: 'MINIMAX_API_KEY', gemini: 'GEMINI_API_KEY', custom: 'CUSTOM_API_KEY' }[p];
    return !!((config && config.getApiKey(p)) || process.env[keyEnv]);
  };

  if (config) {
    const active = config.activeProvider;
    if (active && hasKey(active)) return active;

    if (hasKey('anthropic')) return 'anthropic';
    if (hasKey('openai'))    return 'openai';
    if (hasKey('xai'))       return 'xai';
    if (hasKey('minimax'))   return 'minimax';
    if (hasKey('gemini'))    return 'gemini';
    if (hasKey('custom'))    return 'custom';
  }
  if (hasKey('anthropic')) return 'anthropic';
  if (hasKey('openai'))    return 'openai';
  if (hasKey('xai'))       return 'xai';
  if (hasKey('minimax'))   return 'minimax';
  if (hasKey('gemini'))    return 'gemini';
  return 'custom';
}