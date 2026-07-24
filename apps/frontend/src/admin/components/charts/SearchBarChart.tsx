import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import {
  adminChartAxis,
  adminChartFill,
  adminChartFillFade,
  adminChartGrid,
  adminChartStroke,
  adminChartTooltipBg,
  adminChartTooltipBord,
  adminChartTooltipText,
} from '../../../styles/style_config';

interface SearchTermData {
  term?: string;
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
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: adminChartTooltipBg, borderColor: adminChartTooltipBord }}>
      <p className="text-ink-faint mb-1 max-w-[140px] truncate">"{label}"</p>
      <p className="font-semibold" style={{ color: adminChartTooltipText }}>{payload[0].value} searches</p>
    </div>
  );
};

interface SearchBarChartProps {
  data?: SearchTermData[];
}

export default function SearchBarChart({ data = [] }: SearchBarChartProps) {
  const chartData = data.slice(0, 8).map(d => ({
    term: d.term ? (d.term.slice(0, 14) + (d.term.length > 14 ? '…' : '')) : '',
    count: d.count,
    full: d.term,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={18}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={adminChartStroke} stopOpacity={1} />
            <stop offset="100%" stopColor={adminChartFillFade} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={adminChartGrid} vertical={false} />
        <XAxis dataKey="term" tick={{ fill: adminChartAxis, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: adminChartAxis, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--text-primary-rgb) / 0.03)' }} />
        <Bar dataKey="count" fill="url(#barGrad)" radius={[4, 4, 0, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={`url(#barGrad)`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}