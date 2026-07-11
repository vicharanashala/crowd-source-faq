import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { discussionApi } from "../api/discussionApi";
import { DiscussionDetail } from "../types";
import ReplySection from "../components/ReplySection";
import { useCurrentUser } from "../hooks/useCurrentUser";

export default function DiscussionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [discussion, setDiscussion] = useState<DiscussionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const userId = useCurrentUser();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await discussionApi.getById(id);
      setDiscussion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load discussion");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate">Loading…</div>;
  }

  if (error || !discussion) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="rounded-card border border-clay/30 bg-clay/5 p-6 text-sm text-clay">
          {error || "Discussion not found"}
        </p>
        <Link to="/forum" className="mt-4 inline-block text-sm text-moss underline">
          Back to Discussion Forum
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to="/forum" className="mb-6 inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Discussion Forum
      </Link>

      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-mossLight px-2.5 py-0.5 text-xs font-medium text-moss">
          {discussion.category}
        </span>
        <label className="flex items-center gap-2 text-xs text-slate">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="accent-moss"
          />
          View as admin
        </label>
      </div>

      <h1 className="mb-2 font-display text-2xl font-semibold text-ink">{discussion.title}</h1>

      <div className="mb-4 flex items-center gap-3 text-xs text-slate">
        <span>Posted by {discussion.authorId}</span>
        <span>·</span>
        <span>{new Date(discussion.createdAt).toLocaleString()}</span>
      </div>

      <p className="whitespace-pre-wrap rounded-card border border-line bg-white p-5 text-sm text-ink">
        {discussion.description}
      </p>

      {discussion.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {discussion.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-slate"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <ReplySection
        replies={discussion.replies}
        currentUserId={userId}
        isDiscussionAuthor={discussion.authorId === userId}
        isAdmin={isAdmin}
        onAddReply={async (content) => {
          await discussionApi.addReply(discussion._id, content, userId);
          await load();
        }}
        onUpvote={async (replyId) => {
          await discussionApi.upvoteReply(replyId, userId);
          await load();
        }}
        onAccept={async (replyId) => {
          await discussionApi.acceptReply(replyId, userId);
          await load();
        }}
        onApprove={async (replyId) => {
          await discussionApi.approveReply(replyId);
          await load();
        }}
      />
    </div>
  );
}
