/**
 * AiSettings Admin Page — full dark-theme edition
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';

interface ProviderOverride { hasKey: boolean; baseURL: string; model: string; }
interface AiFeatureConfig { enabled: boolean; model: string; temperature: number; maxTokens: number; }
interface EmbeddingConfig { provider: 'local' | 'huggingface' | 'openai' | 'custom'; model: string; dimensions: number; baseURL: string; hasKey: boolean; }
interface AiConfig {
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';
  providers: { anthropic: ProviderOverride; openai: ProviderOverride; xai: ProviderOverride; minimax: ProviderOverride; gemini: ProviderOverride; custom: ProviderOverride; };
  features: { duplicateDetection: AiFeatureConfig; knowledgeExtraction: AiFeatureConfig; searchSummarization: AiFeatureConfig; faqGeneration: AiFeatureConfig; };
  embedding: EmbeddingConfig;
  usage: { totalRequests: number; totalEstimatedCost: number; lastResetAt: string; };
  isActive: boolean;
}

const PROVIDER_META = {
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Best for complex reasoning and analysis',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    suggestedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229', 'claude-sonnet-4-20250514']
  },
  openai:    {
    label: 'OpenAI GPT',
    description: 'Fast, cost-effective for most tasks',
    defaultModel: 'gpt-4o-mini',
    defaultBaseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    badgeColor: 'bg-success/10 text-success border-success/20',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview']
  },
  xai:       {
    label: 'xAI Grok',
    description: 'Strong reasoning with real-time data access',
    defaultModel: 'grok-3',
    defaultBaseURL: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai/',
    badgeColor: 'bg-warning/10 text-warning border-warning/20',
    suggestedModels: ['grok-3', 'grok-2-1212', 'grok-2', 'grok-beta']
  },
  minimax:   {
    label: 'MiniMax',
    description: 'Cost-effective multilingual support',
    defaultModel: 'MiniMax-Text-01',
    defaultBaseURL: 'https://api.minimax.io/v1',
    docsUrl: 'https://platform.minimax.io',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    suggestedModels: ['MiniMax-Text-01', 'abab6.5g', 'abab6.5-chat']
  },
  gemini:    {
    label: 'Google Gemini',
    description: 'Highly capable, cost-efficient reasoning',
    defaultModel: 'gemini-1.5-flash',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro']
  },
  custom:    {
    label: 'Custom Provider',
    description: 'Any self-hosted or OpenAI-compatible endpoint',
    defaultModel: '',
    defaultBaseURL: 'http://localhost:11434/v1',
    docsUrl: 'https://github.com/ollama/ollama',
    badgeColor: 'bg-border/60 text-ink-soft border-border',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama3', 'mistral', 'mixtral']
  },
} as const;

const FEATURE_LABELS: Record<keyof AiConfig['features'], string> = {
  duplicateDetection:   '🔍 Duplicate Detection',
  knowledgeExtraction:  '📚 Knowledge Extraction',
  searchSummarization:  '✨ Search Summarization',
  faqGeneration:        '🤖 FAQ Generation',
};

type ProviderKey = keyof typeof PROVIDER_META;

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 ${checked ? 'bg-accent' : 'bg-border-medium'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={disabled}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform duration-200 ${checked ? 'bg-accent-text translate-x-[18px]' : 'bg-ink-soft translate-x-0.5'}`} />
    </button>
  );
}

export default function AdminAISettings() {
  // v1.69 — Phase 12: per-program AI config. When ?batchId=...
  // is supplied in the URL, every read/write targets the
  // per-program override (or auto-creates one on first save).
  // The page surfaces a 'no override — falling back to global'
  // hint when the resolver returns hasOverride:false so the
  // admin knows their edits will be saved as an override.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeBatchId = searchParams.get('batchId');
  const { availableBatches, currentBatch: activeProgram } = useBatch();

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [hasOverride, setHasOverride] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [features, setFeatures] = useState<AiConfig['features'] | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message: string } | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<ProviderKey, { apiKey: string; baseURL: string; model: string; showKey: boolean; revealing: boolean }>>({
    anthropic: { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    openai:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    xai:       { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    minimax:   { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    gemini:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    custom:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
  });
  const [savingProviderDraft, setSavingProviderDraft] = useState<ProviderKey | null>(null);

  const [embeddingDraft, setEmbeddingDraft] = useState<{
    provider: 'local' | 'huggingface' | 'openai' | 'custom';
    model: string;
    dimensions: number;
    apiKey: string;
    baseURL: string;
    showKey: boolean;
    revealing: boolean;
  }>({
    provider: 'local',
    model: 'mixedbread-ai/mxbai-embed-large-v1',
    dimensions: 1024,
    apiKey: '',
    baseURL: '',
    showKey: false,
    revealing: false,
  });
  const [savingEmbeddingDraft, setSavingEmbeddingDraft] = useState(false);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await adminApi.get<AiConfig & { hasOverride?: boolean; source?: string }>('/admin/ai/config', {
        params: activeBatchId ? { batchId: activeBatchId } : undefined,
      });
      const data = res.data;
      setConfig(data);
      setActiveProvider(data.activeProvider);
      setFeatures(data.features);
      setHasOverride(data.hasOverride ?? true);
      setProviderDrafts(prev => {
        const next = { ...prev };
        for (const p of ['anthropic','openai','xai','minimax','gemini','custom'] as ProviderKey[]) {
          next[p] = { ...next[p], apiKey: '', baseURL: data.providers[p]?.baseURL ?? '', model: data.providers[p]?.model ?? '' };
        }
        return next;
      });
      if (data.embedding) {
        setEmbeddingDraft(prev => ({
          ...prev,
          provider: data.embedding.provider || 'local',
          model: data.embedding.model || 'mixedbread-ai/mxbai-embed-large-v1',
          dimensions: data.embedding.dimensions || 1024,
          baseURL: data.embedding.baseURL || '',
          apiKey: '',
        }));
      }
    } catch { setError('Failed to load AI configuration.'); }
    finally { setLoading(false); }
  }, [activeBatchId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], enabled: !p[feature].enabled } } : p); setHasChanges(true); };
  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], model } } : p); setHasChanges(true); };
  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], temperature } } : p); setHasChanges(true); };
  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], maxTokens } } : p); setHasChanges(true); };

  const handleSaveFeatures = async () => {
    if (!features) return; setSaving(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { features, batchId: activeBatchId ?? null });
      setSuccess('AI feature settings saved.'); setHasChanges(false); loadConfig(); setTimeout(() => setSuccess(''), 3000);
    }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to save settings.'); }
    finally { setSaving(false); }
  };

  const handleSwitchProvider = async (provider: string) => {
    setSavingProvider(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { activeProvider: provider, batchId: activeBatchId ?? null });
      setActiveProvider(provider); setConfig(p => p ? { ...p, activeProvider: provider as any } : p);
      setSuccess(`Provider switched to ${PROVIDER_META[provider as ProviderKey].label}.`); setTimeout(() => setSuccess(''), 3000);
    }
    catch { setError('Failed to switch provider.'); }
    finally { setSavingProvider(false); }
  };

  const handleResetUsage = async () => {
    if (!confirm('Reset usage statistics? This cannot be undone.')) return;
    try { await adminApi.post('/admin/ai/config/reset-usage'); loadConfig(); setSuccess('Usage statistics reset.'); setTimeout(() => setSuccess(''), 3000); }
    catch { setError('Failed to reset usage.'); }
  };

  const handleTestProvider = async (provider: string) => {
    setTestingProvider(provider); setTestResult(null);
    try { const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider } }); setTestResult({ provider, ok: res.data.ok, message: res.data.message }); }
    catch (err: any) { setTestResult({ provider, ok: false, message: err.response?.data?.message || 'Connection failed' }); }
    finally { setTestingProvider(null); }
  };

  const handleSaveProviderDraft = async (provider: ProviderKey) => {
    const draft = providerDrafts[provider]; setSavingProviderDraft(provider); setError('');
    try {
      const body: Record<string, unknown> = {
        providers: { [provider]: { baseURL: draft.baseURL, model: draft.model, ...(draft.apiKey ? { apiKey: draft.apiKey } : {}) } },
        batchId: activeBatchId ?? null,
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`${PROVIDER_META[provider].label} configuration saved.`);
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save provider configuration.'); }
    finally { setSavingProviderDraft(null); }
  };

  const handleClearApiKey = async (provider: ProviderKey) => {
    if (!confirm(`Clear the stored API key for ${PROVIDER_META[provider].label}?`)) return;
    setSavingProviderDraft(provider); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { providers: { [provider]: { apiKey: '' } }, batchId: activeBatchId ?? null });
      setSuccess(`${PROVIDER_META[provider].label} API key cleared.`);
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to clear API key.'); }
    finally { setSavingProviderDraft(null); }
  };

  const handleRevealApiKey = async (provider: ProviderKey) => {
    setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: true } }));
    try {
      const res = await adminApi.get<{ apiKey: string | null }>(`/admin/ai/config/api-key/${provider}`);
      const key = res.data.apiKey;
      if (key) setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: key, showKey: true, revealing: false } }));
      else { setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } })); setError(`${PROVIDER_META[provider].label} has no API key configured.`); setTimeout(() => setError(''), 4000); }
    } catch { setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } })); setError('Failed to reveal API key.'); }
  };

  const handleSaveEmbeddingDraft = async () => {
    setSavingEmbeddingDraft(true); setError(''); setSuccess('');
    try {
      const body: Record<string, unknown> = {
        embedding: {
          provider: embeddingDraft.provider,
          model: embeddingDraft.model,
          dimensions: embeddingDraft.dimensions,
          baseURL: embeddingDraft.baseURL,
          ...(embeddingDraft.apiKey ? { apiKey: embeddingDraft.apiKey } : {}),
        },
        batchId: activeBatchId ?? null,
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`Embedding configuration saved.`);
      setEmbeddingDraft(prev => ({ ...prev, apiKey: '' }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save embedding configuration.');
    } finally {
      setSavingEmbeddingDraft(false);
    }
  };

  const handleRevealEmbeddingKey = async () => {
    setEmbeddingDraft(prev => ({ ...prev, revealing: true }));
    try {
      const res = await adminApi.get<{ apiKey: string | null }>(`/admin/ai/config/api-key/embedding`);
      const key = res.data.apiKey;
      if (key) setEmbeddingDraft(prev => ({ ...prev, apiKey: key, showKey: true, revealing: false }));
      else { setEmbeddingDraft(prev => ({ ...prev, revealing: false })); setError(`Embedding has no API key configured.`); setTimeout(() => setError(''), 4000); }
    } catch { setEmbeddingDraft(prev => ({ ...prev, revealing: false })); setError('Failed to reveal API key.'); }
  };

  const handleClearEmbeddingKey = async () => {
    if (!confirm(`Clear the stored embedding API key?`)) return;
    setSavingEmbeddingDraft(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { embedding: { apiKey: '' }, batchId: activeBatchId ?? null });
      setSuccess(`Embedding API key cleared.`);
      setEmbeddingDraft(prev => ({ ...prev, apiKey: '' }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to clear API key.');
    } finally {
      setSavingEmbeddingDraft(false);
    }
  };

  const handleTestEmbedding = async () => {
    setTestingEmbedding(true); setEmbeddingTestResult(null);
    try {
      const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider: 'embedding' } });
      setEmbeddingTestResult({ ok: res.data.ok, message: res.data.message });
    } catch (err: any) {
      setEmbeddingTestResult({ ok: false, message: err.response?.data?.message || 'Connection failed' });
    } finally {
      setTestingEmbedding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="h-8 w-48 bg-mist rounded animate-pulse" />
        <div className="h-64 admin-card-surface animate-pulse" />
      </div>
    );
  }

  const currentMeta = PROVIDER_META[activeProvider as ProviderKey];
  const monoInput = 'w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink font-mono focus:outline-none transition-colors admin-input';

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-ink-faint -mt-2">Configure AI providers, API keys, custom endpoints, and per-feature parameters.</p>

      {/* v1.69 — Phase 12: per-program scope selector. When a
          program is picked, every read/write targets the
          per-program override. Without a selection, the page
          edits the global default. The 'no override' badge
          surfaces when the resolver returned hasOverride:false
          so the admin knows their next save will create one. */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Scope:
        </span>
        <button
          type="button"
          onClick={() => { const next = new URLSearchParams(searchParams); next.delete('batchId'); setSearchParams(next); }}
          className={`px-3 py-1 rounded-md text-xs font-medium ${
            !activeBatchId ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'
          }`}
        >
          Global default
        </button>
        {availableBatches.map((b) => (
          <button
            key={b._id}
            type="button"
            onClick={() => { const next = new URLSearchParams(searchParams); next.set('batchId', b._id); setSearchParams(next); }}
            className={`px-3 py-1 rounded-md text-xs font-medium ${
              activeBatchId === b._id ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'
            }`}
          >
            {b.name}
            {b.isDefault && <span className="ml-1 text-[9px] font-semibold uppercase">★</span>}
          </button>
        ))}
        {activeBatchId && !hasOverride && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
            ⚠ No per-program override — falling back to global
          </span>
        )}
        {activeBatchId && hasOverride && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
            ✓ Per-program override active
          </span>
        )}
        {activeProgram && activeBatchId && (
          <span className="text-[10px] text-ink-faint ml-auto">
            Saving as per-program override for <span className="font-semibold text-ink">{activeProgram.name}</span>
          </span>
        )}
      </div>

      {success && <div className="flex items-center gap-2 px-4 py-3 admin-toast-success rounded-xl text-sm"><span>✓</span> {success}</div>}
      {error   && <div className="flex items-center gap-2 px-4 py-3 admin-toast-error  rounded-xl text-sm"><span>✕</span> {error}</div>}

      {/* ── Active Provider ──────────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Active Provider</p>
              <p className="text-xs text-ink-faint mt-0.5">Click a provider to make it the default for all AI features.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentMeta.badgeColor}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />{currentMeta.label}
            </span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(PROVIDER_META) as ProviderKey[]).map((key) => {
            const meta = PROVIDER_META[key];
            const isActive = activeProvider === key;
            const configured = !!(config?.providers[key]?.hasKey || config?.providers[key]?.baseURL);
            return (
              <button key={key} onClick={() => !isActive && handleSwitchProvider(key)} disabled={savingProvider}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${isActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border-medium hover:bg-mist'} ${savingProvider ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {isActive && <span className="absolute top-2 right-2 text-accent text-xs font-bold">● Active</span>}
                <p className="text-sm font-semibold text-ink">{meta.label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{meta.description}</p>
                <p className="text-[10px] text-ink-faint mt-1 font-mono">{meta.defaultModel}</p>
                {configured && <p className="text-[10px] text-accent mt-1 font-semibold">Custom config set</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Provider Credentials ─────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40">
          <p className="text-sm font-semibold text-ink">Provider Credentials & Endpoints</p>
          <p className="text-xs text-ink-faint mt-0.5">Per-provider API keys are encrypted at rest. Leave any field blank to use the default.</p>
        </div>
        <div className="divide-y divide-border">
          {(Object.keys(PROVIDER_META) as ProviderKey[]).map((provider) => {
            const meta = PROVIDER_META[provider];
            const draft = providerDrafts[provider];
            const override = config?.providers[provider];
            const isSaving = savingProviderDraft === provider;
            return (
              <div key={provider} className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeColor}`}>{meta.label}</span>
                  {override?.hasKey ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-success font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-success" />Key stored</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint font-medium"><span className="w-1.5 h-1.5 rounded-full bg-border-medium" />No dashboard key (env var fallback)</span>
                  )}
                </div>

                {/* API Key */}
                <div>
                  <label className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key</span>
                    {override?.hasKey && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <button type="button" onClick={() => handleRevealApiKey(provider)} disabled={draft.revealing} className="text-accent hover:text-accent-hover font-medium disabled:opacity-50">{draft.revealing ? 'Revealing…' : draft.showKey ? 'Hide' : 'Reveal'}</button>
                        <span className="text-border-medium">·</span>
                        <button type="button" onClick={() => handleClearApiKey(provider)} disabled={isSaving} className="text-danger hover:text-danger/80 font-medium disabled:opacity-50">Clear</button>
                      </div>
                    )}
                  </label>
                  <input type={draft.showKey ? 'text' : 'password'} value={draft.apiKey}
                    onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: e.target.value, showKey: true } }))}
                    placeholder={override?.hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
                    autoComplete="off" className={monoInput} />
                  <p className="text-[10px] text-ink-faint mt-1">Get a key: <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{meta.docsUrl.replace('https://','')}</a></p>
                </div>

                {/* Base URL */}
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL <span className="text-[9px] font-normal">(optional)</span></label>
                  <input type="text" value={draft.baseURL} onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], baseURL: e.target.value } }))} placeholder={meta.defaultBaseURL} className={monoInput} />
                  <p className="text-[10px] text-ink-faint mt-1">Point at a proxy, self-hosted gateway, or OpenAI-compatible endpoint.</p>
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Default Model <span className="text-[9px] font-normal">(optional)</span></label>
                  <input type="text" list={`suggested-models-${provider}`} value={draft.model} onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: e.target.value } }))} placeholder={meta.defaultModel} className={monoInput} />
                  <datalist id={`suggested-models-${provider}`}>
                    {meta.suggestedModels.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => handleSaveProviderDraft(provider)} disabled={isSaving} className="admin-btn-primary px-4 py-1.5 text-xs">{isSaving ? 'Saving…' : `Save ${meta.label}`}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Embedding Configuration ─────────────────────────────── */}
      <div className="admin-card-surface border border-accent/20 bg-accent/5">
        <div className="admin-card-header bg-accent/10 border-b border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-accent">🧬 Embedding Model Configuration</p>
              <p className="text-xs text-ink-faint mt-0.5">Manage semantic vector generation settings for search and duplicate detection.</p>
            </div>
            {config?.embedding?.hasKey ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Env / Local Default
              </span>
            )}
          </div>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Embedding Provider */}
            <div>
              <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Embedding Provider</label>
              <select
                value={embeddingDraft.provider}
                onChange={e => setEmbeddingDraft(prev => ({ ...prev, provider: e.target.value as any }))}
                className="w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink focus:outline-none transition-colors admin-input"
              >
                <option value="local">Local (In-Process Transformers)</option>
                <option value="huggingface">HuggingFace Inference API</option>
                <option value="openai">OpenAI Embeddings API</option>
                <option value="custom">Custom OpenAI-Compatible API</option>
              </select>
              <p className="text-[10px] text-ink-faint mt-1 font-sans">
                {embeddingDraft.provider === 'local' && 'Runs locally using in-process ONNX model (no API key needed).'}
                {embeddingDraft.provider === 'huggingface' && 'Calls HuggingFace model server. Requires HF API Key.'}
                {embeddingDraft.provider === 'openai' && 'Calls OpenAI API. Requires dedicated OpenAI API key.'}
                {embeddingDraft.provider === 'custom' && 'Calls custom endpoint (e.g. Ollama, vLLM, self-hosted API).'}
              </p>
            </div>

            {/* Vector Dimensions */}
            <div>
              <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Vector Dimensions</label>
              <input
                type="number"
                value={embeddingDraft.dimensions}
                onChange={e => setEmbeddingDraft(prev => ({ ...prev, dimensions: parseInt(e.target.value) || 1024 }))}
                className={monoInput}
                placeholder="1024"
                min="1"
              />
              <p className="text-[10px] text-ink-faint mt-1 font-sans">
                Must match your MongoDB Search Index (default: 1024). OpenAI models support truncation.
              </p>
            </div>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model Name / Slug</label>
            <input
              type="text"
              list="embedding-suggested-models"
              value={embeddingDraft.model}
              onChange={e => setEmbeddingDraft(prev => ({ ...prev, model: e.target.value }))}
              placeholder="mixedbread-ai/mxbai-embed-large-v1"
              className={monoInput}
            />
            <datalist id="embedding-suggested-models">
              <option value="mixedbread-ai/mxbai-embed-large-v1" />
              <option value="text-embedding-3-small" />
              <option value="text-embedding-3-large" />
              <option value="text-embedding-ada-002" />
            </datalist>
            <p className="text-[10px] text-ink-faint mt-1 font-sans">
              Model identifier used by the provider.
            </p>
          </div>

          {/* Base URL (Conditionally shown for API providers) */}
          {embeddingDraft.provider !== 'local' && (
            <div>
              <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL / Endpoint URL</label>
              <input
                type="text"
                value={embeddingDraft.baseURL}
                onChange={e => setEmbeddingDraft(prev => ({ ...prev, baseURL: e.target.value }))}
                placeholder={
                  embeddingDraft.provider === 'huggingface' ? 'https://router.huggingface.co/hf-inference/models' :
                  embeddingDraft.provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1'
                }
                className={monoInput}
              />
              <p className="text-[10px] text-ink-faint mt-1 font-sans">
                Custom endpoint gateway for the embedding provider.
              </p>
            </div>
          )}

          {/* API Key (Conditionally shown for API providers) */}
          {embeddingDraft.provider !== 'local' && (
            <div>
              <label className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key</span>
                {config?.embedding?.hasKey && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button type="button" onClick={handleRevealEmbeddingKey} disabled={embeddingDraft.revealing} className="text-accent hover:text-accent-hover font-medium disabled:opacity-50 font-sans">
                      {embeddingDraft.revealing ? 'Revealing…' : embeddingDraft.showKey ? 'Hide' : 'Reveal'}
                    </button>
                    <span className="text-border-medium">·</span>
                    <button type="button" onClick={handleClearEmbeddingKey} disabled={savingEmbeddingDraft} className="text-danger hover:text-danger/80 font-medium disabled:opacity-50 font-sans">Clear</button>
                  </div>
                )}
              </label>
              <input
                type={embeddingDraft.showKey ? 'text' : 'password'}
                value={embeddingDraft.apiKey}
                onChange={e => setEmbeddingDraft(prev => ({ ...prev, apiKey: e.target.value, showKey: true }))}
                placeholder={config?.embedding?.hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
                autoComplete="off"
                className={monoInput}
              />
            </div>
          )}

          {/* Action buttons + Warning Info Box */}
          <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestEmbedding}
                disabled={testingEmbedding}
                className="admin-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 font-sans"
              >
                {testingEmbedding ? (
                  <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</>
                ) : 'Test Connection'}
              </button>
              {embeddingTestResult && (
                <span className={`text-xs font-semibold font-sans ${embeddingTestResult.ok ? 'text-success' : 'text-danger'}`}>
                  {embeddingTestResult.ok ? '✓ Connected' : `✕ ${embeddingTestResult.message}`}
                </span>
              )}
            </div>
            
            <button
              type="button"
              onClick={handleSaveEmbeddingDraft}
              disabled={savingEmbeddingDraft}
              className="admin-btn-primary px-4 py-1.5 text-xs font-sans"
            >
              {savingEmbeddingDraft ? 'Saving…' : 'Save Embedding settings'}
            </button>
          </div>

          {/* Vector Index Dimension Mismatch Warning Alert Box */}
          {config?.embedding && config.embedding.dimensions !== embeddingDraft.dimensions && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 space-y-1 font-sans">
              <p className="font-semibold">⚠️ Attention: Vector Dimension Change Detected</p>
              <p>You have changed the dimensions from <strong>{config.embedding.dimensions}</strong> to <strong>{embeddingDraft.dimensions}</strong>.</p>
              <p>To prevent search query crashes, you must drop/recreate the MongoDB Search Index and backfill all embeddings by running:</p>
              <pre className="p-2 bg-black/40 rounded text-[10px] font-mono text-ink mt-1 select-all">
                npm run create:vector-index -- --drop && npm run backfill:embeddings
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Usage Statistics ─────────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Usage Statistics</p>
          <button onClick={handleResetUsage} className="text-xs text-ink-faint hover:text-danger transition-colors">Reset stats</button>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          {[
            { label: 'Total Requests', value: config?.usage?.totalRequests?.toLocaleString() ?? '0' },
            { label: 'Estimated Cost (USD)', value: `$${(config?.usage?.totalEstimatedCost ?? 0).toFixed(4)}` },
            { label: 'Last Reset', value: config?.usage?.lastResetAt ? new Date(config.usage.lastResetAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
          ].map(s => (
            <div key={s.label} className="admin-stat-mini text-center p-3">
              <p className="text-2xl font-bold text-ink">{s.value}</p>
              <p className="text-xs text-ink-faint mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature Configuration ────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Feature Configuration</p>
            <p className="text-xs text-ink-faint mt-0.5">Per-feature model selection and parameters.</p>
          </div>
          <button onClick={handleSaveFeatures} disabled={saving || !hasChanges} className="admin-btn-primary px-4 py-2 text-xs">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
        {features && (
          <div className="divide-y divide-border">
            {(Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>).map((feature) => {
              const f = features[feature];
              // Guard: an inherited/partial config may omit a feature.
              // Skip rather than crash the whole admin page on `f.enabled`.
              if (!f) return null;
              return (
                <div key={feature} className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{FEATURE_LABELS[feature]}</p>
                      <p className="text-xs text-ink-faint">
                        {feature === 'duplicateDetection'  && 'Blocks duplicate posts before creation'}
                        {feature === 'knowledgeExtraction' && 'Extracts Q&A pairs from transcripts and posts'}
                        {feature === 'searchSummarization' && 'Generates concise answers from search results'}
                        {feature === 'faqGeneration'       && 'Drafts official FAQ entries from community posts'}
                      </p>
                    </div>
                    <Toggle checked={f.enabled} onChange={() => handleFeatureToggle(feature)} />
                  </div>
                  <div className={`grid grid-cols-3 gap-3 ${f.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model</label>
                      <input type="text" list={`feature-suggested-models-${activeProvider}`} value={f.model} onChange={e => handleModelChange(feature, e.target.value)} className="admin-input text-xs" />
                      <datalist id={`feature-suggested-models-${activeProvider}`}>
                        {PROVIDER_META[activeProvider as ProviderKey]?.suggestedModels.map(m => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Temperature <span className="text-[9px] font-normal">(0–1)</span></label>
                      <input type="number" min="0" max="1" step="0.05" value={Number(f.temperature.toFixed(2))} onChange={e => handleTempChange(feature, parseFloat(e.target.value) || 0)} className="admin-input text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Max Tokens</label>
                      <input type="number" min="64" max="8192" step="64" value={f.maxTokens} onChange={e => handleMaxTokensChange(feature, parseInt(e.target.value) || 1024)} className="admin-input text-xs" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Provider Health ──────────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40">
          <p className="text-sm font-semibold text-ink">Provider Health</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PROVIDER_META) as ProviderKey[]).map((key) => {
              const isActive = activeProvider === key;
              const isTesting = testingProvider === key;
              const res = testResult?.provider === key ? testResult : null;
              return (
                <div key={key} className={`p-3 rounded-xl border transition-colors ${isActive ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent' : 'bg-border-medium'}`} />
                    <p className="text-xs font-medium text-ink-soft">{PROVIDER_META[key].label}</p>
                    {isActive && <span className="ml-auto text-[9px] font-bold text-accent uppercase tracking-wide">Active</span>}
                  </div>
                  <p className="text-[10px] text-ink-faint mt-1 font-mono">{isActive ? 'Configured' : 'Not active'}</p>
                  {res && <p className={`text-[10px] mt-1.5 font-semibold ${res.ok ? 'text-success' : 'text-danger'}`}>{res.ok ? '✓ Connected' : `✕ ${res.message}`}</p>}
                  <button onClick={() => handleTestProvider(key)} disabled={isTesting} className="mt-2 text-[10px] text-accent hover:text-accent-hover font-medium disabled:opacity-40 transition-colors flex items-center gap-1">
                    {isTesting ? <><span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin inline-block" />Testing…</> : 'Test connection'}
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
