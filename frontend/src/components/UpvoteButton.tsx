interface Props {
  count: number;
  disabled?: boolean;
  onUpvote: () => void;
}

export default function UpvoteButton({ count, disabled, onUpvote }: Props) {
  return (
    <button
      onClick={onUpvote}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-slate transition-colors hover:border-moss hover:text-moss disabled:cursor-not-allowed disabled:opacity-50"
      title={disabled ? "You already upvoted this reply" : "Upvote this reply"}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
      <span className="text-xs font-semibold">{count}</span>
    </button>
  );
}
