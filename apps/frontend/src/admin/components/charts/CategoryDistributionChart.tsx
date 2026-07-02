import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

interface CategoryData {
  category: string;
  count: number;
  views: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  metric: 'count' | 'views';
}

const CustomTooltip = ({ active, payload, label, metric }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: 'rgba(8,8,20,0.97)', borderColor: 'rgba(139,92,246,0.3)' }}>
      <p className="text-white/40 mb-1">{label}</p>
      <p className="font-semibold text-accent">
        {metric === 'count' ? `${val} FAQs` : `${val.toLocaleString()} Views`}
      </p>
    </div>
  );
};

interface CategoryDistributionChartProps {
  data?: CategoryData[];
}

const COLORS = ['#8b5cf6', '#3b82f6', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#a78bfa'];

export default function CategoryDistributionChart({ data = [] }: CategoryDistributionChartProps) {
  const [metric, setMetric] = useState<'count' | 'views'>('count');

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-ink-faint text-xs italic">
        No category data available.
      </div>
    );
  }

  // Sort and limit to top 8 categories to avoid rendering issues
  const sortedData = [...data]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-ink-soft uppercase tracking-wider font-semibold">
          Top Categories
        </span>
        <div className="flex bg-mist rounded-lg p-0.5 border border-border/30">
          <button
            onClick={() => setMetric('count')}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              metric === 'count'
                ? 'bg-card text-accent shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            FAQ Count
          </button>
          <button
            onClick={() => setMetric('views')}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              metric === 'views'
                ? 'bg-card text-accent shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            Views
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-full md:w-3/5 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sortedData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="category"
                type="category"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Bar dataKey={metric} radius={[0, 4, 4, 0]}>
                {sortedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 w-full space-y-2">
          {sortedData.map((d, i) => (
            <div key={d.category} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-ink truncate font-medium">{d.category}</span>
              </div>
              <span className="text-ink-soft tabular-nums font-semibold">
                {metric === 'count'
                  ? `${d.count} FAQs`
                  : `${d.views.toLocaleString()} Views`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
