import React, { useState } from 'react';
import api from '../../utils/api';

export default function AdminDigestPage() {
  const [loading, setLoading] = useState(false);
  const [digest, setDigest] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{ faqsCount: number; postsCount: number; trendsCount: number } | null>(null);
  const [error, setError] = useState('');

  const generateDigest = async () => {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const res = await api.get<{
        digestMarkdown: string;
        faqsCount: number;
        postsCount: number;
        trendsCount: number;
      }>('/faq/digest');
      setDigest(res.data.digestMarkdown);
      setStats({
        faqsCount: res.data.faqsCount,
        postsCount: res.data.postsCount,
        trendsCount: res.data.trendsCount,
      });
    } catch (err) {
      setError('Failed to generate newsletter digest. Verify AI configurations.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h2 className="text-xl font-bold text-ink">Weekly Q&A Digest Builder</h2>
          <p className="text-xs text-ink-soft mt-1">
            Generate and edit a beautifully structured weekly newsletter summarizing new FAQs, popular community questions, and search trends.
          </p>
        </div>
        <button
          onClick={generateDigest}
          disabled={loading}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-accent-text text-xs font-bold rounded-2xl transition-all shadow-md flex items-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
              Synthesizing Digest...
            </>
          ) : (
            <>
              <span>⚡</span> Generate Weekly Digest
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-danger-light border border-danger/15 text-danger text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* Stats summary block */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-border bg-card shadow-sm text-center">
            <span className="text-lg font-bold text-accent">{stats.faqsCount}</span>
            <p className="text-[10px] text-ink-soft font-semibold uppercase tracking-wider mt-1">New FAQs</p>
          </div>
          <div className="p-4 rounded-2xl border border-border bg-card shadow-sm text-center">
            <span className="text-lg font-bold text-emerald-600">{stats.postsCount}</span>
            <p className="text-[10px] text-ink-soft font-semibold uppercase tracking-wider mt-1">Community posts</p>
          </div>
          <div className="p-4 rounded-2xl border border-border bg-card shadow-sm text-center">
            <span className="text-lg font-bold text-amber-600">{stats.trendsCount}</span>
            <p className="text-[10px] text-ink-soft font-semibold uppercase tracking-wider mt-1">Search Keywords</p>
          </div>
        </div>
      )}

      {/* Preview and Edit Section */}
      {digest ? (
        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Edit column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-ink-soft uppercase tracking-wide">Edit Markdown</h3>
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                  copied
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-card border-border hover:bg-mist text-ink-soft'
                }`}
              >
                {copied ? (
                  <>
                    <span>✓</span> Copied Markdown!
                  </>
                ) : (
                  <>
                    <span>📋</span> Copy to Clipboard
                  </>
                )}
              </button>
            </div>
            <textarea
              value={digest}
              onChange={(e) => setDigest(e.target.value)}
              rows={22}
              className="w-full rounded-2xl border border-border bg-mist/40 p-4 text-xs font-mono text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:bg-card transition-all resize-y"
            />
          </div>

          {/* Preview column */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-ink-soft uppercase tracking-wide">Preview</h3>
            <div className="w-full rounded-2xl border border-border/80 bg-card p-5 max-h-[460px] overflow-y-auto shadow-sm prose prose-sm prose-neutral dark:prose-invert">
              <div className="text-xs text-ink-soft leading-relaxed whitespace-pre-wrap font-sans">
                {digest}
              </div>
            </div>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="text-center py-16 rounded-3xl border border-dashed border-border bg-mist/20">
            <span className="text-3xl block mb-2">📬</span>
            <h3 className="text-sm font-semibold text-ink">No Digest Generated</h3>
            <p className="text-xs text-ink-soft max-w-sm mx-auto mt-1 mb-5">
              Click the generate button above to extract this week's highlights and compose a newsletter draft.
            </p>
          </div>
        )
      )}
    </div>
  );
}
