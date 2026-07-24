type BadgeVariant = 'approved' | 'pending' | 'rejected' | 'admin' | 'user' | 'moderator' | 'default';

interface BadgeProps {
  status?: BadgeVariant;
  label?: string;
  showDot?: boolean;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  approved:  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-[#f0fdf4] text-[#166534] border-[#bbf7d0] dark:bg-accent/18 dark:text-accent dark:border-accent/18',
  pending:   'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-[#fffbeb] text-[#92400e] border-[#fde68a] dark:bg-warning/16 dark:text-warning dark:border-warning/16',
  rejected:  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-[#fef2f2] text-[#991b1b] border-[#fecaca] dark:bg-danger/10 dark:text-danger dark:border-danger/10',
  admin:     'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-accent/20 text-[#6B5436] border-accent/45 dark:bg-accent/20 dark:text-accent dark:border-accent/45',
  moderator: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-accent/12 text-[#8A6B43] border-accent/30 dark:bg-accent/12 dark:text-accent-hover dark:border-accent/30',
  user:      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-accent/8 text-accent border-accent/20 dark:bg-accent/8 dark:text-accent-hover dark:border-accent/20',
  default:   'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-[#f9fafb] text-[#374151] border-[#e5e7eb] dark:bg-border/40 dark:text-ink-soft dark:border-border/60',
};

const DOT_COLOR: Record<BadgeVariant, string> = {
  approved:  'bg-success',
  pending:   'bg-warning',
  rejected:  'bg-danger',
  admin:     'bg-accent',
  user:      'bg-[#D6B78F]',
  moderator: 'bg-[#B89564]',
  default:   'bg-ink-faint',
};

export default function Badge({ status = 'default', label, showDot = true }: BadgeProps) {
  const variantClass = VARIANT_CLASS[status] ?? VARIANT_CLASS.default;
  const dotClass = DOT_COLOR[status] ?? DOT_COLOR.default;
  return (
    <span className={variantClass}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />}
      {label || status}
    </span>
  );
}

