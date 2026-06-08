/**
 * AiConfig Model
 *
 * Stores the AI configuration for the application.
 * Only ONE active config document should exist at any time.
 * Admin-only access via the AI Settings page.
 *
 * This replaces the ad-hoc provider detection in duplicateDetector.ts
 * and knowledgeBase.ts with a unified, admin-configurable AI layer.
 *
 * Per-provider API keys and base URLs can be set:
 *   - by the admin via the dashboard (stored encrypted in this document), or
 *   - via env vars (used as fallback if the dashboard value is empty)
 *
 * The runtime resolver (utils/aiProvider.ts) checks the DB first, then env.
 */

import mongoose, { Schema, type Document } from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export type AIProviderType = 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

export interface IProviderOverride {
  // Encrypted at rest. Empty string = "use env var" (or "not configured").
  apiKeyCipher: string;
  // Custom base URL. Empty string = "use provider default".
  baseURL: string;
  // Per-provider model override. Empty string = "use provider default".
  model: string;
}

export interface IAiConfig extends Document {
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
  publicView(): Record<string, unknown>;
}

const providerOverrideSchema = new Schema<IProviderOverride>(
  {
    apiKeyCipher: { type: String, default: '' },
    baseURL:      { type: String, default: '' },
    model:        { type: String, default: '' },
  },
  { _id: false }
);

const aiConfigSchema = new Schema<IAiConfig>(
  {
    activeProvider: {
      type: String,
      enum: ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[],
      required: true,
      default: 'anthropic',
    },

    providers: {
      type: {
        anthropic: { type: providerOverrideSchema, default: () => ({}) },
        openai:    { type: providerOverrideSchema, default: () => ({}) },
        xai:       { type: providerOverrideSchema, default: () => ({}) },
        minimax:   { type: providerOverrideSchema, default: () => ({}) },
        gemini:    { type: providerOverrideSchema, default: () => ({}) },
        custom:    { type: providerOverrideSchema, default: () => ({}) },
      },
      required: true,
      default: () => ({
        anthropic: { apiKeyCipher: '', baseURL: '', model: '' },
        openai:    { apiKeyCipher: '', baseURL: '', model: '' },
        xai:       { apiKeyCipher: '', baseURL: '', model: '' },
        minimax:   { apiKeyCipher: '', baseURL: '', model: '' },
        gemini:    { apiKeyCipher: '', baseURL: '', model: '' },
        custom:    { apiKeyCipher: '', baseURL: '', model: '' },
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

    usage: {
      totalRequests:       { type: Number, default: 0 },
      totalEstimatedCost:  { type: Number, default: 0 },
      lastResetAt:         { type: Date, default: Date.now },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: { updatedAt: true } }
);

// Only one active config at a time
aiConfigSchema.pre('save', function (next) {
  if (this.isActive) {
    AiConfig.updateMany({ _id: { $ne: this._id } }, { isActive: false }).catch((err) => {
      logger.warn(`[AiConfig] Failed to deactivate other configurations on pre-save: ${(err as Error).message}`);
    });
  }
  next();
});

// ── Method implementations ─────────────────────────────────────────────────

aiConfigSchema.methods.getApiKey = function (provider: AIProviderType): string | null {
  const cipher = (this as unknown as IAiConfig).providers?.[provider]?.apiKeyCipher;
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
    self.providers[provider] = { apiKeyCipher: '', baseURL: '', model: '' } as IProviderOverride;
  }
  self.providers[provider].apiKeyCipher = plainKey ? encrypt(plainKey) : '';
};

aiConfigSchema.methods.publicView = function () {
  const self = this as unknown as IAiConfig;
  const obj = self.toObject();
  const view: Record<string, { hasKey: boolean; baseURL: string; model: string }> = {};
  for (const p of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as AIProviderType[]) {
    const prov = obj.providers?.[p] ?? { apiKeyCipher: '', baseURL: '', model: '' };
    view[p] = {
      hasKey: !!prov.apiKeyCipher,
      baseURL: prov.baseURL ?? '',
      model: prov.model ?? '',
    };
  }
  return { ...obj, providers: view };
};

const AiConfig = mongoose.model<IAiConfig>('AiConfig', aiConfigSchema, 'yaksha_faq_ai_config');

export default AiConfig;
