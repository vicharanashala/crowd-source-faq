import { Link } from 'react-router-dom';

const statCards = [
  { label: 'Questions asked', value: '24', hint: '+4 this month' },
  { label: 'Answers shared', value: '81', hint: '+12 this week' },
  { label: 'Accepted answers', value: '13', hint: 'Top 10%' },
  { label: 'Saved FAQs', value: '37', hint: 'Curated reads' },
];

const milestones = [
  { title: 'Helpful voice', detail: 'Answer 10 questions with 4+ upvotes', progress: 82 },
  { title: 'Trusted peer', detail: 'Earn 500 reputation points', progress: 64 },
  { title: 'Knowledge curator', detail: 'Save 50 FAQ items', progress: 74 },
];

const recentActivity = [
  { title: 'Answered a question about onboarding', time: '2h ago' },
  { title: 'Bookmarked a new FAQ', time: '5h ago' },
  { title: 'Reached a new reputation milestone', time: '1d ago' },
];

export default function AchievementsPage() {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Your progress</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Achievement Hub</h1>
            <p className="text-sm text-ink-faint mt-1">Track your contributions, milestones, and momentum in one place.</p>
          </div>
          <Link to="/account" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back to account
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Contribution stats</h2>
                <p className="text-sm text-ink-faint mt-1">A snapshot of your recent activity.</p>
              </div>
              <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
                Level 6
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {statCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <p className="text-sm text-ink-faint">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{card.value}</p>
                  <p className="mt-1 text-xs text-emerald-600">{card.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Next milestone</h2>
            <p className="text-sm text-ink-faint mt-1">You are one step away from the next reward.</p>
            <div className="mt-6 rounded-2xl border border-border/70 bg-bg/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">Community mentor</p>
                  <p className="text-sm text-ink-faint">Answer 25 questions and get featured</p>
                </div>
                <span className="text-sm font-semibold text-accent">75%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-border/70">
                <div className="h-2 w-[75%] rounded-full bg-accent" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Milestones</h2>
            <div className="mt-4 space-y-4">
              {milestones.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{item.title}</p>
                      <p className="text-sm text-ink-faint">{item.detail}</p>
                    </div>
                    <span className="text-sm font-semibold text-accent">{item.progress}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-border/70">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
            <ul className="mt-4 space-y-3">
              {recentActivity.map((entry) => (
                <li key={entry.title} className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-bg/70 p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                  </div>
                  <span className="text-xs text-ink-faint whitespace-nowrap">{entry.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
