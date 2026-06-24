import React from 'react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

export default function AdminSelfHealing() {
  const { analytics } = useAnalytics();
  const suggestions = analytics.selfHealingSuggestions || [];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔧</span>
        <h3 className="text-sm font-semibold text-slate-900">Self-Healing Suggestions</h3>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          No suggestions yet. Suggestions appear automatically based on student interactions.
        </p>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={i} className="bg-white/4 border border-white/8 rounded-lg p-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {s.type === 'create' && `🔍 ${s.reason}`}
                  {s.type === 'rewrite' && `👎 ${s.question} — ${s.reason}`}
                  {s.type === 'document' && `📋 ${s.reason}`}
                </p>
                <p className="text-xs text-brand-400 mt-1 font-medium">
                  → Suggested action: {s.action}
                </p>
              </div>
              <button className="text-xs text-slate-900 font-medium bg-brand-600/20 border border-brand-500/40 px-2.5 py-1 rounded-lg hover:bg-brand-600/30 transition-colors flex-shrink-0">
                {s.action}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
