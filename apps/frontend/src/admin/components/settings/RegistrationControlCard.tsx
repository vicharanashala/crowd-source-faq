/**
 * RegistrationControlCard — admin UI for the v1.70 controlled-registration
 * feature, extended in v1.7x with an "open for all" toggle. Mounted on
 * /admin/settings (alongside GoldenTicketSettingsCard).
 *
 * Endpoints (all admin-only):
 *   GET   /api/admin/registration-config         → current state + link
 *   PATCH /api/admin/registration-config         → toggle enabled + openForAll
 *   POST  /api/admin/registration-config/regenerate-token  → fresh token + link
 *
 * Modes:
 *   enabled=false                   → registration closed (every POST = 403)
 *   enabled=true,  openForAll=false → invite-only (POST needs ?token=)
 *   enabled=true,  openForAll=true  → open for all (POST without ?token= succeeds)
 *
 * On regenerate we get the plaintext token + the full invite link ONCE
 * from the response. We display it with a Copy button so the admin can
 * paste it into Slack / email. We don't persist the plaintext anywhere
 * client-side — the DB only stores the hash and the next GET returns
 * the same plaintext because the backend keeps it on the server.
 *
 * When openForAll is on the invite link is still kept on the server
 * (so the admin can flip back without regenerating), but we de-emphasise
 * it in the UI to avoid suggesting it's the active registration path.
 */
import { useEffect, useState, useCallback } from 'react';
import adminApi from '../../utils/adminApi';
import { useAdminAuth } from '../../hooks/useAdminAuth';

interface ConfigResponse {
  enabled: boolean;
  openForAll: boolean;
  inviteRequired: boolean;
  inviteLink: string;
  tokenGeneratedAt: string;
  allowedDomains: string[];
  lastToggledBy: { id: string; name: string | null; email: string | null } | null;
  lastToggledAt: string;
}

interface RegenerateResponse {
  token: string;
  inviteLink: string;
  tokenGeneratedAt: string;
}

interface Props {
  onSaved: (msg: string, type: 'success' | 'error') => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function RegistrationControlCard({ onSaved }: Props): React.ReactNode {
  const { user } = useAdminAuth();
  if (user?.role !== 'admin') return null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [openForAll, setOpenForAll] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [allowedDomainsInput, setAllowedDomainsInput] = useState('');
  const [savingDomains, setSavingDomains] = useState(false);
  const [lastToggledBy, setLastToggledBy] = useState<ConfigResponse['lastToggledBy']>(null);
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null);
  const [tokenGeneratedAt, setTokenGeneratedAt] = useState<string | null>(null);

  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.get<ConfigResponse>('/admin/registration-config');
      setEnabled(res.data.enabled);
      setOpenForAll(res.data.openForAll);
      setInviteLink(res.data.inviteLink);
      setAllowedDomains(res.data.allowedDomains || []);
      setAllowedDomainsInput((res.data.allowedDomains || []).join(', '));
      setLastToggledBy(res.data.lastToggledBy);
      setLastToggledAt(res.data.lastToggledAt);
      setTokenGeneratedAt(res.data.tokenGeneratedAt);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load registration settings';
      setError(msg);
      onSaved(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [onSaved]);

  useEffect(() => {
    void load();
  }, [load]);

  // Generic PATCH helper — sends whichever flags the caller supplies.
  // The backend accepts { enabled?, openForAll? } and 400s if both are
  // missing, so we always send at least one flag.
  const patchConfig = async (
    body: { enabled?: boolean; openForAll?: boolean; allowedDomains?: string[] },
    successMsg: string,
  ): Promise<void> => {
    try {
      const res = await adminApi.patch<{
        enabled: boolean;
        openForAll: boolean;
        allowedDomains: string[];
        lastToggledAt: string;
      }>('/admin/registration-config', body);
      setEnabled(res.data.enabled);
      setOpenForAll(res.data.openForAll);
      setAllowedDomains(res.data.allowedDomains || []);
      setAllowedDomainsInput((res.data.allowedDomains || []).join(', '));
      setLastToggledAt(res.data.lastToggledAt);
      onSaved(successMsg, 'success');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Toggle failed';
      onSaved(msg, 'error');
    }
  };

