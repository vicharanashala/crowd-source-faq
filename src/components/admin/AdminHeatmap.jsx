import React from 'react';
import { BarChart3 } from 'lucide-react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

const confusionColor = (score, max) => {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return { bar: 'bg-red-500', text: 'text-red-400' };
  if (pct >= 45) return { bar: 'bg-orange-500', text: 'text-orange-400' };
  if (pct >= 25) return { bar: 'bg-yellow-500', text: 'text-yellow-400' };
  return { bar: 'bg-green-500', text: 'text-green-400' };
};

export default function AdminHeatmap() {
  const { analytics } = useAnalytics();
  const heatmap = analytics.heatmap || [];
  const maxCount = heatmap.length > 0 ? heatmap[0].count : 1;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-900">Search Heatmap</h3>
        <span className="ml-auto text-xs text-slate-500">generated from real searches</span>
      </div>

      {heatmap.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">No search data yet. Searches will appear here as students use the portal.</p>
      ) : (
        <div className="space-y-3">
          {heatmap.slice(0, 10).map(row => {
            const c = confusionColor(row.count, maxCount);
            const pct = Math.round((row.count / maxCount) * 100);
            return (
              <div key={row.term}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-800 truncate max-w-[160px]">{row.term}</span>
                  <span className={`text-sm font-bold ${c.text}`}>{row.count}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${c.bar} rounded-full transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
