/**
 * AI feedback widget + explainability indicator — surfaces for the FAQ
 * Assistant (AskAIButton). Both are deliberately kept tiny and self-
 * contained so the chat component can stay focused on messaging.
 *
 * ─── Feature 1: AI Explainability Engine ────────────────────────────────
 * The tooltip shows where the answer came from (which provider / model),
 * the reproducible confidence score, the document retrieval count, and
 * the latency. Clicking the indicator opens a small popover with the
 * full explainability snapshot. We render an empty sentinel as a disabled
 * state so the chat UI never shows broken tooltips on the no-retrieval
 * or provider-error path.
 *
 * ─── Feature 3: AI Quality Feedback System ──────────────────────────────
 * A thumbs-up / thumbs-down control below every assistant message. On
 * submit it POSTs to /feedback (mounted by the backend under
 * /csfaq/api/feedback) with the full provenance (question, answerId,
 * citations, explainability). A free-text comment box appears after a
 * thumbs-down so users can say what was wrong.
 */
import { useState } from 'react';
import api, { friendlyError } from '../../utils/api';

// ─── Types ──────────────────────────────────────────────────────────────

/** Mirrors the backend `CitationSourceType` in utils/ai/citations.ts.
 *  Community hits come back as 'KnowledgeBase'; we only need these four
 *  on the wire (the controller's sanitizer rejects anything else). */
export type SourceType = 'FAQ' | 'Zoom' | 'Document' | 'KnowledgeBase';

export interface Citation {
  id: string;
  title: string;
  similarity: number;
  sourceType: SourceType;
  snippet?: string;
  /** Sub-section inside the document, if known. Sent to the server so
   *  the feedback record can show what the user was reacting to. */
  section?: string;
  /** Optional human label ("from FAQ", "from Zoom meeting", …). */
  provenance?: string;
  /** Optional icon override (emoji). Backend sends one of these; we just render. */
  icon?: string;
}

/** Mirrors the backend `Explainability` in utils/ai/explainability.ts.
 *  We use `modelName` (not `model`) so the field lines up exactly with
 *  the server's IExplainabilitySnapshot schema, otherwise the feedback
 *  controller's sanitizer reads `modelName` and silently stores "unknown". */
export interface Explainability {
  /** 0-1 reproducible confidence. */
  confidence: number;
  /** "openai" | "anthropic" | "xai" | "minimax" | "unknown" */
  provider: string;
  /** Model name e.g. "gpt-4o-mini". */
  modelName: string;
  /** Latency in ms. */
  latencyMs: number;
  documentsRetrieved: number;
  documentsUsed: number;
  /** Average vector similarity over the top-K. */
  vectorScore: number;
  /** Average keyword/BM25 score over the top-K. */
  keywordScore: number;
  duplicateDetected: boolean;
  generatedAt: string;
}

/** Body shape POSTed to /feedback.
 *
 *  The backend's feedback controller expects `helpful: boolean` and an
 *  optional `category` (one of FEEDBACK_CATEGORIES). We translate
 *  `rating: 'up' | 'down'` here so the widget stays expressive but the
 *  wire format matches what the controller already validates. */
export interface FeedbackPayload {
  /** Stable id matching the answer (server computes the same hash if absent). */
  answerId: string;
  question: string;
  helpful: boolean;
  /** Always 'ask_ai' for chat-widget feedback. */
  pipeline: 'ask_ai';
  /** Free-text reason (only on "down" by default; always allowed). */
  comment?: string;
  /** Citations the user saw — what they're actually judging. */
  citations: Citation[];
  /** Full explainability snapshot. Optional because older clients or
   *  some fallback paths (no retrieval / provider error) don't have one. */
  explainability?: Explainability | null;
  /** Top-level shortcuts the controller also accepts on the wire. */
  provider?: string;
  modelName?: string;
  confidence?: number;
  latencyMs?: number;
  sessionId?: string;
  questionId?: string;
  /** Default category when rating=down and the user didn't type one.
   *  Server overwrites this if the comment contains the words
   *  "wrong", "irrelevant", etc. — see feedback.controller.ts. */
  category?: string;
}

export type Sentiment = 'idle' | 'submitting' | 'up' | 'down' | 'error' | 'submitted';

