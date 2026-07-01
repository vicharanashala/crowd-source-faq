import { Link } from 'react-router-dom';

const savedItems = [
  { title: 'How to join the program', hint: 'Program guide' },
  { title: 'Common onboarding questions', hint: 'FAQ collection' },
  { title: 'Community moderation tips', hint: 'Helpful resource' },
];

export default function SavedKnowledgeCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Saved knowledge</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your favorite FAQs and learning resources.</p>
        </div>
        <div className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
          3 items
        </div>
      </div>

      <div className="space-y-2">
        {savedItems.map((item) => (
          <div key={item.title} className="flex items-center justify-between rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="text-xs text-ink-faint">{item.hint}</p>
            </div>
            <span className="text-xs font-medium text-accent">Saved</span>
          </div>
        ))}
      </div>

      <Link to="/saved" className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors">
        <span>Open saved</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
