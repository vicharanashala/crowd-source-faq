const badges = [
  { name: 'Helpful Voice', detail: 'Answered 10+ questions', tone: 'bg-emerald-50 text-emerald-700' },
  { name: 'Trusted Peer', detail: 'Reached 500 reputation', tone: 'bg-sky-50 text-sky-700' },
  { name: 'Curator', detail: 'Saved 25 knowledge items', tone: 'bg-amber-50 text-amber-700' },
];

export default function BadgeShowcaseCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Badge showcase</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your recognition milestones at a glance.</p>
        </div>
        <div className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
          3 earned
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {badges.map((badge) => (
          <div key={badge.name} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>
              {badge.name}
            </div>
            <p className="mt-3 text-sm text-ink">{badge.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
