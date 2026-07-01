import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const initialChallenges = [
  {
    id: 1,
    title: 'Answer one beginner question',
    detail: 'Help a new user get unstuck with a clear explanation.',
    points: 80,
    category: 'Community',
    completed: false,
  },
  {
    id: 2,
    title: 'Save a useful FAQ',
    detail: 'Bookmark an entry you want to revisit later.',
    points: 60,
    category: 'Knowledge',
    completed: false,
  },
  {
    id: 3,
    title: 'Explore a new topic',
    detail: 'Visit a category you have not engaged with yet.',
    points: 50,
    category: 'Discovery',
    completed: false,
  },
];

export default function KnowledgeSprintPage() {
  const [challenges, setChallenges] = useState(initialChallenges);

  const completedCount = useMemo(() => challenges.filter((item) => item.completed).length, [challenges]);
  const progressPercent = Math.round((completedCount / challenges.length) * 100);

  const toggleChallenge = (id: number) => {
    setChallenges((current) =>
      current.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Gamified learning</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Knowledge Sprint</h1>
            <p className="text-sm text-ink-faint mt-1">Complete a short daily set of actions to grow your impact and unlock momentum.</p>
          </div>
          <Link to="/" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back home
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Today’s challenge</h2>
                <p className="text-sm text-ink-faint mt-1">A focused sprint for steady learning and contribution.</p>
              </div>
              <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                +{completedCount * 20} streak points
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {challenges.map((challenge) => (
                <div key={challenge.id} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{challenge.title}</p>
                      <p className="mt-1 text-sm text-ink-faint">{challenge.detail}</p>
                    </div>
                    <span className="rounded-full bg-border/70 px-2.5 py-1 text-[11px] font-semibold text-ink-faint">
                      {challenge.category}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-accent">+{challenge.points} pts</span>
                    <button
                      type="button"
                      onClick={() => toggleChallenge(challenge.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${challenge.completed ? 'bg-emerald-500 text-white' : 'border border-border bg-card text-ink hover:bg-accent/10'}`}
                    >
                      {challenge.completed ? 'Completed' : 'Complete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Sprint status</h2>
              <p className="text-sm text-ink-faint mt-1">A simple progress loop that keeps the experience motivating.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Progress</span>
                <span className="text-sm font-semibold text-accent">{completedCount} of {challenges.length} completed</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-border/70">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-3 text-sm text-ink-faint">You are {progressPercent}% through today’s sprint.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
              <h3 className="text-sm font-semibold text-ink">Why it works</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-faint">
                <li>• Small actions create momentum.</li>
                <li>• Streaks make participation more consistent.</li>
                <li>• Each task leads users into deeper exploration.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
