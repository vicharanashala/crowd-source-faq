import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

export default function AdminPanicMode() {
  const { analytics } = useAnalytics();
  const spikes = analytics.panicSpikes || [];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={15} className="text-red-400" />
        <h3 className="text-sm font-semibold text-slate-900">Panic Mode</h3>
      </div>

      {spikes.length === 0 ? (
        <div className="bg-green-500/8 border border-green-500/15 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={13} className="text-green-500" />
          <p className="text-xs text-green-400">No search spikes detected. All normal.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {spikes.map(spike => (
            <div key={spike.term} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-300 font-semibold mb-1">
                🚨 {spike.term.toUpperCase()} Panic Detected
              </p>
              <p className="text-xs text-red-400/70">
                Searches spiked {spike.multiplier}× in 24 hours
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500">Yesterday: {spike.yesterday}</span>
                <span className="text-xs text-slate-500">→</span>
                <span className="text-xs text-red-400 font-bold">Today: {spike.today}</span>
              </div>
            </div>
          ))}
          <div className="bg-green-500/8 border border-green-500/15 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle size={13} className="text-green-500" />
            <p className="text-xs text-green-400">Affected FAQs auto-promoted to top</p>
          </div>
        </div>
      )}
    </div>
  );
}
