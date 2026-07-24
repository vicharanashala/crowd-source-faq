import React from 'react';
import {
  flexRow,
  numberInput,
  stackXs,
  textBodySoft,
  textXs,
  textXsLabel,
  tierPillAccent,
  tierPillBase,
  tierPillDanger,
  tierPillIdle,
} from '../../styles/style_config';

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
    <div className={stackXs}>
      <div className="flex gap-2">
        {(['evergreen', 'seasonal', 'volatile'] as const).map((t) => {
          // 'evergreen' and 'seasonal' use the brand accent pill (both
          // are healthy editorial states). 'volatile' uses the danger
          // pill because it requires more frequent review.
          const selectedTier = tier === t;
          const selectedStyle =
            t === 'volatile' ? tierPillDanger : tierPillAccent;
          const className = `${tierPillBase} ${selectedTier ? selectedStyle : tierPillIdle}`;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                if (t === 'evergreen') onIntervalChange(0);
                else if (t === 'seasonal') onIntervalChange(SEASONAL_DEFAULT);
                else onIntervalChange(VOLATILE_DEFAULT);
              }}
              className={className}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          );
        })}
      </div>

      {tier !== 'evergreen' && (
        <div className={flexRow}>
          <label className={`${textBodySoft} text-xs whitespace-nowrap`}>
            Review every
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={reviewIntervalDays}
            onChange={(e) => onIntervalChange(Math.max(1, parseInt(e.target.value) || 1))}
            className={numberInput}
          />
          <span className={textXs}>days</span>
          <span className={`${textXsLabel} ml-auto`}>
            {tier === 'seasonal' ? '(default: 15)' : '(default: 4)'}
          </span>
        </div>
      )}
    </div>
  );
}