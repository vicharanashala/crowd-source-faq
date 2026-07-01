import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'info' | 'accent';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  info:    'bg-accent-light text-accent',
  accent:  'bg-accent-light text-accent',
};

export default function Badge({
  variant = 'info',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5
        rounded text-xs font-medium leading-none
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
