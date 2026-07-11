import { Link } from "react-router-dom";
import { Discussion } from "../types";

interface Props {
  discussion: Discussion;
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DiscussionCard({ discussion }: Props) {
  return (
    <Link
      to={`/forum/${discussion._id}`}
      className="block rounded-card border border-line bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="rounded-full bg-mossLight px-2.5 py-0.5 text-xs font-medium text-moss">
          {discussion.category}
        </span>
        {discussion.hasAcceptedAnswer && (
          <span className="flex items-center gap-1 text-xs font-medium text-moss">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            Accepted answer
          </span>
        )}
      </div>

      <h3 className="mb-1 font-display text-lg font-semibold text-ink">
        {discussion.title}
      </h3>
      <p className="mb-4 line-clamp-2 text-sm text-slate">{discussion.description}</p>

      <div className="flex items-center justify-between text-xs text-slate">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {discussion.replyCount ?? 0} replies
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M5 15l7-7 7 7"
              />
            </svg>
            {discussion.upvoteTotal ?? 0} upvotes
          </span>
        </div>
        <span>{timeAgo(discussion.createdAt)}</span>
      </div>
    </Link>
  );
}
