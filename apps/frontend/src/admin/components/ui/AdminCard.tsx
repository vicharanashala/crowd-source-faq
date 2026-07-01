import React, { type ReactNode } from 'react';

interface AdminCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function AdminCard({ title, subtitle, action, children, className = '', noPadding }: AdminCardProps) {
  return (
    <div className={`bg-card border border-border rounded-xl ${noPadding ? '' : 'overflow-hidden'} ${className}`}>
      {(title || action) && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
          <div>
            {title && <p className="text-[13px] font-semibold text-ink">{title}</p>}
            {subtitle && <p className="text-[10px] text-ink-faint mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

interface AdminSectionLabelProps {
  label: string;
  action?: ReactNode;
}

export function AdminSectionLabel({ label, action }: AdminSectionLabelProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <p className="text-[11px] font-semibold text-ink uppercase tracking-widest">{label}</p>
      {action && <div>{action}</div>}
    </div>
  );
}