import React from 'react';

type CardVariant = 'default' | 'elevated' | 'interactive';

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantClasses: Record<CardVariant, string> = {
  default:
    'bg-card rounded-2xl border border-border shadow-subtle',
  elevated:
    'bg-card rounded-2xl border border-border shadow-card',
  interactive:
    'bg-card rounded-2xl border border-border shadow-card card-hover cursor-pointer hover:border-accent/30',
};

export default function Card({
  variant = 'default',
  className = '',
  children,
  onClick,
}: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`${variantClasses[variant]} ${onClick ? 'w-full text-left' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}
