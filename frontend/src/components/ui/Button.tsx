import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: '#5a7a5a' },
  secondary: {},
  ghost: {},
  accent: { backgroundColor: 'rgba(90, 122, 90, 0.1)', color: '#5a7a5a' },
  danger: { backgroundColor: '#dc2626' },
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'text-white hover:brightness-90 active:brightness-75 shadow-sm',
  secondary:
    'bg-white text-ink border border-border hover:bg-mist hover:border-ink-soft active:bg-border',
  ghost:
    'bg-transparent text-ink-soft hover:bg-mist hover:text-ink active:bg-border/40',
  accent:
    'hover:bg-accent/15 active:bg-accent/20',
  danger:
    'text-white hover:brightness-90 active:brightness-75 shadow-sm',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-sm rounded-xl gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={variantStyles[variant]}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-200 ease-smooth
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0" />
      )}
      {children}
    </button>
  );
}
