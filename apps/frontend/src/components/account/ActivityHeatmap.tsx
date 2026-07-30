/**
 * ActivityHeatmap.tsx
 * GitHub-style contribution heatmap showing the user's daily activity
 * for the past 52 weeks. Data from GET /api/auth/me/activity.
 *
 * Intensity levels (contributions per day):
 *   0 → empty grey
 *   1-2 → light green
 *   3-5 → medium green
 *   6-9 → dark green
 *   10+ → brightest green
 */

import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

interface ActivityData {
  days: Record<string, number>;
  since: string;
}

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_COLORS = [
  'bg-[#e8e8e8] dark:bg-[#2d2d2d]',   // 0 - empty
  'bg-[#9be9a8]',                       // 1 - light
  'bg-[#40c463]',                       // 2 - medium
  'bg-[#30a14e]',                       // 3 - dark
  'bg-[#216e39]',                       // 4 - darkest
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildGrid(): Date[] {
  // 52 weeks + today's partial week, starting from the past Sunday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0 = Sun
  // Start from 52 weeks ago, aligned to Sunday
  const start = new Date(today);
  start.setDate(today.getDate() - 364 - dayOfWeek);
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= today) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function ActivityHeatmap() {
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    api.get<ActivityData>('/auth/me/activity')
      .then(res => setData(res.data.days ?? {}))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  const grid = buildGrid(); // flat list of Date objects
  // Group into columns of 7 (each column = one week, Sun→Sat)
  const weeks: Date[][] = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }

  // Build month label positions (column index where month first appears)
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const month = week[0].getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: MONTHS[month], col });
      lastMonth = month;
    }
  });

  const totalContributions = Object.values(data).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle animate-pulse">
        <div className="h-4 w-40 bg-mist rounded mb-4" />
        <div className="h-28 bg-mist rounded-xl" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-ink text-sm">Contribution Activity</h3>
          <p className="text-xs text-ink-soft mt-0.5">
            {totalContributions} contribution{totalContributions !== 1 ? 's' : ''} in the last year
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span>Less</span>
          {LEVEL_COLORS.map((cls, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Grid */}
      <div className="relative overflow-x-auto">
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: 28 }}>
          {weeks.map((_, col) => {
            const lbl = monthLabels.find(m => m.col === col);
            return (
              <div key={col} className="flex-shrink-0 text-[10px] text-ink-soft" style={{ width: 13, marginRight: 2 }}>
                {lbl ? lbl.label : ''}
              </div>
            );
          })}
        </div>

        <div className="flex gap-0">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1 flex-shrink-0">
            {DAYS.map((d, i) => (
              <div key={d} className="text-[10px] text-ink-soft h-3 flex items-center" style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="flex gap-0.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((day, di) => {
                  const key = toISODate(day);
                  const count = data[key] ?? 0;
                  const level = getLevel(count);
                  const isToday = key === toISODate(new Date());
                  return (
                    <div
                      key={di}
                      className={`w-3 h-3 rounded-sm cursor-pointer transition-transform hover:scale-125 ${LEVEL_COLORS[level]} ${isToday ? 'ring-1 ring-accent ring-offset-1' : ''}`}
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        const label = count === 0
                          ? `No contributions on ${day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : `${count} contribution${count !== 1 ? 's' : ''} on ${day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                        setTooltip({ text: label, x: rect.left + rect.width / 2, y: rect.top - 8 });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip (fixed position) */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 bg-ink text-white text-[11px] rounded-md shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-ink" />
        </div>
      )}
    </div>
  );
}