interface ExplainabilityIndicatorProps {
  explainability: Explainability | null;
  modelName?: string;
  sourceCount: number;
}

interface FeedbackWidgetProps {
  answerId: string;
  question: string;
  citations: Citation[];
  explainability: Explainability | null;
  modelName?: string;
  /** When true, disables the widget (no explainability, no answerId). */
  disabled?: boolean;
}

// ─── Icon map (mirrors backend's citationIcon) ──────────────────────────
// Kept here as a fallback in case the backend omits `icon` on a citation.

const ICON_BY_TYPE: Record<SourceType, string> = {
  FAQ: '📋',
  Zoom: '🎥',
  Document: '📄',
  KnowledgeBase: '📚',
};

export function citationIcon(sourceType: SourceType): string {
  return ICON_BY_TYPE[sourceType] ?? '📄';
}

// ─── Confidence → label / color ─────────────────────────────────────────
// Single source of truth so the chip, the tooltip, and the feedback
// payload all agree on what "medium" means.

function confidenceBucket(c: number): {
  friendly: string;
  bg: string;
  text: string;
  dot: string;
  bar: string;
  detail: string;
} {
  if (c >= 0.8) return { friendly: 'AI is confident', bg: 'bg-emerald-500/10', text: 'text-emerald-600', dot: 'bg-emerald-500', bar: 'bg-emerald-500', detail: 'Strong match found in the knowledge base.' };
  if (c >= 0.55) return { friendly: 'AI is moderately confident', bg: 'bg-amber-500/10', text: 'text-amber-600', dot: 'bg-amber-500', bar: 'bg-amber-500', detail: 'Partial match — answer may need verification.' };
  if (c >= 0.3) return { friendly: 'AI is not confident', bg: 'bg-orange-500/10', text: 'text-orange-600', dot: 'bg-orange-500', bar: 'bg-orange-500', detail: 'Weak match — please verify with official sources.' };
  return { friendly: 'No data available', bg: 'bg-mist', text: 'text-ink-soft', dot: 'bg-ink-faint', bar: 'bg-ink-faint', detail: 'Unable to compute confidence for this answer.' };
}

// ─── ExplainabilityIndicator ────────────────────────────────────────────

/**
 * Compact chip showing a friendly confidence label. Clicking opens a
 * popover with the full breakdown. Internal metrics (latency, provider,
 * model) are collapsed by default and only shown in the detail section.
 */
