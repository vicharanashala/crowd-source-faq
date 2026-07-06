type BadgeVariant = 'approved' | 'pending' | 'rejected' | 'admin' | 'user' | 'moderator' | 'default';

interface BadgeProps {
  status?: BadgeVariant;
  label?: string;
  showDot?: boolean;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  approved:  'admin-badge admin-badge-approved',
  pending:   'admin-badge admin-badge-pending',
  rejected:  'admin-badge admin-badge-rejected',
  admin:     'admin-badge admin-badge-admin',
  user:      'admin-badge admin-badge-user',
  moderator: 'admin-badge admin-badge-moderator',
  default:   'admin-badge admin-badge-default',
};

const DOT_COLOR: Record<BadgeVariant, string> = {
  approved:  'bg-success',
  pending:   'bg-warning',
  rejected:  'bg-danger',
  admin:     'bg-accent',     /* sand, deepest tone */
  user:      'bg-[#D6B78F]',  /* sand, lightest tone — categorical distinction by lightness */
  moderator: 'bg-[#B89564]',  /* sand, mid tone */
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
