/**
 * services/ai/provider-resolver.service.ts — Phase 1 R5 (partial).
 *
 * Consolidates the per-program AI provider + model + temperature +
 * maxTokens resolution that was duplicated across the 5 LLM call
 * sites. The audit (docs/redesign-plan.md §2.4 R5) called for "one
 * AIClient interface, one ProviderRegistry, one
 * resolveProvider({ feature, batchId })". The minimal step: a
 * resolver service that returns a fully-resolved provider config,
 * honouring per-program overrides → global default → env fallback.
 *
 * The 5 existing call sites are NOT refactored here — that is a
 * follow-up PR (mechanical, but wide scope). This commit ships the
 * resolver so future call-site migrations are easy.
 */
import { Types } from 'mongoose';
import AiConfig from '../../modules/ai/ai-config.model.js';
import { resolveProviderAsync, getModelForProvider } from '../../utils/ai/aiProvider.js';
import { adminLog } from '../../utils/http/logger.js';

export type AIFeature =
  | 'duplicateDetection'
  | 'knowledgeExtraction'
  | 'searchSummarization'
  | 'faqGeneration';

export type AIProvider =
  | 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

export interface ResolvedProviderConfig {
  provider: AIProvider;
  model: string;
  apiKeyField: string;
  baseURL: string;
  authHeader: string;
  needsAnthropicVersion: boolean;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  source: 'db:program' | 'db:global' | 'env';
  dbConfig: Awaited<ReturnType<typeof AiConfig.findOne>> | null;
}

const FEATURE_ENABLED_DEFAULTS: Record<AIFeature, boolean> = {
  duplicateDetection: true,
  faqGeneration: true,
  knowledgeExtraction: true,
  searchSummarization: true,
};

class AIProviderResolverService {
  async resolve(opts: {
    feature: AIFeature;
    batchId?: Types.ObjectId | string | null;
  }): Promise<ResolvedProviderConfig> {
    const { feature, batchId: rawBatchId } = opts;
    const batchId = rawBatchId == null
      ? null
      : new Types.ObjectId(String(rawBatchId));

    let dbConfig = await AiConfig.findOne({
      batchId: batchId,
      isActive: true,
    }).lean();
    if (!dbConfig && batchId) {
      dbConfig = await AiConfig.findOne({
        batchId: null,
        isActive: true,
      }).lean();
    }
    const source: ResolvedProviderConfig['source'] = dbConfig
      ? (dbConfig.batchId ? 'db:program' : 'db:global')
      : 'env';

    const requestedProvider = dbConfig?.activeProvider;
    const config = await resolveProviderAsync(requestedProvider);

    if (!config.apiKey) {
      adminLog.warn(
        `[aiProviderResolver] No API key for provider '${config.provider}'. ` +
          'Set one of ANTHROPIC_API_KEY / OPENAI_API_KEY / XAI_API_KEY / MINIMAX_API_KEY.',
      );
    }

    const featureConfig = dbConfig?.features?.[feature];
    const rawModel = featureConfig?.model || config.model;
    const model = getModelForProvider(rawModel, config.provider, config.model);
    if (!model) {
      throw new Error(
        `No AI model configured for provider '${config.provider}' on feature '${feature}'. ` +
          `Configure a model in Admin Settings.`,
      );
    }
    const temperature = featureConfig?.temperature ?? 0.3;
    const maxTokens = featureConfig?.maxTokens ?? 1024;
    const enabled = featureConfig?.enabled ?? FEATURE_ENABLED_DEFAULTS[feature];

    return {
      provider: config.provider,
      model,
      apiKeyField: config.apiKey,
      baseURL: config.baseURL,
      authHeader: config.authHeader,
      needsAnthropicVersion: config.needsAnthropicVersion,
      temperature,
      maxTokens,
      enabled,
      source,
      dbConfig: dbConfig ?? null,
    };
  }
}

export const aiProviderResolver = new AIProviderResolverService();
