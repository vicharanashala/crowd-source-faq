/**
 * AiSettings Admin Page
 *
 * Full management interface for AI configuration:
 * - Per-provider API key (encrypted at rest, reveal-on-demand)
 * - Per-provider base URL override (custom endpoints supported)
 * - Per-provider model override
 * - Per-feature model + temperature + max tokens
 * - Usage statistics and cost tracking
 * - Feature enable/disable toggles
 * - Provider health check
 *
 * Route: /admin/settings/ai
 *
 * API keys entered here override the env var of the same name.
 * Base URL overrides let you point any provider at a custom OpenAI-compatible endpoint
 * (e.g. self-hosted, MiniMax, or a proxy).
 */

import React, { useEffect, useState, useCallback } from 'react';
import adminApi from '../utils/adminApi';

interface ProviderOverride {
  hasKey: boolean;
  baseURL: string;
  model: string;
}

interface AiFeatureConfig {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface AiConfig {
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax';
  providers: {
    anthropic: ProviderOverride;
    openai: ProviderOverride;
    xai: ProviderOverride;
    minimax: ProviderOverride;
  };
  features: {
    duplicateDetection: AiFeatureConfig;
    knowledgeExtraction: AiFeatureConfig;
    searchSummarization: AiFeatureConfig;
    faqGeneration: AiFeatureConfig;
  };
  usage: {
    totalRequests: number;
    totalEstimatedCost: number;
    lastResetAt: string;
  };
  isActive: boolean;
}

const PROVIDER_META = {
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Best for complex reasoning and analysis',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    color: 'bg-purple-100 border-purple-300 text-purple-800',
    badgeColor: 'bg-purple-200 text-purple-800',
  },
  openai: {
    label: 'OpenAI GPT',
    description: 'Fast, cost-effective for most tasks',
    defaultModel: 'gpt-4o-mini',
    defaultBaseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    color: 'bg-green-100 border-green-300 text-green-800',
    badgeColor: 'bg-green-200 text-green-800',
  },
  xai: {
    label: 'xAI Grok',
    description: 'Strong reasoning with real-time data access',
    defaultModel: 'grok-3',
    defaultBaseURL: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai/',
    color: 'bg-orange-100 border-orange-300 text-orange-800',
    badgeColor: 'bg-orange-200 text-orange-800',
  },
  minimax: {
    label: 'MiniMax',
    description: 'Cost-effective multilingual support',
    defaultModel: 'MiniMax-Text-01',
    defaultBaseURL: 'https://api.minimax.io/v1',
    docsUrl: 'https://platform.minimax.io',
    color: 'bg-blue-100 border-blue-300 text-blue-800',
    badgeColor: 'bg-blue-200 text-blue-800',
  },
} as const;

const FEATURE_LABELS: Record<keyof AiConfig['features'], string> = {
  duplicateDetection: '🔍 Duplicate Detection',
  knowledgeExtraction: '📚 Knowledge Extraction',
  searchSummarization: '✨ Search Summarization',
  faqGeneration: '🤖 FAQ Generation',
};

type ProviderKey = keyof typeof PROVIDER_META;

