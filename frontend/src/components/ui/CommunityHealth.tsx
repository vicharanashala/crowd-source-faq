import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

interface CommunityStats {
  totalPosts: number;
  answeredPosts: number;
  unansweredPosts: number;
  responseRate: number;
  solvedRate: number;
  newQuestionsThisWeek: number;
  activeContributors: number;
}

export default function CommunityHealth() {
  const [stats, setStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    api.get<CommunityStats>('/community/stats')
      .then(res => setStats(res.data))
      .catch(() => {}); // silent fail — widget is non-critical
  }, []);

  if (!stats) return null;

  const items = [
    {
      label: 'Response Rate',
      value: `${stats.responseRate}%`,
      sub: `${stats.answeredPosts} of ${stats.totalPosts} answered`,
      color: 'text-accent',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 7L5.5 10.5L12 3.5"/>
        </svg>
      ),
    },
    {
      label: 'Solved This Week',
      value: String(stats.newQuestionsThisWeek),
      sub: 'new questions',
      color: 'text-accent',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="5.5"/>
          <path d="M7 4.5V7.5M7 9.5V10"/>
        </svg>
      ),
    },
    {
      label: 'Active Contributors',
      value: String(stats.activeContributors),
      sub: 'this week',
      color: 'text-[#8b5cf6]',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="4" r="2"/>
          <path d="M1.5 11.5C1.5 9.5 3 8 5 8s3.5 1.5 3.5 3.5"/>
          <circle cx="10" cy="4" r="1.5"/>
          <path d="M12.5 8.5c.83.83 1 1.5 1 3"/>
        </svg>
      ),
    },
    {
      label: 'Unanswered',
      value: String(stats.unansweredPosts),
      sub: 'open questions',
      color: stats.unansweredPosts > 0 ? 'text-warning' : 'text-accent',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="5.5"/>
          <path d="M7 5V7.5"/>
          <circle cx="7" cy="9" r="0.5" fill="currentColor"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 mb-5">
      {items.map(item => (
        <div
          key={item.label}
          className="bg-card rounded-xl border border-border px-3 py-2.5 flex items-start gap-2"
        >
          <div className={`flex-shrink-0 mt-0.5 ${item.color}`}>
            {item.icon}
          </div>
          <div className="min-w-0">
            <div className={`text-base font-bold leading-none ${item.color}`}>
              {item.value}
            </div>
            <div className="text-[10px] font-semibold text-ink mt-0.5">{item.label}</div>
            <div className="text-[10px] text-ink-faint">{item.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}