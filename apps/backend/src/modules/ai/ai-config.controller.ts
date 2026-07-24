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
 *   GET    /api/admin/ai/providers/models    → list live models for a provider
 *   GET    /api/admin/ai/config/api-key/:provider → return decrypted key (one-time view)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import AiConfig, { type IAiConfig, type AIProviderType } from './ai-config.model.js';
import { logAction } from '../admin/admin.controller.js';
import { invalidateProviderCache } from '../../utils/ai/aiProvider.js';
import { encrypt, decrypt } from '../../utils/auth/crypto.js';
import { logger } from '../../utils/http/logger.js';

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
          anthropic: { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          openai:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          xai:       { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          minimax:   { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          gemini:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          custom:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
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
    // activeProvider may now be `null` (no provider has any key). The
    // frontend reads `activeProvider` and falls back to the anthropic
    // default if it's missing — emit the literal string 'none' so the
    // UI can branch on it instead of pretending anthropic is active.
    res.json({
      ...view,
      activeProvider: activeProvider ?? 'none',
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
  /**
   * v1.82 — custom-provider wire-format model field name override.
   * Empty string means "no DB override — fall back to env, then
   * to `'model'`". Only meaningful for provider `custom`; ignored
   * for the other five. Controller validates the allowed values at
   * write time (only '' | 'model' | 'modelName').
   */
  customModelField?: '' | 'model' | 'modelName';
  /**
   * v1.83 — multi-key rotation list. When present, REPLACES the
   * entire keys[] on the provider (and clears the legacy
   * `apiKeyCipher` field after migration). Each entry must have
   * a non-empty `label` and an optional non-empty `value` (the
   * plaintext secret — empty `value` keeps the existing slot's
   * ciphertext so the admin can re-order / re-label without
   * re-typing secrets). At most 10 entries per provider.
   */
  keys?: Array<{ label?: unknown; value?: unknown; baseURL?: unknown }>;
}

const MAX_KEYS_PER_PROVIDER = 10;

function isValidProviderList(value: unknown): value is AIProviderType {
  return typeof value === 'string'
    && ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'].includes(value);
}

function normaliseKeyInput(raw: unknown): { label: string; value: string; baseURL: string } {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  const value = typeof obj.value === 'string' ? obj.value : '';
  const baseURL = typeof obj.baseURL === 'string' ? obj.baseURL : '';
  return { label, value, baseURL };
}

/**
 * Apply a PATCH-shaped `keys[]` payload to a provider slot on an
 * AiConfig doc. Mutates `config` in place. Returns `{ error?: string }`
 * for validation failures; on success returns `{ keysApplied: number }`
 * and clears the legacy `apiKeyCipher` since the new shape supersedes
 * it. Empty value preserves the existing ciphertext for that index
 * (so admins can reorder/rename slots without re-typing secrets).
 */
function applyProviderKeysPatch(
  config: IAiConfig,
  provider: AIProviderType,
  keysInput: unknown
): { error?: string; keysApplied?: number } {
  if (!Array.isArray(keysInput)) {
    return { error: `keys must be an array for provider ${provider}` };
  }
  if (keysInput.length > MAX_KEYS_PER_PROVIDER) {
    return { error: `Provider ${provider} supports at most ${MAX_KEYS_PER_PROVIDER} keys (got ${keysInput.length}).` };
  }
  const normalised = keysInput.map(normaliseKeyInput);
  // Validate: unique labels, non-empty labels.
  const seen = new Set<string>();
  for (let i = 0; i < normalised.length; i++) {
    const k = normalised[i];
    if (!k.label) {
      return { error: `Key #${i + 1} for provider ${provider} has an empty label.` };
    }
    if (seen.has(k.label)) {
      return { error: `Provider ${provider} has duplicate key label "${k.label}".` };
    }
    seen.add(k.label);
  }

  const slot = (config as any).providers[provider];
  if (!slot) return { error: `Unknown provider ${provider}` };

  // Merge with existing ciphertexts when value is omitted — admins
  // use this flow to reorder/rename without re-typing secrets.
  const existingArr = Array.isArray(slot.keys) ? slot.keys : [];
  const newKeys = normalised.map((k, idx) => {
    const prev = existingArr[idx];
    return {
      label: k.label,
      valueEnc: k.value ? encrypt(k.value) : (prev?.valueEnc ?? ''),
      baseURL: k.baseURL || (prev?.baseURL ?? slot.baseURL ?? ''),
      unhealthyUntil: prev?.unhealthyUntil ?? null,
    };
  }).filter((k) => k.label && k.valueEnc);

  slot.keys = newKeys;
  // Multi-key shape supersedes the legacy single-key field.
  if (slot.apiKeyCipher) slot.apiKeyCipher = '';
  return { keysApplied: newKeys.length };
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
          anthropic: { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          openai:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          xai:       { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          minimax:   { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          gemini:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
          custom:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '' },
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
    const unsetOps: Record<string, string> = {};
    if (providers && typeof providers === 'object') {
      for (const prov of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[]) {
        const update = providers[prov];
        if (!update) continue;
        // apiKey uses the model's encrypt path (config.setApiKey)
        // v1.83 — when keys[] is also being set, the apiKey is
        // handled as keys[0].value further down. We still honour
        // a bare apiKey as the legacy single-key write path.
        if (update.apiKey !== undefined && (update.keys === undefined || !Array.isArray(update.keys))) {
          // Use the model's setter so the cipher is applied
          // server-side, then read back the cipher to write.
          config.setApiKey(prov, update.apiKey);
          setOps[`providers.${prov}.apiKeyCipher`] = (config.providers as any)[prov]?.apiKeyCipher;
        }
        if (update.baseURL !== undefined) setOps[`providers.${prov}.baseURL`] = update.baseURL;
        if (update.model !== undefined)    setOps[`providers.${prov}.model`]    = update.model;
        // v1.82 — custom-model-field override. Validated against the
        // same enum ('model' | 'modelName' | '') so a typo in the
        // admin UI gets a clean 400 instead of being persisted as
        // junk. Empty string is allowed and means "fall back to env
        // / default" — admins can clear an override without dropping
        // the row.
        if (update.customModelField !== undefined) {
          if (update.customModelField !== '' && update.customModelField !== 'model' && update.customModelField !== 'modelName') {
            res.status(400).json({
              message: `Invalid customModelField for provider ${prov}: must be '', 'model', or 'modelName'.`,
            });
            return;
          }
          setOps[`providers.${prov}.customModelField`] = update.customModelField;
        }
        // v1.83 — multi-key rotation list. Validate, merge with
        // existing ciphertexts (so reorders don't force retyping),
        // and replace the slot's keys[] in a single $set. The
        // legacy apiKeyCipher is dropped via $unset so subsequent
        // reads use the new shape exclusively.
        if (update.keys !== undefined) {
          const result = applyProviderKeysPatch(config, prov, update.keys);
          if (result.error) {
            res.status(400).json({ message: result.error });
            return;
          }
          setOps[`providers.${prov}.keys`] = (config.providers as any)[prov]?.keys;
          unsetOps[`providers.${prov}.apiKeyCipher`] = '';
        }
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

    if (Object.keys(setOps).length > 0 || Object.keys(unsetOps).length > 0) {
      const update: Record<string, unknown> = {};
      if (Object.keys(setOps).length > 0) update.$set = setOps;
      if (Object.keys(unsetOps).length > 0) update.$unset = unsetOps;
      await AiConfig.findOneAndUpdate(
        { _id: config._id },
        update,
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
    // S5-C6 (CRITICAL) fix: scope the findOne to the GLOBAL config
    // (batchId: null). Previously this returned any active doc — with
    // per-program overrides, it could return a program-specific override
    // instead of the global default. `revealApiKey` then surfaced the
    // wrong key, and `resetAiUsage` reset the wrong usage row.
    const config = await AiConfig.findOne({ isActive: true, batchId: null });
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

  // S5-C6 (CRITICAL) fix: see resetAiUsage above. Scope to global config.
  const config = await AiConfig.findOne({ isActive: true, batchId: null });
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

  // Same 'none' sentinel as getAiConfig — when no provider has any key,
  // the frontend needs an explicit signal that the system is unconfigured
  // so it can show "No AI provider configured" instead of pretending one is
  // active.
  res.json({ providers, activeProvider: activeProvider ?? 'none' });
};

// ─── GET /api/admin/ai/providers/test?provider=X ─────────────────────────────

export const testProvider = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.query as { provider?: string };
  const validProviders = ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom', 'embedding'];

  if (!provider || !validProviders.includes(provider)) {
    res.status(400).json({ ok: false, message: 'Invalid provider' });
    return;
  }

  // Short-circuit when the provider has no API key configured. Without
  // this, the chat call would still fire — hitting the provider's
  // `/messages` or `/chat/completions` endpoint with an empty Bearer
  // token, getting back a 401, and only THEN returning ok:false. The
  // resulting error string is also ugly (e.g. "anthropic error: {"error":
  // "invalid x-api-key"}") and confuses admins. A clean pre-flight
  // check gives a deterministic, actionable message.
  if (provider !== 'embedding') {
    const config = await AiConfig.findOne({ isActive: true, batchId: null });
    const dbKey = config ? config.getApiKey(provider as AIProviderType) : null;
    const envKey = process.env[envKeyName(provider as AIProviderType)] ?? '';
    if (!dbKey && !envKey) {
      res.json({
        ok: false,
        message: `No API key configured for ${provider}. Set ${envKeyName(provider as AIProviderType)} in env or save a key in AI Settings.`,
      });
      return;
    }
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

// ─── POST /api/admin/ai/test-feature ─────────────────────────────────
//
// v1.82 — Per-feature live test. Fires an actual extraction /
// duplicate-check / summarization / FAQ-generation call with a
// built-in sample input, so admins can verify the *full*
// per-feature config (model, temperature, maxTokens, provider key,
// baseURL, customModelField) works end-to-end without waiting for a
// cron tick or staging a real post.
//
// Each feature uses the same input the production code path consumes;
// the response is the same shape the rest of the app would store.
// Errors are returned as `{ ok:false, error }` so the UI can surface
// them inline.
export const testFeature = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as { feature?: string };
    const feature = body.feature;
    const validFeatures = ['duplicateDetection', 'knowledgeExtraction', 'searchSummarization', 'faqGeneration'] as const;
    if (!feature || !(validFeatures as readonly string[]).includes(feature)) {
      res.status(400).json({ ok: false, error: `Unknown feature "${feature}". Expected one of: ${validFeatures.join(', ')}` });
      return;
    }

    const t0 = Date.now();
    const { AiClient } = await import('./ai-client.service.js');
    const client = new AiClient();

    if (feature === 'duplicateDetection') {
      const result = await client.detectDuplicates({
        userQuestion: 'How do I request an NOC certificate?',
        candidates: [
          { _id: 'sample-1', title: 'How to apply for an NOC', source: 'faq' },
          { _id: 'sample-2', title: 'Team meeting schedule', source: 'community' },
        ],
      });
      const arr = result as unknown as Array<{ _id: string; score: number; reason: string }>;
      res.json({
        ok: true,
        feature,
        content: JSON.stringify(result),
        preview: arr.length > 0
          ? `${arr.length} candidate(s); top score ${arr[0].score.toFixed(2)} — ${arr[0].reason}`
          : 'no duplicates found',
        durationMs: Date.now() - t0,
      });
      return;
    }

    if (feature === 'knowledgeExtraction') {
      const result = await client.extractKnowledge({
        source: 'transcript',
        rawText: 'Q: How do I request an NOC certificate?\nA: Submit the NOC form on the student dashboard. Processing takes 3-5 business days.\nQ: Who signs the certificate?\nA: The program coordinator signs all NOC certificates.',
        context: 'Live test sample',
      });
      res.json({
        ok: true,
        feature,
        content: JSON.stringify(result),
        preview: `${result.length} Q&A pair(s) extracted`,
        durationMs: Date.now() - t0,
      });
      return;
    }

    if (feature === 'searchSummarization') {
      const result = await client.summarize({
        query: 'How do I request an NOC certificate?',
        faqs: [
          { question: 'How to apply for an NOC', answer: 'Submit the NOC form on the student dashboard.' },
        ],
      });
      res.json({
        ok: true,
        feature,
        content: result,
        preview: result.slice(0, 200),
        durationMs: Date.now() - t0,
      });
      return;
    }

    if (feature === 'faqGeneration') {
      const result = await client.generateFAQ(
        'How do I request an NOC certificate?',
        'Multiple students asked about NOC procedures this week.',
        'Administrative'
      );
      res.json({
        ok: true,
        feature,
        content: JSON.stringify(result),
        preview: `${result.question.slice(0, 80)} → ${result.category}`,
        durationMs: Date.now() - t0,
      });
      return;
    }

    // Unreachable — guarded by the enum check above.
    res.status(400).json({ ok: false, error: 'Unhandled feature' });
  } catch (err: any) {
    res.json({ ok: false, error: err?.message || String(err) });
  }
};

// ─── GET /api/admin/ai/providers/models?provider=X[&kind=embedding] ─────────
//
// Live model browser for the AI Settings page. Fetches the list of
// available models directly from the provider's API so the admin UI
// can show a real-time dropdown rather than the hardcoded
// `suggestedModels` array.
//
// Contract:
//   GET /api/admin/ai/providers/models?provider=openai
//   → { ok: true,  models: ['gpt-4o', 'gpt-4o-mini', ...], source: 'live' }
//   → { ok: false, models: [], error: 'No API key configured for openai.' }
//
// `kind=embedding` switches to embedding-specific providers (e.g.
// huggingface's `/api/models` listing). Defaults to 'chat'.
//
// Failure mode is exhaustive: missing key, 401/403, network error,
// unsupported provider, malformed JSON, etc. ALL errors return
// ok:false with an empty `models` array. The endpoint never throws
// — callers can rely on the shape `{ ok, models, error? }`.
export const listProviderModels = async (req: Request, res: Response): Promise<void> => {
  const { provider, kind } = req.query as { provider?: string; kind?: string };
  const validChatProviders = ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as const;
  const validEmbeddingProviders = ['huggingface', 'openai', 'custom'] as const;
  const mode: 'chat' | 'embedding' = kind === 'embedding' ? 'embedding' : 'chat';
  const allValid = mode === 'embedding' ? validEmbeddingProviders : validChatProviders;

  // Wrap the whole body in try/catch — defensive against any throw
  // (mongo down, network reset, JSON parse error, etc.) so the UI
  // never sees a 500.
  try {
    if (!provider || !(allValid as readonly string[]).includes(provider)) {
      res.json({ ok: false, models: [], error: `Unsupported provider "${provider}" for ${mode} model listing.` });
      return;
    }

    const config = await AiConfig.findOne({ isActive: true, batchId: null });

    // ── HuggingFace embedding listing ─────────────────────────────
    // The /api/models endpoint is public (no auth needed) but we
    // attach a token when one is configured. Returns 200 with a
    // JSON array of { id, ... } — each `id` is a model slug like
    // "mixedbread-ai/mxbai-embed-large-v1".
    if (mode === 'embedding' && provider === 'huggingface') {
      const dbKey = config?.getEmbeddingApiKey() ?? null;
      const envKey = process.env.HUGGINGFACE_API_KEY ?? '';
      const apiKey = dbKey || envKey || '';
      const url = 'https://huggingface.co/api/models?full=false&limit=200';
      try {
        const resp = await fetch(url, apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {});
        if (!resp.ok) {
          res.json({ ok: false, models: [], error: `HuggingFace returned HTTP ${resp.status}.` });
          return;
        }
        const data: unknown = await resp.json();
        const models = Array.isArray(data)
          ? (data as Array<{ id?: string }>)
              .map((m) => m?.id)
              .filter((m): m is string => typeof m === 'string' && m.length > 0)
          : [];
        res.json({ ok: true, models, source: 'live' });
        return;
      } catch (err: any) {
        res.json({ ok: false, models: [], error: `HuggingFace model list failed: ${err?.message || 'network error'}` });
        return;
      }
    }

    // ── OpenAI-compatible /v1/models listing ─────────────────────
    // Works for openai, xai, minimax, gemini (via its OAI-compat
    // path), and any custom OpenAI-compatible endpoint. Reuses the
    // same DB+env key resolution as testProvider so behaviour is
    // consistent (an admin who tested the connection will get the
    // same key for the model browser).
    if (
      (mode === 'chat' && ['openai', 'xai', 'minimax', 'gemini', 'custom'].includes(provider)) ||
      (mode === 'embedding' && ['openai', 'custom'].includes(provider))
    ) {
      const prov = provider as AIProviderType;
      const dbKey = config ? config.getApiKey(prov) : null;
      const envKey = mode === 'embedding'
        ? (process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '')
        : (process.env[envKeyName(prov)] ?? '');
      const apiKey = dbKey || envKey;

      if (!apiKey) {
        const envHint = mode === 'embedding' ? 'EMBEDDING_API_KEY (or OPENAI_API_KEY)' : envKeyName(prov);
        res.json({
          ok: false,
          models: [],
          error: `No API key configured for ${provider}. Set ${envHint} in env or save a key in AI Settings.`,
        });
        return;
      }

      // Default base URLs mirror what getAiProviders reports. `custom`
      // is special: the admin sets their own baseURL. We use whatever
      // they saved; if it's empty we fall back to the OpenAI default
      // (which is the most common shape for self-hosted OAI-compatible
      // endpoints).
      const baseURL = (config?.providers?.[prov]?.baseURL || '').trim()
        || (prov === 'openai' ? 'https://api.openai.com/v1'
        : prov === 'minimax' ? 'https://api.minimax.io/v1'
        : prov === 'xai' ? 'https://api.x.ai/v1'
        : prov === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
        : 'https://api.openai.com/v1');

      const url = `${baseURL.replace(/\/$/, '')}/models`;
      try {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!resp.ok) {
          // 401/403 are the common case for invalid keys; surface a
          // clean message rather than dumping the provider's error JSON.
          const status = resp.status;
          res.json({
            ok: false,
            models: [],
            error: status === 401 || status === 403
              ? `Provider rejected the API key (HTTP ${status}).`
              : `Provider returned HTTP ${status}.`,
          });
          return;
        }
        const data: any = await resp.json();
        // OpenAI-compatible shape: { data: [{ id, ... }] }
        let ids: string[] = [];
        if (data && Array.isArray(data.data)) {
          ids = data.data
            .map((m: any) => m?.id)
            .filter((m: unknown): m is string => typeof m === 'string' && m.length > 0);
        } else if (Array.isArray(data)) {
          // Some providers return a flat array of {id}.
          ids = data
            .map((m: any) => m?.id ?? m)
            .filter((m: unknown): m is string => typeof m === 'string' && m.length > 0);
        }
        res.json({ ok: true, models: ids, source: 'live' });
        return;
      } catch (err: any) {
        res.json({ ok: false, models: [], error: `Provider model list failed: ${err?.message || 'network error'}` });
        return;
      }
    }

    // anthropic has no /v1/models endpoint — return empty (caller falls
    // back to the hardcoded suggestedModels list).
    res.json({ ok: false, models: [], error: `Provider "${provider}" does not expose a /v1/models endpoint.` });
  } catch (err: any) {
    // Defensive last-resort catch so the UI never sees a 500.
    res.json({ ok: false, models: [], error: err?.message || 'Unexpected error listing models.' });
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

  // S5-C6 (CRITICAL) fix: see resetAiUsage above. Scope to global config
  // so revealApiKey surfaces the global API key, not a per-program override.
  const config = await AiConfig.findOne({ isActive: true, batchId: null });
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

// S5-H17 (HIGH) fix (revised in v1.79.1): the previous exact-match
// whitelist was too strict — it blocked perfectly valid models the
// provider supports (e.g. newer Anthropic Claude 4.x releases,
// dated gpt-4o snapshots like gpt-4o-2024-08-06, new xAI Grok
// versions) and forced admins to edit the source code to add every
// model release. The whitelist also drifted out of date the moment
// a new model launched.
//
// New policy: validate that the model string is non-empty and
// matches a sane shape (non-whitespace, length-bounded). Don't
// reject based on internal knowledge of which models exist — the
// provider API will surface a 4xx error if the model doesn't
// exist, which surfaces to the admin via the existing
// "Test connection" flow. This unblocks admins who type supported
// model names that we haven't hardcoded yet.
//
// The function is kept (and exported) so existing callers don't
// break; it just always returns isValid:true for non-empty shapes.
export function validateModelForProvider(model: string, _provider: string): { isValid: boolean; error?: string } {
  if (typeof model !== 'string') {
    return { isValid: false, error: 'Model must be a string.' };
  }
  const trimmed = model.trim();
  if (trimmed.length === 0) {
    return { isValid: true }; // empty → caller may treat as "use default"
  }
  if (trimmed.length > 256) {
    return { isValid: false, error: 'Model name is unreasonably long (max 256 chars).' };
  }
  // Disallow whitespace and control chars — provider model slugs never contain them.
  // eslint-disable-next-line no-control-regex -- intentional: catches ASCII control chars in user-supplied model names
  if (/[\s\u0000-\u001f]/.test(trimmed)) {
    return { isValid: false, error: 'Model name must not contain whitespace or control characters.' };
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
 * Priority: anthropic > openai > xai > minimax > gemini > custom.
 *
 * Returns `null` when no provider has a usable API key (neither DB nor env).
 * Previously this function fell through to `'custom'` on miss, which made
 * the admin UI display "Configured ✓ Active" for a completely non-functional
 * provider (since `custom` always "passed" `isActive`). Callers must treat
 * `null` as "AI is not configured — the system is degraded, surface this to
 * the admin UI instead of pretending a provider is active."
 */
export async function detectActiveProvider(): Promise<AIProviderType | null> {
  // S5-C6 (CRITICAL) fix: scope to global config.
  const config = await AiConfig.findOne({ isActive: true, batchId: null });
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
  // No DB row AND no env-var key for any provider → nothing to talk to.
  return null;
}

// ─── v1.83 — Multi-key rotation admin endpoints ─────────────────────────────
//
// Three new endpoints under /admin/ai/provider-keys/:provider:
//   GET    /admin/ai/provider-keys/:provider  → list keys with PLAINTEXT
//   PUT    /admin/ai/provider-keys/:provider  → replace full key list
//   DELETE /admin/ai/provider-keys/:provider  → clear all keys
//
// The existing PATCH /admin/ai/config endpoint already accepts
// `providers.<p>.keys` (see `applyProviderKeysPatch` above) — this
// trio is the same surface, scoped per-provider, with an explicit
// semantic that ITS singular job is the key list (so the frontend
// can refetch/replace/clear without re-sending model/baseURL).
//
// All three are admin-only (the router they live behind is mounted
// inside admin.routes.ts which gates every route through adminOnly).
// The GET plaintext response is logged via logAction so admins can't
// peek at secrets without leaving a paper trail.

const PROVIDER_KEYS_ALLOWED: AIProviderType[] = ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'];

function isProviderKeyName(s: string): s is AIProviderType {
  return (PROVIDER_KEYS_ALLOWED as string[]).includes(s);
}

/**
 * GET /admin/ai/provider-keys/:provider
 *
 * Admin-only. Returns the ordered key list WITH plaintext `value`
 * fields decrypted (admins need this so they can copy an existing
 * key into a new slot, or paste it into a different provider). The
 * ciphertext `valueEnc` is NOT included — it's an internal detail.
 *
 * Lazily promotes the legacy `apiKeyCipher` into a single "Primary"
 * row on first read so legacy docs surface the existing secret
 * without forcing an admin write. The plaintext values shown here
 * represent the truth stored in the DB (encrypted at rest).
 */
export const getProviderKeys = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = String(req.params.provider ?? '');
    if (!isProviderKeyName(raw)) {
      res.status(400).json({ message: `Invalid provider "${raw}".` });
      return;
    }
    const provider = raw as AIProviderType;

    // S5-C6 (CRITICAL) fix: scope to global config so the admin
    // sees the same key list the rest of the runtime uses.
    const config = await AiConfig.findOne({ isActive: true, batchId: null });
    if (!config) {
      res.json({ provider, keys: [] });
      return;
    }

    const arr = config.getApiKeys(provider);
    const keys = arr
      .filter((k) => !!k?.valueEnc)
      .map((k) => {
        let value = '';
        try {
          value = decrypt(k.valueEnc);
        } catch (err) {
          logger.warn(`[aiConfigController] Failed to decrypt provider key "${k.label}" for ${provider}: ${(err as Error).message}`);
        }
        const baseURL = (k.baseURL && k.baseURL.length > 0)
          ? k.baseURL
          : ((config.providers?.[provider]?.baseURL ?? ''));
        return {
          label: k.label,
          value, // PLAINTEXT — admin-only
          baseURL,
          unhealthyUntil: k.unhealthyUntil ?? null,
        };
      });

    await logAction(
      (req as any).user?.id ?? 'system',
      'reveal_provider_keys',
      String(provider),
      'ai_config',
      `Reveal ${keys.length} key(s) for ${provider}`
    );

    res.json({
      provider,
      keys,
      // For convenience — admins editing in the UI can prefill these
      // without an extra GET.
      defaultBaseURL: config.providers?.[provider]?.baseURL ?? '',
      model:          config.providers?.[provider]?.model ?? '',
      customModelField: config.providers?.[provider]?.customModelField ?? '',
      maxKeys: MAX_KEYS_PER_PROVIDER,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PUT /admin/ai/provider-keys/:provider
 *
 * Body:
 *   {
 *     keys: [{ label, value?, baseURL? }],
 *     defaultBaseURL?: string,
 *     model?: string,
 *     customModelField?: '' | 'model' | 'modelName'
 *   }
 *
 * Replaces the full key list for the provider. Defaults applied on
 * the baseURL field (per-key baseURL falls back to the provider's
 * defaultBaseURL when omitted). ≤ 10 keys, unique labels, non-empty
 * values. The legacy `apiKeyCipher` field is cleared after the
 * write so subsequent reads use the new shape exclusively.
 */
export const putProviderKeys = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = String(req.params.provider ?? '');
    if (!isProviderKeyName(raw)) {
      res.status(400).json({ message: `Invalid provider "${raw}".` });
      return;
    }
    const provider = raw as AIProviderType;

    const body = (req.body ?? {}) as {
      keys?: unknown;
      defaultBaseURL?: unknown;
      model?: unknown;
      customModelField?: unknown;
    };

    if (!Array.isArray(body.keys)) {
      res.status(400).json({ message: 'Request body must include a keys array.' });
      return;
    }
    if (body.keys.length > MAX_KEYS_PER_PROVIDER) {
      res.status(400).json({ message: `At most ${MAX_KEYS_PER_PROVIDER} keys allowed per provider (got ${body.keys.length}).` });
      return;
    }

    const normalised = body.keys.map(normaliseKeyInput);

    // Enforce: ≤ MAX, unique labels, non-empty labels.
    const seen = new Set<string>();
    for (let i = 0; i < normalised.length; i++) {
      const k = normalised[i];
      if (!k.label) {
        res.status(400).json({ message: `Key #${i + 1} has an empty label.` });
        return;
      }
      if (seen.has(k.label)) {
        res.status(400).json({ message: `Duplicate key label "${k.label}".` });
        return;
      }
      seen.add(k.label);
    }

    // Validate customModelField if present.
    if (body.customModelField !== undefined
        && body.customModelField !== ''
        && body.customModelField !== 'model'
        && body.customModelField !== 'modelName') {
      res.status(400).json({ message: 'customModelField must be "", "model", or "modelName".' });
      return;
    }

    const config = await AiConfig.findOne({ isActive: true, batchId: null });
    if (!config) {
      res.status(404).json({ message: 'No active AI config found.' });
      return;
    }

    const slot = (config as any).providers[provider];
    const existingArr = Array.isArray(slot?.keys) ? slot.keys : [];
    const defaultBaseURL = typeof body.defaultBaseURL === 'string'
      ? body.defaultBaseURL
      : (slot?.baseURL ?? '');

    const newKeys = normalised
      .map((k, idx) => {
        const prev = existingArr[idx];
        return {
          label: k.label,
          valueEnc: k.value ? encrypt(k.value) : (prev?.valueEnc ?? ''),
          baseURL: k.baseURL || defaultBaseURL || (prev?.baseURL ?? ''),
          unhealthyUntil: prev?.unhealthyUntil ?? null,
        };
      })
      .filter((k) => k.valueEnc); // drop rows without a secret

    // Build the atomic $set / $unset. Always replace the entire
    // keys[] — never partially merge — so the UI's "save" button
    // matches the admin's mental model of "this is what's persisted".
    const setOps: Record<string, unknown> = {
      [`providers.${provider}.keys`]: newKeys,
    };
    const unsetOps: Record<string, string> = {
      [`providers.${provider}.apiKeyCipher`]: '',
    };
    if (typeof body.defaultBaseURL === 'string') {
      setOps[`providers.${provider}.baseURL`] = body.defaultBaseURL;
    }
    if (typeof body.model === 'string') {
      const modelTrim = body.model.trim();
      const v = validateModelForProvider(modelTrim, provider);
      if (!v.isValid) {
        res.status(400).json({ message: `Invalid model for provider ${provider}: ${v.error}` });
        return;
      }
      setOps[`providers.${provider}.model`] = modelTrim;
    }
    if (body.customModelField !== undefined) {
      setOps[`providers.${provider}.customModelField`] = body.customModelField;
    }

    await AiConfig.findOneAndUpdate(
      { _id: config._id },
      { $set: setOps, $unset: unsetOps },
      { new: true },
    );
    invalidateProviderCache();

    await logAction(
      (req as any).user?.id ?? 'system',
      'put_provider_keys',
      String(provider),
      'ai_config',
      `Replace key list for ${provider}: ${newKeys.length} key(s) with labels [${newKeys.map((k) => k.label).join(', ')}]`
    );

    res.json({
      message: `Updated ${newKeys.length} key(s) for ${provider}.`,
      provider,
      keysApplied: newKeys.length,
      publicView: config.publicView(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /admin/ai/provider-keys/:provider
 *
 * Clears all keys for the provider. The persisted doc has both
 * keys[] emptied and the legacy apiKeyCipher cleared (so subsequent
 * publicView()/getAiProviders() returns `hasKey: false` and the
 * env-var fallback path takes over).
 */
export const deleteProviderKeys = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = String(req.params.provider ?? '');
    if (!isProviderKeyName(raw)) {
      res.status(400).json({ message: `Invalid provider "${raw}".` });
      return;
    }
    const provider = raw as AIProviderType;

    const config = await AiConfig.findOne({ isActive: true, batchId: null });
    if (!config) {
      res.status(404).json({ message: 'No active AI config found.' });
      return;
    }

    await AiConfig.findOneAndUpdate(
      { _id: config._id },
      { $set: { [`providers.${provider}.keys`]: [] }, $unset: { [`providers.${provider}.apiKeyCipher`]: '' } },
      { new: true },
    );
    invalidateProviderCache();

    await logAction(
      (req as any).user?.id ?? 'system',
      'delete_provider_keys',
      String(provider),
      'ai_config',
      `Cleared all keys for ${provider}`
    );

    res.json({
      message: `Cleared all keys for ${provider}.`,
      provider,
      publicView: config.publicView(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};