interface Props {
  onClick: () => void;
}

export default function NewDiscussionButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-full bg-clay px-5 py-2.5 text-sm font-semibold text-parchment shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      New Discussion
    </button>
  );
}
