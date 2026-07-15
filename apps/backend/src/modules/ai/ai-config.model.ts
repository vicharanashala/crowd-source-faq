/**
 * AiConfig Model
 *
 * v1.69 — Phase 4: per-program AI configuration.
 *
 * A single `batchId: null` doc is the global default. Each program
 * can additionally have its own `batchId: <programId>` doc that
 * overrides the global one (model selection, API key, features).
 *
 * Resolution order (utils/ai/aiProvider.ts → resolveActiveAiConfig):
 *   1. (batchId, isActive:true) — per-program override
 *   2. (batchId:null, isActive:true) — global default
 *   3. empty defaults — used as the last resort when nothing is
 *      configured anywhere
 *
 * The existing "only one active config at a time" invariant is
 * preserved PER batchId: at most one active doc per (batchId)
 * combination. The pre-save hook deactivates other docs in the
 * same (batchId) bucket on save rather than globally.
 *
 * The admin dashboard's AI Settings page now uses batchId from
 * the program selector to decide which config to edit.
 *
 * v1.66 — admin-only access. Replaces the ad-hoc provider
 * detection in duplicateDetector.ts and knowledgeBase.ts with a
 * unified, admin-configurable AI layer. The runtime resolver
 * (utils/aiProvider.ts) checks the DB first, then env.
 *
 * v1.82 — added `customModelField?: string` on IProviderOverride
 * to expose the wire-format model field name for the `custom`
 * provider (e.g. `model` vs `modelName`). Surfaced via publicView()
 * and surfaced to the admin UI as a select on the Custom provider
 * card. See aiProvider.ts for the runtime fallback chain.
 *
 * v1.83 — Multi-API-key rotation. Each provider override now carries
 * an ordered `keys: IProviderKey[]` array (label + encrypted value +
 * per-key baseURL + transient unhealthyUntil). The legacy single
 * `apiKeyCipher` field is preserved on the doc to keep env-var
 * resolution and external `getApiKey()` callers (auth/profile,
 * apiUsageLog, etc.) working unchanged. On read, missing/empty
 * `keys[]` is lazily promoted from the legacy field on first access;
 * the next write (PUT /admin/ai/provider-keys/:provider or the
 * PATCH /admin/ai/config convenience wrapper) drops the legacy
 * field. Public views only expose hasKey + keyCount — plaintext is
 * gated behind the admin reveal endpoint.
 */

import mongoose, { Schema, type Document, Types } from 'mongoose';
import { encrypt, decrypt } from '../../utils/auth/crypto.js';
import { logger } from '../../utils/http/logger.js';

export type AIProviderType = 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

/**
 * v1.83 — One API key slot in a provider's multi-key array.
 * `valueEnc` is the same AES-GCM ciphertext the legacy `apiKeyCipher`
 * field holds; we keep a separate field name so Mongoose schema
 * updates don't break older docs that only carry the legacy field.
 */
export interface IProviderKey {
  label: string;
  valueEnc: string;
  baseURL?: string;
  /**
   * Transient rate-limit recovery window. Set when a 429 or auth
   * failure marks this key unhealthy; cleared on next successful
   * call. Pure runtime hint — callers may also persist via
   * `markUnhealthy()` on the model for cross-restart durability,
   * but the default flow is to skip keys with unhealthyUntil > now.
   */
  unhealthyUntil?: Date | null;
}

