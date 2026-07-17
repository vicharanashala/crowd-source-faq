/**
 * AiSettings Admin Page — full dark-theme edition
 */

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion';
import { adminBtnPrimary, adminBtnSecondary, adminInput } from '../../styles/style_config';
import { useSearchParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';

interface ProviderOverride {
  hasKey: boolean;
  // v1.83 — multi-key rotation. The public /admin/ai/providers view
  // never returns per-key plaintext values; it only reports whether
  // ANY keys are configured (`hasKey`) and how many (`keyCount`).
  // The detailed key list lives behind /admin/ai/provider-keys/:provider.
  keyCount: number;
  baseURL: string;
  model: string;
  /**
   * v1.82 — custom-provider wire-format model field name. ''
   * (default) means "fall back to env / default ('model')". Only
   * meaningful when the active provider is `custom`; ignored for
   * the other five. Mirrors `provider.customModelField` from
   * `ai-config.controller.ts → publicView()`.
   */
  customModelField?: string;
}

// Per-key slot for the multi-key admin UI. Ordered. The backend
// resolves fallbacks in array order (first healthy key wins).
// `value` is a one-shot draft that the user types; on Save it's
// POSTed to /admin/ai/provider-keys/:provider and then cleared
// from the draft (the server only returns plaintext via the
// dedicated reveal endpoint).
interface ProviderKeyRow {
  id: string;
  label: string;
  value: string;
  baseURL?: string;
  showValue?: boolean;
}
interface AiFeatureConfig {
  enabled: boolean;
  model: string;
  // v1.80.x — optional per-feature embedding model. Stored as a
  // free-form field on the features.{feature} doc; backend mongoose
  // schema is `Object` so unknown fields round-trip without migration.
  // When the admin leaves this empty the global embedding config is
  // used (unchanged behaviour). Future wire-up: backend code that
  // looks up embedding model per call should prefer this field and
  // fall back to AiConfig.embedding.model.
  embeddingModel?: string;
  temperature: number;
  maxTokens: number;
  // v1.85 — automatic provider failover. allowFallback defaults to
  // true on the backend when undefined; the UI surfaces it as a
  // checkbox. fallbackProviders is an ordered list of provider
  // names that the chain walks when the primary returns a retriable
  // failure. Empty array = use the env-var FALLBACK_PROVIDERS or
  // the hard-coded default order.
  allowFallback?: boolean;
  fallbackProviders?: ('anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom')[];
}
interface EmbeddingConfig { provider: 'local' | 'huggingface' | 'openai' | 'custom'; model: string; dimensions: number; baseURL: string; hasKey: boolean; }
interface AiConfig {
  // Backend can return the sentinel 'none' when no provider has any key
  // configured — this signals "system is unconfigured" rather than
  // pretending one of the providers is active.
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom' | 'none';
  providers: { anthropic: ProviderOverride; openai: ProviderOverride; xai: ProviderOverride; minimax: ProviderOverride; gemini: ProviderOverride; custom: ProviderOverride; };
  features: { duplicateDetection: AiFeatureConfig; knowledgeExtraction: AiFeatureConfig; searchSummarization: AiFeatureConfig; faqGeneration: AiFeatureConfig; };
  embedding: EmbeddingConfig;
  usage: { totalRequests: number; totalEstimatedCost: number; lastResetAt: string; };
  isActive: boolean;
}

// Per-provider hasKey truth from /admin/ai/providers. This is the
// authoritative source for "is the provider actually wired up" —
// `isActive` alone only tells you which one is selected, not whether
// it has a working API key. Previously the UI conflated the two and
// showed "Configured ✓ Active" for unconfigured systems.
type ProviderKeyStatus = Record<'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom', boolean>;

const PROVIDER_META = {
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Best for complex reasoning and analysis',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
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
    defaultModel: 'MiniMax-M3',
    defaultBaseURL: 'https://api.minimax.io/v1',
    docsUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    // Both General API keys (sk-…) and Token Plan / Coding Plan keys
    // (sk-cp-…) authenticate against the same base URL — they share
    // the /v1/chat/completions endpoint. The only difference is the
    // billing pool: General keys draw from pay-as-you-go credits, Token
    // Plan keys draw from your subscription quota. If you have a Token
    // Plan subscription, use the sk-cp-… key (Subscription Key from
    // Billing → Token Plan). Otherwise use a general sk-… key from
    // Account Management → API Keys.
    keyHint: 'Use a General API key (sk-…) or Token Plan key (sk-cp-…). Both work against this endpoint; pick the one that matches your billing plan. Get it at the link above.',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
    suggestedModels: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2', 'MiniMax-Text-01']
  },
  gemini:    {
    label: 'Google Gemini',
    description: 'Highly capable, cost-efficient reasoning',
    defaultModel: 'gemini-1.5-flash',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
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
  // v1.80.x — replaced the broken Toggle with one that renders
  // cleanly. Previous version referenced `bg-accent-text` and
  // `bg-border-medium`, neither of which are real theme tokens
  // — they fall through to the page's brown accent background
  // regardless of `checked` state. Inline visual style here
  // avoids the theme-class guess.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{ backgroundColor: checked ? '#10b981' : '#d1d5db' }}
      title={checked ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

// Per-chat-provider edit form used by the unified Provider Settings card.
// v1.83 — refactored to support N ordered API key slots per provider. The
// backend resolves keys in array order and rotates to the next healthy
// key on 429 / rate-limit. All other fields (baseURL/model/customModelField,
// live model browser, Test/Save buttons) are unchanged.
function ChatProviderFields({
  provider, draft, setProviderDrafts, override, isActive, hasKey, monoInput,
  saving, testing, testResult, onSwitchActive, onTest, onSave, onReveal, onClear,
  savingProviderGlobal,
  liveModels, browsingModels, browseError, onBrowse,
  onAddKey, onRemoveKey, onMoveKey, onUpdateKey,
}: {
  provider: ProviderKey;
  draft: {
    // v1.83 — API Key(s). `apiKey` is still on the draft for back-compat
    // rendering of any legacy UI/tests; canonical truth is `keys[]`.
    apiKey: string;
    // Ordered API key slots. First non-empty key is the "primary" the
    // backend will use first; remainder are fallbacks.
    keys: ProviderKeyRow[];
    baseURL: string;
    model: string;
    customModelField: string;
    showKey: boolean;
    revealing: boolean;
  };
  setProviderDrafts: React.Dispatch<React.SetStateAction<Record<ProviderKey, any>>>;
  override: { hasKey: boolean; keyCount?: number; baseURL?: string; model?: string } | undefined;
  isActive: boolean;
  hasKey: boolean;
  monoInput: string;
  saving: boolean;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onSwitchActive: (p: string) => void;
  onTest: (p: string) => void;
  onSave: (p: ProviderKey) => void;
  /** Reveal the plaintext of a specific key row (defaults to row 0). */
  onReveal: (p: ProviderKey, rowId?: string) => void;
  /** Clear a specific key row (defaults to row 0 = the whole provider). */
  onClear: (p: ProviderKey, rowId?: string) => void;
  savingProviderGlobal: boolean;
  // Live model browser state for this provider. `liveModels` is the
  // union of the backend response + the hardcoded suggestedModels so
  // the datalist still works even if the live fetch failed.
  liveModels: string[];
  browsingModels: boolean;
  browseError: string | null;
  onBrowse: (provider: ProviderKey) => void;
  // Key-row CRUD. Always keep at least one row; max 10 per provider.
  onAddKey: (p: ProviderKey) => void;
  onRemoveKey: (p: ProviderKey, rowId: string) => void;
  onMoveKey: (p: ProviderKey, rowId: string, dir: -1 | 1) => void;
  onUpdateKey: (p: ProviderKey, rowId: string, patch: Partial<ProviderKeyRow>) => void;
}) {
  const meta = PROVIDER_META[provider];
  // Picker modal: opens when the user clicks "View all N models".
  // Closed by backdrop click, ESC keypress, or row selection.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const healthBadge = isActive
    ? hasKey
      ? { dot: 'bg-success', text: 'Configured', tone: 'text-success' }
      : { dot: 'bg-danger', text: 'Active but no API key configured', tone: 'text-danger font-semibold' }
    : { dot: 'bg-border-medium', text: 'Not active', tone: 'text-ink-faint' };
  // v1.83 — visible "N keys" badge so admins see at-a-glance how many
  // API key slots are configured for this provider. The summary
  // endpoint reports `keyCount`; the row list below is the draft,
  // which may already have new rows the server hasn't seen yet.
  const serverKeyCount = override?.keyCount ?? (hasKey ? 1 : 0);
  const visibleKeyCount = Math.max(
    serverKeyCount,
    draft.keys?.length ?? 0,
  );

  return (
    <div className="space-y-4">
      {/* Header: provider identity + health badge + switch-active button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${healthBadge.dot}`} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeColor}`}>{meta.label}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-accent/30 bg-accent/10 text-accent" title={`${visibleKeyCount} API key slot${visibleKeyCount === 1 ? '' : 's'} configured`}>
            {visibleKeyCount} key{visibleKeyCount === 1 ? '' : 's'}
          </span>
          <span className={`text-[11px] font-mono ${healthBadge.tone}`}>{healthBadge.text}</span>
        </div>
        {!isActive && (
          <button type="button" onClick={() => onSwitchActive(provider)} disabled={savingProviderGlobal}
            className={`${adminBtnSecondary} px-3 py-1.5 text-xs disabled:opacity-50`}>
            {savingProviderGlobal ? 'Switching…' : `Make ${meta.label} active`}
          </button>
        )}
      </div>

      {/* v1.83 — multi-key stack rendered at FULL WIDTH above the
          URL/model row. Previously these rows lived inside a 3-col
          grid (md:col-span-1) which crammed labels into 1/3 of the
          card and made the value inputs illegible, especially on
          mobile. Each key card is now a clean width-100% row. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key{draft.keys.length > 1 ? 's' : ''}</span>
          {hasKey && draft.keys.length === 1 && (
            <div className="flex items-center gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => onReveal(provider)}
                disabled={draft.revealing}
                className="text-accent hover:text-accent-hover font-medium disabled:opacity-50"
              >
                {draft.revealing ? 'Revealing…' : draft.showKey ? 'Hide' : 'Reveal'}
              </button>
              <span className="text-border-medium">·</span>
              <button
                type="button"
                onClick={() => onClear(provider)}
                disabled={saving}
                className="text-danger hover:text-danger/80 font-medium disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {(draft.keys ?? []).map((row, idx) => (
            <div key={row.id} className="border border-border rounded-lg p-3 bg-bg-secondary/30 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={row.label}
                  onChange={e => onUpdateKey(provider, row.id, { label: e.target.value })}
                  placeholder={idx === 0 ? 'Primary' : `Key ${idx + 1}`}
                  className={`${monoInput} text-[11px] py-1 flex-1 min-w-0`}
                  aria-label={`Label for key ${idx + 1}`}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMoveKey(provider, row.id, -1)}
                    disabled={idx === 0}
                    title="Move up (higher priority)"
                    aria-label="Move up"
                    className="text-ink-faint hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-1 text-xs"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => onMoveKey(provider, row.id, 1)}
                    disabled={idx === (draft.keys?.length ?? 0) - 1}
                    title="Move down (lower priority)"
                    aria-label="Move down"
                    className="text-ink-faint hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-1 text-xs"
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => onRemoveKey(provider, row.id)}
                    disabled={(draft.keys?.length ?? 0) <= 1}
                    title={(draft.keys?.length ?? 0) <= 1 ? 'At least one key row is required' : 'Remove this key'}
                    aria-label="Remove key"
                    className="text-danger hover:text-danger/80 disabled:opacity-30 disabled:cursor-not-allowed px-1 text-xs"
                  >×</button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type={row.showValue ? 'text' : 'password'}
                  value={row.value}
                  onChange={e => onUpdateKey(provider, row.id, { value: e.target.value, showValue: true })}
                  placeholder={hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
                  autoComplete="off"
                  className={`${monoInput} text-[11px] py-1 flex-1 min-w-0`}
                  aria-label={`Value for key ${idx + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onUpdateKey(provider, row.id, { showValue: !row.showValue })}
                  title={row.showValue ? 'Hide value' : 'Reveal value'}
                  aria-label={row.showValue ? 'Hide value' : 'Reveal value'}
                  className="text-ink-faint hover:text-ink px-1 text-xs shrink-0"
                >{row.showValue ? '🙈' : '👁'}</button>
              </div>
              {/* Per-key baseURL override — only meaningful for the
                  `custom` provider (where admins may route each key
                  through a different upstream). For other providers
                  the global baseURL applies. */}
              {provider === 'custom' && (
                <input
                  type="text"
                  value={row.baseURL ?? ''}
                  onChange={e => onUpdateKey(provider, row.id, { baseURL: e.target.value })}
                  placeholder="per-key base URL (optional)"
                  className={`${monoInput} text-[11px] py-1`}
                  aria-label={`Per-key base URL for key ${idx + 1}`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onAddKey(provider)}
            disabled={(draft.keys?.length ?? 0) >= 10}
            title={(draft.keys?.length ?? 0) >= 10 ? 'Maximum 10 keys per provider' : 'Add another API key slot (used as fallback on 429)'}
            className={`${adminBtnSecondary} px-3 py-1 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed`}
          >+ Add another key</button>
          <p className="text-[10px] text-ink-faint">
            Get a key: <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{meta.docsUrl.replace('https://','')}</a>
          </p>
          {/* Per-provider key-format warning, if the meta declares one. */}
          {('keyHint' in meta) && (
            <p className="text-[10px] text-warning">⚠ {String(meta.keyHint)}</p>
          )}
        </div>
      </div>

      {/* URL + Model row. Two columns on tablet+ to keep both visible
          side-by-side, single column on mobile so inputs stretch to
          full width and don't overflow. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL <span className="text-[9px] font-normal">(optional)</span></label>
          <input type="text" value={draft.baseURL}
            onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], baseURL: e.target.value } }))}
            placeholder={meta.defaultBaseURL} className={monoInput} />
          <p className="text-[10px] text-ink-faint mt-1">
            {provider === 'custom'
              ? 'OpenAI-compatible endpoint. Include /v1 in the path (e.g. http://localhost:11434/v1 for Ollama). The backend auto-inserts /v1 if missing.'
              : 'Proxy / gateway / OpenAI-compatible endpoint. Applies to every key slot unless a per-key URL is set (custom provider only).'}
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Default Model <span className="text-[9px] font-normal">(optional)</span></label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" list={`suggested-models-${provider}`} value={draft.model}
              onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: e.target.value } }))}
              placeholder={meta.defaultModel} className={`${monoInput} flex-1 min-w-0`} />
            {/* Live model browser. Disabled when no API key is configured
                (the backend would just return ok:false with an empty list
                anyway, but failing fast in the UI gives clearer feedback). */}
            <button type="button" onClick={() => onBrowse(provider)}
              disabled={browsingModels || !hasKey}
              title={!hasKey ? 'Save an API key first, then browse live models.' : 'Fetch available models from the provider API.'}
              className={`${adminBtnSecondary} px-2 py-1.5 text-[10px] flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}>
              {browsingModels
                ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Fetching…</>
                : '🔄 Browse live'}
            </button>
          </div>
          {/* v1.82 — custom-provider wire-format model field name. Only
              rendered for `custom`; ignored for the other five. The
              runtime resolver reads this from the AiConfig doc with
              fallback to CUSTOM_MODEL_FIELD env then 'model'. Now a
              proper full-width sibling below the model input + browse
              button (previously nested inside a flex which collapsed
              it next to the model input). */}
          {provider === 'custom' && (
            <div className="mt-3">
              <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">
                Wire-format Model Field <span className="text-[9px] font-normal">(optional)</span>
              </label>
              <select
                value={draft.customModelField ?? ''}
                onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], customModelField: e.target.value } }))}
                className={monoInput + ' text-xs'}
              >
                <option value="">Default (model)</option>
                <option value="model">model</option>
                <option value="modelName">modelName (proxy / gateway compat)</option>
              </select>
              <p className="text-[10px] text-ink-faint mt-1">
                Flip this if a relay or gateway in front of your custom endpoint expects the model
                identifier under the <code>modelName</code> field instead of <code>model</code>.
                Empty falls back to env (<code>CUSTOM_MODEL_FIELD</code>) or default.
              </p>
            </div>
          )}
          {/* datalist stays as a typing hint for users who know the slug. */}
          <datalist id={`suggested-models-${provider}`}>
            {Array.from(new Set([...liveModels, ...meta.suggestedModels])).map(m => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {browseError && (
            <p className="text-[10px] text-danger mt-1">⚠ {browseError}</p>
          )}
          {liveModels.length > 0 && (
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="text-[10px] text-accent hover:underline mt-1"
            >
              View all {liveModels.length} live model{liveModels.length === 1 ? '' : 's'} →
            </button>
          )}
          {liveModels.length === 0 && meta.suggestedModels.length > 0 && (
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="text-[10px] text-accent hover:underline mt-1"
            >
              View suggested models ({meta.suggestedModels.length}) →
            </button>
          )}
          <ModelPickerModal
            open={modelPickerOpen}
            onClose={() => setModelPickerOpen(false)}
            title={`${meta.label} — ${liveModels.length > 0 ? 'live' : 'suggested'} models`}
            models={Array.from(new Set([...liveModels, ...meta.suggestedModels]))}
            current={draft.model}
            onPick={(m) => {
              setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: m } }));
              setModelPickerOpen(false);
            }}
          />
        </div>
      </div>

      {/* Action row: test + result + save */}
      <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onTest(provider)}
            disabled={testing || !hasKey}
            title={!hasKey ? 'Save an API key before testing the connection.' : undefined}
            className={`${adminBtnSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}>
            {testing ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</> : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-xs font-semibold ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok ? '✓ Connected' : `✕ ${testResult.message}`}
            </span>
          )}
        </div>
        <button type="button" onClick={() => onSave(provider)} disabled={saving}
          className={`${adminBtnPrimary} px-4 py-1.5 text-xs disabled:opacity-50`}>
          {saving ? 'Saving…' : `Save ${meta.label}`}
        </button>
      </div>
    </div>
  );
}

// Embedding model edit form. Same shape as ChatProviderFields but with
// the embedding-specific fields (provider, dimensions, model, baseURL, key)
// and the dimension-mismatch warning that fires when the draft dimensions
// diverge from what the backend currently stores.
function EmbeddingFields({
  embeddingDraft, setEmbeddingDraft, config, monoInput, saving, testing, testResult, onTest, onSave,
  liveModels, browsingModels, browseError, onBrowse,
}: {
  embeddingDraft: { provider: 'local' | 'huggingface' | 'openai' | 'custom'; model: string; dimensions: number; apiKey: string; baseURL: string; showKey: boolean; revealing: boolean };
  setEmbeddingDraft: React.Dispatch<React.SetStateAction<any>>;
  config: AiConfig | null;
  monoInput: string;
  saving: boolean;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
  onSave: () => void;
  // Live model browser state for the embedding model field.
  liveModels: string[];
  browsingModels: boolean;
  browseError: string | null;
  onBrowse: () => void;
}) {
  const requiresApi = embeddingDraft.provider !== 'local';
  // Fallback list of static suggestions per embedding provider. The
  // merged list = hardcoded + any live result.
  const staticEmbeddingModels: Record<'local' | 'huggingface' | 'openai' | 'custom', string[]> = {
    local:       ['mixedbread-ai/mxbai-embed-large-v1'],
    huggingface: ['mixedbread-ai/mxbai-embed-large-v1', 'BAAI/bge-large-en-v1.5', 'sentence-transformers/all-MiniLM-L6-v2'],
    openai:      ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
    custom:      ['mixedbread-ai/mxbai-embed-large-v1'],
  };
  const mergedModels = Array.from(new Set([...liveModels, ...staticEmbeddingModels[embeddingDraft.provider]]));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${config?.embedding?.hasKey ? 'bg-success' : 'bg-warning'}`} />
        <span className="text-sm font-semibold text-ink">Embedding Model</span>
        <span className="text-[11px] font-mono text-ink-faint">
          {config?.embedding?.hasKey ? 'Configured' : 'Env / Local Default'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Embedding Provider</label>
          <select value={embeddingDraft.provider}
            onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, provider: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink focus:outline-none ${adminInput}`}>
            <option value="local">Local (In-Process)</option>
            <option value="huggingface">HuggingFace Inference</option>
            <option value="openai">OpenAI Embeddings</option>
            <option value="custom">Custom OpenAI-Compatible</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Vector Dimensions</label>
          <input type="number" value={embeddingDraft.dimensions}
            onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, dimensions: parseInt(e.target.value) || 1024 }))}
            className={monoInput} placeholder="1024" min="1" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model Name</label>
          <div className="flex gap-2">
            <input type="text" list="embedding-suggested-models" value={embeddingDraft.model}
              onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, model: e.target.value }))}
              placeholder="mixedbread-ai/mxbai-embed-large-v1" className={monoInput} />
            {/* Live model browser for the embedding model. Only enabled
                for providers that expose a model listing endpoint
                (huggingface / openai / custom). Local has nothing to
                list — it's a fixed in-process pipeline. */}
            <button type="button" onClick={onBrowse}
              disabled={browsingModels || embeddingDraft.provider === 'local'}
              title={embeddingDraft.provider === 'local'
                ? 'Local embedding has no remote model list.'
                : 'Fetch available models from the embedding provider API.'}
              className={`${adminBtnSecondary} px-2 py-1.5 text-[10px] flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}>
              {browsingModels
                ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Fetching…</>
                : '🔄 Browse live'}
            </button>
          </div>
          <datalist id="embedding-suggested-models">
            {mergedModels.map(m => <option key={m} value={m} />)}
          </datalist>
          {browseError && (
            <p className="text-[10px] text-danger mt-1">⚠ {browseError}</p>
          )}
          {liveModels.length > 0 && !browseError && (
            <p className="text-[10px] text-success mt-1">✓ {liveModels.length} live model{liveModels.length === 1 ? '' : 's'} loaded</p>
          )}
        </div>
      </div>

      {requiresApi && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL</label>
            <input type="text" value={embeddingDraft.baseURL}
              onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, baseURL: e.target.value }))}
              placeholder={
                embeddingDraft.provider === 'huggingface' ? 'https://router.huggingface.co/hf-inference/models' :
                embeddingDraft.provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1'
              } className={monoInput} />
          </div>
          <div>
            <label className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key</span>
              {config?.embedding?.hasKey && (
                <div className="flex items-center gap-2 text-[10px]">
                  <button type="button" onClick={() => setEmbeddingDraft((prev: any) => ({ ...prev, showKey: !prev.showKey }))} className="text-accent hover:text-accent-hover font-medium">
                    {embeddingDraft.showKey ? 'Hide' : 'Reveal'}
                  </button>
                  <span className="text-border-medium">·</span>
                  <button type="button" onClick={() => setEmbeddingDraft((prev: any) => ({ ...prev, apiKey: '' }))} className="text-danger hover:text-danger/80 font-medium">Clear</button>
                </div>
              )}
            </label>
            <input type={embeddingDraft.showKey ? 'text' : 'password'} value={embeddingDraft.apiKey}
              onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, apiKey: e.target.value, showKey: true }))}
              placeholder={config?.embedding?.hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
              autoComplete="off" className={monoInput} />
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onTest} disabled={testing}
            className={`${adminBtnSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50`}>
            {testing ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</> : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-xs font-semibold ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok ? '✓ Connected' : `✕ ${testResult.message}`}
            </span>
          )}
        </div>
        <button type="button" onClick={onSave} disabled={saving}
          className={`${adminBtnPrimary} px-4 py-1.5 text-xs disabled:opacity-50`}>
          {saving ? 'Saving…' : 'Save Embedding settings'}
        </button>
      </div>

      {/* Vector Index Dimension Mismatch Warning */}
      {config?.embedding && config.embedding.dimensions !== embeddingDraft.dimensions && (
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning space-y-1">
          <p className="font-semibold">⚠️ Vector Dimension Change Detected</p>
          <p>You changed dimensions from <strong>{config.embedding.dimensions}</strong> to <strong>{embeddingDraft.dimensions}</strong>. Run <code className="bg-warning/20 px-1 rounded">npm run create:vector-index -- --drop && npm run backfill:embeddings</code> to rebuild the MongoDB Search Index, or search queries will crash.</p>
        </div>
      )}
    </div>
  );
}

// ── Model picker modal ────────────────────────────────────────────────────
// Opens when the user clicks "View all N models" under the chat-provider
// model's Default Model input. Lists every fetched + suggested model
// as a scrollable grid; clicking a row writes to `draft.model` and
// closes the modal. Search box filters the list in-memory.
//
// ESC and backdrop click both dismiss. No save happens here — the
// model is set in the draft state only; "Save {Provider}" persists
// it, matching the rest of the card's draft/save flow.
//
// `groupedByProvider` enables an alternate mode where the picker
// shows a section per provider (Anthropic / OpenAI / MiniMax / etc.)
// with each section's live models plus suggested defaults. The
// provider mode is used by the Feature Configuration block so admins
// see ALL configured providers' available models in one place.
type ProviderGroup = { provider: ProviderKey; label: string; models: string[] };
function ModelPickerModal({
  open,
  onClose,
  title,
  models,
  current,
  onPick,
  groupedByProvider,
  pickerId = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  models: string[];
  current: string;
  onPick: (model: string) => void;
  groupedByProvider?: ProviderGroup[];
  pickerId?: string;
}) {
  const [filter, setFilter] = useState('');
  // Close on ESC. Listener is keyed on `pickerId` so multiple open
  // pickers (chat + feature) don't double-fire.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Reset filter each time the modal opens.
  useEffect(() => {
    if (open) setFilter('');
  }, [open]);
  const lc = filter.toLowerCase();
  const filteredFlat = filter.trim()
    ? models.filter((m) => m.toLowerCase().includes(lc))
    : models;
  const filteredGrouped = groupedByProvider
    ? groupedByProvider
        .map((g) => ({
          ...g,
          models: filter.trim() ? g.models.filter((m) => m.toLowerCase().includes(lc)) : g.models,
        }))
        .filter((g) => g.models.length > 0)
    : null;
  const totalCount = filteredGrouped
    ? filteredGrouped.reduce((n, g) => n + g.models.length, 0)
    : filteredFlat.length;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-[61] flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'tween', duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{title}</p>
                  <p className="text-xs text-ink-soft mt-0.5">{totalCount} model{totalCount === 1 ? '' : 's'} — click to select</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink text-xl leading-none">×</button>
              </div>
              <div className="px-4 py-2 border-b border-border">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter models…"
                  autoFocus
                  className="w-full text-xs font-mono px-3 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="overflow-y-auto px-2 py-2 flex-1">
                {totalCount === 0 ? (
                  <p className="text-xs text-ink-faint text-center py-8">No models match "{filter}".</p>
                ) : filteredGrouped ? (
                  <div className="space-y-3">
                    {filteredGrouped.map((g) => (
                      <section key={g.provider}>
                        <div className="flex items-center justify-between px-2 py-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{g.label}</p>
                          <p className="text-[10px] text-ink-faint font-mono">{g.models.length}</p>
                        </div>
                        <ul className="space-y-1">
                          {g.models.map((m) => {
                            const active = current === m;
                            return (
                              <li key={`${g.provider}:${m}`}>
                                <button
                                  type="button"
                                  onClick={() => onPick(m)}
                                  className={`w-full text-left text-xs font-mono px-3 py-2 rounded-md hover:bg-bg-secondary/60 transition-colors ${active ? 'bg-accent/10 text-accent font-semibold border border-accent/30' : 'border border-transparent'}`}
                                  title={`${g.label} — ${m}`}
                                >
                                  <span className="mr-2 text-ink-faint">{active ? '✓' : ' '}</span>
                                  {m}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredFlat.map((m) => {
                      const active = current === m;
                      return (
                        <li key={m}>
                          <button
                            type="button"
                            onClick={() => onPick(m)}
                            className={`w-full text-left text-xs font-mono px-3 py-2 rounded-md hover:bg-bg-secondary/60 transition-colors ${active ? 'bg-accent/10 text-accent font-semibold border border-accent/30' : 'border border-transparent'}`}
                            title={active ? 'Currently selected — click to re-select' : `Select ${m}`}
                          >
                            <span className="mr-2 text-ink-faint">{active ? '✓' : ' '}</span>
                            {m}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                <p className="text-[10px] text-ink-faint">ESC or click outside to close. Save the card to persist.</p>
                <button type="button" onClick={onClose} className={adminBtnSecondary + ' px-3 py-1 text-xs'}>Close</button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  // v1.71 — derive the displayed program name from the URL-selected
  // activeBatchId (not from BatchContext), so the "Saving as per-program
  // override for X" label always matches the scope button that's actually
  // selected. Without this, BatchContext.currentBatch could be a stale
  // value (e.g. user picked a different scope in another tab) and the
  // label would mislead.
  const selectedBatch = activeBatchId
    ? availableBatches.find((b) => b._id === activeBatchId)
    : undefined;
  const displayedBatchName = selectedBatch?.name ?? activeProgram?.name;

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [hasOverride, setHasOverride] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  // Which provider is currently being edited in the unified Provider
  // Settings card. Drives the dropdown + the fields rendered below.
  // Defaults to the active provider so the most-relevant config is
  // always shown first. `'embedding'` is a special value that swaps
  // the edit form into embedding-provider mode.
  const [editingProvider, setEditingProvider] = useState<ProviderKey | 'embedding'>('anthropic');
  // Per-provider hasKey truth, fetched from /admin/ai/providers. Used
  // by the Provider Health card to surface "No API key" badges so an
  // unconfigured provider is visibly distinct from a working one.
  const [providerKeyStatus, setProviderKeyStatus] = useState<ProviderKeyStatus>({
    anthropic: false, openai: false, xai: false, minimax: false, gemini: false, custom: false,
  });
  const [features, setFeatures] = useState<AiConfig['features'] | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message: string } | null>(null);
  // v1.82 — per-feature live test. `testingFeature` is the id of the
  // feature whose test is in flight; `featureTestResults` keeps the
  // outcome so the admin can see it next to the row even after
  // editing other fields.
  const [testingFeature, setTestingFeature] = useState<keyof AiConfig['features'] | null>(null);
  const [featureTestResults, setFeatureTestResults] = useState<Record<string, { ok: boolean; preview: string; durationMs: number; content: string } | null>>({});
  const onTestFeature = async (feature: keyof AiConfig['features']) => {
    setTestingFeature(feature);
    try {
      const res = await adminApi.post<{ ok: boolean; feature: string; content: string; preview: string; durationMs: number; error?: string }>(
        '/admin/ai/test-feature',
        { feature, batchId: activeBatchId ?? null }
      );
      setFeatureTestResults(prev => ({ ...prev, [feature]: {
        ok: !!res.data.ok,
        preview: res.data.preview || res.data.error || '(no preview)',
        durationMs: res.data.durationMs ?? 0,
        content: res.data.content || '',
      } }));
    } catch (err: any) {
      setFeatureTestResults(prev => ({ ...prev, [feature]: {
        ok: false,
        preview: err?.response?.data?.error || err?.message || 'Request failed',
        durationMs: 0,
        content: '',
      } }));
    } finally {
      setTestingFeature(null);
    }
  };
  // v1.83 — per-provider draft now includes an ordered list of API
  // key rows. Always at least one row; the admin uses the
  // "Add another key" UI button (→ onAddKey handler below) to add
  // more. The `id` is a stable client-side row handle only — the
  // server sees `{label, value, baseURL?}` per slot.
  const emptyKeyRow = (): ProviderKeyRow => ({
    id: `k_${Math.random().toString(36).slice(2, 10)}`,
    label: '',
    value: '',
    baseURL: '',
    showValue: false,
  });
  type ProviderDraftShape = {
    apiKey: string;
    keys: ProviderKeyRow[];
    baseURL: string;
    model: string;
    customModelField: string;
    showKey: boolean;
    revealing: boolean;
  };
  const [providerDrafts, setProviderDrafts] = useState<Record<ProviderKey, ProviderDraftShape>>({
    anthropic: { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
    openai:    { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
    xai:       { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
    minimax:   { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
    gemini:    { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
    custom:    { apiKey: '', keys: [emptyKeyRow()], baseURL: '', model: '', customModelField: '', showKey: false, revealing: false },
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

  // Live model browser state. Three independent slots:
  //   chat       — per-provider (e.g. openai has its own live list)
  //   embedding  — single slot for the embedding model
  //   feature    — single slot for the per-feature model (uses activeProvider)
  // On Browse success, the returned model IDs merge with the hardcoded
  // `suggestedModels` in the corresponding `<datalist>`. On failure, the
  // error is surfaced inline but the datalist still shows the
  // hardcoded fallback.
  const emptyProviderRecord = (): Record<ProviderKey, string[]> => ({
    anthropic: [], openai: [], xai: [], minimax: [], gemini: [], custom: [],
  });
  const [liveChatModels, setLiveChatModels] = useState<Record<ProviderKey, string[]>>(emptyProviderRecord);
  const [liveEmbeddingModels, setLiveEmbeddingModels] = useState<string[]>([]);
  const [liveFeatureModels, setLiveFeatureModels] = useState<string[]>([]);
  const [browsingChat, setBrowsingChat] = useState<Record<ProviderKey, boolean>>({
    anthropic: false, openai: false, xai: false, minimax: false, gemini: false, custom: false,
  });
  const [browsingEmbedding, setBrowsingEmbedding] = useState(false);
  const [browsingFeature, setBrowsingFeature] = useState(false);
  // Per-feature picker visibility for the model field in the
  // Feature Configuration block. v1.80.x — moved out of the IIFE
  // because hooks-in-conditionals break React's rules of hooks
  // (rendered-more-hooks error #310). Keys match the feature names
  // in AiConfig['features'].
  const [openFeatureChatPicker, setOpenFeatureChatPicker] = useState<keyof AiConfig['features'] | null>(null);
  const [openFeatureEmbeddingPicker, setOpenFeatureEmbeddingPicker] = useState<keyof AiConfig['features'] | null>(null);
  const [browseErrorChat, setBrowseErrorChat] = useState<Record<ProviderKey, string | null>>({
    anthropic: null, openai: null, xai: null, minimax: null, gemini: null, custom: null,
  });
  const [browseErrorEmbedding, setBrowseErrorEmbedding] = useState<string | null>(null);
  const [browseErrorFeature, setBrowseErrorFeature] = useState<string | null>(null);

  // v1.80.x — derived grouped lists for the Feature Configuration
  // model pickers. Computed on every render (cheap) so changes to
  // `liveChatModels` (after a Browse live click) flow through to the
  // picker without a refresh. Empty groups omitted.
  const chatProviderGroups: ProviderGroup[] = (Object.keys(PROVIDER_META) as ProviderKey[])
    .map((pk) => {
      const meta = PROVIDER_META[pk];
      const live = liveChatModels[pk] ?? [];
      const deduped = Array.from(new Set([...live, ...meta.suggestedModels]));
      return { provider: pk, label: meta.label, models: deduped };
    })
    .filter((g) => g.models.length > 0);
  const chatProviderGroupCount = chatProviderGroups.reduce((n, g) => n + g.models.length, 0);
  // Embedding groups: only one provider at a time is fetched today
  // (the global embedding config selects one provider). We fold the
  // current provider's live list under that provider's section, and
  // fall back to the static suggestions for the others so the picker
  // is never empty after the admin has typed a provider key.
  const STATIC_EMBED_SUGGESTIONS: Record<string, string[]> = {
    local:       ['mixedbread-ai/mxbai-embed-large-v1'],
    huggingface: ['mixedbread-ai/mxbai-embed-large-v1', 'sentence-transformers/all-MiniLM-L6-v2'],
    openai:      ['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002'],
    custom:      ['mixedbread-ai/mxbai-embed-large-v1'],
  };
  const embeddingGroups: ProviderGroup[] = (['local', 'huggingface', 'openai', 'custom'] as const)
    .map((pk) => {
      const live = embeddingDraft?.provider === pk ? (liveEmbeddingModels ?? []) : [];
      const fallback = STATIC_EMBED_SUGGESTIONS[pk] ?? [];
      const deduped = Array.from(new Set([...live, ...fallback]));
      return { provider: pk as unknown as ProviderKey, label: pk, models: deduped };
    })
    .filter((g) => g.models.length > 0);
  const embeddingGroupCount = embeddingGroups.reduce((n, g) => n + g.models.length, 0);

  const loadConfig = useCallback(async () => {
    try {
      // Fetch config and per-provider hasKey in parallel. The config
      // endpoint alone only tells us which provider is "active" — to
      // know whether each provider actually has an API key we need the
      // dedicated providers endpoint. Without this, the UI cannot
      // distinguish a working provider from an unconfigured one.
      const [configRes, providersRes] = await Promise.all([
        adminApi.get<AiConfig & { hasOverride?: boolean; source?: string }>('/admin/ai/config', {
          params: activeBatchId ? { batchId: activeBatchId } : undefined,
        }),
        adminApi.get<{ providers: Array<{ id: string; hasKey: boolean }> }>('/admin/ai/providers'),
      ]);
      const data = configRes.data;
      setConfig(data);
      setActiveProvider(data.activeProvider);
      setFeatures(data.features);
      setHasOverride(data.hasOverride ?? true);
      setProviderDrafts(prev => {
        const next = { ...prev };
        for (const p of ['anthropic','openai','xai','minimax','gemini','custom'] as ProviderKey[]) {
          next[p] = { ...next[p], apiKey: '' , baseURL: data.providers[p]?.baseURL ?? '', model: data.providers[p]?.model ?? '', customModelField: data.providers[p]?.customModelField ?? '' };
        }
        return next;
      });
      // Seed providerKeyStatus from the providers endpoint.
      const status: ProviderKeyStatus = { anthropic: false, openai: false, xai: false, minimax: false, gemini: false, custom: false };
      for (const p of providersRes.data.providers ?? []) {
        if (p.id in status) status[p.id as keyof ProviderKeyStatus] = !!p.hasKey;
      }
      setProviderKeyStatus(status);
      if (data.embedding) {
        setEmbeddingDraft(prev => ({
          ...prev,
          provider: data.embedding.provider || 'local',
          model: data.embedding.model || 'mixedbread-ai/mxbai-embed-large-v1',
          dimensions: data.embedding.dimensions || 1024,
          baseURL: data.embedding.baseURL || '',
          apiKey: ''
        }));
      }
    } catch { setError('Failed to load AI configuration.'); }
    finally { setLoading(false); }
  }, [activeBatchId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], enabled: !p[feature].enabled } } : p); setHasChanges(true); };
  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], model } } : p); setHasChanges(true); };
  const handleEmbeddingModelChange = (feature: keyof AiConfig['features'], embeddingModel: string) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], embeddingModel } } : p); setHasChanges(true); };
  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], temperature } } : p); setHasChanges(true); };
  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], maxTokens } } : p); setHasChanges(true); };
  // v1.85 — provider-failover controls. allowFallback toggles
  // the whole chain; fallbackProviders is a free-order list of
  // provider names that the chain walks in order (empty = use
  // the server-side default order). Stored alongside the
  // feature model + temperature; backend honours them on the
  // next request without restart.
  const handleAllowFallbackChange = (feature: keyof AiConfig['features'], allowed: boolean) => {
    if (!features) return;
    setFeatures(p => p ? { ...p, [feature]: { ...p[feature], allowFallback: allowed } } : p);
    setHasChanges(true);
  };
  const handleToggleFallbackProvider = (feature: keyof AiConfig['features'], provider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom') => {
    if (!features) return;
    setFeatures(p => {
      if (!p) return p;
      const cur = p[feature].fallbackProviders ?? [];
      const next = cur.includes(provider) ? cur.filter(x => x !== provider) : [...cur, provider];
      return { ...p, [feature]: { ...p[feature], fallbackProviders: next } };
    });
    setHasChanges(true);
  };
  const handleMoveFallbackProvider = (feature: keyof AiConfig['features'], provider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom', dir: -1 | 1) => {
    if (!features) return;
    setFeatures(p => {
      if (!p) return p;
      const cur = [...(p[feature].fallbackProviders ?? [])];
      const idx = cur.indexOf(provider);
      if (idx < 0) return p;
      const swap = idx + dir;
      if (swap < 0 || swap >= cur.length) return p;
      [cur[idx], cur[swap]] = [cur[swap], cur[idx]];
      return { ...p, [feature]: { ...p[feature], fallbackProviders: cur } };
    });
    setHasChanges(true);
  };

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
    // Pre-flight guard: if the provider has no API key configured,
    // skip the network round-trip and surface a clean message. The
    // backend now does the same check on its side, but doing it here
    // saves the request entirely and gives the UI a stable, non-401
    // error string to display.
    if (!providerKeyStatus[provider as keyof ProviderKeyStatus]) {
      setTestResult({ provider, ok: false, message: `No API key configured for ${provider}. Save a key first, then test.` });
      setTestingProvider(null);
      return;
    }
    try { const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider } }); setTestResult({ provider, ok: res.data.ok, message: res.data.message }); }
    catch (err: any) { setTestResult({ provider, ok: false, message: err.response?.data?.message || 'Connection failed' }); }
    finally { setTestingProvider(null); }
  };

  const handleSaveProviderDraft = async (provider: ProviderKey) => {
    const draft = providerDrafts[provider]; setSavingProviderDraft(provider); setError('');
    try {
      // v1.83 — multi-key rotation. Build the canonical `keys[]`
      // payload from the draft rows, defaulting the first row's
      // label to "Primary" if empty (matches the seed convention
      // the backend uses when promoting legacy single keys).
      // Stripped to label/value/baseURL only (no `id`/`showValue`).
      const keysPayload = (draft.keys ?? [])
        .map((k, idx) => ({
          label: (k.label ?? '').trim() || (idx === 0 ? 'Primary' : `Key ${idx + 1}`),
          value: k.value ?? '',
          ...(provider === 'custom' && k.baseURL ? { baseURL: k.baseURL } : {}),
        }))
        // Drop empty rows (no value AND no label) so admins can
        // remove a "planned" row by clearing both fields.
        .filter((k) => k.value.trim() !== '' || k.label.trim() !== '');
      // Legacy back-compat shape: keep providers.<p>.apiKey pointing
      // at the primary slot's value so the existing PATCH endpoint
      // remains the source of truth for one-key writes (the server
      // will also upsert the same value into keys[0]).
      const body: Record<string, unknown> = {
        providers: {
          [provider]: {
            baseURL: draft.baseURL,
            model: draft.model,
            customModelField: draft.customModelField,
            ...(keysPayload[0]?.value ? { apiKey: keysPayload[0].value } : {}),
            // v1.83 — new shape; backend v1.83+ uses it to populate
            // multi-key rows. Backend ignores on older builds (no
            // harm) and the legacy `apiKey` above keeps the legacy
            // flow working unchanged.
            keys: keysPayload,
          },
        },
        batchId: activeBatchId ?? null,
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`${PROVIDER_META[provider].label} configuration saved.`);
      // Clear draft values after a successful save so secrets don't
      // linger in component state.
      setProviderDrafts(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          apiKey: '',
          keys: (prev[provider].keys ?? []).map((k) => ({ ...k, value: '', showValue: false })),
        },
      }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save provider configuration.'); }
    finally { setSavingProviderDraft(null); }
  };

  // v1.83 — multi-key CRUD handlers.
  // Each one targets a single provider's draft slot; row identity
  // is `row.id` (client-only, never sent to server).

  // Append a fresh empty row at the end. Capped at 10 by the
  // caller-side button (also enforced server-side on PUT).
  const handleAddKey = (provider: ProviderKey) => {
    setProviderDrafts(prev => {
      const cur = prev[provider];
      if ((cur.keys?.length ?? 0) >= 10) return prev;
      return {
        ...prev,
        [provider]: { ...cur, keys: [...(cur.keys ?? []), emptyKeyRow()] },
      };
    });
  };

  const handleRemoveKey = (provider: ProviderKey, rowId: string) => {
    setProviderDrafts(prev => {
      const cur = prev[provider];
      const nextKeys = (cur.keys ?? []).filter((k) => k.id !== rowId);
      // Always keep at least one row. If the removed row was the
      // last one, replace it with an empty one.
      const keys = nextKeys.length > 0 ? nextKeys : [emptyKeyRow()];
      return { ...prev, [provider]: { ...cur, keys } };
    });
  };

  const handleMoveKey = (provider: ProviderKey, rowId: string, dir: -1 | 1) => {
    setProviderDrafts(prev => {
      const cur = prev[provider];
      const keys = [...(cur.keys ?? [])];
      const idx = keys.findIndex((k) => k.id === rowId);
      if (idx < 0) return prev;
      const swap = idx + dir;
      if (swap < 0 || swap >= keys.length) return prev;
      [keys[idx], keys[swap]] = [keys[swap], keys[idx]];
      return { ...prev, [provider]: { ...cur, keys } };
    });
  };

  const handleUpdateKey = (provider: ProviderKey, rowId: string, patch: Partial<ProviderKeyRow>) => {
    setProviderDrafts(prev => {
      const cur = prev[provider];
      const keys = (cur.keys ?? []).map((k) => k.id === rowId ? { ...k, ...patch } : k);
      return { ...prev, [provider]: { ...cur, keys } };
    });
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

  // Live model browser. Three callers (chat / embedding / feature) all
  // share the same response shape from /admin/ai/providers/models. The
  // function never throws — the backend always returns ok:false on
  // failure, so the catch here only fires on transport errors (the
  // request never got a response). On any failure the error is stored
  // in the appropriate slot and the UI shows it inline; the hardcoded
  // `suggestedModels` list still works as a fallback.
  const handleBrowseModels = async (
    target: 'chat' | 'embedding' | 'feature',
    providerId: string,
  ) => {
    if (target === 'chat') {
      setBrowsingChat((p) => ({ ...p, [providerId]: true }));
      setBrowseErrorChat((p) => ({ ...p, [providerId]: null }));
    } else if (target === 'embedding') {
      setBrowsingEmbedding(true);
      setBrowseErrorEmbedding(null);
    } else {
      setBrowsingFeature(true);
      setBrowseErrorFeature(null);
    }
    try {
      const res = await adminApi.get<{ ok: boolean; models: string[]; error?: string }>(
        '/admin/ai/providers/models',
        { params: { provider: providerId, kind: target === 'embedding' ? 'embedding' : 'chat' } },
      );
      if (res.data.ok && Array.isArray(res.data.models)) {
        if (target === 'chat') {
          setLiveChatModels((p) => ({ ...p, [providerId]: res.data.models }));
        } else if (target === 'embedding') {
          setLiveEmbeddingModels(res.data.models);
        } else {
          setLiveFeatureModels(res.data.models);
        }
      } else {
        const msg = res.data.error || 'No models returned.';
        if (target === 'chat') {
          setBrowseErrorChat((p) => ({ ...p, [providerId]: msg }));
          setLiveChatModels((p) => ({ ...p, [providerId]: [] }));
        } else if (target === 'embedding') {
          setBrowseErrorEmbedding(msg);
          setLiveEmbeddingModels([]);
        } else {
          setBrowseErrorFeature(msg);
          setLiveFeatureModels([]);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Network error';
      if (target === 'chat') {
        setBrowseErrorChat((p) => ({ ...p, [providerId]: msg }));
        setLiveChatModels((p) => ({ ...p, [providerId]: [] }));
      } else if (target === 'embedding') {
        setBrowseErrorEmbedding(msg);
        setLiveEmbeddingModels([]);
      } else {
        setBrowseErrorFeature(msg);
        setLiveFeatureModels([]);
      }
    } finally {
      if (target === 'chat') setBrowsingChat((p) => ({ ...p, [providerId]: false }));
      else if (target === 'embedding') setBrowsingEmbedding(false);
      else setBrowsingFeature(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl">
        <div className="h-8 w-48 bg-mist rounded animate-pulse" />
        <div className="h-64 admin-card-surface animate-pulse" />
      </div>
    );
  }

  const currentMeta = PROVIDER_META[activeProvider as ProviderKey];
  const monoInput = 'w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink font-mono focus:outline-none transition-colors admin-input';

  return (
    <div className="space-y-6 max-w-6xl">
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
          <span className="text-[10px] font-medium uppercase tracking-wider text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-0.5">
            ⚠ No per-program override — falling back to global
          </span>
        )}
        {activeBatchId && hasOverride && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 rounded-md px-2 py-0.5">
            ✓ Per-program override active
          </span>
        )}
        {displayedBatchName && activeBatchId && (
          <span className="text-[10px] text-ink-faint ml-auto">
            Saving as per-program override for <span className="font-semibold text-ink">{displayedBatchName}</span>
          </span>
        )}
      </div>

      {success && <div className="flex items-center gap-2 px-4 py-3 admin-toast-success rounded-xl text-sm"><span>✓</span> {success}</div>}
      {error   && <div className="flex items-center gap-2 px-4 py-3 admin-toast-error rounded-xl text-sm"><span>✕</span> {error}</div>}

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

  {/* ── Provider Settings (unified: chat providers + embedding) ───
            Replaces the old "Provider Credentials" + "Embedding Configuration"
            + "Provider Health" trio. The dropdown picks which provider to
            edit; only the selected provider's fields render. Embedding is
            a special value of the dropdown that swaps into embedding-mode
            (provider + dimensions + model + baseURL + key). */}
        <div className="admin-card-surface">
          <div className="admin-card-header bg-mist/40 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">Provider Settings</p>
              <p className="text-xs text-ink-faint mt-0.5">Edit API keys, endpoints, and test connections for any provider or the embedding model.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[10px] font-semibold text-ink-faint uppercase">Editing</label>
              <select
                value={editingProvider}
                onChange={e => {
                  const v = e.target.value as ProviderKey | 'embedding';
                  setEditingProvider(v);
                  // Clear stale test result when switching providers so the
                  // badge doesn't mislead the user about the new provider's
                  // health.
                  setTestResult(null);
                  setEmbeddingTestResult(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs border bg-bg-secondary text-ink font-medium focus:outline-none ${adminInput} min-w-[14rem]`}
              >
                {(Object.keys(PROVIDER_META) as ProviderKey[]).map(k => (
                  <option key={k} value={k}>{PROVIDER_META[k].label}</option>
                ))}
                <option value="embedding">— Embedding Model —</option>
              </select>
            </div>
          </div>

          <div className="p-5">
            {editingProvider === 'embedding' ? (
              <EmbeddingFields
                embeddingDraft={embeddingDraft}
                setEmbeddingDraft={setEmbeddingDraft}
                config={config}
                monoInput={monoInput}
                saving={savingEmbeddingDraft}
                testing={testingEmbedding}
                testResult={embeddingTestResult}
                onTest={handleTestEmbedding}
                onSave={handleSaveEmbeddingDraft}
                liveModels={liveEmbeddingModels}
                browsingModels={browsingEmbedding}
                browseError={browseErrorEmbedding}
                onBrowse={() => handleBrowseModels('embedding', embeddingDraft.provider)}
              />
            ) : (
              <ChatProviderFields
                provider={editingProvider}
                draft={providerDrafts[editingProvider]}
                setProviderDrafts={setProviderDrafts}
                override={config?.providers[editingProvider]}
                isActive={activeProvider === editingProvider}
                hasKey={providerKeyStatus[editingProvider]}
                monoInput={monoInput}
                saving={savingProviderDraft === editingProvider}
                testing={testingProvider === editingProvider}
                testResult={testResult?.provider === editingProvider ? testResult : null}
                onSwitchActive={handleSwitchProvider}
                onTest={handleTestProvider}
                onSave={handleSaveProviderDraft}
                onReveal={handleRevealApiKey}
                onClear={handleClearApiKey}
                savingProviderGlobal={savingProvider}
                liveModels={liveChatModels[editingProvider]}
                browsingModels={browsingChat[editingProvider]}
                browseError={browseErrorChat[editingProvider]}
                onBrowse={(p: ProviderKey) => handleBrowseModels('chat', p)}
                onAddKey={handleAddKey}
                onRemoveKey={handleRemoveKey}
                onMoveKey={handleMoveKey}
                onUpdateKey={handleUpdateKey}
              />
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
          <button onClick={handleSaveFeatures} disabled={saving || !hasChanges} className={`${adminBtnPrimary} px-4 py-2 text-xs`}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
        {features && (
          <div className="divide-y divide-border">
            {(Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>).map((feature) => {
              const f = features[feature];
              // Defensive: if a feature key is missing from the API
              // response (stale DB doc, partial update, etc.), skip the
              // row instead of crashing the whole page.
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
                    <button
                      type="button"
                      onClick={() => onTestFeature(feature)}
                      disabled={!f.enabled || testingFeature === feature}
                      title={`Fire an actual ${feature} call against the current config (uses the active provider's key + base URL + customModelField). Lets you verify the whole pipeline without waiting for a cron tick.`}
                      className={`${adminBtnSecondary} px-2 py-1 text-[10px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0`}
                    >
                      {testingFeature === feature
                        ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</>
                        : '▶ Test'}
                    </button>
                  </div>
                  <div className={`grid grid-cols-2 gap-3 ${f.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    {/* Chat model row — picker is grouped by provider,
                        populated from live-fetched + suggested models
                        across every configured provider. */}
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={f.model}
                          onChange={e => handleModelChange(feature, e.target.value)}
                          className={`${adminInput} text-xs`}
                          placeholder="(model id)"
                        />
                        <button
                          type="button"
                          onClick={() => setOpenFeatureChatPicker(feature)}
                          disabled={chatProviderGroups.length === 0}
                          title={chatProviderGroups.length === 0
                            ? 'Save a key + click "Browse live" in the Provider Settings card to populate this list.'
                            : `Browse ${chatProviderGroupCount} models grouped by provider`}
                          className={`${adminBtnSecondary} px-2 py-1.5 text-[10px] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          🔄 Models
                        </button>
                      </div>
                      <ModelPickerModal
                        open={openFeatureChatPicker === feature}
                        onClose={() => setOpenFeatureChatPicker(null)}
                        title={`${FEATURE_LABELS[feature]} — chat model (grouped by provider)`}
                        models={[]}
                        current={f.model}
                        onPick={(m) => { handleModelChange(feature, m); setOpenFeatureChatPicker(null); }}
                        groupedByProvider={chatProviderGroups}
                        pickerId={`feature:chat:${feature}`}
                      />
                    </div>
                    {/* Temperature + max tokens are 2-up on the right. */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Temperature <span className="text-[9px] font-normal">(0–1)</span></label>
                        <input type="number" min="0" max="1" step="0.05" value={Number(f.temperature.toFixed(2))} onChange={e => handleTempChange(feature, parseFloat(e.target.value) || 0)} className={`${adminInput} text-xs`} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Max Tokens</label>
                        <input type="number" min="64" max="8192" step="64" value={f.maxTokens} onChange={e => handleMaxTokensChange(feature, parseInt(e.target.value) || 1024)} className={`${adminInput} text-xs`} />
                      </div>
                    </div>
                    {/* Embedding model row — picker is populated from
                        the global embedding live-fetch results plus the
                        existing embedding.suggested fallback list. Same
                        UX as the chat row but bound to the embedding
                        model field on the feature. Stored against the
                        feature doc via the same PATCH as chat config;
                        backend will round-trip the unknown field. */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Embedding Model <span className="text-[9px] font-normal">(optional — falls back to global embedding)</span></label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={f.embeddingModel ?? ''}
                          onChange={e => handleEmbeddingModelChange(feature, e.target.value)}
                          className={`${adminInput} text-xs`}
                          placeholder={config?.embedding?.model ?? '(global embedding model)'}
                        />
                        <button
                          type="button"
                          onClick={() => setOpenFeatureEmbeddingPicker(feature)}
                          disabled={embeddingGroups.length === 0}
                          title={embeddingGroups.length === 0
                            ? 'Configure an embedding provider (Embedding section below) and click "Browse live" to populate this list.'
                            : `Browse ${embeddingGroupCount} embedding models grouped by provider`}
                          className={`${adminBtnSecondary} px-2 py-1.5 text-[10px] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          🔄 Models
                        </button>
                      </div>
                      <ModelPickerModal
                        open={openFeatureEmbeddingPicker === feature}
                        onClose={() => setOpenFeatureEmbeddingPicker(null)}
                        title={`${FEATURE_LABELS[feature]} — embedding model (grouped by provider)`}
                        models={[]}
                        current={f.embeddingModel ?? ''}
                        onPick={(m) => { handleEmbeddingModelChange(feature, m); setOpenFeatureEmbeddingPicker(null); }}
                        groupedByProvider={embeddingGroups}
                        pickerId={`feature:embedding:${feature}`}
                      />
                    </div>
                    {/* v1.85 — provider failover. Toggle the chain
                        on/off; reorder the per-feature fallback
                        list (drag-style up/down buttons; order =
                        chain order). Empty list = "use the server
                        default order". Each provider in the list
                        must have a key configured (in Provider
                        Settings) for the chain to actually try it;
                        unconfigured providers are silently
                        skipped server-side. */}
                    <div className="col-span-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <label className="flex items-center gap-2 text-[10px] font-semibold text-ink-faint uppercase">
                          <input
                            type="checkbox"
                            checked={f.allowFallback !== false}
                            onChange={e => handleAllowFallbackChange(feature, e.target.checked)}
                            data-testid={`feature-${feature}-allow-fallback`}
                            className="cursor-pointer"
                          />
                          Allow Provider Fallback
                        </label>
                        <span className="text-[10px] text-ink-faint">
                          {f.fallbackProviders && f.fallbackProviders.length > 0
                            ? `${f.fallbackProviders.length} provider(s) in chain`
                            : 'using server default order'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5" data-testid={`feature-${feature}-fallback-chain`}>
                        {(['anthropic', 'openai', 'xai', 'minimax', 'gemini', 'custom'] as const).map((prov) => {
                          const inChain = (f.fallbackProviders ?? []).includes(prov);
                          const orderIdx = (f.fallbackProviders ?? []).indexOf(prov);
                          const provHasKey = config?.providers?.[prov]?.hasKey ?? false;
                          return (
                            <div
                              key={prov}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] ${
                                inChain
                                  ? 'bg-accent/10 border-accent/40 text-ink'
                                  : 'bg-mist/40 border-border text-ink-faint'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleFallbackProvider(feature, prov)}
                                disabled={!provHasKey}
                                title={!provHasKey
                                  ? `${prov} has no API key — configure it in Provider Settings first`
                                  : inChain
                                    ? `Click to remove ${prov} from the chain`
                                    : `Click to add ${prov} to the chain`}
                                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 font-semibold"
                              >
                                {prov}
                                {inChain && (
                                  <span className="ml-1 text-[9px] text-ink-faint">#{orderIdx + 1}</span>
                                )}
                              </button>
                              {inChain && (
                                <span className="flex items-center gap-0.5 ml-1 border-l border-border/60 pl-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveFallbackProvider(feature, prov, -1)}
                                    disabled={orderIdx === 0}
                                    aria-label={`Move ${prov} earlier in the chain`}
                                    className="text-[10px] px-1 text-ink-soft hover:text-ink disabled:opacity-30"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveFallbackProvider(feature, prov, +1)}
                                    disabled={orderIdx === (f.fallbackProviders?.length ?? 0) - 1}
                                    aria-label={`Move ${prov} later in the chain`}
                                    className="text-[10px] px-1 text-ink-soft hover:text-ink disabled:opacity-30"
                                  >
                                    ▼
                                  </button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-ink-faint mt-1.5">
                        Retriable failures (401, 429, 5xx, network) trigger the next provider.
                        Validation errors (400) abort the chain. The chain is also auto-skipped
                        for providers without a configured API key.
                      </p>
                    </div>
                  </div>
                  {/* v1.82 — live test result panel. Shows whatever the
                      last call returned (or an error) below the row's
                      inputs. Auto-clears on next test. */}
                  {featureTestResults[feature] && (
                    <div className={`mt-2 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap break-words ${featureTestResults[feature]!.ok ? 'bg-success/10 border border-success/30 text-success' : 'bg-danger/10 border border-danger/30 text-danger'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold">{featureTestResults[feature]!.ok ? '✓' : '✕'} {featureTestResults[feature]!.preview}</span>
                        <span className="text-[10px] opacity-70">{featureTestResults[feature]!.durationMs}ms</span>
                      </div>
                      {featureTestResults[feature]!.content && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70">raw response</summary>
                          <pre className="mt-1 text-[10px] max-h-48 overflow-y-auto">{featureTestResults[feature]!.content}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>
  );
}
