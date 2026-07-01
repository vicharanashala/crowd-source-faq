import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface UserActivityData {
  date?: string;
  searches?: number;
  users?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 border text-xs" style={{ background: 'rgba(8,8,20,0.97)', borderColor: 'rgba(34,211,238,0.3)' }}>
      <p className="text-white/40 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

interface UserActivityChartProps {
  data?: UserActivityData[];
}

export default function UserActivityChart({ data = [] }: UserActivityChartProps) {
  const formatted = data.map(d => ({ ...d, date: d.date?.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="searchGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(34,211,238,0.3)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="searches" name="Searches" stroke="#22d3ee" strokeWidth={2} fill="url(#searchGrad)" dot={false} activeDot={{ r: 4, fill: '#22d3ee', stroke: '#030307', strokeWidth: 2 }} />
        <Area type="monotone" dataKey="users" name="Users" stroke="#3b82f6" strokeWidth={2} fill="url(#usersGrad)" dot={false} activeDot={{ r: 4, fill: '#3b82f6', stroke: '#030307', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}