export interface IProviderOverride {
  // LEGACY (pre-v1.83) — encrypted single API key.
  // v1.83 keeps this field for back-compat with callers that still
  // read `getApiKey(provider)` (apiUsageLog, mintServiceToken,
  // zoomOAuth, etc.). On read, an empty `keys[]` is lazily promoted
  // from this field. On write, the new endpoints clear this field
  // once `keys[]` is populated.
  apiKeyCipher: string;
  // Custom base URL. Empty string = "use provider default".
  // v1.83 — this remains the provider-default baseURL. Per-key
  // baseURLs live inside `keys[].baseURL` and override this when set.
  baseURL: string;
  // Per-provider model override. Empty string = "use provider default".
  model: string;
  /**
   * v1.82 — custom-provider wire-format model field name.
   *   ''         → fall back to env / default ('model')
   *   'model'    → standard OpenAI-compat (`{model: "..."}`)
   *   'modelName' → camelCase variant for proxies that expect it
   * Only meaningful when the active provider is `custom`; ignored
   * for the other five. Typed as `string` (not enum) so Mongoose's
   * nested-schema type inference stays happy; the controller
   * validates the allowed values at write time.
   */
  customModelField?: string;
  /**
   * v1.83 — ordered list of API key slots. Caller resolves them
   * in array order; the first non-empty + non-unhealthy slot wins.
   * The runtime (provider-resolver.service.ts) reads from this
   * array and emits a `candidates[]` list for the 429-rotation
   * logic in ai-client.service.ts.
   */
  keys: IProviderKey[];
}

export interface IEmbeddingConfig {
  provider: 'local' | 'huggingface' | 'openai' | 'custom';
  model: string;
  dimensions: number;
  apiKeyCipher: string;
  baseURL: string;
}

export interface IAiConfig extends Document {
  // v1.69 — Phase 4: null = global default, non-null = per-program
  // override. The unique partial index below enforces at most one
  // active doc per (batchId, isActive:true) combination.
  batchId: Types.ObjectId | null;

  // Which provider is currently active
  activeProvider: AIProviderType;

  // Per-provider overrides set from the admin dashboard.
  providers: {
    anthropic: IProviderOverride;
    openai: IProviderOverride;
    xai: IProviderOverride;
    minimax: IProviderOverride;
    gemini: IProviderOverride;
    custom: IProviderOverride;
  };

  // Per-feature configuration
  features: {
    duplicateDetection:  { enabled: boolean; model: string; temperature: number; maxTokens: number };
    knowledgeExtraction: { enabled: boolean; model: string; temperature: number; maxTokens: number };
    searchSummarization: { enabled: boolean; model: string; temperature: number; maxTokens: number };
    faqGeneration:       { enabled: boolean; model: string; temperature: number; maxTokens: number };
  };

  // Dynamic Embedding Configuration (v1.72)
  embedding: IEmbeddingConfig;

  usage: {
    totalRequests: number;
    totalEstimatedCost: number;
    lastResetAt: Date;
  };

  isActive: boolean;
  updatedAt: Date;

  // Instance methods (implemented below on the schema)
  getApiKey(provider: AIProviderType): string | null;
  setApiKey(provider: AIProviderType, plainKey: string): void;
  getApiKeys(provider: AIProviderType): IProviderKey[];
  getEmbeddingApiKey(): string | null;
  setEmbeddingApiKey(plainKey: string): void;
  publicView(): Record<string, unknown>;
}

const providerKeySchema = new Schema<IProviderKey>(
  {
    label: { type: Schema.Types.String, default: '' },
    valueEnc: { type: Schema.Types.String, default: '' },
    baseURL: { type: Schema.Types.String, default: '' },
    unhealthyUntil: { type: Date, default: null },
  },
  { _id: false }
);

const providerOverrideSchema = new Schema<IProviderOverride>(
  {
    apiKeyCipher: { type: Schema.Types.String, default: '' },
    baseURL:      { type: Schema.Types.String, default: '' },
    model:        { type: Schema.Types.String, default: '' },
    // v1.82 — plain String (not enum) so legacy docs round-trip
    // cleanly. Controller validates '' | 'model' | 'modelName'
    // before persisting.
    customModelField: { type: Schema.Types.String, default: '' },
    // v1.83 — multi-key rotation list. Empty by default — the
    // legacy `apiKeyCipher` is the source of truth until the
    // admin saves the new shape via the dedicated endpoint.
    keys: { type: [providerKeySchema], default: [] },
  },
  { _id: false }
);

