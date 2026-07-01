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
 */
import mongoose, { Schema } from 'mongoose';
import { encrypt, decrypt } from '../utils/auth/crypto.js';
import { logger } from '../utils/http/logger.js';
const providerOverrideSchema = new Schema({
    apiKeyCipher: { type: String, default: '' },
    baseURL: { type: String, default: '' },
    model: { type: String, default: '' },
}, { _id: false });
const aiConfigSchema = new Schema({
    // v1.69 — Phase 4: per-program override scoping. null = global.
    batchId: {
        type: Schema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
    activeProvider: {
        type: String,
        enum: ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'],
        required: true,
        default: 'anthropic',
    },
    providers: {
        type: {
            anthropic: { type: providerOverrideSchema, default: () => ({}) },
            openai: { type: providerOverrideSchema, default: () => ({}) },
            xai: { type: providerOverrideSchema, default: () => ({}) },
            minimax: { type: providerOverrideSchema, default: () => ({}) },
            gemini: { type: providerOverrideSchema, default: () => ({}) },
            custom: { type: providerOverrideSchema, default: () => ({}) },
        },
        required: true,
        default: () => ({
            anthropic: { apiKeyCipher: '', baseURL: '', model: '' },
            openai: { apiKeyCipher: '', baseURL: '', model: '' },
            xai: { apiKeyCipher: '', baseURL: '', model: '' },
            minimax: { apiKeyCipher: '', baseURL: '', model: '' },
            gemini: { apiKeyCipher: '', baseURL: '', model: '' },
            custom: { apiKeyCipher: '', baseURL: '', model: '' },
        }),
    },
    features: {
        type: Object,
        required: true,
        default: () => ({
            duplicateDetection: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 1024 },
            knowledgeExtraction: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 2048 },
            searchSummarization: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 },
            faqGeneration: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.4, maxTokens: 1024 },
        }),
    },
    usage: {
        totalRequests: { type: Number, default: 0 },
        totalEstimatedCost: { type: Number, default: 0 },
        lastResetAt: { type: Date, default: Date.now },
    },
    isActive: { type: Boolean, default: true },
}, { timestamps: { updatedAt: true } });
// v1.69 — Phase 4: invariant is "at most one active per (batchId)".
// When this doc is saved with isActive:true, deactivate any other
// active docs in the SAME (batchId) bucket (either null or this
// doc's batchId), but NOT docs in other buckets.
aiConfigSchema.pre('save', function (next) {
    if (this.isActive) {
        const self = this;
        const bucket = { _id: { $ne: self._id }, isActive: true };
        if (self.batchId)
            bucket.batchId = self.batchId;
        else
            bucket.batchId = null;
        AiConfig.updateMany(bucket, { isActive: false }).catch((err) => {
            logger.warn(`[AiConfig] Failed to deactivate other configs in same bucket: ${err.message}`);
        });
    }
    next();
});
// v1.69 — Phase 4: partial unique index. There can be at most
// one doc per (batchId, isActive:true) pair. The partial filter
// means (batchId:null, isActive:false) docs are not constrained,
// so historical inactive configs are kept for audit.
aiConfigSchema.index({ batchId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
// ── Method implementations ─────────────────────────────────────────────────
aiConfigSchema.methods.getApiKey = function (provider) {
    const cipher = this.providers?.[provider]?.apiKeyCipher;
    if (!cipher)
        return null;
    try {
        return decrypt(cipher);
    }
    catch (err) {
        logger.warn(`[AiConfig] Failed to decrypt API key for provider ${provider}: ${err.message}`);
        return null;
    }
};
aiConfigSchema.methods.setApiKey = function (provider, plainKey) {
    const self = this;
    if (!self.providers)
        self.providers = {};
    if (!self.providers[provider]) {
        self.providers[provider] = { apiKeyCipher: '', baseURL: '', model: '' };
    }
    self.providers[provider].apiKeyCipher = plainKey ? encrypt(plainKey) : '';
};
aiConfigSchema.methods.publicView = function () {
    const self = this;
    const obj = self.toObject();
    const view = {};
    for (const p of ['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom']) {
        const prov = obj.providers?.[p] ?? { apiKeyCipher: '', baseURL: '', model: '' };
        view[p] = {
            hasKey: !!prov.apiKeyCipher,
            baseURL: prov.baseURL ?? '',
            model: prov.model ?? '',
        };
    }
    return { ...obj, providers: view };
};
const AiConfig = mongoose.model('AiConfig', aiConfigSchema, 'yaksha_faq_ai_config');
export default AiConfig;
