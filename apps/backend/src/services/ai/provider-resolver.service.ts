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
 *
 * v1.83 — Multi-API-key rotation. The resolver now also returns
 *   candidates: Array<{ key, baseURL, authHeader, label }>
 * with each candidate representing one healthy (non-unhealthy)
 * configured key. Callers that only read `apiKey` keep working
 * (the first healthy candidate is exposed as `apiKey`). The
 * ai-client uses the array to rotate on 429 rate-limit failures.
 */
import { Types } from 'mongoose';
import AiConfig, { type IProviderKey } from '../../modules/ai/ai-config.model.js';
import { resolveProviderAsync, getModelForProvider } from '../../utils/ai/aiProvider.js';
import { adminLog } from '../../utils/http/logger.js';
import { decrypt } from '../../utils/auth/crypto.js';

export type AIFeature =
  | 'duplicateDetection'
  | 'knowledgeExtraction'
  | 'searchSummarization'
  | 'faqGeneration';

export type AIProvider =
  | 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';

export interface ProviderCandidate {
  /** Plaintext API key value for the candidate slot. */
  key: string;
  /** Per-candidate baseURL override; falls back to provider default. */
  baseURL: string;
  authHeader: 'x-api-key' | 'Authorization';
  label: string;
}

/**
 * Resolved provider config — backward compatible.
 *
 * `apiKey` is now the first candidate's key (was the single
 * resolved value before v1.83). Callers reading `apiKey` only get
 * the same single value they did before. New callers should read
 * `candidates` and rotate on demand.
 */
export interface ResolvedProviderConfig {
  provider: AIProvider;
  modelName: string;
  apiKeyField: string;
  baseURL: string;
  authHeader: string;
  needsAnthropicVersion: boolean;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  source: 'db:program' | 'db:global' | 'env';
  dbConfig: Awaited<ReturnType<typeof AiConfig.findOne>> | null;
  /** Convenience alias for `apiKeyField`. Matches the v1.83+ AI result shape. */
  apiKey: string;
  /**
   * v1.83 — ordered list of healthy (non-unhealthy) key candidates.
   * Always at least one entry when `apiKey` is non-empty. Unhealthy
   * keys (unhealthyUntil > now) are filtered out so ai-client can
   * skip straight to a working key without retrying on the same one.
   */
  candidates: ProviderCandidate[];
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
    const rawModel = featureConfig?.model || config.modelName;
    const model = getModelForProvider(rawModel, config.provider, config.modelName);
    if (!model) {
      throw new Error(
        `No AI model configured for provider '${config.provider}' on feature '${feature}'. ` +
          `Configure a model in Admin Settings.`,
      );
    }
    const temperature = featureConfig?.temperature ?? 0.3;
    const maxTokens = featureConfig?.maxTokens ?? 1024;
    const enabled = featureConfig?.enabled ?? FEATURE_ENABLED_DEFAULTS[feature];

    // v1.83 — build candidates[] from the per-provider keys[].
    // We read the live mongoose doc (not the .lean() version above) so the
    // helper getApiKeys() handles the legacy apiKeyCipher lazy promotion.
    const authHeader = (config.authHeader === 'x-api-key' ? 'x-api-key' : 'Authorization') as 'x-api-key' | 'Authorization';
    const candidates = await this.buildCandidates(config.provider, config.baseURL, authHeader);

    // Back-compat: existing callers that only read apiKeyField / apiKey
    // get the first healthy candidate (or the resolved value when no
    // multi-key config exists).
    const apiKey = candidates.length > 0
      ? candidates[0].key
      : config.apiKey;

    return {
      provider: config.provider,
      modelName: model,
      apiKeyField: apiKey,
      apiKey,
      baseURL: config.baseURL,
      authHeader: config.authHeader,
      needsAnthropicVersion: config.needsAnthropicVersion,
      temperature,
      maxTokens,
      enabled,
      source,
      dbConfig: dbConfig ?? null,
      candidates,
    };
  }

  /**
   * v1.83 — Build the candidates[] list for a provider. Reads the
   * current global AiConfig doc (the same one that backs
   * resolveProviderAsync), iterates `providers.<p>.keys`, drops
   * entries with `unhealthyUntil > now`, decrypts each value,
   * and emits an ordered array. When the doc has no `keys[]`
   * but a legacy `apiKeyCipher`, that legacy value is surfaced
   * as a single Primary candidate.
   */
  private async buildCandidates(
    provider: AIProvider,
    fallbackBaseURL: string,
    authHeader: 'x-api-key' | 'Authorization'
  ): Promise<ProviderCandidate[]> {
    const out: ProviderCandidate[] = [];
    try {
      const cfg = await AiConfig.findOne({ isActive: true, batchId: null });
      const slot = cfg?.providers?.[provider];
      if (!slot) return out;

      const now = Date.now();
      // Live mongoose doc so getApiKeys() does the legacy promotion.
      let rawKeys: IProviderKey[] = [];
      if (cfg) {
        try {
          rawKeys = (cfg as any).getApiKeys(provider);
        } catch {
          rawKeys = Array.isArray((slot as any).keys) ? ((slot as any).keys as IProviderKey[]) : [];
        }
      }

      const defaultBaseURL = (slot as any).baseURL || fallbackBaseURL;

      for (const k of rawKeys) {
        if (!k || !k.valueEnc) continue;
        const until = k.unhealthyUntil ? new Date(k.unhealthyUntil).getTime() : 0;
        if (until > now) continue; // Skip keys marked unhealthy.
        let plain = '';
        try {
          plain = decrypt(k.valueEnc);
        } catch (err) {
          adminLog.warn(
            `[aiProviderResolver] Failed to decrypt candidate key "${k.label}" for ${provider}: ${(err as Error).message}. Skipping.`
          );
          continue;
        }
        if (!plain) continue;
        out.push({
          key: plain,
          baseURL: (k.baseURL && k.baseURL.length > 0) ? k.baseURL : defaultBaseURL,
          authHeader,
          label: k.label || 'Key',
        });
      }
    } catch (err) {
      adminLog.warn(
        `[aiProviderResolver] buildCandidates failed for ${provider}: ${(err as Error).message}. Falling back to resolved single key.`
      );
    }
    return out;
  }
}

export const aiProviderResolver = new AIProviderResolverService();
