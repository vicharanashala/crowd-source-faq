import { useState } from 'react';
import { Link } from 'react-router-dom';

const topicCards = [
  { name: 'Onboarding', score: 'High', trend: 'Rising', color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Program access', score: 'Very high', trend: 'Hot', color: 'bg-sky-50 text-sky-700' },
  { name: 'Account setup', score: 'Moderate', trend: 'Stable', color: 'bg-amber-50 text-amber-700' },
];

const quickFilters = ['All', 'Fast response', 'Needs attention', 'Trending now'];

const questions = [
  { title: 'How do I change my program?', detail: 'A recurring topic with strong search volume.', meta: '6 new questions today' },
  { title: 'Why is my access not working?', detail: 'A high-friction issue that needs better guidance.', meta: '4 flagged answers' },
  { title: 'What is the quickest onboarding path?', detail: 'Users are looking for a more direct first step.', meta: '3 expert replies' },
];

export default function TopicRadarPage() {
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Discovery intelligence</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Topic Radar</h1>
            <p className="text-sm text-ink-faint mt-1">See what people are asking about most and where the platform can improve guidance.</p>
          </div>
          <Link to="/" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back home
          </Link>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeFilter === filter ? 'bg-accent text-white' : 'border border-border bg-bg/70 text-ink hover:bg-accent/10'}`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {topicCards.map((topic) => (
              <div key={topic.name} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{topic.name}</p>
                    <p className="mt-1 text-sm text-ink-faint">{topic.score} interest</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${topic.color}`}>{topic.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Trending now</h2>
            <p className="text-sm text-ink-faint mt-1">The issues gaining momentum across the platform.</p>
            <div className="mt-4 space-y-3">
              {questions.map((question) => (
                <div key={question.title} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <p className="text-sm font-semibold text-ink">{question.title}</p>
                  <p className="mt-1 text-sm text-ink-faint">{question.detail}</p>
                  <p className="mt-3 text-xs font-medium text-accent">{question.meta}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Signal summary</h2>
            <p className="text-sm text-ink-faint mt-1">A simple view of where content should be improved next.</p>
            <div className="mt-4 space-y-3">
              {[
                ['Fast response', 'Users need quicker answers for account-related issues.'],
                ['Needs attention', 'Some recurring questions still lack clear guidance.'],
                ['Trending now', 'Program onboarding continues to attract strong interest.'],
              ].map(([label, text]) => (
                <div key={label} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-sm text-ink-faint">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
