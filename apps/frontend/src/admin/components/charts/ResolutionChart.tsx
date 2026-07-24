import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';
import {
  adminChartBg,
  adminChartPercentText,
  adminChartProgressFill,
  adminChartSubtleText,
  adminLegendApprovedDot,
  adminLegendPendingDot,
  adminLegendRejectedDot,
} from '../../../styles/style_config';

interface ResolutionChartProps {
  approved?: number;
  pending?: number;
  rejected?: number;
}

export default function ResolutionChart({ approved = 0, pending = 0, rejected = 0 }: ResolutionChartProps) {
  const total = approved + pending + rejected || 1;
  const rate = Math.round((approved / total) * 100);
  const data = [{ value: rate, fill: adminChartProgressFill }];

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="90%" startAngle={90} endAngle={-270} data={data} barSize={10}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: adminChartBg }} dataKey="value" angleAxisId={0} cornerRadius={8} fill={adminChartProgressFill} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color: adminChartPercentText }}>{rate}%</span>
          <span className="text-[10px]" style={{ color: adminChartSubtleText }}>resolved</span>
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-ink-faint">{approved} approved</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-warning" />
          <span className="text-ink-faint">{pending} pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-danger" />
          <span className="text-ink-faint">{rejected} rejected</span>
        </div>
      </div>
    </div>
  );
}