  const toggleEnabled = async (next: boolean): Promise<void> => {
    setTogglingEnabled(true);
    try {
      await patchConfig({ enabled: next }, next ? 'Registration enabled' : 'Registration disabled');
    } finally {
      setTogglingEnabled(false);
    }
  };

  const toggleOpenForAll = async (next: boolean): Promise<void> => {
    setTogglingOpen(true);
    try {
      await patchConfig(
        { openForAll: next },
        next
          ? 'Open-for-all enabled — anyone can register without an invite link.'
          : 'Open-for-all disabled — registration now requires an invite link.',
      );
    } finally {
      setTogglingOpen(false);
    }
  };

  const saveDomains = async (): Promise<void> => {
    setSavingDomains(true);
    const domains = allowedDomainsInput
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
    try {
      await patchConfig({ allowedDomains: domains }, 'Allowed email domains updated.');
    } finally {
      setSavingDomains(false);
    }
  };

  const regenerate = async (): Promise<void> => {
    setRegenerating(true);
    try {
      const res = await adminApi.post<RegenerateResponse>(
        '/admin/registration-config/regenerate-token',
      );
      setInviteLink(res.data.inviteLink);
      setTokenGeneratedAt(res.data.tokenGeneratedAt);
      setConfirmingRegen(false);
      onSaved('Invite link regenerated — old link is now invalid.', 'success');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Regenerate failed';
      onSaved(msg, 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const copyLink = async (): Promise<void> => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onSaved('Could not copy to clipboard', 'error');
    }
  };

  const lastToggledByLine = lastToggledBy
    ? `${lastToggledBy.name ?? lastToggledBy.email ?? 'admin'} · ${formatDate(lastToggledAt)}`
    : 'Never toggled';

  // Derived state used by the UI to render the right "current mode" banner.
  // Mirrors the backend's gate logic so admins see a single source of truth.
  let modeBanner: { tone: 'closed' | 'open' | 'invite'; text: string };
  if (!enabled) {
    modeBanner = {
      tone: 'closed',
      text: 'Registration is currently CLOSED — every POST /api/auth/register returns 403.',
    };
  } else if (openForAll) {
    modeBanner = {
      tone: 'open',
      text: 'Registration is OPEN TO EVERYONE — no invite link required.',
    };
  } else {
    modeBanner = {
      tone: 'invite',
      text: 'Registration is INVITE-ONLY — callers must supply the current invite link.',
    };
  }

  // The "Open for all" sub-toggle is meaningless while registration is
  // closed (the gate rejects everyone regardless). Disable it so admins
  // don't flip it on, see "still closed", and file a bug. We still allow
  // the value to stick on the server (the backend persists it) — just
  // hide it from the click target.
  const openToggleDisabled = loading || togglingEnabled || !enabled;

  return (
    <div className="admin-card-surface">
      <div className="admin-card-header">
        <p className="text-sm font-semibold text-ink">Registration Control</p>
        <p className="text-xs text-ink-faint mt-0.5">
          Public self-registration is OFF by default. Toggle "Allow new
          registrations" on, then choose between invite-only (default) or
          open-for-all (no invite link needed).
        </p>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Error banner — shown when initial load fails */}
        {error && (
          <div
            className="rounded-md px-3 py-2 text-xs border border-red-200 bg-red-50 text-red-900"
            aria-live="assertive"
          >
            <span className="font-semibold">Load failed: </span>
            {error}
          </div>
        )}

        {/* Mode banner — derived state, not editable */}
        <div
          className={[
            'rounded-md px-3 py-2 text-xs border',
            modeBanner.tone === 'closed'
              ? 'bg-red-50 border-red-200 text-red-900'
              : modeBanner.tone === 'open'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900',
          ].join(' ')}
          aria-live="polite"
        >
          <span className="font-semibold">Current mode: </span>
          {modeBanner.text}
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <p className="text-sm font-medium text-ink">Allow new registrations</p>
            <p className="text-xs text-ink-faint mt-1">
              Master switch. When OFF, every <code className="font-mono">POST /api/auth/register</code>{' '}
              returns 403 — including requests with a valid token.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Allow new registrations"
            disabled={loading || togglingEnabled}
            onClick={() => toggleEnabled(!enabled)}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
              enabled ? 'bg-emerald-500' : 'bg-border',
              loading || togglingEnabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
                enabled ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Open-for-all sub-toggle */}
        <div
          className={[
            'flex items-center justify-between gap-4 pb-4 border-b border-border pl-3',
            openToggleDisabled ? 'opacity-60' : '',
          ].join(' ')}
        >
          <div>
            <p className="text-sm font-medium text-ink">Open for all</p>
            <p className="text-xs text-ink-faint mt-1">
              When ON, anyone with a valid email and password can register
              without an invite link. Stored invite link is preserved on the
              server so you can flip this off and reactivate it without
              regenerating.
            </p>
            {!enabled && (
              <p className="text-[11px] text-amber-700 mt-1">
                Enable "Allow new registrations" first to make this take effect.
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={openForAll}
            aria-label="Open for all (no invite required)"
            disabled={openToggleDisabled || togglingOpen}
            onClick={() => toggleOpenForAll(!openForAll)}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
              openForAll ? 'bg-emerald-500' : 'bg-border',
              openToggleDisabled || togglingOpen
                ? 'opacity-60 cursor-not-allowed'
                : 'cursor-pointer',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
                openForAll ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Email Domain Restriction input */}
        <div className="pb-4 border-b border-border pl-3">
          <label className="admin-label">Allowed Email Domains</label>
          <p className="text-xs text-ink-faint mb-2">
            Restrict self-registration to specific email domains (comma-separated, e.g. <code className="font-mono">flowkey.io, university.edu</code>). Leave empty for no restriction.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              disabled={loading || savingDomains}
              placeholder="e.g. flowkey.io, college.edu"
              value={allowedDomainsInput}
              onChange={(e) => setAllowedDomainsInput(e.target.value)}
              className="admin-input flex-1"
            />
            <button
              type="button"
              onClick={saveDomains}
              disabled={loading || savingDomains}
              className="admin-btn-primary shrink-0"
            >
              {savingDomains ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Invite link */}
        <div className={openForAll ? 'opacity-70' : ''}>
          <label className="admin-label">
            Current invite link
            {openForAll && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">
                Inactive — open-for-all is on
              </span>
            )}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={loading ? 'Loading…' : inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="admin-input font-mono text-xs flex-1"
              aria-label="Current invite link URL"
            />
            <button
              type="button"
              onClick={copyLink}
              disabled={!inviteLink || loading}
              className="admin-btn-secondary shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-ink-faint mt-1.5">
            {openForAll
              ? 'Currently unused for new registrations (gate bypasses it). Will reactivate instantly when you turn Open-for-all off.'
              : 'Anyone with this link can register while the master toggle is ON. Regenerating instantly invalidates the old link.'}
          </p>
        </div>

        {/* Regenerate */}
        <div>
          {!confirmingRegen ? (
            <button
              type="button"
              onClick={() => setConfirmingRegen(true)}
              disabled={loading || regenerating}
              className="admin-btn-secondary"
            >
              Regenerate invite link
            </button>
          ) : (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                Regenerating will invalidate the current link immediately.
                Anyone using the old link will get a 403.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={regenerating}
                  className="admin-btn-primary"
                >
                  {regenerating ? 'Regenerating…' : 'Confirm regenerate'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRegen(false)}
                  disabled={regenerating}
                  className="admin-btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Audit info */}
        <div className="border-t border-border pt-3 space-y-1 text-xs text-ink-soft">
          <div className="flex items-center justify-between">
            <span>Token generated</span>
            <span className="text-ink-faint">{formatDate(tokenGeneratedAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last toggled by</span>
            <span className="text-ink-faint">{lastToggledByLine}</span>
          </div>
        </div>
      </div>
    </div>
  );
}