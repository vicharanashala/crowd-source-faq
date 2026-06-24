import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function ProgressBar({ readCount, totalSections }) {
  const pct = Math.round((readCount / totalSections) * 100);

  return (
    <div className="glass-card p-3 flex items-center gap-3">
      <CheckCircle2 size={16} className="text-brand-400 flex-shrink-0" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400">You've read {readCount} of {totalSections} sections</span>
          <span className="text-xs text-brand-400 font-medium">{pct}%</span>
        </div>
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