export default function AdminAISettings() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Draft state for edits
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [features, setFeatures] = useState<AiConfig['features'] | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message: string } | null>(null);

  // Per-provider draft (apiKey + baseURL + model)
  const [providerDrafts, setProviderDrafts] = useState<Record<ProviderKey, { apiKey: string; baseURL: string; model: string; showKey: boolean; revealing: boolean }>>({
    anthropic: { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    openai:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    xai:       { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    minimax:   { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
  });
  const [savingProviderDraft, setSavingProviderDraft] = useState<ProviderKey | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await adminApi.get<AiConfig>('/admin/ai/config');
      const data = res.data;
      setConfig(data);
      setActiveProvider(data.activeProvider);
      setFeatures(data.features);

      // Seed provider drafts from server-side hasKey/baseURL/model
      // (we do NOT pull the api key itself — that requires the explicit reveal action)
      setProviderDrafts(prev => {
        const next = { ...prev };
        for (const p of ['anthropic', 'openai', 'xai', 'minimax'] as ProviderKey[]) {
          next[p] = {
            ...next[p],
            apiKey: '',  // always start blank; user must type to overwrite
            baseURL: data.providers[p]?.baseURL ?? '',
            model: data.providers[p]?.model ?? '',
          };
        }
        return next;
      });
    } catch {
      setError('Failed to load AI configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Feature handlers ──────────────────────────────────────────────────────

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => {
    if (!features) return;
    setFeatures((prev) => prev ? { ...prev, [feature]: { ...prev[feature], enabled: !prev[feature].enabled } } : prev);
    setHasChanges(true);
  };

  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => {
    if (!features) return;
    setFeatures((prev) => prev ? { ...prev, [feature]: { ...prev[feature], model } } : prev);
    setHasChanges(true);
  };

  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => {
    if (!features) return;
    setFeatures((prev) => prev ? { ...prev, [feature]: { ...prev[feature], temperature } } : prev);
    setHasChanges(true);
  };

  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => {
    if (!features) return;
    setFeatures((prev) => prev ? { ...prev, [feature]: { ...prev[feature], maxTokens } } : prev);
    setHasChanges(true);
  };

  const handleSaveFeatures = async () => {
    if (!features) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.patch('/admin/ai/config', { features });
      setSuccess('AI feature settings saved.');
      setHasChanges(false);
      loadConfig();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  // ── Provider handlers ─────────────────────────────────────────────────────

  const handleSwitchProvider = async (provider: string) => {
    setSavingProvider(true);
    setError('');
    try {
      await adminApi.patch('/admin/ai/config', { activeProvider: provider });
      setActiveProvider(provider);
      setConfig((prev) => (prev ? { ...prev, activeProvider: provider as any } : prev));
      setSuccess(`Provider switched to ${PROVIDER_META[provider as keyof typeof PROVIDER_META].label}.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to switch provider.');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleResetUsage = async () => {
    if (!confirm('Reset usage statistics? This cannot be undone.')) return;
    try {
      await adminApi.post('/admin/ai/config/reset-usage');
      loadConfig();
      setSuccess('Usage statistics reset.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to reset usage.');
    }
  };

  const handleTestProvider = async (provider: string) => {
    setTestingProvider(provider);
    setTestResult(null);
    try {
      const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider } });
      setTestResult({ provider, ok: res.data.ok, message: res.data.message });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Connection failed';
      setTestResult({ provider, ok: false, message: msg });
    } finally {
      setTestingProvider(null);
    }
  };

  // ── Per-provider draft save ───────────────────────────────────────────────

  const handleSaveProviderDraft = async (provider: ProviderKey) => {
    const draft = providerDrafts[provider];
    setSavingProviderDraft(provider);
    setError('');
    try {
      const body: Record<string, unknown> = {
        providers: {
          [provider]: {
            baseURL: draft.baseURL,
            model: draft.model,
            // Only send apiKey if user actually typed something.
            // (Empty string would clear the stored key — see warning in UI.)
            ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
          },
        },
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`${PROVIDER_META[provider].label} configuration saved.`);
      // Clear the apiKey field after save (no longer needed; stored on server)
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000);
      loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save provider configuration.');
    } finally {
      setSavingProviderDraft(null);
    }
  };

  const handleClearApiKey = async (provider: ProviderKey) => {
    if (!confirm(`Clear the stored API key for ${PROVIDER_META[provider].label}?\n\nThe system will fall back to the env var (${({anthropic:'ANTHROPIC_API_KEY',openai:'OPENAI_API_KEY',xai:'XAI_API_KEY',minimax:'MINIMAX_API_KEY'})[provider]}) or be unconfigured.`)) return;
    setSavingProviderDraft(provider);
    setError('');
    try {
      await adminApi.patch('/admin/ai/config', { providers: { [provider]: { apiKey: '' } } });
      setSuccess(`${PROVIDER_META[provider].label} API key cleared.`);
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000);
      loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to clear API key.');
    } finally {
      setSavingProviderDraft(null);
    }
  };

  const handleRevealApiKey = async (provider: ProviderKey) => {
    setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: true } }));
    try {
      const res = await adminApi.get<{ apiKey: string | null }>(`/admin/ai/config/api-key/${provider}`);
      const key = res.data.apiKey;
      if (key) {
        setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: key, showKey: true, revealing: false } }));
      } else {
        setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } }));
        setError(`${PROVIDER_META[provider].label} has no API key configured in the dashboard. (Check the env var as a fallback.)`);
        setTimeout(() => setError(''), 4000);
      }
    } catch {
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } }));
      setError('Failed to reveal API key.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="h-8 w-48 bg-admin-surface rounded animate-pulse" />
        <div className="h-64 bg-admin-card rounded-xl border border-white/5 animate-pulse" />
      </div>
    );
  }

  const currentMeta = PROVIDER_META[activeProvider as keyof typeof PROVIDER_META];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-admin-text">AI Settings</h2>
        <p className="text-sm text-admin-muted mt-0.5">
          Configure AI providers, API keys, custom endpoints, and per-feature parameters.
        </p>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <span className="text-base">✓</span> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span className="text-base">✕</span> {error}
        </div>
      )}

      {/* ── Active Provider ─────────────────────────────────────────── */}
      <div className="bg-admin-card border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-admin-bg/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-admin-text">Active Provider</p>
              <p className="text-xs text-admin-muted mt-0.5">Click a provider to make it the default for all AI features.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${currentMeta.badgeColor}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {currentMeta.label}
            </span>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(PROVIDER_META) as Array<keyof typeof PROVIDER_META>).map((key) => {
            const meta = PROVIDER_META[key];
            const isActive = activeProvider === key;
            const override = config?.providers[key];
            const configured = !!override?.hasKey || !!override?.baseURL;
            return (
              <button
                key={key}
                onClick={() => !isActive && handleSwitchProvider(key)}
                disabled={savingProvider}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : 'border-white/5 hover:border-white/10 hover:bg-admin-bg'
                } ${savingProvider ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 text-accent text-xs font-bold">● Active</span>
                )}
                <p className="text-sm font-semibold text-admin-text">{meta.label}</p>
                <p className="text-xs text-admin-muted mt-0.5">{meta.description}</p>
                <p className="text-[10px] text-admin-muted mt-1 font-mono">{meta.defaultModel}</p>
                {configured && (
                  <p className="text-[10px] text-accent mt-1 font-semibold">Custom config set</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Per-Provider Configuration (API key, base URL, model) ──── */}
      <div className="bg-admin-card border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-admin-bg/50">
          <p className="text-sm font-semibold text-admin-text">Provider Credentials & Endpoints</p>
          <p className="text-xs text-admin-muted mt-0.5">
            Per-provider API keys are encrypted at rest. Base URL lets you point a provider at a custom endpoint.
            Leave any field blank to use the default.
          </p>
        </div>

        <div className="divide-y divide-white/5">
          {(Object.keys(PROVIDER_META) as ProviderKey[]).map((provider) => {
            const meta = PROVIDER_META[provider];
            const draft = providerDrafts[provider];
            const override = config?.providers[provider];
            const isSaving = savingProviderDraft === provider;
            return (
              <div key={provider} className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${meta.badgeColor}`}>
                    {meta.label}
                  </span>
                  {override?.hasKey && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-success font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Key stored
                    </span>
                  )}
                  {!override?.hasKey && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-admin-muted font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-admin-muted/30" />
                      No dashboard key (env var fallback)
                    </span>
                  )}
                </div>

                {/* API Key */}
                <div>
                  <label className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-admin-muted uppercase">API Key</span>
                    <div className="flex items-center gap-2 text-[10px]">
                      {override?.hasKey && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRevealApiKey(provider)}
                            disabled={draft.revealing}
                            className="text-accent hover:text-accent-dark font-medium disabled:opacity-50"
                          >
                            {draft.revealing ? 'Revealing…' : draft.showKey ? 'Hide' : 'Reveal'}
                          </button>
                          <span className="text-admin-muted">·</span>
                          <button
                            type="button"
                            onClick={() => handleClearApiKey(provider)}
                            disabled={isSaving}
                            className="text-danger hover:text-red-700 font-medium disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </label>
                  <div className="relative">
                    <input
                      type={draft.showKey ? 'text' : 'password'}
                      value={draft.apiKey}
                      onChange={(e) => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: e.target.value, showKey: true } }))}
                      placeholder={override?.hasKey ? '•••••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
                      autoComplete="off"
                      className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text font-mono focus:outline-none focus:border-admin-purple/50"
                    />
                  </div>
                  <p className="text-[10px] text-admin-muted mt-1">
                    Get a key: <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{meta.docsUrl.replace('https://', '')}</a>
                  </p>
                </div>

                {/* Base URL */}
                <div>
                  <label className="block text-[10px] font-semibold text-admin-muted uppercase mb-1">
                    Base URL <span className="text-[9px] text-admin-muted font-normal">(optional — leave blank for default)</span>
                  </label>
                  <input
                    type="text"
                    value={draft.baseURL}
                    onChange={(e) => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], baseURL: e.target.value } }))}
                    placeholder={meta.defaultBaseURL}
                    className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text font-mono focus:outline-none focus:border-admin-purple/50"
                  />
                  <p className="text-[10px] text-admin-muted mt-1">
                    Point at a proxy, self-hosted gateway, or OpenAI-compatible endpoint.
                  </p>
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[10px] font-semibold text-admin-muted uppercase mb-1">
                    Default Model <span className="text-[9px] text-admin-muted font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={draft.model}
                    onChange={(e) => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: e.target.value } }))}
                    placeholder={meta.defaultModel}
                    className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text font-mono focus:outline-none focus:border-admin-purple/50"
                  />
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleSaveProviderDraft(provider)}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Saving…' : `Save ${meta.label}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Usage Statistics ────────────────────────────────────────── */}
      <div className="bg-admin-card border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-admin-bg/50 flex items-center justify-between">
          <p className="text-sm font-semibold text-admin-text">Usage Statistics</p>
          <button
            onClick={handleResetUsage}
            className="text-xs text-admin-muted hover:text-red-500 transition-colors"
          >
            Reset stats
          </button>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-admin-bg rounded-xl">
            <p className="text-2xl font-bold text-admin-text">{config?.usage.totalRequests.toLocaleString() ?? 0}</p>
            <p className="text-xs text-admin-muted mt-0.5">Total Requests</p>
          </div>
          <div className="text-center p-3 bg-admin-bg rounded-xl">
            <p className="text-2xl font-bold text-admin-text">
              ${(config?.usage.totalEstimatedCost ?? 0).toFixed(4)}
            </p>
            <p className="text-xs text-admin-muted mt-0.5">Estimated Cost (USD)</p>
          </div>
          <div className="text-center p-3 bg-admin-bg rounded-xl">
            <p className="text-2xl font-bold text-admin-text">
              {config?.usage.lastResetAt
                ? new Date(config.usage.lastResetAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '—'}
            </p>
            <p className="text-xs text-admin-muted mt-0.5">Last Reset</p>
          </div>
        </div>
      </div>

      {/* ── Per-Feature Configuration ───────────────────────────────── */}
      <div className="bg-admin-card border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-admin-bg/50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-admin-text">Feature Configuration</p>
            <p className="text-xs text-admin-muted mt-0.5">Per-feature model selection and parameters.</p>
          </div>
          <button
            onClick={handleSaveFeatures}
            disabled={saving || !hasChanges}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {features && (
          <div className="divide-y divide-white/5">
            {(Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>).map((feature) => {
              const f = features[feature];
              const meta = PROVIDER_META[activeProvider as keyof typeof PROVIDER_META];
              return (
                <div key={feature} className="p-5 space-y-3">
                  {/* Feature header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-admin-text">{FEATURE_LABELS[feature]}</p>
                      <p className="text-xs text-admin-muted">
                        {feature === 'duplicateDetection' && 'Blocks duplicate posts before creation'}
                        {feature === 'knowledgeExtraction' && 'Extracts Q&A pairs from transcripts and posts'}
                        {feature === 'searchSummarization' && 'Generates concise answers from search results'}
                        {feature === 'faqGeneration' && 'Drafts official FAQ entries from community posts'}
                      </p>
                    </div>
                    <Toggle
                      checked={f.enabled}
                      onChange={() => handleFeatureToggle(feature)}
                    />
                  </div>

                  {/* Model + parameters */}
                  <div className={`grid grid-cols-3 gap-3 ${f.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div>
                      <label className="block text-[10px] font-semibold text-admin-muted uppercase mb-1">Model</label>
                      <input
                        type="text"
                        value={f.model}
                        onChange={(e) => handleModelChange(feature, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text focus:outline-none focus:border-admin-purple/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-admin-muted uppercase mb-1">
                        Temperature <span className="text-[9px] text-admin-muted">(0–1)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={Number(f.temperature.toFixed(2))}
                        onChange={(e) => handleTempChange(feature, parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text focus:outline-none focus:border-admin-purple/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-admin-muted uppercase mb-1">Max Tokens</label>
                      <input
                        type="number"
                        min="64"
                        max="8192"
                        step="64"
                        value={f.maxTokens}
                        onChange={(e) => handleMaxTokensChange(feature, parseInt(e.target.value) || 1024)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-white/5 bg-admin-card text-admin-text focus:outline-none focus:border-admin-purple/50"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── API Health Check ────────────────────────────────────────── */}
      <div className="bg-admin-card border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-admin-bg/50 flex items-center justify-between">
          <p className="text-sm font-semibold text-admin-text">Provider Health</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PROVIDER_META) as Array<keyof typeof PROVIDER_META>).map((key) => {
              const isActive = activeProvider === key;
              const isTesting = testingProvider === key;
              const resultForProvider = testResult?.provider === key ? testResult : null;
              return (
                <div
                  key={key}
                  className={`p-3 rounded-xl border ${isActive ? 'border-accent bg-accent/5' : 'border-white/5'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent' : 'bg-admin-muted/30'}`} />
                    <p className="text-xs font-medium text-admin-text">{PROVIDER_META[key].label}</p>
                    {isActive && (
                      <span className="ml-auto text-[9px] font-bold text-accent uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  <p className="text-[10px] text-admin-muted mt-1 font-mono">
                    {isActive ? 'Configured' : 'Not active'}
                  </p>
                  {resultForProvider && (
                    <p className={`text-[10px] mt-1.5 font-semibold ${resultForProvider.ok ? 'text-success' : 'text-danger'}`}>
                      {resultForProvider.ok ? '✓ Connected' : `✕ ${resultForProvider.message}`}
                    </p>
                  )}
                  <button
                    onClick={() => handleTestProvider(key)}
                    disabled={isTesting}
                    className="mt-2 text-[10px] text-accent hover:text-accent-dark font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    {isTesting ? (
                      <>
                        <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                        Testing…
                      </>
                    ) : (
                      <>Test connection</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 ${
        checked ? 'bg-accent' : 'bg-admin-surface'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={disabled}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-admin-card shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
