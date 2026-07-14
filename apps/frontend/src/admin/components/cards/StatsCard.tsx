import React, { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';

function useCountUp(target: number, duration = 1200): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

type CardTheme = 'purple' | 'blue' | 'cyan' | 'green' | 'amber' | 'red';

interface CardThemeStyle {
  gradient: string;
  border: string;
  iconBg: string;
  glow: string;
  trend: string;
}

const CARD_THEMES: Record<CardTheme, CardThemeStyle> = {
  purple: { gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.08))', border: 'rgba(139,92,246,0.2)', iconBg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', glow: 'rgba(139,92,246,0.15)', trend: '#a78bfa' },
  blue:   { gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(37,99,235,0.06))', border: 'rgba(59,130,246,0.2)', iconBg: 'linear-gradient(135deg, #3b82f6, #2563eb)', glow: 'rgba(59,130,246,0.15)', trend: '#60a5fa' },
  cyan:   { gradient: 'linear-gradient(135deg, rgba(34,211,238,0.1), rgba(6,182,212,0.05))', border: 'rgba(34,211,238,0.18)', iconBg: 'linear-gradient(135deg, #22d3ee, #0891b2)', glow: 'rgba(34,211,238,0.12)', trend: '#67e8f9' },
  green:  { gradient: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.05))', border: 'rgba(16,185,129,0.18)', iconBg: 'linear-gradient(135deg, #10b981, #059669)', glow: 'rgba(16,185,129,0.12)', trend: '#34d399' },
  amber:  { gradient: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(217,119,6,0.05))', border: 'rgba(245,158,11,0.18)', iconBg: 'linear-gradient(135deg, #f59e0b, #d97706)', glow: 'rgba(245,158,11,0.12)', trend: '#fbbf24' },
  red:    { gradient: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.05))', border: 'rgba(239,68,68,0.18)', iconBg: 'linear-gradient(135deg, #ef4444, #dc2626)', glow: 'rgba(239,68,68,0.12)', trend: '#f87171' },
};

interface IconProps {
  size: number;
  [key: string]: unknown;
}

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<IconProps>;
  theme?: CardTheme;
  trend?: number;
  trendLabel?: string;
  delay?: number;
  isText?: boolean;
}

export default function StatsCard({ label, value, icon: Icon, theme = 'purple', trend, trendLabel, delay = 0, isText = false }: StatsCardProps) {
  const count = useCountUp(isText ? 0 : (value as number || 0));
  const t = CARD_THEMES[theme] || CARD_THEMES.purple;
  const trendUp = trend !== undefined ? parseFloat(String(trend)) >= 0 : false;

  const containerStyle: CSSProperties = {
    background: t.gradient,
    borderColor: t.border,
    boxShadow: `0 4px 24px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="relative rounded-xl p-5 border overflow-hidden cursor-default"
      style={containerStyle}
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl" style={{ background: t.iconBg }} />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: t.iconBg }}>
            <Icon size={16} />
          </div>
          {trend !== undefined && (
            <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: trendUp ? '#34d399' : '#f87171' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {trendUp
                  ? <polyline points="18 15 12 9 6 15"/>
                  : <polyline points="6 9 12 15 18 9"/>}
              </svg>
              {Math.abs(trend)}
            </div>
          )}
        </div>

        <p className="text-2xl font-bold text-white tabular-nums mb-1">
          {isText ? value : count.toLocaleString()}
        </p>
        <p className="text-xs text-white/40 font-medium">{label}</p>
        {trendLabel && (
          <p className="text-[10px] mt-1.5" style={{ color: t.trend }}>{trendLabel}</p>
        )}
      </div>
    </motion.div>
  );
}