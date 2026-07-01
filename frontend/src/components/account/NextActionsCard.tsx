const actions = [
  { title: 'Explore new topics', detail: 'Discover fresh FAQs and trending discussions.' },
  { title: 'Answer a question', detail: 'Share your expertise and earn more reputation.' },
  { title: 'Save useful reads', detail: 'Keep important knowledge handy for later.' },
];

export default function NextActionsCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Recommended next actions</h2>
          <p className="text-xs text-ink-faint mt-0.5">Small steps to keep your momentum going.</p>
        </div>
        <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
          Guided
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.title} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{action.title}</p>
              <p className="text-xs text-ink-faint">{action.detail}</p>
            </div>
            <button className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-accent/10 transition-colors">
              Start
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
