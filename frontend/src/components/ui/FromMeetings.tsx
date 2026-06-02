import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import type { RecentFAQ, ZoomPublicStats } from '../../types/ui';

/**
 * "From Zoom Meetings" — surfaces the project's actual goal on the home page.
 *
 * Renders only when there is at least one Zoom-derived FAQ in the system.
 * If no meetings have been processed yet, the whole section is hidden so
 * the home page still feels calm and useful.
 */

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function FromMeetings() {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState<RecentFAQ[]>([]);
  const [stats, setStats] = useState<ZoomPublicStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.get<{ faqs: RecentFAQ[] }>('/faq/recent', { params: { source: 'zoom_transcript', limit: 6 } }),
      api.get<ZoomPublicStats>('/zoom/public-stats'),
    ])
      .then(([faqsRes, statsRes]) => {
        if (!isMounted) return;
        setFaqs(faqsRes.data.faqs || []);
        setStats(statsRes.data);
      })
      .catch(() => {
        if (!isMounted) return;
        setFaqs([]);
        setStats(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const hasData = faqs.length > 0;
  const anyZoomActivity =
    !!stats && (stats.meetingsProcessed > 0 || stats.insightsExtracted > 0 || stats.knowledgeExtracted > 0);

  // Skeleton while loading
  if (loading) {
    return (
      <section className="mt-12">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-mist rounded animate-pulse" />
          <div className="h-5 w-56 bg-mist rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[160px] rounded-2xl border border-border bg-white/70 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-ink-faint">
            <VideoIcon />
            <p className="text-[11px] font-semibold uppercase tracking-wider">From Zoom Meetings</p>
          </div>
          <h2 className="mt-1 font-serif text-xl sm:text-2xl text-ink leading-snug">
            {hasData
              ? 'Questions interns asked — and we solved them'
              : 'Doubts answered in your team\'s Zoom sessions, turned into FAQs'}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-ink-soft max-w-xl">
            {hasData
              ? 'Auto-extracted from intern sessions. We listen, transcribe, and turn answers into FAQs.'
              : 'Admins connect Zoom once. New meetings get transcribed, questions get extracted, and answers show up here for everyone to search.'}
          </p>
        </div>
        {anyZoomActivity && (
          <div className="flex items-center gap-3 text-[11px] text-ink-soft bg-mist/60 border border-border/60 rounded-full px-3 py-1.5">
            <span><b className="text-ink">{stats!.meetingsProcessed}</b> meetings</span>
            <span className="text-ink-faint">·</span>
            <span><b className="text-ink">{stats!.faqsPromoted}</b> FAQs added</span>
          </div>
        )}
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {faqs.map((faq) => (
            <article
              key={faq._id}
              onClick={() => navigate(`/faq/${faq._id}`)}
              className="group cursor-pointer rounded-2xl border border-border bg-card hover:border-accent/30 hover:shadow-subtle transition-all p-4 flex flex-col"
            >
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2D8CFF]/10 text-[#2D8CFF] text-[10px] font-semibold uppercase tracking-wider">
                  <VideoIcon /> From Meeting
                </span>
                {faq.category && (
                  <span className="px-2 py-0.5 rounded-md bg-mist text-ink-faint text-[10px] font-semibold uppercase tracking-wider">
                    {faq.category}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                {faq.question}
              </h3>
              {faq.answer && (
                <p className="mt-2 text-xs text-ink-soft leading-relaxed line-clamp-3">
                  {faq.answer}
                </p>
              )}
              <div className="mt-auto pt-3 flex items-center justify-between text-[10px] text-ink-faint">
                <span>
                  {faq.sourceMeetingTopic ? `From: ${faq.sourceMeetingTopic}` : formatRelativeTime(faq.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-soft font-medium group-hover:text-accent transition-colors">
                  Read <ArrowRightIcon />
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        // Empty state — explains HOW the goal works, even when no data yet.
        // This is the project's main value prop, so it should never disappear.
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HowItWorksStep
            n="1"
            title="Connect Zoom"
            body="An admin links the team's Zoom account once from the Account page."
          />
          <HowItWorksStep
            n="2"
            title="Meetings get transcribed"
            body="When a meeting ends, we pull the transcript and pick out the questions."
          />
          <HowItWorksStep
            n="3"
            title="Answers become FAQs"
            body="Confirmed Q&As are saved as FAQs that everyone can search and upvote."
          />
        </div>
      )}
    </section>
  );
}

function HowItWorksStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#2D8CFF]/10 text-[#2D8CFF] text-xs font-semibold">
          {n}
        </span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">{body}</p>
    </div>
  );
}
