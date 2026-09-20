/**
 * StatCard — one stat tile in the Learning Journey dashboard grid.
 * The number counts up from 0 to `value` via GSAP once it's known
 * (skipped entirely for prefers-reduced-motion — jumps straight to
 * the final value).
 */

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import Card from '../ui/Card';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  accentClassName?: string;
  /** Extra content under the number, e.g. a progress bar. */
  footer?: React.ReactNode;
}

export default function StatCard({
  label,
  value,
  suffix = '',
  icon,
  accentClassName = 'bg-accent-light text-accent',
  footer,
}: StatCardProps): React.ReactElement {
  const numberRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = numberRef.current;
    if (!el) return;

    if (reducedMotion) {
      el.textContent = `${value}${suffix}`;
      return;
    }

    // Animate a plain counter object rather than driving React state per
    // frame — GSAP writes straight to the DOM via onUpdate, which is far
    // cheaper than a setState-per-tick re-render loop.
    const counter = { n: 0 };
    const tween = gsap.to(counter, {
      n: value,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = `${Math.round(counter.n)}${suffix}`;
      },
    });

    return () => { tween.kill(); };
  }, [value, suffix, reducedMotion]);

  return (
    <Card variant="elevated" className="journey-stat-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${accentClassName}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div>
        <p className="text-2xl font-semibold text-ink tabular-nums" aria-live="polite">
          <span ref={numberRef}>0{suffix}</span>
        </p>
        <p className="text-xs text-ink-faint mt-0.5">{label}</p>
      </div>
      {footer}
    </Card>
  );
}
