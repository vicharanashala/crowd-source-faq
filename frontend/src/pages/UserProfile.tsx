import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { QuestionCard } from "@/components/QuestionCard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Award, MapPin, Calendar, Edit3, Mail, Loader2 } from "lucide-react";
import { timeAgo } from "@/lib/mockData";

export default function UserProfile() {
  const { handle } = useParams();
  const { user: currentUser } = useAuth();
  const [u, setU] = useState<any>(null);
  const [userQuestions, setUserQuestions] = useState<any[]>([]);
  const [userAnswers, setUserAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("questions");

  useEffect(() => {
    const fetchProfileData = async () => {
      setLoading(true);
      try {
        // Query route param if it's a valid MongoDB ObjectId, else default to current user ID
        const targetId = handle && handle.match(/^[0-9a-fA-F]{24}$/)
          ? handle
          : (currentUser ? currentUser._id : null);

        if (!targetId) {
          setU(null);
          setLoading(false);
          return;
        }

        const [profileRes, questionsRes, answersRes] = await Promise.all([
          api.get(`/users/${targetId}`),
          api.get(`/users/${targetId}/questions`),
          api.get(`/users/${targetId}/answers`),
        ]);

        if (profileRes.data.success) {
          const profile = profileRes.data.data.user;
          // Map MongoDB schema to frontend naming conventions
          profile.name = profile.displayName;
          profile.reputation = profile.reputationScore || 0;
          profile.joined = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : "2026";
          setU(profile);
        }

        if (questionsRes.data.success) {
          setUserQuestions(questionsRes.data.data.questions || []);
        }

        if (answersRes.data.success) {
          setUserAnswers(answersRes.data.data.answers || []);
        }
      } catch (err) {
        console.error("Failed to load profile data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [handle, currentUser]);

  const tabs = [
    { k: "questions", label: `Questions (${userQuestions.length})` },
    { k: "answers", label: `Answers (${userAnswers.length})` },
    { k: "activity", label: "Activity" },
    { k: "badges", label: "Badges" },
  ];

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="animate-spin text-brand-blue" size={32} />
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-mute">Loading profile...</p>
        </div>
      </PageShell>
    );
  }

  if (!u) {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-serif text-4xl mb-4 text-brand-ink">Profile Not Found</h1>
          <p className="text-brand-body mb-8">Please log in to view your profile, or verify the URL.</p>
          <Link to="/login" className="bg-brand-ink text-brand-paper px-6 py-3 text-sm">Sign in</Link>
        </div>
      </PageShell>
    );
  }

  const userAvatar = u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name || "U")}`;

  return (
    <PageShell>
      <section className="border-b border-brand-line bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10 md:py-14">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-8">
            <img src={userAvatar} alt={u.name} className="w-32 h-32 object-cover rounded-full border border-brand-line shadow-sm" data-testid="profile-avatar" />
            <div className="flex-1">
              <p className="label-eyebrow mb-2">{u.title || u.role || "Contributor"}</p>
              <h1 className="font-serif text-5xl md:text-6xl text-brand-ink leading-none tracking-tight">{u.name}</h1>
              <div className="flex flex-wrap items-center gap-5 mt-5 text-sm text-brand-body">
                <span className="flex items-center gap-2"><Mail size={13} /> {u.handle || "user"}@crowdsource.faq</span>
                <span className="flex items-center gap-2"><Calendar size={13} /> Joined {u.joined}</span>
                <span className="flex items-center gap-2"><MapPin size={13} /> Remote / Lisbon</span>
              </div>
            </div>
            {currentUser && currentUser._id === u._id && (
              <div className="flex items-center gap-3">
                <button className="border border-brand-line px-5 py-3 text-sm hover:border-brand-ink flex items-center gap-2" data-testid="profile-edit-btn">
                  <Edit3 size={13} /> Edit profile
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-brand-line border-y border-brand-line mt-10">
            {[
              { k: "Reputation", v: u.reputation.toLocaleString() },
              { k: "Questions", v: userQuestions.length },
              { k: "Answers", v: userAnswers.length },
              { k: "Streak", v: u.streak || 0 },
            ].map((s) => (
              <div key={s.k} className="bg-white px-6 py-5">
                <p className="font-sans font-semibold text-3xl md:text-4xl text-brand-ink">{s.v}</p>
                <p className="label-eyebrow mt-2">{s.k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10">
        <div className="flex gap-1 border-b border-brand-line mb-8" data-testid="profile-tabs">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-4 py-3 text-sm tracking-wide border-b-2 -mb-px transition-colors ${tab === t.k ? 'border-brand-ink text-brand-ink font-medium' : 'border-transparent text-brand-body hover:text-brand-ink'}`}
              data-testid={`profile-tab-${t.k}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "questions" && (
          <div className="border border-brand-line">
            {userQuestions.map((q) => <QuestionCard key={q._id || q.id} q={q} />)}
            {userQuestions.length === 0 && (
              <div className="p-8 text-center text-brand-mute bg-white">No questions published yet.</div>
            )}
          </div>
        )}

        {tab === "answers" && (
          <div className="border border-brand-line bg-white divide-y divide-brand-line">
            {userAnswers.map((a) => {
              const isAccepted = a.isAccepted !== undefined ? a.isAccepted : a.accepted;
              const votes = a.upvoteCount !== undefined ? a.upvoteCount : (a.votes || 0);
              const excerpt = a.body ? (a.body.length > 180 ? a.body.slice(0, 180) + "..." : a.body) : "";
              const questionTitle = a.question ? a.question.title : "Discussion";
              const questionLink = a.question ? `/q/${a.question._id || a.question.id || a.question.slug}` : "#";

              return (
                <div key={a._id || a.id} className="p-6 md:p-8" data-testid={`profile-answer-${a._id || a.id}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {isAccepted && <span className="bg-[#E8F0ED] text-brand-forest text-[10px] uppercase tracking-widest px-2 py-0.5 font-bold">Accepted</span>}
                    <span className="label-eyebrow">{votes} votes · {timeAgo(a.createdAt)}</span>
                  </div>
                  <Link to={questionLink}>
                    <h3 className="font-serif text-2xl text-brand-ink hover:text-brand-blue mb-2 leading-tight">{questionTitle}</h3>
                  </Link>
                  <p className="text-brand-body text-sm whitespace-pre-wrap">{excerpt}</p>
                </div>
              );
            })}
            {userAnswers.length === 0 && (
              <div className="p-8 text-center text-brand-mute">No answers contributed yet.</div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-4">
            {userQuestions.slice(0, 2).map((q, i) => (
              <div key={`act-q-${i}`} className="border border-brand-line bg-white p-5 flex items-center justify-between" data-testid={`activity-q-${i}`}>
                <div>
                  <p className="label-eyebrow">Asked</p>
                  <Link to={`/q/${q.slug || q._id}`}>
                    <p className="text-brand-ink text-base mt-1 hover:text-brand-blue">{q.title}</p>
                  </Link>
                </div>
                <span className="text-xs text-brand-mute">{timeAgo(q.createdAt)}</span>
              </div>
            ))}
            {userAnswers.slice(0, 2).map((ans, i) => (
              <div key={`act-a-${i}`} className="border border-brand-line bg-white p-5 flex items-center justify-between" data-testid={`activity-a-${i}`}>
                <div>
                  <p className="label-eyebrow">Answered</p>
                  <Link to={ans.question ? `/q/${ans.question._id || ans.question.slug}` : "#"}>
                    <p className="text-brand-ink text-base mt-1 hover:text-brand-blue">{ans.question ? ans.question.title : "Discussion"}</p>
                  </Link>
                </div>
                <span className="text-xs text-brand-mute">{timeAgo(ans.createdAt)}</span>
              </div>
            ))}
            {userQuestions.length === 0 && userAnswers.length === 0 && (
              <div className="p-8 text-center text-brand-mute bg-white">No recent activity.</div>
            )}
          </div>
        )}

        {tab === "badges" && (
          u.badges && u.badges.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {u.badges.map((badgeName: string) => {
                const badgesMeta: Record<string, { desc: string, tier: string }> = {
                  "Curator": { desc: "Edited 25+ questions for clarity", tier: "Gold" },
                  "Trusted Source": { desc: "10+ accepted answers in Engineering", tier: "Gold" },
                  "Early Adopter": { desc: "Joined in the first 1,000 members", tier: "Silver" },
                  "Mentor": { desc: "Answered 50+ questions", tier: "Silver" },
                  "Sleuth": { desc: "Resolved 5 reported issues", tier: "Bronze" },
                  "Storyteller": { desc: "Wrote an answer over 500 words", tier: "Bronze" },
                  "verified": { desc: "Verified system account badge", tier: "Gold" },
                  "founder": { desc: "Founder of CrowdFAQ knowledge base", tier: "Gold" },
                };
                const b = badgesMeta[badgeName] || { desc: "Awarded for contributions to CrowdFAQ", tier: "Bronze" };

                return (
                  <div key={badgeName} className="border border-brand-line bg-white p-6" data-testid={`badge-${badgeName.toLowerCase()}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <Award size={20} className={b.tier === 'Gold' ? 'text-brand-gold' : b.tier === 'Silver' ? 'text-brand-mute' : 'text-[#8B6E4E]'} />
                      <p className="label-eyebrow">{b.tier}</p>
                    </div>
                    <p className="font-serif text-2xl text-brand-ink leading-tight mb-1">{badgeName}</p>
                    <p className="text-sm text-brand-body">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-brand-mute bg-white border border-brand-line">
              No badges earned yet.
            </div>
          )
        )}
      </section>
    </PageShell>
  );
}
