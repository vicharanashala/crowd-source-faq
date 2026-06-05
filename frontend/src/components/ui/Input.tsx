import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export default function Input({
  label,
  error,
  iconLeft,
  iconRight,
  id,
  className = '',
  ...props
}: InputProps) {
  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-ink-soft mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
            {iconLeft}
          </div>
        )}
        <input
          id={id}
          className={
            `w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm text-ink placeholder-ink-faint ` +
            `focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent transition-all duration-200 ease-smooth ` +
            `${iconLeft ? 'pl-10' : ''} ` +
            `${iconRight ? 'pr-10' : ''} ` +
            `${error ? 'border-danger focus:ring-danger/20 focus:border-danger' : ''} ` +
            className
          }
          {...props}
        />
        {iconRight && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
            {iconRight}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
