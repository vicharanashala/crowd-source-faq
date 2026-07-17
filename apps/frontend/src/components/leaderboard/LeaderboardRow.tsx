import React from 'react';
import { motion } from 'framer-motion';
import { tableTr } from '../../styles/components';

interface LeaderboardRowProps {
  rank: number;
  name: string;
  avatar: string | null;
  tier: string;
  points: number;
  acceptedAnswers: number;
  faqContributions: number;
  rankChange: number;
  isCurrentUser?: boolean;
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  knowledge_master: { bg: 'bg-accent/15', text: 'text-accent' },
  champion:         { bg: 'bg-warning/15', text: 'text-warning' },
  expert:           { bg: 'bg-success/15', text: 'text-success' },
  helper:           { bg: 'bg-info/15', text: 'text-info' },
  contributor:      { bg: 'bg-mist', text: 'text-ink-soft' },
  newcomer:         { bg: 'bg-mist', text: 'text-ink-faint' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function RankChangeIndicator({ change }: { change: number }) {
  if (change === 0) return <span className="text-[10px] text-ink-faint">-</span>;
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        {change}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
      {Math.abs(change)}
    </span>
  );
}

export default function LeaderboardRow({
  rank,
  name,
  avatar,
  tier,
  points,
  acceptedAnswers,
  faqContributions,
  rankChange,
  isCurrentUser,
}: LeaderboardRowProps) {
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.newcomer;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`${tableTr} ${isCurrentUser ? 'bg-accent/5 border-l-2 border-l-accent' : ''}`}
    >
      {/* Rank */}
      <td className="px-3 py-3 text-center w-12">
        <div className="flex flex-col items-center">
          <span className="text-sm font-bold text-ink">{rank}</span>
          <RankChangeIndicator change={rankChange} />
        </div>
      </td>

      {/* User */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className={`w-8 h-8 rounded-full ${tierColor.bg} ${tierColor.text} flex items-center justify-center text-xs font-bold`}>
              {getInitials(name)}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-ink truncate max-w-[180px]">
              {name}
              {isCurrentUser && <span className="ml-1.5 text-[10px] text-accent font-medium">(you)</span>}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit ${tierColor.bg} ${tierColor.text}`}>
              {tier.replace('_', ' ')}
            </span>
          </div>
        </div>
      </td>

      {/* Points */}
      <td className="px-3 py-3 text-right">
        <span className="text-sm font-bold text-ink">{points.toLocaleString()}</span>
      </td>

      {/* Stats */}
      <td className="px-3 py-3 text-right hidden sm:table-cell">
        <div className="flex items-center justify-end gap-3 text-xs text-ink-soft">
          <span title="Accepted answers">
            <span className="font-semibold text-success">{acceptedAnswers}</span> ans
          </span>
          <span title="FAQ contributions">
            <span className="font-semibold text-accent">{faqContributions}</span> faq
          </span>
        </div>
      </td>
    </motion.tr>
  );
}
