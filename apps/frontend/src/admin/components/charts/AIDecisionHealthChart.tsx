/**
 * AIDecisionHealthChart — 14-day stacked bar chart of auto-answer pipeline
 * decisions.
 *
 * Each bar = one UTC day. Bars are split into three segments:
 *   - approved  (sage green / success)  — AI confidence high enough to auto-approve
 *   - suggested (amber / warning)       — medium confidence, queued for human review
 *   - escalated (coral / danger)        — low confidence or sensitive topic
 *
 * Tooltip on hover shows the per-day counts + that day's average AI
 * confidence (0–1). Tooltip text colors are pulled from the project's
 * existing `adminLegend*Dot` tokens in `styles/components.ts` so the
 * chart inherits dark-mode + theme support automatically — no literal
 * hex here.
 */
import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  adminChartAxis,
  adminChartCursor,
  adminChartGrid,
  adminChartTooltipBg,
  adminChartTooltipBord,
  adminLegendApprovedDot,
  adminLegendPendingDot,
  adminLegendRejectedDot,
} from '../../../styles/style_config';

export interface AiDecisionHealthData {
  date: string;
  approved: number;
  suggested: number;
  escalated: number;
  total: number;
  avgConfidence: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AiDecisionHealthData }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 border text-xs"
      style={{ background: adminChartTooltipBg, borderColor: adminChartTooltipBord }}
    >
      <p className="text-ink-faint mb-1">{label}</p>
      <p className="font-semibold" style={{ color: adminLegendApprovedDot }}>
        Approved: {d.approved}
      </p>
      <p className="font-semibold" style={{ color: adminLegendPendingDot }}>
        Suggested: {d.suggested}
      </p>
      <p className="font-semibold" style={{ color: adminLegendRejectedDot }}>
        Escalated: {d.escalated}
      </p>
      <p className="text-ink-faint mt-1">
        Avg confidence: {Math.round(d.avgConfidence * 100)}%
      </p>
    </div>
  );
};

interface AIDecisionHealthChartProps {
  data?: AiDecisionHealthData[];
}

export default function AIDecisionHealthChart({ data = [] }: AIDecisionHealthChartProps) {
  // Slice "YYYY-MM-DD" → "MM-DD" for axis labels, same convention as FAQGrowthChart.
  const formatted = data.map((d) => ({ ...d, date: d.date?.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={adminChartGrid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: adminChartAxis, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: adminChartAxis, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: adminChartCursor, opacity: 0.4 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="approved" stackId="a" fill={adminLegendApprovedDot} name="Approved" />
        <Bar dataKey="suggested" stackId="a" fill={adminLegendPendingDot} name="Suggested" />
        <Bar dataKey="escalated" stackId="a" fill={adminLegendRejectedDot} name="Escalated" />
      </BarChart>
    </ResponsiveContainer>
  );
}
