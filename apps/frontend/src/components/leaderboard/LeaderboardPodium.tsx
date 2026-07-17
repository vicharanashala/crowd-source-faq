import React from 'react';
import { motion } from 'framer-motion';

interface PodiumEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  tier: string;
  points: number;
}

const TIER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  knowledge_master: { bg: 'bg-accent/15', text: 'text-accent', ring: 'ring-accent/30' },
  champion:         { bg: 'bg-warning/15', text: 'text-warning', ring: 'ring-warning/30' },
  expert:           { bg: 'bg-success/15', text: 'text-success', ring: 'ring-success/30' },
  helper:           { bg: 'bg-info/15', text: 'text-info', ring: 'ring-info/30' },
  contributor:      { bg: 'bg-mist', text: 'text-ink-soft', ring: 'ring-border' },
  newcomer:         { bg: 'bg-mist', text: 'text-ink-faint', ring: 'ring-border' },
};

const RANK_STYLES: Record<number, { medal: string; height: string; bg: string; border: string }> = {
  1: { medal: '🥇', height: 'h-28', bg: 'bg-gradient-to-b from-warning/10 to-transparent', border: 'border-warning/30' },
  2: { medal: '🥈', height: 'h-22', bg: 'bg-gradient-to-b from-ink-faint/10 to-transparent', border: 'border-border' },
  3: { medal: '🥉', height: 'h-16', bg: 'bg-gradient-to-b from-[#cd7f32]/10 to-transparent', border: 'border-[#cd7f32]/30' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function LeaderboardPodium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) return null;

  // Show rank 1 in center, rank 2 left, rank 3 right
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const display = [ordered[1], ordered[0], ordered[2]].filter(Boolean);

  return (
    <div className="flex items-end justify-center gap-4 sm:gap-6 py-6">
      {display.map((entry, i) => {
        const style = RANK_STYLES[entry.rank] || RANK_STYLES[3];
        const tierColor = TIER_COLORS[entry.tier] || TIER_COLORS.newcomer;
        const isCenter = entry.rank === 1;

        return (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className={`flex flex-col items-center ${isCenter ? 'order-2' : entry.rank === 2 ? 'order-1' : 'order-3'}`}
          >
            {/* Avatar */}
            <div className={`relative mb-2 ${isCenter ? 'scale-110' : ''}`}>
              {entry.avatar ? (
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className={`${isCenter ? 'w-16 h-16' : 'w-12 h-12'} rounded-full object-cover ring-2 ${tierColor.ring}`}
                />
              ) : (
                <div
                  className={`${isCenter ? 'w-16 h-16 text-lg' : 'w-12 h-12 text-sm'} rounded-full ${tierColor.bg} ${tierColor.text} flex items-center justify-center font-bold ring-2 ${tierColor.ring}`}
                >
                  {getInitials(entry.name)}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 text-lg">{style.medal}</span>
            </div>

            {/* Name */}
            <span className={`text-sm font-semibold text-ink ${isCenter ? 'text-base' : ''} text-center max-w-[100px] truncate`}>
              {entry.name}
            </span>

            {/* Tier pill */}
            <span className={`mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${tierColor.bg} ${tierColor.text}`}>
              {entry.tier.replace('_', ' ')}
            </span>

            {/* Points */}
            <span className="mt-1.5 text-xs font-bold text-ink-soft">{entry.points.toLocaleString()} pts</span>

            {/* Platform */}
            <div className={`mt-2 w-full ${style.height} ${style.bg} border ${style.border} rounded-t-xl flex items-end justify-center pb-2`}>
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider">#{entry.rank}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
