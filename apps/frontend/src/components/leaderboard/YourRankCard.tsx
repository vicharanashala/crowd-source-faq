import React from 'react';
import { motion } from 'framer-motion';

interface YourRankCardProps {
  rank: number;
  points: number;
  tier: string;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  knowledge_master: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' },
  champion:         { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20' },
  expert:           { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
  helper:           { bg: 'bg-info/10', text: 'text-info', border: 'border-info/20' },
  contributor:      { bg: 'bg-mist', text: 'text-ink-soft', border: 'border-border' },
  newcomer:         { bg: 'bg-mist', text: 'text-ink-faint', border: 'border-border' },
};

const TIER_THRESHOLDS: Record<string, number> = {
  newcomer: 0,
  contributor: 50,
  helper: 150,
  expert: 300,
  champion: 600,
  knowledge_master: 1000,
};

const TIER_ORDER = ['newcomer', 'contributor', 'helper', 'expert', 'champion', 'knowledge_master'];

function getNextTier(currentTier: string): string | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export default function YourRankCard({ rank, points, tier }: YourRankCardProps) {
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.newcomer;
  const nextTier = getNextTier(tier);
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;
  const progress = nextThreshold ? Math.min(100, (points / nextThreshold) * 100) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border ${tierColor.border} ${tierColor.bg} p-5`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ink">Your Rank</h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tierColor.bg} ${tierColor.text} border ${tierColor.border}`}>
          {tier.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold text-ink">#{rank}</span>
        <span className="text-sm text-ink-soft">of all contributors</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-soft">{points.toLocaleString()} points</span>
          {nextTier && nextThreshold && (
            <span className="text-ink-faint">
              {nextThreshold - points} pts to <span className={`font-medium ${tierColor.text}`}>{nextTier.replace('_', ' ')}</span>
            </span>
          )}
          {!nextTier && <span className="text-accent font-medium">Max tier!</span>}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-border/50 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              tier === 'knowledge_master' ? 'bg-accent' :
              tier === 'champion' ? 'bg-warning' :
              tier === 'expert' ? 'bg-success' :
              'bg-info'
            }`}
          />
        </div>
      </div>
    </motion.div>
  );
}
