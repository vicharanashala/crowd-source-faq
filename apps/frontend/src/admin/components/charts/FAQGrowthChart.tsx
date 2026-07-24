import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  adminChartActiveDotFill,
  adminChartActiveDotStroke,
  adminChartAxis,
  adminChartCursor,
  adminChartFill,
  adminChartFillFade,
  adminChartGrid,
  adminChartStroke,
  adminChartTooltipBg,
  adminChartTooltipBord,
  adminChartTooltipText,
} from '../../../styles/style_config';

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
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: adminChartTooltipBg, borderColor: adminChartTooltipBord }}>
      <p className="text-ink-faint mb-1">{label}</p>
      <p className="font-semibold" style={{ color: adminChartTooltipText }}>{payload[0].value} FAQs added</p>
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
            <stop offset="0%" stopColor={adminChartFill} stopOpacity={1} />
            <stop offset="100%" stopColor={adminChartFillFade} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={adminChartGrid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: adminChartAxis, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: adminChartAxis, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: adminChartCursor, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="count" stroke={adminChartStroke} strokeWidth={2} fill="url(#faqGrad)" dot={false} activeDot={{ r: 4, fill: adminChartActiveDotFill, stroke: adminChartActiveDotStroke, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}