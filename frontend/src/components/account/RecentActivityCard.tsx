const activityItems = [
  { title: 'Answered a question about onboarding', time: '2h ago' },
  { title: 'Saved a new FAQ for later review', time: '5h ago' },
  { title: 'Reached a new reputation milestone', time: '1d ago' },
];

export default function RecentActivityCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your latest actions in the community.</p>
        </div>
        <div className="rounded-full bg-border/70 px-2.5 py-1 text-[11px] font-semibold text-ink-faint">
          Live feed
        </div>
      </div>

      <div className="space-y-2">
        {activityItems.map((item) => (
          <div key={item.title} className="flex items-center justify-between rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
            <p className="text-sm font-medium text-ink">{item.title}</p>
            <span className="text-xs text-ink-faint whitespace-nowrap">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
