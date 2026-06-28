import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { timeAgo } from "@/lib/mockData";

interface CommentBlockProps {
  comments: any[];
  parentType: "Question" | "Answer";
  parentId: string;
  onCommentAdded: () => void;
}

export default function CommentBlock({
  comments = [],
  parentType,
  parentId,
  onCommentAdded,
}: CommentBlockProps) {
  const { user } = useAuth();
  const [commentInput, setCommentInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || !user) return;

    setSubmitting(true);
    try {
      const endpoint = parentType === "Question"
        ? `/questions/${parentId}/comments`
        : `/answers/${parentId}/comments`;

      const res = await api.post(endpoint, {
        body: commentInput.trim(),
        parentType,
      });

      if (res.data.success) {
        toast.success("Comment added successfully.");
        setCommentInput("");
        onCommentAdded();
        setIsExpanded(true); // Automatically expand the comment section when adding a new comment
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to add comment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-brand-line pl-6">
      {/* Toggle Button for comments if there are any */}
      {comments.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-blue hover:text-brand-ink transition-colors"
          >
            <MessageSquare size={13} />
            {isExpanded ? "Hide Comments" : `Show Comments (${comments.length})`}
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      {/* Expanded Comments List */}
      {isExpanded && comments.length > 0 && (
        <div className="space-y-3 mb-4 pl-4 border-l border-brand-line">
          {comments.map((comment: any) => {
            const author = comment.author || {
              displayName: "Unknown User",
              avatar: `https://api.dicebear.com/7.x/initials/svg?seed=U`,
              role: "student",
            };

            return (
              <div
                key={comment._id || comment.id}
                className="text-xs border-b border-[#EBEAE5] pb-2 last:border-b-0"
              >
                <p className="text-brand-body leading-relaxed mb-1">{comment.body}</p>
                <div className="flex items-center gap-2 text-[9px] text-brand-mute uppercase tracking-widest font-semibold">
                  <span className="text-brand-ink">{author.displayName}</span>
                  <span>·</span>
                  <span>{timeAgo(comment.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Write Comment Form */}
      {user ? (
        <form onSubmit={handleSubmit} className="flex gap-2 items-start mt-2">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Add a comment..."
            disabled={submitting}
            className="flex-1 text-xs border border-brand-line bg-[#FAF9F7] px-3 py-2 outline-none focus:border-brand-ink focus:bg-white placeholder-brand-mute/80 transition-all"
          />
          <button
            type="submit"
            disabled={submitting || !commentInput.trim()}
            className="bg-brand-ink text-brand-paper hover:bg-brand-blue text-[10px] px-3 py-2 disabled:opacity-50 transition-colors font-medium flex items-center justify-center min-w-[60px]"
          >
            {submitting ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : "Post"}
          </button>
        </form>
      ) : (
        <p className="text-[10px] text-brand-mute italic mt-1">
          Please sign in to add comments.
        </p>
      )}
    </div>
  );
}
