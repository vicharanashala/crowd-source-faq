import { Link } from 'react-router-dom';

const summaryItems = [
  { label: 'Questions', value: '24', detail: 'Asked this month' },
  { label: 'Answers', value: '81', detail: 'Shared so far' },
  { label: 'Reputation', value: '1.2k', detail: 'Growing steadily' },
];

export default function ContributionSummaryCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Contribution summary</h2>
          <p className="text-xs text-ink-faint mt-0.5">A quick view of your recent momentum.</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          Active
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
            <p className="text-xs text-ink-faint">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{item.value}</p>
            <p className="mt-1 text-[11px] text-ink-faint">{item.detail}</p>
          </div>
        ))}
      </div>

      <Link
        to="/account/achievements"
        className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
      >
        <span>View achievements</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
