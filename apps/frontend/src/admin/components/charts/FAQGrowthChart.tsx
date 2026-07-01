import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface FAQGrowthData {
  date?: string;
  count?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: 'rgba(8,8,20,0.97)', borderColor: 'rgba(139,92,246,0.3)' }}>
      <p className="text-white/40 mb-1">{label}</p>
      <p className="text-violet-300 font-semibold">{payload[0].value} FAQs added</p>
    </div>
  );
};

interface FAQGrowthChartProps {
  data?: FAQGrowthData[];
}

export default function FAQGrowthChart({ data = [] }: FAQGrowthChartProps) {
  const formatted = data.map(d => ({ ...d, date: d.date?.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="faqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#faqGrad)" dot={false} activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#030307', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}