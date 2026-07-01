import React, { useEffect, useState } from 'react';

function useCountUp(target: number, duration = 1000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

interface AdminStatCardProps {
  label: string;
  value: number;
  sub?: string;
  alert?: boolean;
  trend?: number;
}

export function AdminStatCard({ label, value, sub, alert, trend }: AdminStatCardProps) {
  const count = useCountUp(value);

  return (
    <div className={`bg-card border rounded-xl p-4 ${alert ? 'border-amber/30 bg-amber/5' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-amber' : 'text-ink'}`}>
          {count.toLocaleString()}
        </p>
        {trend !== undefined && (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${trend >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-ink mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-ink-faint mt-0.5">{sub}</p>}
    </div>
  );
}