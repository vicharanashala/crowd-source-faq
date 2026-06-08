import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import { AdminStatCard } from '../components/ui';

interface AuditStat {
  totalFaqs: number;
  flaggedFaqs: number;
  flaggedLast7Days: number;
  avgScore: number | null;
  lastAuditAt: string | null;
  verdictBreakdown: { correct: number; drift_detected: number; contradiction: number; stale: number };
  totalAudited: number;
}

interface AuditResult {
  _id: string;
  faqId: string;
  question: string;
  score: number;
  verdict: 'correct' | 'drift_detected' | 'contradiction' | 'stale';
  reason: string;
  sources: { id: string; title: string; type: string }[];
  checkedAt: string;
}

export default function AdminFAQAuditPage() {
  const [stats, setStats] = useState<AuditStat | null>(null);
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'drift_detected' | 'contradiction' | 'stale'>('all');

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      adminApi.get<{ results: AuditStat }>('/admin/audit/stats'),
      adminApi.get<{ results: AuditResult[] }>('/admin/audit/results?limit=50'),
    ])
      .then(([s, r]) => {
        setStats(s.data.results);
        setResults(r.data.results ?? []);
      })
      .catch((e) => console.error(friendlyError(e, 'Failed to load')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleRunAudit = async (dry = false) => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await adminApi.post(dry ? '/admin/audit/faqs?dry_run=true' : '/admin/audit/faqs');
      const d = r.data;
      const msg = dry
        ? `Dry run: would audit ${d.audited} FAQs, ${d.flagged} need review`
        : `Audit complete — ${d.audited} audited, ${d.flagged} flagged`;
      setRunResult(msg);
      if (!dry) fetchData();
    } catch (e) {
      setRunResult(`Error: ${friendlyError(e, 'Run failed')}`);
    } finally {
      setRunLoading(false);
    }
  };

  const filtered = results.filter((r) => {
    if (filter === 'all') return r.verdict !== 'correct';
    return r.verdict === filter;
  });

  const verdictLabel: Record<string, string> = {
    correct: 'Correct',
    drift_detected: 'Drift',
    contradiction: 'Contradiction',
    stale: 'Stale',
  };

  const verdictColor: Record<string, string> = {
    correct: 'text-success',
    drift_detected: 'text-warning',
    contradiction: 'text-danger',
    stale: 'text-ink-faint',
  };

  const scoreColor = (s: number) =>
    s >= 0.80 ? 'text-success' : s >= 0.60 ? 'text-warning' : 'text-danger';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-ink">FAQ AI Audit</h1>
          <p className="text-xs text-ink-faint mt-0.5">
            AI checks each approved FAQ against the knowledge base for correctness
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRunAudit(true)}
            disabled={runLoading}
            className="text-xs px-3.5 py-1.5 rounded-lg border border-border text-ink-soft hover:text-ink hover:bg-mist transition-all disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            onClick={() => handleRunAudit(false)}
            disabled={runLoading}
            className="text-xs px-3.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all disabled:opacity-50"
          >
            {runLoading ? 'Running…' : 'Run Audit'}
          </button>
        </div>
      </div>

      {runResult && (
        <div className={`text-xs px-4 py-3 rounded-xl border ${runResult.startsWith('Error') ? 'bg-danger/5 border-danger/20 text-danger' : 'bg-card border-border text-ink'}`}>
          {runResult}
        </div>
      )}

      {/* Stats */}
      {!loading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AdminStatCard
            value={stats.totalFaqs}
            label="Total FAQs"
            trend={undefined}
            alert={false}
          />
          <AdminStatCard
            value={stats.flaggedFaqs}
            label="Flagged"
            trend={undefined}
            alert={stats.flaggedFaqs > 0}
          />
          <AdminStatCard
            value={stats.flaggedLast7Days}
            label="Flagged (7d)"
            trend={undefined}
            alert={stats.flaggedLast7Days > 3}
          />
          <AdminStatCard
            value={stats.avgScore != null ? Math.round(stats.avgScore * 100) : 0}
            label="Avg Score %"
            trend={undefined}
            alert={stats.avgScore != null && stats.avgScore < 0.70}
          />
        </div>
      )}

      {/* Verdict breakdown */}
      {!loading && stats && (
        <div className="bg-card border border-border rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">Audit Verdict Breakdown (last 50)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'correct',        label: 'Correct',        count: stats.verdictBreakdown.correct },
              { key: 'drift_detected', label: 'Drift',           count: stats.verdictBreakdown.drift_detected },
              { key: 'contradiction',  label: 'Contradiction',   count: stats.verdictBreakdown.contradiction },
              { key: 'stale',          label: 'Stale',           count: stats.verdictBreakdown.stale },
            ].map(({ key, label, count }) => (
              <div key={key} className="text-center">
                <p className={`text-xl font-bold ${verdictColor[key] ?? 'text-ink'}`}>{count}</p>
                <p className="text-xs text-ink-soft mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {stats.lastAuditAt && (
            <p className="text-[10px] text-ink-faint mt-3 text-center">
              Last audit: {new Date(stats.lastAuditAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1">
        {(['all', 'drift_detected', 'contradiction', 'stale'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-accent/10 border-accent/20 text-accent'
                : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
            }`}
          >
            {f === 'all' ? 'Flagged' : verdictLabel[f]}
          </button>
        ))}
      </div>

      {/* Results list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-mist rounded w-3/4 mb-2" />
              <div className="h-3 bg-mist rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-ink-faint">No issues found — all FAQs are healthy</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((result) => (
            <div key={result._id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                        result.verdict === 'correct'       ? 'border-success/20 bg-success/5 text-success' :
                        result.verdict === 'drift_detected' ? 'border-warning/20 bg-warning/5 text-warning' :
                        result.verdict === 'contradiction'  ? 'border-danger/20 bg-danger/5 text-danger' :
                                                             'border-border bg-mist text-ink-faint'
                      }`}>
                        {verdictLabel[result.verdict] ?? result.verdict}
                      </span>
                      <span className={`text-sm font-bold ${scoreColor(result.score)}`}>
                        {Math.round(result.score * 100)}%
                      </span>
                    </div>
                    <p className="text-sm font-medium text-ink leading-snug">{result.question}</p>
                    <p className="text-xs text-ink-soft mt-1 leading-relaxed">{result.reason}</p>
                    {result.sources.length > 0 && (
                      <p className="text-[10px] text-ink-faint mt-1.5">
                        Sources: {result.sources.map((s) => `${s.title} (${s.type})`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-ink-faint">{new Date(result.checkedAt).toLocaleDateString()}</p>
                    <a
                      href={`/admin/faqs?q=${encodeURIComponent(result.question)}`}
                      className="text-[11px] text-accent hover:underline mt-1 block"
                    >
                      View FAQ →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}