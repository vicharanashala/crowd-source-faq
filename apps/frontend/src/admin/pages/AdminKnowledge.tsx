/**
 * AdminKnowledge — v1.83.
 *
 * Unified tabbed page that collapses the four legacy
 *   /admin/zoom-meetings
 *   /admin/zoom-insights
 *   /admin/document-insights
 *   /admin/context-sources   (Documents + Web URLs sub-tabs)
 * pages into a single `/admin/knowledge` route with one sub-tab bar.
 *
 * Each tab embeds (not re-implements) the existing leaf view:
 *
 *   1. Connect Zoom         → AdminZoomMeetings default
 *   2. Upload Document      → UploadDocumentView from AdminContextSources
 *   3. Web URL              → WebUrlView from AdminContextSources
 *   4. Zoom Insights        → ZoomInsightsView from AdminZoomInsights
 *   5. Document Insights    → DocumentInsightsView from AdminDocumentInsights
 *   6. Paste Text / HTML    → PasteTextView from AdminContextSources
 *
 * Selects the active tab from the `?tab=` query param so the
 * legacy `/admin/<old-route>` redirects can drop the user on the
 * right surface without losing the URL.
 *
 * NOTE: keeping the leaf pages themselves unchanged was a
 * deliberate constraint — AdminZoomMeetings in particular still
 * uses `useBodyScrollLock` and a `document.getElementById` look-up
 * for the topic input, both of which assume its container is the
 * only place that DOM exists. Mounting two copies of that view
 * would clash, so only ONE instance is rendered at a time and the
 * body is unmounted on tab change.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// Leaf views (NOT re-implemented — imported as-is).
import AdminZoomMeetings from './AdminZoomMeetings';
import {
  WebUrlView,
  UploadDocumentView,
  PasteTextView,
} from './AdminContextSources';
import {
  ZoomInsightsView,
} from './AdminZoomInsights';
import { DocumentInsightsView } from './AdminDocumentInsights';
import AdminDocumentIndex from './AdminDocumentIndex';

// ── Tabs ──────────────────────────────────────────────────────────────────

type TabKey =
  | 'zoom'           // Connect Zoom
  | 'upload'         // Upload Document
  | 'url'            // Web URL
  | 'zoom-insights'  // Zoom Insights
  | 'doc-insights'   // Document Insights
  | 'paste'          // Paste text / HTML
  | 'index';         // Document Index — diagnostics

interface TabSpec {
  key: TabKey;
  label: string;
  /** Optional short hint shown as a tooltip / sub-text on the tab pill. */
  hint?: string;
  /** If set, an extra inline notice is rendered at the top of the tab. */
  notice?: 'recording-ingestion';
}

const TABS: TabSpec[] = [
  { key: 'zoom',          label: 'Connect Zoom', hint: 'OAuth + transcript upload + meeting list' },
  { key: 'upload',        label: 'Upload Document', hint: 'PDF, TXT, MD, CSV, HTML' },
  { key: 'url',           label: 'Web URL', hint: 'Server fetches + extracts text' },
  { key: 'index',         label: 'Document Index', hint: 'View indexing status, re-index, recent activity' },
  { key: 'zoom-insights', label: 'Zoom Insights' },
  { key: 'doc-insights',  label: 'Document Insights' },
  { key: 'paste',         label: 'Paste Text/HTML', hint: 'For JS-only / login-walled pages' },
];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

// ── Tab notices ───────────────────────────────────────────────────────────

/**
 * Notice shown at the top of the "Connect Zoom" tab explaining
 * that this is the live-ingest path; the recording ingestion
 * pipeline lives behind the OAuth webhook and runs automatically.
 */
function RecordingIngestionNotice() {
  return (
    <div className="admin-card-surface px-4 py-3 flex items-start gap-3 border-accent/30 bg-accent/5">
      <svg
        className="flex-shrink-0 mt-0.5 text-accent"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <div className="flex-1 text-xs text-ink-soft">
        <p className="font-semibold text-ink">Recording ingestion is automatic.</p>
        <p className="mt-0.5 text-ink-faint">
          Once an admin Zoom account is connected, new cloud recordings are
          ingested automatically via Zoom&apos;s <code className="font-mono">recording.completed</code>{' '}
          webhook — they show up in the meeting list below. Use the{' '}
          <span className="font-semibold">Upload .vtt / .txt</span> box on this tab
          to add a transcript that&apos;s already outside Zoom (or for testing).
          See{' '}
          <span className="font-semibold">Document Insights</span> for text
          already pasted into the web URL or paste-text flow.
        </p>
      </div>
    </div>
  );
}

// ── Tab content switcher ──────────────────────────────────────────────────

/**
 * Renders the leaf view for the active tab. Each leaf is mounted
 * ONLY when its tab is active so the existing single-tab
 * assumptions in AdminZoomMeetings
 * (`useBodyScrollLock`, `document.getElementById('upload-topic')`)
 * keep working.
 */
function TabContent({ tab, onJumpToUpload }: { tab: TabKey; onJumpToUpload: () => void }) {
  switch (tab) {
    case 'zoom':
      return (
        <>
          <RecordingIngestionNotice />
          <AdminZoomMeetings />
        </>
      );

    case 'upload':
      return <UploadDocumentView />;

    case 'url':
      return <WebUrlView />;

    case 'index':
      return <AdminDocumentIndex />;

    case 'zoom-insights':
      return <ZoomInsightsView />;

    case 'doc-insights':
      return <DocumentInsightsView onJumpToUpload={onJumpToUpload} />;

    case 'paste':
      return <PasteTextView onJumpToUpload={onJumpToUpload} />;

    default:
      // Unreachable — `tab` is constrained upstream.
      return null;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminKnowledge() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = useMemo(
    () => (isTabKey(tabParam) ? (tabParam as TabKey) : 'zoom'),
    [tabParam],
  );

  const setTab = useCallback(
    (next: TabKey) => {
      // Preserves any other query params that may be present in the future.
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="space-y-5 max-w-5xl" data-testid="admin-knowledge-page">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-ink" data-testid="admin-knowledge-title">
          Knowledge Base
        </h1>
        <p className="text-xs text-ink-faint mt-0.5">
          Connect Zoom, fetch web pages, upload documents, paste text, and review
          AI-extracted insights — all in one place.
        </p>
      </div>

      {/* Tab bar — uses the same pill style as AdminDocumentInsights.
       * Active tab: bg-accent text-white. Inactive: bg-mist text-ink-soft. */}
      <div
        role="tablist"
        aria-label="Knowledge base"
        className="flex flex-wrap items-center gap-1.5"
        data-testid="admin-knowledge-tablist"
      >
        {TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`admin-knowledge-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              title={t.hint}
              className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors admin-card-surface ${
                active
                  ? 'bg-accent text-white'
                  : 'bg-mist text-ink-soft hover:bg-mist/70'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div data-testid={`admin-knowledge-tabpanel-${activeTab}`} className="space-y-5">
        <TabContent tab={activeTab} onJumpToUpload={() => setTab('upload')} />
      </div>
      {/* noscript fallback; admin sidebar is the canonical entry
       * for users with JS disabled. */}
      <noscript>
        <p className="text-xs text-ink-faint">
          This page requires JavaScript. Use the sidebar to navigate.
        </p>
      </noscript>
    </div>
  );
}
