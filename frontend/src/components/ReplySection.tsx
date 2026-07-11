import { FormEvent, useState } from "react";
import { Reply } from "../types";
import UpvoteButton from "./UpvoteButton";
import AcceptedAnswerBadge from "./AcceptedAnswerBadge";
import AdminApprovalControls from "./AdminApprovalControls";

interface Props {
  replies: Reply[];
  currentUserId: string;
  isDiscussionAuthor: boolean;
  isAdmin: boolean;
  onAddReply: (content: string) => Promise<void>;
  onUpvote: (replyId: string) => Promise<void>;
  onAccept: (replyId: string) => Promise<void>;
  onApprove: (replyId: string) => Promise<void>;
}

export default function ReplySection({
  replies,
  currentUserId,
  isDiscussionAuthor,
  isAdmin,
  onAddReply,
  onUpvote,
  onAccept,
  onApprove,
}: Props) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accepted answer appears at the top of the reply section; the rest
  // remain in chronological order.
  const sorted = [...replies].sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError("Reply cannot be empty");
      return;
    }
    try {
      setSubmitting(true);
      await onAddReply(content.trim());
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post reply");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">
        {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
      </h2>

      <div className="space-y-4">
        {sorted.map((reply) => (
          <div
            key={reply._id}
            className={`rounded-card border p-4 ${
              reply.accepted ? "border-moss bg-mossLight/40" : "border-line bg-white"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {reply.accepted && <AcceptedAnswerBadge />}
              {isAdmin && (
                <AdminApprovalControls
                  approved={reply.approved}
                  onApprove={() => onApprove(reply._id)}
                />
              )}
              {reply.approved && !isAdmin && (
                <span className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
                  Admin approved
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap text-sm text-ink">{reply.content}</p>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate">
                {new Date(reply.createdAt).toLocaleString()}
              </span>

              <div className="flex items-center gap-2">
                {isDiscussionAuthor && !reply.accepted && (
                  <button
                    onClick={() => onAccept(reply._id)}
                    className="rounded-full border border-moss px-3 py-1 text-xs font-medium text-moss hover:bg-moss hover:text-parchment"
                  >
                    Mark as accepted
                  </button>
                )}
                <UpvoteButton
                  count={reply.upvoteCount}
                  disabled={reply.upvotedBy.includes(currentUserId)}
                  onUpvote={() => onUpvote(reply._id)}
                />
              </div>
            </div>
          </div>
        ))}

        {replies.length === 0 && (
          <p className="rounded-card border border-dashed border-line bg-white/50 p-6 text-center text-sm text-slate">
            No replies yet. Be the first to help.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <label className="mb-1 block text-sm font-medium text-ink">Add a reply</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Share what worked for you…"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
        />
        {error && <p className="mt-1 text-xs text-clay">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-parchment hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post reply"}
          </button>
        </div>
      </form>
    </div>
  );
}