const aiConfigSchema = new Schema<IAiConfig>(
  {
    // v1.69 — Phase 4: per-program override scoping. null = global.
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
    },
    activeProvider: {
      type: Schema.Types.String,
      enum: ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[],
      required: true,
      default: 'anthropic',
    },

    providers: {
      // v1.82 — type cast to any to work around a Mongoose v7
      // type-inference bug that fires when the IProviderOverride
      // interface gains an optional field. Runtime behaviour is
      // identical.
      type: {
        anthropic: { type: providerOverrideSchema, default: () => ({}) },
        openai:    { type: providerOverrideSchema, default: () => ({}) },
        xai:       { type: providerOverrideSchema, default: () => ({}) },
        minimax:   { type: providerOverrideSchema, default: () => ({}) },
        gemini:    { type: providerOverrideSchema, default: () => ({}) },
        custom:    { type: providerOverrideSchema, default: () => ({}) },
      } as any,
      required: true,
      default: () => ({
        anthropic: { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
        openai:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
        xai:       { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
        minimax:   { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
        gemini:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
        custom:    { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] },
      }),
    },

    features: {
      type: Object,
      required: true,
      default: () => ({
        duplicateDetection:  { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 1024 },
        knowledgeExtraction: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 2048 },
        searchSummarization: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 },
        faqGeneration:       { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.4, maxTokens: 1024 },
      }),
    },

    embedding: {
      type: {
        provider: { type: Schema.Types.String, enum: ['local', 'huggingface', 'openai', 'custom'], default: 'local' },
        model: { type: Schema.Types.String, default: 'mixedbread-ai/mxbai-embed-large-v1' },
        dimensions: { type: Number, default: 1024 },
        apiKeyCipher: { type: Schema.Types.String, default: '' },
        baseURL: { type: Schema.Types.String, default: '' },
      },
      required: true,
      default: () => ({
        provider: 'local',
        model: 'mixedbread-ai/mxbai-embed-large-v1',
        dimensions: 1024,
        apiKeyCipher: '',
        baseURL: '',
      }),
    },

    usage: {
      totalRequests:       { type: Number, default: 0 },
      totalEstimatedCost:  { type: Number, default: 0 },
      lastResetAt:         { type: Date, default: Date.now },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: { updatedAt: true } }
);

// v1.69 — Phase 4: invariant is "at most one active per (batchId)".
// When this doc is saved with isActive:true, deactivate any other
// active docs in the SAME (batchId) bucket (either null or this
// doc's batchId), but NOT docs in other buckets.
aiConfigSchema.pre('save', function (next) {
  if (this.isActive) {
    const self = this as unknown as IAiConfig;
    const bucket: Record<string, unknown> = { _id: { $ne: self._id }, isActive: true };
    if (self.batchId) bucket.batchId = self.batchId;
    else bucket.batchId = null;
    AiConfig.updateMany(bucket, { isActive: false }).catch((err) => {
      logger.warn(`[AiConfig] Failed to deactivate other configs in same bucket: ${(err as Error).message}`);
    });
  }
  next();
});

