/**
 * ErrorBoundary.tsx — React 16+ error boundary.
 *
 * H2 fix (v1.68): A render-time exception in any page unmounts
 * the entire React tree and leaves the user with a blank page.
 * This boundary catches errors during render / lifecycle /
 * constructors of descendant components, logs them to the
 * backend /api/log endpoint (which writes to main_log.txt with
 * the request context), and shows a friendly fallback UI with
 * recovery options.
 *
 * Usage:
 *   <ErrorBoundary sectionName="AdminGoldenTickets">
 *     <AdminGoldenTickets />
 *   </ErrorBoundary>
 *
 * Two flavors:
 *   - level="top"    (default) — full-page "Something went wrong"
 *   - level="section" — inline card, parent layout still works
 *
 * Routes errors to the existing /api/log endpoint (see
 * backend/utils/http/fileLogger.ts → ingestFrontendLog). The
 * endpoint is unauthenticated by design so a logged-out user
 * hitting a broken page can still surface the error.
 */

import React from 'react';
import Spinner from './Spinner';

type Level = 'top' | 'section';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Where the boundary sits. Used for the log line + fallback UI. */
  sectionName: string;
  /** 'top' = full-page, 'section' = inline card. Default 'top'. */
  level?: Level;
  /** Optional fallback. If omitted, a built-in panel is used. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  /** True after the user clicks "report" — used to disable the button. */
  reported: boolean;
}

const INITIAL_STATE: ErrorBoundaryState = {
  hasError: false,
  error: null,
  componentStack: null,
  reported: false,
};

/**
 * Best-effort fire-and-forget POST to /api/log. Backend writes
 * to main_log.txt. We never throw out of this — the boundary's
 * job is to recover, not to crash the recovery UI.
 */
function reportError(
  sectionName: string,
  error: Error,
  componentStack: string | null,
): void {
  const meta = {
    section: sectionName,
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack ?? '',
    componentStack: componentStack ?? '',
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
  // fetch can fail silently in old browsers / blocked networks;
  // we don't await and we don't throw.
  try {
    void fetch('/csfaq/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'ERROR', message: `[frontend]: unhandled error in ${sectionName}`, meta }),
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch {
    /* swallow */
  }
  // Also log to devtools — the only place an engineer sees
  // this without trawling main_log.txt.
  // eslint-disable-next-line no-console
  console.error(`[ErrorBoundary:${sectionName}]`, error, componentStack);
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    this.setState({ componentStack: info.componentStack ?? null });
    reportError(this.props.sectionName, error, info.componentStack ?? null);
  }

  handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  handleHome = (): void => {
    if (typeof window !== 'undefined') window.location.href = '/';
  };

  handleCopyDetails = async (): Promise<void> => {
    const { error, componentStack } = this.state;
    const text = [
      `Section: ${this.props.sectionName}`,
      `Error: ${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
      '',
      'Stack:',
      error?.stack ?? '',
      '',
      'Component stack:',
      componentStack ?? '',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ reported: true });
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); this.setState({ reported: true }); }
      catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
  };

  handleReport = (): void => {
    // Re-fire the report (useful if /api/log was down on the
    // first attempt) and mark as reported.
    if (this.state.error) {
      reportError(this.props.sectionName, this.state.error, this.state.componentStack);
    }
    this.setState({ reported: true });
  };

  reset = (): void => {
    this.setState(INITIAL_STATE);
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    if (this.props.level === 'section') {
      return <SectionFallback
        sectionName={this.props.sectionName}
        error={this.state.error}
        onReset={this.reset}
      />;
    }

    return <TopFallback
      sectionName={this.props.sectionName}
      error={this.state.error}
      reported={this.state.reported}
      onReload={this.handleReload}
      onHome={this.handleHome}
      onCopy={this.handleCopyDetails}
      onReport={this.handleReport}
    />;
  }
}

// ─── Fallback UIs ───────────────────────────────────────────────────────────

function TopFallback(props: {
  sectionName: string;
  error: Error | null;
  reported: boolean;
  onReload: () => void;
  onHome: () => void;
  onCopy: () => void;
  onReport: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="min-h-screen bg-bg flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-float">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-ink">Something went wrong</h1>
            <p className="text-xs text-ink-faint mt-0.5">in <code className="font-mono">{props.sectionName}</code></p>
          </div>
        </div>

        <p className="text-sm text-ink-soft leading-relaxed mb-4">
          {props.error?.message
            ? props.error.message
            : 'An unexpected error broke this page. The rest of the app is still working.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onReload}
            className="btn-base btn-primary text-sm"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={props.onHome}
            className="btn-base btn-secondary text-sm"
          >
            Go home
          </button>
          <button
            type="button"
            onClick={props.onReport}
            disabled={props.reported}
            className="btn-base btn-secondary text-sm"
          >
            {props.reported ? 'Reported' : 'Report issue'}
          </button>
          <button
            type="button"
            onClick={props.onCopy}
            className="text-xs text-ink-faint hover:text-ink-soft underline self-center ml-auto"
          >
            Copy error details
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionFallback(props: {
  sectionName: string;
  error: Error | null;
  onReset: () => void;
}): React.ReactElement {
  return (
    <div role="alert" className="admin-card-surface p-5 my-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">This section failed to render</h3>
          <p className="text-xs text-ink-faint mt-1 font-mono truncate">{props.sectionName}</p>
          {props.error?.message && (
            <p className="text-xs text-ink-soft mt-2 leading-relaxed">{props.error.message}</p>
          )}
          <button
            type="button"
            onClick={props.onReset}
            className="text-xs text-accent hover:underline mt-2"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight Suspense fallback for the route-level <Suspense> wrappers.
 * Keeps the page chrome visible while lazy chunks load.
 */
export function RouteSuspenseFallback(): React.ReactElement {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
