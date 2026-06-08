/**
 * AiSettings Admin Page — full dark-theme edition
 */

import { useEffect, useState, useCallback } from 'react';
import adminApi from '../utils/adminApi';

interface ProviderOverride { hasKey: boolean; baseURL: string; model: string; }
interface AiFeatureConfig { enabled: boolean; model: string; temperature: number; maxTokens: number; }
interface AiConfig {
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom';
  providers: { anthropic: ProviderOverride; openai: ProviderOverride; xai: ProviderOverride; minimax: ProviderOverride; gemini: ProviderOverride; custom: ProviderOverride; };
  features: { duplicateDetection: AiFeatureConfig; knowledgeExtraction: AiFeatureConfig; searchSummarization: AiFeatureConfig; faqGeneration: AiFeatureConfig; };
  usage: { totalRequests: number; totalEstimatedCost: number; lastResetAt: string; };
  isActive: boolean;
}

const PROVIDER_META = {
  anthropic: { label: 'Anthropic Claude', description: 'Best for complex reasoning and analysis',       defaultModel: 'claude-sonnet-4-20250514',       defaultBaseURL: 'https://api.anthropic.com/v1',                            docsUrl: 'https://console.anthropic.com/settings/keys',  badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  openai:    { label: 'OpenAI GPT',       description: 'Fast, cost-effective for most tasks',            defaultModel: 'gpt-4o-mini',                    defaultBaseURL: 'https://api.openai.com/v1',                               docsUrl: 'https://platform.openai.com/api-keys',         badgeColor: 'bg-success/10 text-success border-success/20' },
  xai:       { label: 'xAI Grok',         description: 'Strong reasoning with real-time data access',   defaultModel: 'grok-3',                         defaultBaseURL: 'https://api.x.ai/v1',                                     docsUrl: 'https://console.x.ai/',                        badgeColor: 'bg-warning/10 text-warning border-warning/20' },
  minimax:   { label: 'MiniMax',           description: 'Cost-effective multilingual support',            defaultModel: 'MiniMax-Text-01',                defaultBaseURL: 'https://api.minimax.io/v1',                               docsUrl: 'https://platform.minimax.io',                  badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  gemini:    { label: 'Google Gemini',     description: 'Highly capable, cost-efficient reasoning',      defaultModel: 'gemini-1.5-flash',               defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', docsUrl: 'https://aistudio.google.com/app/apikey',       badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  custom:    { label: 'Custom Provider',   description: 'Any self-hosted or OpenAI-compatible endpoint', defaultModel: 'custom-model',                   defaultBaseURL: 'http://localhost:11434/v1',                               docsUrl: 'https://github.com/ollama/ollama',             badgeColor: 'bg-border/60 text-ink-soft border-border' },
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
  const [config, setConfig] = useState<AiConfig | null>(null);
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

  const loadConfig = useCallback(async () => {
    try {
      const res = await adminApi.get<AiConfig>('/admin/ai/config');
      const data = res.data;
      setConfig(data); setActiveProvider(data.activeProvider); setFeatures(data.features);
      setProviderDrafts(prev => {
        const next = { ...prev };
        for (const p of ['anthropic','openai','xai','minimax','gemini','custom'] as ProviderKey[]) {
          next[p] = { ...next[p], apiKey: '', baseURL: data.providers[p]?.baseURL ?? '', model: data.providers[p]?.model ?? '' };
        }
        return next;
      });
    } catch { setError('Failed to load AI configuration.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], enabled: !p[feature].enabled } } : p); setHasChanges(true); };
  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], model } } : p); setHasChanges(true); };
  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], temperature } } : p); setHasChanges(true); };
  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], maxTokens } } : p); setHasChanges(true); };

  const handleSaveFeatures = async () => {
    if (!features) return; setSaving(true); setError('');
    try { await adminApi.patch('/admin/ai/config', { features }); setSuccess('AI feature settings saved.'); setHasChanges(false); loadConfig(); setTimeout(() => setSuccess(''), 3000); }
    catch { setError('Failed to save settings.'); }
    finally { setSaving(false); }
  };

  const handleSwitchProvider = async (provider: string) => {
    setSavingProvider(true); setError('');
    try { await adminApi.patch('/admin/ai/config', { activeProvider: provider }); setActiveProvider(provider); setConfig(p => p ? { ...p, activeProvider: provider as any } : p); setSuccess(`Provider switched to ${PROVIDER_META[provider as ProviderKey].label}.`); setTimeout(() => setSuccess(''), 3000); }
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
      const body: Record<string, unknown> = { providers: { [provider]: { baseURL: draft.baseURL, model: draft.model, ...(draft.apiKey ? { apiKey: draft.apiKey } : {}) } } };
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
    try { await adminApi.patch('/admin/ai/config', { providers: { [provider]: { apiKey: '' } } }); setSuccess(`${PROVIDER_META[provider].label} API key cleared.`); setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } })); setTimeout(() => setSuccess(''), 3000); loadConfig(); }
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
                  <input type="text" value={draft.model} onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: e.target.value } }))} placeholder={meta.defaultModel} className={monoInput} />
                </div>

                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => handleSaveProviderDraft(provider)} disabled={isSaving} className="admin-btn-primary px-4 py-1.5 text-xs">{isSaving ? 'Saving…' : `Save ${meta.label}`}</button>
                </div>
              </div>
            );
          })}
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
            { label: 'Total Requests', value: config?.usage.totalRequests.toLocaleString() ?? '0' },
            { label: 'Estimated Cost (USD)', value: `$${(config?.usage.totalEstimatedCost ?? 0).toFixed(4)}` },
            { label: 'Last Reset', value: config?.usage.lastResetAt ? new Date(config.usage.lastResetAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
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
                      <input type="text" value={f.model} onChange={e => handleModelChange(feature, e.target.value)} className="admin-input text-xs" />
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
