import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

export default function AdminTopSearches() {
  const { analytics } = useAnalytics();
  const topSearches = analytics.topSearches || [];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-900">Top Searches</h3>
      </div>

      {topSearches.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No searches yet.</p>
      ) : (
        <div className="space-y-2">
          {topSearches.map((item, idx) => (
            <div key={item.term} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-slate-500 w-4">{idx + 1}</span>
                <span className="text-xs text-slate-700 truncate">{item.term}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <span className="text-xs text-slate-500">{item.count}</span>
                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                  item.trend === 'up' ? 'text-green-500' : item.trend === 'down' ? 'text-red-500' : 'text-slate-400'
                }`}>
                  {item.trend === 'up' && <ArrowUpRight size={10} />}
                  {item.trend === 'down' && <ArrowDownRight size={10} />}
                  {item.trend === 'flat' && <Minus size={10} />}
                  {item.growth > 0 ? '+' : ''}{item.growth}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
