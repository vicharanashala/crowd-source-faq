import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { PageShell } from "@/components/layout/PageShell";
import CommentBlock from "@/components/CommentBlock";
import { userById, timeAgo } from "@/lib/mockData";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { ChevronUp, ChevronDown, ShieldCheck, MessageSquare, Eye, Share2, Bookmark, Flag, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function QuestionDetail() {
  const { slug } = useParams();
  const { user } = useAuth();

  const [q, setQ] = useState<any>(null);
  const [qAnswers, setQAnswers] = useState<any[]>([]);
  const [related, setRelated] = useState<any[]>([]);
  const [answerInput, setAnswerInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  // Flag/Report States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<"question" | "answer" | null>(null);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("Spam / promotional");
  const [submittingReport, setSubmittingReport] = useState(false);

  // Fetch question and answers
  const fetchQuestionDetails = async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await api.get(`/questions/${slug}`);
      if (res.data.success && res.data.data.question) {
        const questionData = res.data.data.question;
        setQ(questionData);
        setQAnswers(questionData.answers || []);

        // Fetch related questions based on the first tag of this question
        if (questionData.tags && questionData.tags.length > 0) {
          const relatedRes = await api.get("/questions", {
            params: { tag: questionData.tags[0], limit: 10 }
          });
          if (relatedRes.data.success && relatedRes.data.data.questions) {
            setRelated(
              relatedRes.data.data.questions
                .filter((item: any) => item._id !== questionData._id)
                .slice(0, 4)
            );
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to load question details:", err);
      toast.error(err.response?.data?.error?.message || "Failed to load question details.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchQuestionDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Submit Answer
  const handlePostAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerInput.trim() || !q) return;

    setSubmittingAnswer(true);
    try {
      const res = await api.post("/answers", {
        questionId: q._id || q.id,
        body: answerInput.trim(),
      });
      if (res.data.success) {
        toast.success("Answer posted successfully.");
        setAnswerInput("");
        // Refresh question details to display new answer
        await fetchQuestionDetails();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to post answer. Make sure you are signed in.");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Vote on Answer
  const handleVote = async (answerId: string, type: "up" | "down") => {
    try {
      const res = await api.post(`/answers/${answerId}/vote`, { type });
      if (res.data.success) {
        toast.success(`Voted ${type} successfully.`);
        // Update vote locally
        setQAnswers((current) =>
          current.map((a) => (a._id === answerId ? { ...a, ...res.data.data.answer } : a))
        );
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || `Failed to cast vote.`);
    }
  };

  // Vote on Question
  const handleQuestionVote = async (type: "up" | "down") => {
    if (!q) return;
    try {
      const res = await api.post(`/questions/${q._id || q.id}/vote`, { type });
      if (res.data.success) {
        toast.success(`Voted ${type} successfully.`);
        setQ((current: any) => {
          if (!current) return null;
          return {
            ...current,
            upvoteCount: res.data.data.question.upvoteCount,
            downvoteCount: res.data.data.question.downvoteCount,
          };
        });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || `Failed to cast vote on question.`);
    }
  };

  // Accept Answer
  const handleAccept = async (answerId: string) => {
    try {
      const res = await api.patch(`/answers/${answerId}/accept`);
      if (res.data.success) {
        toast.success("Answer accepted.");
        // Refresh to show accepted status
        await fetchQuestionDetails();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to accept answer.");
    }
  };

  // Follow/Unfollow Question
  const handleFollow = async () => {
    if (!user) {
      toast.error("Please sign in to follow questions.");
      return;
    }
    try {
      const res = await api.post(`/questions/${q._id || q.id}/follow`);
      if (res.data.success) {
        toast.success(res.data.message);
        setQ((current: any) => ({
          ...current,
          isFollowing: res.data.isFollowing,
        }));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to update subscription.");
    }
  };

  // Bookmark/Unbookmark Question
  const handleBookmark = async () => {
    if (!user) {
      toast.error("Please sign in to save questions.");
      return;
    }
    try {
      const res = await api.post(`/questions/${q._id || q.id}/bookmark`);
      if (res.data.success) {
        toast.success(res.data.message);
        setQ((current: any) => ({
          ...current,
          isBookmarked: res.data.isBookmarked,
        }));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to update bookmark.");
    }
  };

  // Submit Content Report
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to submit a report.");
      return;
    }
    if (!reportReason || !reportTargetId || !reportType) return;
    setSubmittingReport(true);
    try {
      const res = await api.post("/reports", {
        target: reportTargetId,
        type: reportType,
        reason: reportReason,
      });
      if (res.data.success) {
        toast.success("Content reported successfully. A moderator will review it.");
        setShowReportModal(false);
        setReportReason("Spam / promotional");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to submit report.");
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="animate-spin text-brand-blue" size={32} />
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-mute">Loading entry details...</p>
        </div>
      </PageShell>
    );
  }

  if (!q) {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-serif text-4xl mb-4 text-brand-ink">Question Not Found</h1>
          <p className="text-brand-body mb-8">This question may have been deleted or the link is incorrect.</p>
          <Link to="/" className="bg-brand-ink text-brand-paper px-6 py-3 text-sm">Back to feed</Link>
        </div>
      </PageShell>
    );
  }

  const qAuthorId = typeof q.author === "object" && q.author !== null ? (q.author._id || q.author.id) : q.author;
  const isQuestionAuthor = user && (user._id === qAuthorId || user.id === qAuthorId || user.role === "admin" || user.role === "moderator");

  const qAuthor = typeof q.author === "object" && q.author !== null
    ? {
      name: q.author.displayName || "Unknown User",
      avatar: q.author.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(q.author.displayName || "U")}`,
      title: q.author.title || q.author.role || "Contributor",
      reputation: q.author.reputationScore || 0,
    }
    : userById(q.author);

  const votesCount = q.upvoteCount !== undefined ? q.upvoteCount : (q.votes || 0);
  const viewsCount = q.views || 0;

  return (
    <PageShell>
      <section className="border-b border-brand-line">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10 md:py-14">
          <div className="flex items-center gap-3 mb-6 text-xs uppercase tracking-widest text-brand-body">
            <Link to="/" className="hover:text-brand-ink">Feed</Link>
            <span className="text-brand-mute">/</span>
            <Link to={`/categories/${q.category || (q.tags && q.tags[0]) || "general"}`} className="hover:text-brand-ink">{q.category || (q.tags && q.tags[0]) || "general"}</Link>
            <span className="text-brand-mute">/</span>
            <span className="text-brand-mute truncate">Question</span>
          </div>

          <div className="flex items-center gap-3 mb-5">
            {q.status === "verified" && (
              <span className="bg-[#E8F0ED] text-brand-forest text-[10px] uppercase tracking-widest px-3 py-1 font-bold flex items-center gap-1.5">
                <ShieldCheck size={11} /> Verified answer
              </span>
            )}
            <span className="label-eyebrow">{q.category || (q.tags && q.tags[0]) || "general"}</span>
          </div>

          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-brand-ink leading-[1.05] tracking-tight max-w-4xl">
            {q.title}
          </h1>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-6 text-sm">
            <div className="flex items-center gap-4">
              <Link to={`/profile/${qAuthorId}`}>
                <img src={qAuthor.avatar} alt={qAuthor.name} className="w-12 h-12 object-cover rounded-full hover:opacity-80 transition-opacity" />
              </Link>
              <div>
                <Link to={`/profile/${qAuthorId}`} className="hover:underline">
                  <p className="text-brand-ink font-medium">{qAuthor.name}</p>
                </Link>
                <p className="label-eyebrow">{qAuthor.title} · Asked {timeAgo(q.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-5 text-brand-body">
              <span className="flex items-center gap-2"><MessageSquare size={14} />{qAnswers.length} answers</span>
              <span className="flex items-center gap-2"><Eye size={14} />{viewsCount.toLocaleString()} views</span>
              <button className="flex items-center gap-2 hover:text-brand-ink" data-testid="share-btn"><Share2 size={14} />Share</button>
              <button
                onClick={handleFollow}
                className={`flex items-center gap-2 transition-colors ${q.isFollowing ? "text-brand-blue font-semibold" : "hover:text-brand-ink"}`}
              >
                <Eye size={14} />
                {q.isFollowing ? "Following" : "Follow"}
              </button>
              <button
                onClick={handleBookmark}
                className={`flex items-center gap-2 transition-colors ${q.isBookmarked ? "text-brand-blue font-semibold" : "hover:text-brand-ink"}`}
                data-testid="bookmark-btn"
              >
                <Bookmark size={14} fill={q.isBookmarked ? "currentColor" : "none"} />
                {q.isBookmarked ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10 grid lg:grid-cols-12 gap-10">
        <article className="lg:col-span-8">
          <div className="flex gap-6">
            <VoteColumn
              count={votesCount}
              testid={`vote-question-${q._id || q.id}`}
              onVote={(type) => handleQuestionVote(type)}
            />
            <div className="flex-1">
              <p className="text-brand-body text-base md:text-lg leading-relaxed mb-6 whitespace-pre-wrap">{q.body}</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {q.tags.map((t: string) => (
                  <Link key={t} to={`/search?q=${t}`} className="text-xs px-3 py-1.5 border border-brand-line text-brand-body uppercase tracking-wider hover:border-brand-ink">#{t}</Link>
                ))}
              </div>
              <div className="flex gap-3 text-xs uppercase tracking-widest text-brand-mute pb-4 border-b border-brand-line">
                <button className="hover:text-brand-ink flex items-center gap-1.5"><Share2 size={12} />Share</button>
                <button
                  onClick={() => {
                    setReportType("question");
                    setReportTargetId(q._id || q.id);
                    setReportReason("Spam / promotional");
                    setShowReportModal(true);
                  }}
                  className="hover:text-brand-ink flex items-center gap-1.5"
                >
                  <Flag size={12} />Report
                </button>
              </div>
              <CommentBlock
                comments={q.comments}
                parentType="Question"
                parentId={q._id || q.id}
                onCommentAdded={fetchQuestionDetails}
              />
            </div>
          </div>

          <div className="mt-12">
            <div className="flex items-end justify-between border-b border-brand-line pb-3 mb-6">
              <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-brand-ink">{qAnswers.length} Answers</h2>
            </div>

            <div className="space-y-10">
              {qAnswers.map((a) => {
                const isAccepted = a.isAccepted !== undefined ? a.isAccepted : a.accepted;
                const answerVotes = a.upvoteCount !== undefined ? a.upvoteCount : (a.votes || 0);
                const isAI = a.aiGenerated || !a.author;
                const u = isAI
                  ? {
                    name: "AI Assistant",
                    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=FAQAssistant",
                    title: "FAQ Bot",
                    reputation: 9999,
                  }
                  : typeof a.author === "object" && a.author !== null
                    ? {
                      name: a.author.displayName || "Unknown User",
                      avatar: a.author.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(a.author.displayName || "U")}`,
                      title: a.author.title || a.author.role || "Contributor",
                      reputation: a.author.reputationScore || 0,
                    }
                    : userById(a.author);

                const aAuthorId = isAI ? null : (typeof a.author === "object" && a.author !== null ? (a.author._id || a.author.id) : a.author);

                return (
                  <div key={a._id || a.id} className={`p-6 md:p-8 ${isAccepted ? 'border-l-4 border-brand-blue bg-[#F4F7FA]' : 'border-l border-brand-line'}`} data-testid={`answer-${a._id || a.id}`}>
                    {isAccepted && (
                      <div className="flex items-center gap-2 mb-4 text-brand-blue text-[10px] uppercase tracking-widest font-bold">
                        <Check size={13} strokeWidth={2.5} /> Accepted answer
                      </div>
                    )}
                    <div className="flex gap-6">
                      <div className="flex flex-col items-center w-12 shrink-0">
                        <button onClick={() => handleVote(a._id, "up")} className="text-brand-mute hover:text-brand-ink p-1"><ChevronUp size={22} strokeWidth={1.5} /></button>
                        <span className="font-sans font-semibold text-2xl text-brand-ink leading-none my-1">{answerVotes}</span>
                        <button onClick={() => handleVote(a._id, "down")} className="text-brand-mute hover:text-brand-vermilion p-1"><ChevronDown size={22} strokeWidth={1.5} /></button>
                      </div>

                      <div className="flex-1">
                        <p className="text-brand-body text-base leading-relaxed whitespace-pre-wrap">{a.body}</p>
                        <div className="flex flex-wrap items-center justify-between mt-6 pt-4 border-t border-brand-line gap-4">
                          <div className="flex items-center gap-3">
                            {isAI ? (
                              <img src={u.avatar} alt="" className="w-9 h-9 object-cover rounded-full" />
                            ) : (
                              <Link to={`/profile/${aAuthorId}`}>
                                <img src={u.avatar} alt="" className="w-9 h-9 object-cover rounded-full hover:opacity-80 transition-opacity" />
                              </Link>
                            )}
                            <div>
                              {isAI ? (
                                <p className="text-sm text-brand-ink font-medium">{u.name}</p>
                              ) : (
                                <Link to={`/profile/${aAuthorId}`} className="hover:underline">
                                  <p className="text-sm text-brand-ink font-medium">{u.name}</p>
                                </Link>
                              )}
                              <p className="text-[10px] uppercase tracking-widest text-brand-mute">
                                {isAI ? "Provisional Answer" : `${u.reputation.toLocaleString()} rep`} · {timeAgo(a.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-brand-mute">
                            {isQuestionAuthor && !isAccepted && (
                              <button onClick={() => handleAccept(a._id)} className="text-[#00684A] font-bold hover:underline">
                                Accept Answer
                              </button>
                            )}
                            <button className="hover:text-brand-ink">Share</button>
                            <button
                              onClick={() => {
                                setReportType("answer");
                                setReportTargetId(a._id || a.id);
                                setReportReason("Spam / promotional");
                                setShowReportModal(true);
                              }}
                              className="hover:text-brand-ink flex items-center gap-1"
                            >
                              <Flag size={11} />Report
                            </button>
                          </div>
                        </div>
                        <CommentBlock
                          comments={a.comments}
                          parentType="Answer"
                          parentId={a._id || a.id}
                          onCommentAdded={fetchQuestionDetails}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handlePostAnswer} className="mt-12 border-t border-brand-line pt-8">
              <h3 className="font-serif text-2xl text-brand-ink mb-4">Your answer</h3>
              <textarea rows={5} value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} required disabled={submittingAnswer} placeholder="Write a clear, sourced answer. Avoid pleasantries. Get to the point." className="w-full border border-brand-line bg-white p-4 text-base outline-none focus:border-brand-ink resize-y" data-testid="answer-input" />
              <div className="flex justify-end mt-4">
                <button type="submit" disabled={submittingAnswer || !answerInput.trim()} className="bg-brand-ink text-brand-paper px-6 py-3 text-sm tracking-wide hover:bg-brand-blue disabled:opacity-50" data-testid="post-answer-btn">
                  {submittingAnswer ? "Posting..." : "Post your answer"}
                </button>
              </div>
            </form>
          </div>
        </article>

        <aside className="lg:col-span-4 space-y-6">
          {related.length > 0 && (
            <div className="border border-brand-line bg-white p-6">
              <p className="label-eyebrow mb-4">Related questions</p>
              <ul className="divide-y divide-brand-line">
                {related.map((r) => {
                  const relatedSlug = r.slug || r._id;
                  const relatedVotes = r.upvoteCount !== undefined ? r.upvoteCount : (r.votes || 0);
                  const relatedAnswers = r.answerCount !== undefined ? r.answerCount : (r.answers || 0);

                  return (
                    <li key={r._id || r.id}>
                      <Link to={`/q/${relatedSlug}`} className="block py-4 group" data-testid={`related-${r._id || r.id}`}>
                        <p className="font-serif text-lg text-brand-ink leading-snug group-hover:text-brand-blue mb-1">{r.title}</p>
                        <p className="text-[10px] uppercase tracking-widest text-brand-mute">{relatedAnswers} answers · {relatedVotes} votes</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="border border-brand-line bg-white p-6">
            <p className="label-eyebrow mb-4">About the asker</p>
            <div className="flex items-center gap-3 mb-3">
              <Link to={`/profile/${qAuthorId}`}>
                <img src={qAuthor.avatar} alt="" className="w-12 h-12 object-cover rounded-full hover:opacity-80 transition-opacity" />
              </Link>
              <div>
                <Link to={`/profile/${qAuthorId}`} className="hover:underline">
                  <p className="text-brand-ink">{qAuthor.name}</p>
                </Link>
                <p className="text-xs text-brand-mute">{qAuthor.title}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-brand-line border border-brand-line">
              <div className="bg-white px-3 py-3"><p className="font-sans font-semibold text-2xl">{qAuthor.reputation.toLocaleString()}</p><p className="label-eyebrow text-[9px]">Reputation</p></div>
              <div className="bg-white px-3 py-3"><p className="font-sans font-semibold text-2xl">{q.createdAt ? new Date(q.createdAt).getFullYear() : '2026'}</p><p className="label-eyebrow text-[9px]">Asked Year</p></div>
            </div>
          </div>
        </aside>
      </section>

      {/* Flag/Report Content Modal Overlay */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-brand-line w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-serif text-2xl text-brand-ink mb-4">Report Content</h3>
            <form onSubmit={handleReportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-brand-mute mb-2 font-bold">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full border border-brand-line p-2.5 text-sm bg-[#FAF9F7] outline-none focus:border-brand-ink"
                >
                  <option value="Spam / promotional">Spam / promotional</option>
                  <option value="Misinformation">Misinformation</option>
                  <option value="Duplicate">Duplicate</option>
                  <option value="Off-topic">Off-topic</option>
                  <option value="Low quality">Low quality</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="border border-brand-line px-4 py-2 text-xs uppercase tracking-wider hover:bg-[#FAF9F7] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="bg-brand-ink text-brand-paper hover:bg-brand-blue px-4 py-2 text-xs uppercase tracking-wider disabled:opacity-50 font-bold flex items-center justify-center min-w-[120px]"
                >
                  {submittingReport ? <Loader2 className="animate-spin w-4 h-4" /> : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}

const VoteColumn = ({ count, testid, onVote }: { count: number; testid: string; onVote: (type: "up" | "down") => void }) => (
  <div className="flex flex-col items-center w-12 shrink-0" data-testid={testid}>
    <button onClick={() => onVote("up")} className="text-brand-mute hover:text-brand-ink p-1"><ChevronUp size={22} strokeWidth={1.5} /></button>
    <span className="font-sans font-semibold text-3xl text-brand-ink leading-none my-1">{count}</span>
    <button onClick={() => onVote("down")} className="text-brand-mute hover:text-brand-vermilion p-1"><ChevronDown size={22} strokeWidth={1.5} /></button>
  </div>
);