// v1.69 — Phase 4: partial unique index. There can be at most
// one doc per (batchId, isActive:true) pair. The partial filter
// means (batchId:null, isActive:false) docs are not constrained,
// so historical inactive configs are kept for audit.
aiConfigSchema.index(
  { batchId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// ── Method implementations ─────────────────────────────────────────────────

/**
 * v1.83 — Promote a legacy `apiKeyCipher` into `keys[]` on read.
 * Idempotent: returns the array as-is if it's already populated,
 * or synthesises a single "Primary" entry from the legacy field
 * when present. The lazy promotion happens inside the read paths
 * so callers (provider-resolver, ai-client, ai-config controller)
 * never have to care about the legacy shape. Callers that persist
 * the document (admin endpoints) are responsible for clearing
 * `apiKeyCipher` on the next write.
 */
function ensureKeysArray(self: IAiConfig, provider: AIProviderType): IProviderKey[] {
  const slot = self.providers?.[provider];
  if (!slot) return [];
  if (Array.isArray(slot.keys) && slot.keys.length > 0) return slot.keys;
  // Legacy promotion — synthesise a single key from apiKeyCipher.
  if (slot.apiKeyCipher) {
    return [{
      label: 'Primary',
      valueEnc: slot.apiKeyCipher,
      baseURL: slot.baseURL || '',
      unhealthyUntil: null,
    }];
  }
  return [];
}

aiConfigSchema.methods.getApiKey = function (provider: AIProviderType): string | null {
  const self = this as unknown as IAiConfig;
  const cipher = self.providers?.[provider]?.apiKeyCipher;
  if (!cipher) return null;
  try {
    return decrypt(cipher);
  } catch (err) {
    logger.warn(`[AiConfig] Failed to decrypt API key for provider ${provider}: ${(err as Error).message}`);
    return null;
  }
};

aiConfigSchema.methods.setApiKey = function (provider: AIProviderType, plainKey: string) {
  const self = this as unknown as IAiConfig;
  if (!self.providers) self.providers = {} as any;
  if (!self.providers[provider]) {
    self.providers[provider] = { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] } as IProviderOverride;
  }
  self.providers[provider].apiKeyCipher = plainKey ? encrypt(plainKey) : '';
};

/**
 * v1.83 — Return the full list of encrypted key slots for a
 * provider, lazily promoting from `apiKeyCipher` if `keys[]`
 * is empty. Used by provider-resolver and the admin reveal
 * endpoint. The returned array is the live sub-document array;
 * callers that need to mutate should make a copy first.
 */
aiConfigSchema.methods.getApiKeys = function (provider: AIProviderType): IProviderKey[] {
  return ensureKeysArray(this as unknown as IAiConfig, provider);
};

aiConfigSchema.methods.getEmbeddingApiKey = function (): string | null {
  const cipher = (this as unknown as IAiConfig).embedding?.apiKeyCipher;
  if (!cipher) return null;
  try {
    return decrypt(cipher);
  } catch (err) {
    logger.warn(`[AiConfig] Failed to decrypt embedding API key: ${(err as Error).message}`);
    return null;
  }
};

aiConfigSchema.methods.setEmbeddingApiKey = function (plainKey: string) {
  const self = this as unknown as IAiConfig;
  if (!self.embedding) {
    self.embedding = { provider: 'local', model: 'mixedbread-ai/mxbai-embed-large-v1', dimensions: 1024, apiKeyCipher: '', baseURL: '' };
  }
  self.embedding.apiKeyCipher = plainKey ? encrypt(plainKey) : '';
};

/**
 * Public summary — explicitly strips plaintext.
 * v1.83 — exposes `keyCount: number` (number of configured keys
 * for each provider). No `value`/`valueEnc` ever leaves this
 * method. Admins who need plaintext fetch it via the dedicated
 * reveal endpoint, which is logged.
 */
aiConfigSchema.methods.publicView = function () {
  const self = this as unknown as IAiConfig;
  const obj = self.toObject();
  const view: Record<string, {
    hasKey: boolean;
    keyCount: number;
    baseURL: string;
    model: string;
    customModelField: string;
  }> = {};
  for (const p of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[]) {
    const prov = obj.providers?.[p] ?? { apiKeyCipher: '', baseURL: '', model: '', customModelField: '', keys: [] };
    // Prefer the new keys[] for the truth on presence. Fall back
    // to the legacy single cipher for legacy docs.
    const keysArr: IProviderKey[] = Array.isArray(prov.keys) ? prov.keys : [];
    const hasLegacyCipher = !!prov.apiKeyCipher;
    const keyCount = keysArr.length > 0
      ? keysArr.filter((k) => !!(k?.valueEnc)).length
      : (hasLegacyCipher ? 1 : 0);
    view[p] = {
      hasKey: keyCount > 0,
      keyCount,
      baseURL: prov.baseURL ?? '',
      model: prov.model ?? '',
      customModelField: prov.customModelField ?? '',
    };
  }
  return {
    ...obj,
    providers: view,
    embedding: {
      provider: obj.embedding?.provider || 'local',
      model: obj.embedding?.model || 'mixedbread-ai/mxbai-embed-large-v1',
      dimensions: obj.embedding?.dimensions || 1024,
      baseURL: obj.embedding?.baseURL || '',
      hasKey: !!obj.embedding?.apiKeyCipher,
    }
  };
};

const AiConfig = mongoose.model<IAiConfig>('AiConfig', aiConfigSchema, 'yaksha_faq_ai_config');

export default AiConfig;
