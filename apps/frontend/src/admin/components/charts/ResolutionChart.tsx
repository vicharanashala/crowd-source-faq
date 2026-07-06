import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

interface ResolutionChartProps {
  approved?: number;
  pending?: number;
  rejected?: number;
}

export default function ResolutionChart({ approved = 0, pending = 0, rejected = 0 }: ResolutionChartProps) {
  const total = approved + pending + rejected || 1;
  const rate = Math.round((approved / total) * 100);
  const data = [{ value: rate, fill: '#8b5cf6' }];

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="90%" startAngle={90} endAngle={-270} data={data} barSize={10}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: 'rgba(255,255,255,0.05)' }} dataKey="value" angleAxisId={0} cornerRadius={8} fill="#8b5cf6" />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{rate}%</span>
          <span className="text-[10px] text-white/30">resolved</span>
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-white/40">{approved} approved</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-white/40">{pending} pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-white/40">{rejected} rejected</span>
        </div>
      </div>
    </div>
  );
}