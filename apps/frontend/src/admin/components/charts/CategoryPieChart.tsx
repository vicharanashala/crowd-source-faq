import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#8b5cf6', '#3b82f6', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#a78bfa'];

interface CategoryData {
  name: string;
  count: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: 'rgba(8,8,20,0.97)', borderColor: 'rgba(255,255,255,0.1)' }}>
      <p className="text-white/40 mb-0.5">{payload[0].name}</p>
      <p className="text-white font-semibold">{payload[0].value} FAQs</p>
    </div>
  );
};

interface CategoryPieChartProps {
  data?: CategoryData[];
}

export default function CategoryPieChart({ data = [] }: CategoryPieChartProps) {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%"
            innerRadius={46} outerRadius={72}
            dataKey="count" nameKey="name"
            strokeWidth={0} paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-xs text-white/50 truncate flex-1">{d.name}</span>
            <span className="text-xs text-white/70 font-medium tabular-nums">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}