import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-[1.5px]',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
};

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`
        rounded-full border-accent/30 border-t-accent animate-spin
        ${sizeClasses[size]}
        ${className}
      `}
      role="status"
      aria-label="Loading"
    />
  );
}
