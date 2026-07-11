interface Props {
  approved: boolean;
  onApprove: () => void;
}

// Shown to admins on each reply. Reject/flag actions live on the Admin
// Dashboard module (placeholder); this control covers the one action
// PRODUCT.md scopes to the forum itself: approving a reply in place.
export default function AdminApprovalControls({ approved, onApprove }: Props) {
  if (approved) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
        Admin approved
      </span>
    );
  }

  return (
    <button
      onClick={onApprove}
      className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-slate hover:border-gold hover:text-gold"
    >
      Approve (admin)
    </button>
  );
}
