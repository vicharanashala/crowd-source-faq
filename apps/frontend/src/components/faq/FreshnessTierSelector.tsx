import React from 'react';

interface FreshnessTierSelectorProps {
  value: 'evergreen' | 'seasonal' | 'volatile';
  onChange: (tier: 'evergreen' | 'seasonal' | 'volatile') => void;
  reviewIntervalDays: number;
  onIntervalChange: (days: number) => void;
}

const SEASONAL_DEFAULT = 15;
const VOLATILE_DEFAULT  = 4;

export default function FreshnessTierSelector({
  value: tier,
  onChange,
  reviewIntervalDays,
  onIntervalChange,
}: FreshnessTierSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(['evergreen', 'seasonal', 'volatile'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              onChange(t);
              if (t === 'evergreen') onIntervalChange(0);
              else if (t === 'seasonal') onIntervalChange(SEASONAL_DEFAULT);
              else onIntervalChange(VOLATILE_DEFAULT);
            }}
            className={`flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-all
              ${tier === t
                ? t === 'evergreen' ? 'border-green-400 bg-green-50 text-green-700'
                : t === 'seasonal' ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-red-400 bg-red-50 text-red-700'
                : 'border-border text-ink-soft hover:bg-mist'
              }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tier !== 'evergreen' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-soft whitespace-nowrap">
            Review every
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={reviewIntervalDays}
            onChange={(e) => onIntervalChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 rounded-lg border border-border bg-mist px-2 py-1.5 text-xs text-ink text-center focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <span className="text-xs text-ink-soft">days</span>
          <span className="text-xs text-ink-faint ml-auto">
            {tier === 'seasonal' ? '(default: 15)' : '(default: 4)'}
          </span>
        </div>
      )}
    </div>
  );
}