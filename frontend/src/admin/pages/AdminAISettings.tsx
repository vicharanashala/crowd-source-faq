/**
 * AiSettings Admin Page
 *
 * Full management interface for AI configuration:
 * - Provider selection (Anthropic / OpenAI / xAI / MiniMax)
 * - Per-feature model and parameters
 * - Usage statistics and cost tracking
 * - Feature enable/disable toggles
 *
 * Route: /admin/settings/ai
 */

import React, { useEffect, useState, useCallback } from 'react';
import adminApi from '../utils/adminApi';

interface AiFeatureConfig {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface AiConfig {
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax';
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
    color: 'bg-purple-100 border-purple-300 text-purple-800',
    badgeColor: 'bg-purple-200 text-purple-800',
  },
  openai: {
    label: 'OpenAI GPT',
    description: 'Fast, cost-effective for most tasks',
    defaultModel: 'gpt-4o-mini',
    color: 'bg-green-100 border-green-300 text-green-800',
    badgeColor: 'bg-green-200 text-green-800',
  },
  xai: {
    label: 'xAI Grok',
    description: 'Strong reasoning with real-time data access',
    defaultModel: 'grok-3',
    color: 'bg-orange-100 border-orange-300 text-orange-800',
    badgeColor: 'bg-orange-200 text-orange-800',
  },
  minimax: {
    label: 'MiniMax',
    description: 'Cost-effective multilingual support',
    defaultModel: 'MiniMax-Text-01',
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

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
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
        checked ? 'bg-accent' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={disabled}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

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

  const loadConfig = useCallback(async () => {
    try {
      const res = await adminApi.get<AiConfig>('/admin/ai/config');
      const data = res.data;
      setConfig(data);
      setActiveProvider(data.activeProvider);
      setFeatures(data.features);
    } catch {
      setError('Failed to load AI configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => {
    if (!features) return;
    setFeatures((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [feature]: {
          ...prev[feature],
          enabled: !prev[feature].enabled,
        },
      };
    });
    setHasChanges(true);
  };

  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => {
    if (!features) return;
    setFeatures((prev) => {
      if (!prev) return prev;
      return { ...prev, [feature]: { ...prev[feature], model } };
    });
    setHasChanges(true);
  };

  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => {
    if (!features) return;
    setFeatures((prev) => {
      if (!prev) return prev;
      return { ...prev, [feature]: { ...prev[feature], temperature } };
    });
    setHasChanges(true);
  };

  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => {
    if (!features) return;
    setFeatures((prev) => {
      if (!prev) return prev;
      return { ...prev, [feature]: { ...prev[feature], maxTokens } };
    });
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
      const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', {
        params: { provider },
      });
      setTestResult({ provider, ok: res.data.ok, message: res.data.message });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Connection failed';
      setTestResult({ provider, ok: false, message: msg });
    } finally {
      setTestingProvider(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-white rounded-xl border border-gray-200 animate-pulse" />
      </div>
    );
  }

  const currentMeta = PROVIDER_META[activeProvider as keyof typeof PROVIDER_META];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">AI Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure AI providers, per-feature parameters, and monitor usage.
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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">AI Provider</p>
              <p className="text-xs text-gray-500 mt-0.5">API keys are stored in environment variables, not in the database.</p>
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
            return (
              <button
                key={key}
                onClick={() => !isActive && handleSwitchProvider(key)}
                disabled={savingProvider}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                } ${savingProvider ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 text-accent text-xs font-bold">● Active</span>
                )}
                <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">{meta.defaultModel}</p>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 bg-amber-50/50 border-t border-amber-100">
          <p className="text-xs text-amber-700">
            <span className="font-medium">Note:</span> To change providers, add the new API key to your <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file and restart the server.
            The key is validated on first AI request.
          </p>
        </div>
      </div>

      {/* ── Usage Statistics ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Usage Statistics</p>
          <button
            onClick={handleResetUsage}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            Reset stats
          </button>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-gray-900">{config?.usage.totalRequests.toLocaleString() ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Requests</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-gray-900">
              ${(config?.usage.totalEstimatedCost ?? 0).toFixed(4)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Estimated Cost (USD)</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-gray-900">
              {config?.usage.lastResetAt
                ? new Date(config.usage.lastResetAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Last Reset</p>
          </div>
        </div>
      </div>

      {/* ── Per-Feature Configuration ───────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Feature Configuration</p>
            <p className="text-xs text-gray-500 mt-0.5">Per-feature model selection and parameters.</p>
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
          <div className="divide-y divide-gray-50">
            {(Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>).map((feature) => {
              const f = features[feature];
              const meta = PROVIDER_META[activeProvider as keyof typeof PROVIDER_META];
              return (
                <div key={feature} className="p-5 space-y-3">
                  {/* Feature header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{FEATURE_LABELS[feature]}</p>
                      <p className="text-xs text-gray-500">
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
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Model</label>
                      <input
                        type="text"
                        value={f.model}
                        onChange={(e) => handleModelChange(feature, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">
                        Temperature <span className="text-[9px] text-gray-400">(0–1)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={Number(f.temperature.toFixed(2))}
                        onChange={(e) => handleTempChange(feature, parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Tokens</label>
                      <input
                        type="number"
                        min="64"
                        max="8192"
                        step="64"
                        value={f.maxTokens}
                        onChange={(e) => handleMaxTokensChange(feature, parseInt(e.target.value) || 1024)}
                        className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-gray-400"
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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Provider Health</p>
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
                  className={`p-3 rounded-xl border ${isActive ? 'border-accent bg-accent/5' : 'border-gray-100'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent' : 'bg-gray-300'}`} />
                    <p className="text-xs font-medium text-gray-700">{PROVIDER_META[key].label}</p>
                    {isActive && (
                      <span className="ml-auto text-[9px] font-bold text-accent uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 font-mono">
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