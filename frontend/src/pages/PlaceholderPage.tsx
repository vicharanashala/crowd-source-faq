interface Props {
  title: string;
  description: string;
}

// Used for the sibling modules (FAQ, Admin Dashboard, Query Resolution,
// Escalation) that are owned by other workstreams in the CSFAQ project.
// Kept minimal on purpose — do not build these out further here.
export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-mossLight text-moss">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate">{description}</p>
      <p className="mt-4 font-mono text-xs uppercase tracking-widest text-clay">
        Coming soon
      </p>
    </div>
  );
}
