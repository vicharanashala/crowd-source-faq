/**
 * ModeratorWorkloadChart — 14-day stacked bar chart of moderator
 * activity, bucketed by day in UTC.
 *
 * Each bar = one UTC day. Bars are split into three segments covering
 * all 11 `ModerationAction` enum values (no "other" catch-all):
 *   - warnings (sage green / success)   — warn, lift_warning, point_deduct, badge_issue_negative
 *   - account  (amber / warning)        — ban, unban, suspend, unsuspend
 *   - content  (coral / danger)         — soft_delete, restore, delete_content
 *
 * Tooltip on hover shows the per-day counts + total. All visual colors
 * are pulled from the project's `adminLegend*Dot` tokens in
 * `styles/components.ts` so the chart inherits dark-mode + theme
 * support automatically — no literal hex here.
 *
 * Note on bucket ↔ legend mapping: the tokens carry judgment meaning
 * (approved/pending/rejected) that doesn't map cleanly to action
 * *severity*, but using them keeps the admin chart family visually
 * consistent. Document the mapping in this file's header rather than
 * per-render.
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

export interface ModeratorWorkloadData {
  date: string;
  warnings: number;
  account: number;
  content: number;
  total: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ModeratorWorkloadData }>;
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
        Warnings: {d.warnings}
      </p>
      <p className="font-semibold" style={{ color: adminLegendPendingDot }}>
        Account actions: {d.account}
      </p>
      <p className="font-semibold" style={{ color: adminLegendRejectedDot }}>
        Content actions: {d.content}
      </p>
      <p className="text-ink-faint mt-1">
        Total: {d.total}
      </p>
    </div>
  );
};

interface ModeratorWorkloadChartProps {
  data?: ModeratorWorkloadData[];
}

export default function ModeratorWorkloadChart({ data = [] }: ModeratorWorkloadChartProps) {
  // Slice "YYYY-MM-DD" → "MM-DD" for axis labels, same convention as
  // AIDecisionHealthChart and FAQGrowthChart.
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
        <Bar dataKey="warnings" stackId="a" fill={adminLegendApprovedDot} name="Warnings" />
        <Bar dataKey="account" stackId="a" fill={adminLegendPendingDot} name="Account" />
        <Bar dataKey="content" stackId="a" fill={adminLegendRejectedDot} name="Content" />
      </BarChart>
    </ResponsiveContainer>
  );
}
