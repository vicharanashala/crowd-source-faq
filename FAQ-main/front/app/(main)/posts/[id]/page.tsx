"use client";
import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { postsApi, answersApi, aiApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatTimeAgo } from "@/lib/utils";
import Link from "next/link";

interface Comment {
  id: string; authorName: string; authorTitle: string; content: string;
  timestamp: string; likes: number; likedBy: string[];
  replies: Comment[];
}
interface Answer {
  _id: string; content: string; isAI?: boolean; isAccepted?: boolean;
  upvotes: number; author?: { name: string; email: string }; createdAt: string;
}
interface Post {
  _id: string; id: string; title: string; intro: string; description: string;
  category: string; author: { id: string; name: string; title: string; avatar: string };
  timestamp: string; upvotes: number; commentsCount: number; views: string;
  comments: Comment[]; voted?: "up" | "down" | null; bookmarked?: boolean; createdAt?: string;
}

const s = {
  card: { background: "#fff", border: "1px solid rgba(74,144,196,0.15)", borderRadius: 14, padding: "28px 32px", marginBottom: 20 } as React.CSSProperties,
  chip: { fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 20, background: "rgba(74,144,196,0.1)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.2)" } as React.CSSProperties,
  btn: { fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 700, padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 } as React.CSSProperties,
  input: { width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "rgba(74,144,196,0.05)", border: "1px solid rgba(74,144,196,0.2)", color: "var(--ink)", outline: "none", resize: "none" as const },
};

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"comments" | "answers">("comments");
  const [commentText, setCommentText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [aiAnswer, setAiAnswer] = useState<{ answer: string; source: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<{ commentId: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ["post", id],
    queryFn: () => postsApi.getById(id).then((r) => r.data),
  });
  const { data: answers = [] } = useQuery<Answer[]>({
    queryKey: ["answers", id],
    queryFn: () => answersApi.getByPost(id).then((r) => r.data),
    enabled: tab === "answers",
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["post", id] });

  const voteMut = useMutation({ mutationFn: (dir: "up" | "down" | null) => postsApi.vote(id, dir), onSuccess: inv });
  const bmMut = useMutation({ mutationFn: () => postsApi.bookmark(id), onSuccess: (r) => { toast.success(r.data.bookmarked ? "Bookmarked!" : "Removed"); inv(); } });
  const delMut = useMutation({ mutationFn: () => postsApi.delete(id), onSuccess: () => { toast.success("Deleted"); router.push("/posts"); } });
  const commentMut = useMutation({ mutationFn: () => postsApi.addComment(id, commentText), onSuccess: () => { setCommentText(""); inv(); } });
  const replyMut = useMutation({ mutationFn: () => postsApi.addReply(id, replyTo!.commentId, replyText), onSuccess: () => { setReplyText(""); setReplyTo(null); inv(); } });
  const answerMut = useMutation({ mutationFn: () => answersApi.create(id, answerText), onSuccess: () => { setAnswerText(""); qc.invalidateQueries({ queryKey: ["answers", id] }); } });
  const likeMut = useMutation({ mutationFn: (cid: string) => postsApi.likeComment(id, cid), onSuccess: inv });
  const upvoteAnsMut = useMutation({ mutationFn: (aid: string) => answersApi.upvote(aid), onSuccess: () => qc.invalidateQueries({ queryKey: ["answers", id] }) });
  const acceptMut = useMutation({ mutationFn: (aid: string) => answersApi.accept(aid), onSuccess: () => qc.invalidateQueries({ queryKey: ["answers", id] }) });

  const handleAskAI = async () => {
    if (!post) return;
    setAiLoading(true);
    try {
      const res = await aiApi.ask(post.title);
      setAiAnswer({ answer: res.data.answer, source: res.data.source });
    } catch { toast.error("AI unavailable"); }
    finally { setAiLoading(false); }
  };

  if (isLoading) return <div className="empty-state" style={{ paddingTop: 120 }}><div className="empty-text">Loading…</div></div>;
  if (!post) return <div className="empty-state" style={{ paddingTop: 120 }}><div className="empty-text">Post not found. <Link href="/posts" style={{ color: "var(--sky)" }}>← Back</Link></div></div>;

  const isAuthor = user && (post.author?.id === user.id || post.author?.id === user._id);
  const catLabel = post.category?.charAt(0).toUpperCase() + post.category?.slice(1).toLowerCase();

  return (
    <>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "100px 24px 80px", position: "relative", zIndex: 2 }}>
        <Link href="/posts" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>
          ← BACK TO POSTS
        </Link>

        {/* Main card */}
        <div style={s.card}>
          <span style={s.chip}>{catLabel}</span>

          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,40px)", fontWeight: 600, lineHeight: 1.2, color: "var(--ink)", margin: "14px 0 12px" }}>
            {post.title}
          </h1>

          {post.intro && (
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, lineHeight: 1.75, color: "var(--ink-soft)", marginBottom: 20 }}>
              {post.intro}
            </p>
          )}

          {/* Author + meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 20, borderBottom: "1px solid rgba(74,144,196,0.1)", flexWrap: "wrap" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--sky)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {post.author?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink-mid)" }}>{post.author?.name}</p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--muted)" }}>{post.author?.title}</p>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em" }}>
              <span>◷ {post.views}</span>
              <span>{post.createdAt ? formatTimeAgo(post.createdAt) : post.timestamp}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, paddingTop: 18, flexWrap: "wrap" }}>
            {/* Vote */}
            <div style={{ display: "flex", border: "1px solid rgba(74,144,196,0.2)", borderRadius: 9, overflow: "hidden" }}>
              <button onClick={() => user ? voteMut.mutate(post.voted === "up" ? null : "up") : toast.error("Login to vote")}
                style={{ ...s.btn, background: post.voted === "up" ? "rgba(74,144,196,0.1)" : "transparent", color: post.voted === "up" ? "var(--sky)" : "var(--ink-soft)", borderRadius: 0 }}>
                ▲ {post.upvotes}
              </button>
              <button onClick={() => user ? voteMut.mutate(post.voted === "down" ? null : "down") : toast.error("Login to vote")}
                style={{ ...s.btn, background: post.voted === "down" ? "rgba(212,95,74,0.1)" : "transparent", color: post.voted === "down" ? "var(--coral)" : "var(--ink-soft)", borderRadius: 0 }}>
                ▼
              </button>
            </div>

            <button onClick={() => user ? bmMut.mutate() : toast.error("Login to bookmark")}
              style={{ ...s.btn, background: post.bookmarked ? "rgba(200,146,42,0.1)" : "transparent", color: post.bookmarked ? "var(--gold)" : "var(--ink-soft)", border: "1px solid rgba(74,144,196,0.2)" }}>
              {post.bookmarked ? "♥ Saved" : "♡ Save"}
            </button>

            <button onClick={handleAskAI} disabled={aiLoading}
              style={{ ...s.btn, background: "rgba(74,144,196,0.08)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.25)" }}>
              ✦ {aiLoading ? "Asking AI…" : "Ask AI"}
            </button>

            {(isAuthor || user?.role === "admin") && (
              <button onClick={() => confirm("Delete this post?") && delMut.mutate()}
                style={{ ...s.btn, background: "rgba(212,95,74,0.08)", color: "var(--coral)", border: "1px solid rgba(212,95,74,0.2)", marginLeft: "auto" }}>
                ✕ Delete
              </button>
            )}
          </div>

          {/* AI Answer */}
          {aiAnswer && (
            <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 10, background: "rgba(74,144,196,0.06)", border: "1px solid rgba(74,144,196,0.2)" }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--sky)", marginBottom: 8 }}>
                ✦ AI ANSWER — {aiAnswer.source.toUpperCase()}
              </p>
              <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, lineHeight: 1.75, color: "var(--ink-soft)" }}>
                {aiAnswer.answer}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["comments", "answers"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...s.btn, background: tab === t ? "var(--sky)" : "transparent", color: tab === t ? "#fff" : "var(--ink-soft)", border: "1px solid " + (tab === t ? "var(--sky)" : "rgba(74,144,196,0.2)"), textTransform: "capitalize" }}>
              {t === "comments" ? `Comments (${post.commentsCount})` : `Answers (${answers.length})`}
            </button>
          ))}
        </div>

        {/* Comments tab */}
        {tab === "comments" && (
          <div id="comments">
            {user && (
              <div style={s.card}>
                <textarea rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…" style={{ ...s.input, marginBottom: 12, display: "block" }} />
                <button onClick={() => commentText.trim() && commentMut.mutate()} disabled={!commentText.trim() || commentMut.isPending}
                  className="apply-btn" style={{ fontSize: 12 }}>
                  {commentMut.isPending ? "Posting…" : "Comment →"}
                </button>
              </div>
            )}

            {post.comments?.length === 0 && (
              <div className="empty-state" style={{ padding: "40px 0" }}>
                <div className="empty-text">No comments yet. Be the first!</div>
              </div>
            )}

            {post.comments?.map((comment) => (
              <div key={comment.id} style={{ ...s.card, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--sky)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {comment.authorName[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink-mid)" }}>{comment.authorName}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)" }}>{comment.timestamp}</span>
                    </div>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, lineHeight: 1.65, color: "var(--ink)", marginBottom: 10 }}>{comment.content}</p>
                    <div style={{ display: "flex", gap: 14 }}>
                      <button onClick={() => likeMut.mutate(comment.id)}
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
                        ♥ {comment.likes}
                      </button>
                      <button onClick={() => setReplyTo({ commentId: comment.id })}
                        style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--sky)", background: "none", border: "none", cursor: "pointer" }}>
                        Reply
                      </button>
                    </div>

                    {/* Reply box */}
                    {replyTo?.commentId === comment.id && (
                      <div style={{ marginTop: 10 }}>
                        <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a reply…" style={{ ...s.input, marginBottom: 8 }}
                          onKeyDown={(e) => e.key === "Enter" && replyText.trim() && replyMut.mutate()} />
                        <button onClick={() => replyText.trim() && replyMut.mutate()} disabled={replyMut.isPending}
                          className="apply-btn" style={{ fontSize: 11 }}>
                          {replyMut.isPending ? "…" : "Reply →"}
                        </button>
                      </div>
                    )}

                    {/* Replies */}
                    {comment.replies?.map((reply) => (
                      <div key={reply.id} style={{ marginTop: 10, paddingLeft: 16, borderLeft: "2px solid rgba(74,144,196,0.15)" }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--ink-mid)" }}>{reply.authorName}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)" }}>{reply.timestamp}</span>
                        </div>
                        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink)", lineHeight: 1.6 }}>{reply.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Answers tab */}
        {tab === "answers" && (
          <div>
            {user && (
              <div style={s.card}>
                <textarea rows={4} value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Write a detailed answer…" style={{ ...s.input, marginBottom: 12, display: "block" }} />
                <button onClick={() => answerText.trim() && answerMut.mutate()} disabled={!answerText.trim() || answerMut.isPending}
                  className="apply-btn" style={{ fontSize: 12 }}>
                  {answerMut.isPending ? "Posting…" : "Post Answer →"}
                </button>
              </div>
            )}

            {answers.length === 0 && (
              <div className="empty-state" style={{ padding: "40px 0" }}>
                <div className="empty-text">No answers yet.</div>
              </div>
            )}

            {answers.map((ans) => (
              <div key={ans._id} style={{ ...s.card, border: ans.isAccepted ? "1px solid rgba(90,184,122,0.35)" : s.card.border, background: ans.isAccepted ? "rgba(90,184,122,0.04)" : "#fff", marginBottom: 12 }}>
                {ans.isAccepted && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#5ab87a", display: "inline-block", marginBottom: 10, background: "rgba(90,184,122,0.12)", padding: "3px 8px", borderRadius: 20 }}>
                    ✓ ACCEPTED ANSWER
                  </span>
                )}
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, lineHeight: 1.75, color: "var(--ink-soft)", marginBottom: 14 }}>{ans.content}</p>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)" }}>
                    {typeof ans.author === "object" ? ans.author?.name : "Anonymous"} · {formatTimeAgo(ans.createdAt)}
                  </span>
                  <button onClick={() => upvoteAnsMut.mutate(ans._id)}
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", background: "none", border: "none", cursor: "pointer" }}>
                    ▲ {ans.upvotes}
                  </button>
                  {user?.role === "admin" && !ans.isAccepted && (
                    <button onClick={() => acceptMut.mutate(ans._id)}
                      style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "#5ab87a", background: "rgba(90,184,122,0.1)", border: "1px solid rgba(90,184,122,0.3)", borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>
                      ✓ Accept
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
