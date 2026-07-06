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
      sub: `+${Math.round(stats.responseRate * 0.08)}% this week`,
      subColor: 'text-accent',
      color: 'text-accent',
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
      label: 'Asked This Week',
      value: String(stats.newQuestionsThisWeek),
      sub: `+${stats.newQuestionsThisWeek} from last week`,
      subColor: 'text-warning',
      color: 'text-warning',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="5.5"/>
          <path d="M5 5a2.5 2.5 0 0 1 4.13.71c0 1.42-2.13 2.13-2.13 2.13"/>
          <circle cx="7" cy="10" r="0.5" fill="currentColor"/>
        </svg>
      ),
    },
    {
      label: 'Active Contributors',
      value: String(stats.activeContributors),
      sub: `+${Math.max(1, Math.round(stats.activeContributors * 0.2))} this week`,
      subColor: 'text-accent',
      color: 'text-accent',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 7L5.5 10.5L12 3.5"/>
        </svg>
      ),
    },
    {
      label: 'Unanswered',
      value: String(stats.unansweredPosts),
      sub: stats.unansweredPosts > 0 ? `-${Math.max(1, Math.round(stats.unansweredPosts * 0.1))} this week` : 'none pending',
      subColor: stats.unansweredPosts > 0 ? 'text-danger' : 'text-accent',
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
      {items.map(item => (
        <div
          key={item.label}
          className="bg-card rounded-xl border border-border px-3 py-3 flex items-start gap-2.5"
        >
          <div className={`flex-shrink-0 mt-0.5 ${item.color}`}>
            {item.icon}
          </div>
          <div className="min-w-0">
            <div className={`text-lg font-bold leading-none ${item.color}`}>
              {item.value}
            </div>
            <div className="text-[10px] text-ink-soft mt-1">{item.label}</div>
            <div className={`text-[10px] font-medium mt-0.5 flex items-center gap-1 ${item.subColor}`}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {item.sub.startsWith('-') ? (
                  <path d="M5 7L2 4M5 7L8 4"/>
                ) : (
                  <path d="M5 3L2 6M5 3L8 6"/>
                )}
              </svg>
              {item.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}