export function ExplainabilityIndicator({ explainability, modelName, sourceCount }: ExplainabilityIndicatorProps) {
  const [open, setOpen] = useState(false);

  if (!explainability) return null;

  const c = Math.max(0, Math.min(1, explainability.confidence));
  const bucket = confidenceBucket(c);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border ${bucket.bg} ${bucket.text} hover:border-accent/40 transition-all`}
        title="How confident is the AI"
        aria-label="Show answer confidence details"
        aria-expanded={open}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${bucket.dot}`} />
        {bucket.friendly}
        {sourceCount > 0 && <span className="text-ink-faint font-normal">· {sourceCount} source{sourceCount !== 1 ? 's' : ''}</span>}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
            tabIndex={-1}
          />
          <div className="absolute z-50 left-0 bottom-full mb-1.5 w-80 p-4 rounded-xl bg-card border border-border shadow-xl shadow-ink/10 text-left">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mb-2">Confidence Details</p>
            {/* Friendly label + progress bar */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${bucket.dot}`} />
                <span className="text-[12px] text-ink font-semibold">{bucket.friendly}</span>
              </div>
              <div className="h-1.5 bg-border/60 rounded-full overflow-hidden">
                <div className={`h-full ${bucket.bar} rounded-full transition-all`} style={{ width: `${Math.round(c * 100)}%` }} />
              </div>
              <p className="text-[10px] text-ink-faint mt-1.5">{bucket.detail}</p>
            </div>
            {/* Source summary */}
            {sourceCount > 0 && (
              <div className="text-[11px] text-ink-soft mb-2 pb-2 border-b border-border/50">
                Based on {sourceCount} source{sourceCount !== 1 ? 's' : ''} from the knowledge base.
              </div>
            )}
            {/* Collapsible technical details */}
            <details className="group">
              <summary className="text-[10px] text-ink-faint cursor-pointer hover:text-ink-soft transition-colors select-none">
                Technical details
              </summary>
              <dl className="space-y-1.5 text-[11px] text-ink-soft mt-2 pl-1">
                <div className="flex justify-between gap-2"><dt>Provider</dt><dd className="text-ink font-mono text-[10px]">{explainability.provider}</dd></div>
                <div className="flex justify-between gap-2"><dt>Model</dt><dd className="text-ink font-mono text-[10px] truncate" title={explainability.modelName}>{explainability.modelName}</dd></div>
                <div className="flex justify-between gap-2"><dt>Latency</dt><dd className="text-ink">{explainability.latencyMs}ms</dd></div>
                <div className="flex justify-between gap-2"><dt>Retrieved</dt><dd className="text-ink">{explainability.documentsRetrieved} docs</dd></div>
                {explainability.documentsUsed > 0 && (
                  <div className="flex justify-between gap-2"><dt>Used in prompt</dt><dd className="text-ink">{explainability.documentsUsed} docs</dd></div>
                )}
                {explainability.duplicateDetected && (
                  <div className="flex justify-between gap-2"><dt>Duplicate</dt><dd className="text-amber-600 font-semibold">Detected</dd></div>
                )}
              </dl>
              {modelName && modelName !== explainability.modelName && (
                <p className="text-[10px] text-ink-faint mt-2 pt-2 border-t border-border">Fallback model: <span className="font-mono">{modelName}</span></p>
              )}
            </details>
            <p className="text-[9px] text-ink-faint mt-2 pt-2 border-t border-border/50">Confidence is computed from retrieval metadata — reproducible, not the model's self-report.</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── CitationChips ──────────────────────────────────────────────────────

/**
 * Renders citations grouped as Primary (index 0) vs Other References.
 * Primary gets a card with snippet preview; others are compact chips.
 * Sorted by similarity descending.
 */
export function CitationChips({ citations, onNav }: { citations: Citation[]; onNav: (href: string) => void }) {
  if (!citations || citations.length === 0) return null;

  const sorted = [...citations].sort((a, b) => b.similarity - a.similarity);
  const primary = sorted[0];
  const others = sorted.slice(1);

  return (
    <div className="space-y-2 pt-1">
      {/* Primary source — full card with snippet */}
      <button
        type="button"
        onClick={() => onNav(citationHref(primary))}
        title={primary.snippet ? `${primary.title}\n\n${primary.snippet}` : primary.title}
        className="w-full text-left p-2.5 rounded-lg border border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/40 transition-all group"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Primary source</span>
          <span className="shrink-0">{primary.icon ?? citationIcon(primary.sourceType)}</span>
          <span className="truncate text-[11px] text-ink font-medium">{primary.title}</span>
          <span className="ml-auto shrink-0 text-[9px] text-ink-faint font-medium">{Math.round(primary.similarity * 100)}%</span>
        </div>
        {primary.snippet && (
          <p className="text-[10px] text-ink-soft line-clamp-2 leading-relaxed">{primary.snippet}</p>
        )}
      </button>

      {/* Other references — compact chips */}
      {others.length > 0 && (
        <div>
          <p className="text-[9px] text-ink-faint font-semibold uppercase tracking-wider mb-1">Other references</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                type="button"
                onClick={() => onNav(citationHref(c))}
                title={c.snippet ? `${c.title} · ${Math.round(c.similarity * 100)}% match\n\n${c.snippet}` : `${c.title} · ${Math.round(c.similarity * 100)}% match`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border border-border bg-card hover:border-accent/40 hover:bg-accent/5 text-ink-soft transition-all"
              >
                <span className="shrink-0">{c.icon ?? citationIcon(c.sourceType)}</span>
                <span className="truncate max-w-[140px]">{c.title}</span>
                <span className="text-ink-faint text-[9px]">{Math.round(c.similarity * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Build a sensible deep-link for a citation. Mirrors the URLs the
 * backend rag.service.ts writes into `RagSource.url` (FAQ/Community/
 * Knowledge), so clicking a citation takes the user to the same place
 * as clicking the legacy "Source" row.
 */
function citationHref(c: Citation): string {
  // Backend's knowledge matches include the `id` as the document id and
  // a `provenance` string ("from Zoom meeting" / "from document"). For
  // the public UI we link to the FAQ page (the assistant panel isn't a
  // deep-link surface, so an internal page that exists today is better
  // than a 404).
  if (c.sourceType === 'FAQ' && c.id) return `/faq/${encodeURIComponent(c.id)}`;
  if (c.sourceType === 'KnowledgeBase' && c.id) return `/community?post=${encodeURIComponent(c.id)}`;
  if (c.id) return `/faq?from-knowledge=${encodeURIComponent(c.id)}`;
  return '/faq';
}

// ─── FeedbackWidget ─────────────────────────────────────────────────────

/**
 * Thumbs-up / thumbs-down control. On "down" a comment box appears;
 * submit posts to /feedback. The widget is idempotent — once a
 * rating is submitted we replace the controls with a thank-you state
 * so the user can't accidentally re-submit.
 */
export function FeedbackWidget({ answerId, question, citations, explainability, modelName, disabled }: FeedbackWidgetProps) {
  const [sentiment, setSentiment] = useState<Sentiment>('idle');
  const [comment, setComment] = useState('');

  if (disabled) return null;

  const submit = async (rating: 'up' | 'down') => {
    if (sentiment === 'submitting' || sentiment === 'submitted') return;
    setSentiment('submitting');
    try {
      const payload: FeedbackPayload = {
        answerId,
        question,
        // The backend's feedback controller validates `helpful: boolean`
        // and (when false) a `category`. We map the user-facing rating
        // to that wire format here so the widget stays expressive.
        helpful: rating === 'up',
        pipeline: 'ask_ai',
        // Default category for thumbs-down so the controller's category
        // breakdown isn't empty when the user skips the comment box.
        // Category values must match FEEDBACK_CATEGORIES (PascalCase).
        category: rating === 'down' ? (comment.trim() ? 'Incorrect' : 'PoorExplanation') : undefined,
        comment: comment.trim() || undefined,
        citations,
        explainability: explainability ?? null,
        // Top-level shortcuts the sanitizer also accepts on the wire.
        provider: explainability?.provider,
        modelName: explainability?.modelName ?? modelName,
        confidence: explainability?.confidence,
        latencyMs: explainability?.latencyMs,
      };
      await api.post('/feedback', payload);
      setSentiment('submitted');
    } catch (err: unknown) {
      setSentiment('error');
      // Reset to idle after a beat so they can retry.
      setTimeout(() => setSentiment((s) => (s === 'error' ? 'idle' : s)), 2500);
      // eslint-disable-next-line no-console
      console.warn('[ai-feedback] submit failed', friendlyError(err, 'submit failed'));
    }
  };

  if (sentiment === 'submitted') {
    return (
      <p className="text-[10px] text-ink-faint">Thanks — your feedback improves the assistant.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => submit('up')}
          disabled={sentiment === 'submitting'}
          title="This answer was helpful"
          aria-label="Thumbs up"
          className={`w-6 h-6 rounded-md text-[11px] flex items-center justify-center transition-all ${
            sentiment === 'up' ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
              : 'border border-border text-ink-soft hover:border-emerald-500/40 hover:text-emerald-600'
          }`}
        >👍</button>
        <button
          type="button"
          onClick={() => setSentiment('down')}
          disabled={sentiment === 'submitting'}
          title="This answer needs improvement"
          aria-label="Thumbs down"
          className={`w-6 h-6 rounded-md text-[11px] flex items-center justify-center transition-all ${
            sentiment === 'down' ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
              : 'border border-border text-ink-soft hover:border-rose-500/40 hover:text-rose-600'
          }`}
        >👎</button>
        {sentiment === 'down' && (
          <span className="text-[10px] text-ink-faint ml-1">What was wrong?</span>
        )}
        {sentiment === 'error' && (
          <span className="text-[10px] text-rose-600 ml-1">Couldn't submit — try again</span>
        )}
      </div>
      {sentiment === 'down' && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: brief reason"
            className="flex-1 text-[11px] px-2 py-1 rounded-md border border-border bg-bg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50"
            maxLength={500}
          />
          <button
            type="button"
            onClick={() => submit('down')}
            disabled={false /* the surrounding state guard already prevents double-submit */}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/30 hover:bg-rose-500/15 transition-colors disabled:opacity-50"
          >Send</button>
        </div>
      )}
    </div>
  );
}
