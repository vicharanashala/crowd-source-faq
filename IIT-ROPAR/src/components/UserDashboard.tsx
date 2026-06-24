import { fetchWithAuth } from "../utils/api.js";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FolderDown, FileText, CheckCircle, Clock, AlertTriangle, Play, Flame, 
  HelpCircle, ArrowRight, Award, Plus, Sparkles, Upload, FileCheck, Shield, Bookmark, 
  Zap, Star, User, Settings, CheckCircle2, AlertCircle, RefreshCw, Send, ThumbsUp, X
} from "lucide-react";
import { FAQItem } from "../types.js";

interface UserDashboardProps {
  onNavigateTab: (tab: string) => void;
  onSearchTerm: (term: string) => void;
  faqs: FAQItem[];
  bookmarkedIds: string[];
  faqHistory: string[];
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

export default function UserDashboard({ 
  onNavigateTab, 
  onSearchTerm, 
  faqs: initialFaqs, 
  bookmarkedIds, 
  faqHistory,
  currentUser,
  setCurrentUser
}: UserDashboardProps) {
  
  const [subTab, setSubTab] = useState<"overview" | "raise" | "issues" | "faqHub" | "community" | "profile">("overview");

  // Dynamic States loaded via Full Stack APIs
  const [tickets, setTickets] = useState<any[]>([]);
  const [communityAnswers, setCommunityAnswers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsList, setLogsList] = useState([
    { week: 1, topic: "Cloud Deployment Systems", grade: "A+", status: "Reviewed" },
    { week: 2, topic: "Vite and Proxy Architecture", grade: "A", status: "Reviewed" },
    { week: 3, topic: "Gemini Model SDK Integration", grade: "A+", status: "Reviewed" },
  ]);

  // Raise Issue state
  const [issueTitle, setIssueTitle] = useState("");
  const [issueCategory, setIssueCategory] = useState("MERN Course");
  const [issuePriority, setIssuePriority] = useState("Medium");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueAttachment, setIssueAttachment] = useState("");
  const [ticketSuccess, setTicketSuccess] = useState<any | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Suggested FAQs triggered as user types
  const suggestedFaqs = useMemo(() => {
    if (issueTitle.trim().length < 3) return [];
    const query = issueTitle.toLowerCase();
    return initialFaqs.filter(faq => 
      faq.question.toLowerCase().includes(query) ||
      faq.category.toLowerCase().includes(query) ||
      faq.tags.some(t => t.toLowerCase().includes(query))
    ).slice(0, 4);
  }, [issueTitle, initialFaqs]);

  const [selectedSugFaq, setSelectedSugFaq] = useState<FAQItem | null>(null);

  // Community answer state
  const [selectedFaqForAns, setSelectedFaqForAns] = useState<string>("");
  const [commAnswerText, setCommAnswerText] = useState("");
  const [commSuccess, setCommSuccess] = useState(false);

  // Local document state
  const [nocUploaded, setNocUploaded] = useState(currentUser?.nocStatus === "verified");
  const [nocFileName, setNocFileName] = useState("Signed_NOC_IITR_Signed.pdf");
  const [isNocApproving, setIsNocApproving] = useState(false);
  const [journalText, setJournalText] = useState("");

  // Category List
  const ticketCategories = [
    "MERN Course",
    "AI Fundamentals",
    "Internship",
    "Certificate",
    "Stipend",
    "Technical Issue",
    "Other"
  ];

  // Fetch full stack datasets for this user
  const loadDashboardData = async () => {
    if (!currentUser?.email) return;
    setLoading(true);
    try {
      // 1. Fetch tickets
      const tRes = await fetchWithAuth(`/api/tickets?email=${currentUser.email}`);
      if (tRes.ok) {
        const tObj = await tRes.json();
        setTickets(tObj.tickets || []);
      }

      // 2. Fetch community answers
      const cRes = await fetchWithAuth("/api/community-answers");
      if (cRes.ok) {
        const cObj = await cRes.json();
        // filter for current student
        const filteredAns = cObj.communityAnswers.filter((a: any) => a.studentEmail.toLowerCase() === currentUser.email.toLowerCase());
        setCommunityAnswers(filteredAns);
      }

      // 3. Fetch notifications
      const nRes = await fetchWithAuth(`/api/notifications?email=${currentUser.email}`);
      if (nRes.ok) {
        const nObj = await nRes.json();
        setNotifications(nObj.notifications || []);
      }
    } catch (err) {
      console.error("Dashboard api fetch failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentUser, subTab]);

  // Raise issue Submission
  const handleRaiseIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setTicketSuccess(null);

    if (!issueTitle.trim() || !issueDescription.trim()) {
      setFormError("Issue Title and Engineering Description are required.");
      return;
    }

    try {
      const response = await fetchWithAuth("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle,
          category: issueCategory,
          description: issueDescription,
          priority: issuePriority,
          studentEmail: currentUser.email,
          studentName: currentUser.name,
          attachmentName: issueAttachment || "support_attachment.png"
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create support ticket.");
      }

      setTicketSuccess(data.ticket);
      // Reset form fields
      setIssueTitle("");
      setIssueDescription("");
      setIssueAttachment("");
      
      // Update score in local state
      setCurrentUser({
        ...currentUser,
        contributionScore: currentUser.contributionScore + 15
      });
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred during ticket creation.");
    }
  };

  // Submit community answer FAQ
  const handleCommAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFaqForAns || !commAnswerText.trim()) return;

    try {
      const response = await fetchWithAuth("/api/community-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faqId: selectedFaqForAns,
          studentEmail: currentUser.email,
          studentName: currentUser.name,
          answer: commAnswerText
        })
      });

      if (response.ok) {
        setCommSuccess(true);
        setCommAnswerText("");
        setTimeout(() => setCommSuccess(false), 3000);
        loadDashboardData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Dismiss notification
  const handleDismissNotification = async (notifId: string) => {
    try {
      await fetchWithAuth("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notifId })
      });
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNocUploadSim = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsNocApproving(true);
      const name = file.name;
      setTimeout(() => {
        setIsNocApproving(false);
        setNocUploaded(true);
        setNocFileName(name);
        setCurrentUser({
          ...currentUser,
          nocStatus: "verified",
          contributionScore: currentUser.contributionScore + 25
        });
      }, 1500);
    }
  };

  const handleJournalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalText.trim()) return;

    const newWeek = logsList.length + 1;
    setLogsList([
      ...logsList,
      { week: newWeek, topic: journalText, grade: "Pending Review", status: "Submitted" }
    ]);

    setJournalText("");
    setCurrentUser({
      ...currentUser,
      rosettaLogsCount: (currentUser.rosettaLogsCount || 0) + 1,
      contributionScore: currentUser.contributionScore + 30
    });
  };

  const isRosettaLogsUnlocked = (currentUser?.rosettaLogsCount || 0) >= 3;
  const isNocUnlocked = nocUploaded;
  const isChampionUnlocked = currentUser?.contributionScore >= 160;

  return (
    <div className="space-y-6">
      
      {/* Intern Info Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-2xl glass border border-white/5 bg-[#0A0A0F]/80">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/25 text-purple-400">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-white text-sm font-bold font-sans">{currentUser?.name}</h2>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/25 font-bold uppercase">
                {currentUser?.role}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              ID: {currentUser?.studentId} · {currentUser?.college}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 mt-3 md:mt-0 font-mono text-[11px]">
          <div className="flex items-center space-x-1">
            <Award className="h-4 w-4 text-purple-400" />
            <span className="text-slate-400">Score:</span>
            <span className="text-white font-bold">{currentUser?.contributionScore} XP</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
            <span className="text-slate-400">Streak:</span>
            <span className="text-[#FFB020] font-bold">{currentUser?.activeStreak || 5} Days</span>
          </div>
        </div>
      </div>

      {/* Futuristic Dashboard Submenus */}
      <div className="flex overflow-x-auto gap-1 border-b border-white/5 pb-1">
        {[
          { id: "overview", label: "Overview Hub", icon: FolderDown },
          { id: "raise", label: "Raise Support Issue", icon: Plus },
          { id: "issues", label: `My Tickets (${tickets.length})`, icon: FileText },
          { id: "faqHub", label: "Smart FAQ Hub", icon: HelpCircle },
          { id: "community", label: `My Answers (${communityAnswers.length})`, icon: Zap },
          { id: "profile", label: "Intern Profile & Credentials", icon: Settings }
        ].map(item => {
          const Icon = item.icon;
          const isActive = subTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setSubTab(item.id as any); setTicketSuccess(null); setFormError(null); }}
              className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                isActive 
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300" 
                  : "bg-transparent border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          
          {/* ===========================================
              SUBTAB 1: OVERVIEW HUB
             =========================================== */}
          {subTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Cohort Progress */}
                <div className="md:col-span-2 glass rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between shadow-lg">
                  <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-purple-650/10 blur-2xl" />
                  
                  <div>
                    <span className="font-mono text-[9px] text-purple-400 font-bold uppercase tracking-wider bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/10 inline-block">
                      VICHARANASHALA PORTAL ENGAGEMENT
                    </span>
                    <h3 className="font-display text-white text-base font-bold mt-2">Engineering Roadmap Journey</h3>
                    <p className="text-slate-400 text-xs mt-1">
                      Your engineering logs and technical contributions build up your final evaluation score for the Recommendation letters.
                    </p>
                  </div>

                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Engineering Milestone Progress</span>
                      <span>{Math.min(100, (currentUser?.rosettaLogsCount || 0) * 15)}% Complete</span>
                    </div>
                    <div className="w-full bg-[#050505] rounded-full h-2 overflow-hidden border border-white/5">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-blue-400 h-full rounded-full shadow-[0_0_8px_rgba(139,92,206,0.5)] transition-all" 
                        style={{ width: `${Math.min(100, (currentUser?.rosettaLogsCount || 0) * 15)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Milestone Badge card */}
                <div className="glass rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-emerald-500/10 blur-xl font-mono text-[8px] text-emerald-400" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">NOC Verification Status</span>
                    {nocUploaded ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  </div>
                  <div>
                    <h4 className="text-white text-lg font-bold font-sans mt-2">
                      {nocUploaded ? "VERIFIED" : "PENDING UPLOAD"}
                    </h4>
                    <p className="text-[10px] text-slate-505 font-mono mt-0.5 truncate">
                      {nocUploaded ? `File: ${nocFileName}` : "Deadline: June 15, 2026"}
                    </p>
                  </div>
                </div>

              </div>

              {/* Achievements row */}
              <div className="glass rounded-2xl p-5 relative overflow-hidden">
                <h4 className="text-white text-xs font-bold font-mono tracking-wider mb-4 border-b border-white/5 pb-2">
                  GAMIFIED MILESTONES REVIEW
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className={`p-4 rounded-xl border flex flex-col justify-between ${isRosettaLogsUnlocked ? "bg-purple-950/15 border-purple-500/30" : "bg-white/[0.01] border-white/5 opacity-55"}`}>
                    <div>
                      <span className="text-[9px] font-mono bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded">WEEKLY SCHOLAR</span>
                      <h5 className="text-white font-bold text-xs mt-1.5">Rosetta Scholar Medal</h5>
                      <p className="text-[10px] text-slate-400 mt-1">Stipend disbursements priority release queue privilege unlocked.</p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 mt-3 border-t border-white/5 pt-2">Requires: &ge;3 logs submissions</span>
                  </div>

                  <div className={`p-4 rounded-xl border flex flex-col justify-between ${isNocUnlocked ? "bg-emerald-950/15 border-emerald-500/30" : "bg-white/[0.01] border-white/5 opacity-55"}`}>
                    <div>
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded font-bold">COMPLIANT MEDAL</span>
                      <h5 className="text-white font-bold text-xs mt-1.5">Official Stamp of Compliance</h5>
                      <p className="text-[10px] text-slate-400 mt-1">Automatic verification in final IIT Ropar official registers.</p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 mt-3 border-t border-white/5 pt-2">Requires: Upload signed NOC</span>
                  </div>

                  <div className={`p-4 rounded-xl border flex flex-col justify-between ${isChampionUnlocked ? "bg-cyan-950/15 border-cyan-500/30" : "bg-white/[0.01] border-white/5 opacity-55"}`}>
                    <div>
                      <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded font-bold">LAB CHAMPION</span>
                      <h5 className="text-white font-bold text-xs mt-1.5">Vicharanashala Champion Privilege</h5>
                      <p className="text-[10px] text-slate-400 mt-1">Direct reference profile sent to partner AI research hubs.</p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 mt-3 border-t border-white/5 pt-2">Requires: &ge;160 contribution score</span>
                  </div>
                </div>
              </div>

              {/* NOC + Logs Form block */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* NOC Submission */}
                <div className="glass rounded-2xl p-5 border border-white/5">
                  <h4 className="text-white font-sans font-bold text-xs flex items-center mb-1">
                    <FolderDown className="h-4.5 w-4.5 text-purple-400 mr-2" />
                    NOC Verification Document
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Submit No Objection Certificate (NOC) authorized by TPO to unlock academic credits integration.
                  </p>

                  <div className="border border-dashed border-white/10 rounded-xl p-4 text-center bg-[#07070C]">
                    {isNocApproving ? (
                      <div className="py-4 space-y-2">
                        <RefreshCw className="h-6 w-6 text-purple-400 animate-spin mx-auto" />
                        <span className="text-[11px] text-slate-400 font-mono block">Analyzing formatting compliance...</span>
                      </div>
                    ) : nocUploaded ? (
                      <div className="space-y-2.5 py-2">
                        <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto" />
                        <div>
                          <p className="text-slate-200 text-xs font-bold truncate max-w-xs mx-auto">{nocFileName}</p>
                          <p className="text-[10px] text-emerald-400 font-mono font-medium block mt-0.5">NOC STAMPED & VERIFIED BY IIT ROPAR TEAM</p>
                        </div>
                        <button onClick={() => { setNocUploaded(false); }} className="text-[10px] text-red-400 hover:underline">
                          Delete & Upload New
                        </button>
                      </div>
                    ) : (
                      <div className="py-2 space-y-2">
                        <Upload className="h-6 w-6 text-slate-500 mx-auto" />
                        <label className="text-xs text-purple-400 hover:underline font-mono font-bold cursor-pointer block">
                          Choose legal PDF NOC Document
                          <input type="file" className="hidden" accept=".pdf" onChange={handleNocUploadSim} />
                        </label>
                        <span className="text-[10px] text-slate-650 font-mono">Maximum legal capacity 4MB</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rosetta Log submission */}
                <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
                  <div>
                    <h4 className="text-white font-sans font-bold text-xs flex items-center mb-1">
                      <FileText className="h-4.5 w-4.5 text-cyan-400 mr-2" />
                      Weekly Rosetta Journal Logs
                    </h4>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Summarize engineering features developed during the current Summer Cohort program.
                    </p>
                  </div>

                  <form onSubmit={handleJournalSubmit} className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={journalText}
                        onChange={(e) => setJournalText(e.target.value)}
                        placeholder="e.g. Cleared Week 4 quizzes, built AI chat models and synced API endpoint proxy"
                        className="flex-1 bg-white/[0.02] border border-white/10 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-cyan-500/30"
                      />
                      <button 
                        type="submit" 
                        disabled={!journalText.trim()}
                        className="px-3.5 py-1.5 rounded-lg bg-cyan-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                      >
                        Submit
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 max-h-[100px] overflow-y-auto rounded bg-black/20 text-[10px] text-slate-400 font-mono leading-relaxed divide-y divide-white/5 border border-white/5">
                    {logsList.map(item => (
                      <div key={item.week} className="p-1.5 flex justify-between">
                        <span>Week {item.week}: {item.topic}</span>
                        <span className="text-slate-505 bg-white/5 px-1 rounded">{item.grade}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Interactive Notifications block inside Overview of dashboard */}
              {notifications.length > 0 && (
                <div className="p-4 rounded-xl border border-white/5 bg-purple-950/5">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="font-mono text-[9px] text-[#C084FC] font-extrabold uppercase tracking-widest flex items-center">
                      <Sparkles className="h-3 w-3 mr-1.5 animate-pulse text-[#C084FC]" />
                      Activity and Status Alerts
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Real-time alerts Sync active</span>
                  </div>
                  <div className="space-y-2">
                    {notifications.slice(0, 3).map(not => (
                      <div key={not.id} className="text-xs p-2.5 rounded-lg bg-[#0F0F12]/80 border border-white/5 flex items-start justify-between">
                        <div className="flex items-start space-x-2">
                          <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${
                            not.type === "success" ? "text-emerald-400" : not.type === "warning" ? "text-amber-400" : "text-blue-400"
                          }`} />
                          <span className="text-slate-300">{not.text}</span>
                        </div>
                        <button onClick={() => handleDismissNotification(not.id)} className="text-[10px] text-slate-500 hover:text-white ml-2">
                          Dismiss
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ===========================================
              SUBTAB 2: RAISE SUPPORT ISSUE (TICKET FORM)
             =========================================== */}
          {subTab === "raise" && (
            <div className="max-w-2xl mx-auto glass rounded-2xl p-6 border border-white/10 relative">
              <span className="font-mono text-[9px] text-purple-400 uppercase tracking-widest font-extrabold">NEW PROBLEM REPORT MODULE</span>
              <h3 className="font-display text-white text-base font-bold mt-1.5">Raise Support Engineering Ticket</h3>
              <p className="text-xs text-slate-400 mt-1 mb-6">
                Fill the fields below. A unique ticket ID will be generated automatically, and our admin team will be notified immediately of your issue.
              </p>

              {/* Status Alert */}
              {formError && (
                <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-400/5 text-xs text-red-400 flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {ticketSuccess && (
                <div className="mb-6 p-5 rounded-xl border border-emerald-500/30 bg-emerald-400/5 text-center space-y-2.5">
                  <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto animate-bounce" />
                  <div>
                    <h5 className="text-white text-sm font-bold">Support Ticket Successfully Raised!</h5>
                    <p className="font-mono text-[11px] text-emerald-400 font-bold uppercase mt-1">
                      Ticket ID: {ticketSuccess.id}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 leading-normal max-w-md mx-auto">
                      A confirmation has been logged. Admin was mailed at <span className="font-mono text-slate-355">support@iitr.ac.in</span>. You can track this under My Tickets tab.
                    </p>
                  </div>
                  <button 
                    onClick={() => setTicketSuccess(null)}
                    className="px-4 py-1.5 rounded-lg border border-white/15 hover:border-white/20 text-[11px] text-slate-200 mt-2 hover:bg-white/5 transition"
                  >
                    Open Another Support Case
                  </button>
                </div>
              )}

              {!ticketSuccess && (
                <form onSubmit={handleRaiseIssueSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
                      Issue Title / Question Summarization
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. MERN course materials not reflecting in seq-3"
                      value={issueTitle}
                      onChange={(e) => setIssueTitle(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#07070B] py-2.5 px-3.5 text-xs text-white focus:border-purple-500/30 focus:outline-none"
                      required
                    />
                  </div>

                  {/* SMART FAQ SUGGESTIONS ("Did you mean?") */}
                  <AnimatePresence>
                    {suggestedFaqs.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 bg-purple-950/10 border border-purple-500/25 rounded-xl overflow-hidden"
                      >
                        <span className="font-mono text-[9px] text-[#C084FC] font-extrabold flex items-center uppercase mb-2">
                          <HelpCircle className="h-3 w-3 mr-1 animate-pulse" />
                          Did you mean? Smart FAQ Auto Match Suggestions
                        </span>
                        
                        <div className="space-y-1.5">
                          {suggestedFaqs.map(faq => (
                            <div 
                              key={faq.id} 
                              className="text-xs p-2 rounded bg-black/30 border border-white/5 hover:border-purple-500/20 transition flex justify-between items-center"
                            >
                              <div>
                                <span className="font-mono text-[9px] text-cyan-400 bg-cyan-900/20 px-1 border border-cyan-500/10 rounded mr-1.5">{faq.category}</span>
                                <strong className="text-slate-200">{faq.question}</strong>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedSugFaq(faq)}
                                className="text-[10px] text-purple-400 font-semibold hover:underline"
                              >
                                View Answer
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
                        Category Classification
                      </label>
                      <select
                        value={issueCategory}
                        onChange={(e) => setIssueCategory(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-[#07070B] p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500/30"
                      >
                        {ticketCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
                        Priority Weighting
                      </label>
                      <select
                        value={issuePriority}
                        onChange={(e) => setIssuePriority(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-[#07070B] p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500/30"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium font-bold">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
                      Engineering Description / Steps to Reproduce
                    </label>
                    <textarea 
                      placeholder="Please delineate your query or issue in detail so that scholars/faculty can resolve it efficiently..."
                      rows={4}
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#07070B] p-3 text-xs text-white focus:border-purple-500/30 focus:outline-none leading-relaxed"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
                      Screen Recording or Screenshot Attachment (Sim Upload File Name)
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. screenshot_progress_bug.png"
                      value={issueAttachment}
                      onChange={(e) => setIssueAttachment(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#07070B] py-2 px-3 text-xs text-slate-300 focus:border-purple-500/30 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-95 text-white text-xs tracking-wider uppercase font-extrabold cursor-pointer transition shadow-lg"
                  >
                    <span>Submit & Generate Ticket Credentials</span>
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {/* Inline suggestion modal popup */}
              {selectedSugFaq && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                  <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F0F12] p-5 shadow-2xl relative">
                    <button onClick={() => setSelectedSugFaq(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                      <X className="h-4.5 w-4.5" />
                    </button>
                    <span className="font-mono text-[9px] text-cyan-400 bg-cyan-500/10 px-1.5 border border-cyan-500/25 rounded">
                      {selectedSugFaq.category}
                    </span>
                    <h4 className="text-white font-bold text-sm mt-3 pr-8">{selectedSugFaq.question}</h4>
                    <p className="text-xs text-slate-355 mt-3 whitespace-pre-line leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5">
                      {selectedSugFaq.answer}
                    </p>

                    <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-white/5">
                      <button 
                        onClick={() => setSelectedSugFaq(null)}
                        className="px-3.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
                      >
                        Keep editing ticket
                      </button>

                      <button 
                        onClick={() => {
                          setSelectedSugFaq(null);
                          setIssueTitle("");
                          setIssueDescription("");
                          // reward score for utilizing self support!
                          setCurrentUser({
                            ...currentUser,
                            contributionScore: currentUser.contributionScore + 20
                          });
                        }}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                      >
                        ✅ This Solved It! Cancel Ticket
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ===========================================
              SUBTAB 3: MY SUPPORT TICKETS LIST
             =========================================== */}
          {subTab === "issues" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <h3 className="text-white text-base font-bold">Personal Support History</h3>
                  <p className="text-xs text-slate-400">Track current review status, prioritization and resolution timeline logs.</p>
                </div>
                <button
                  onClick={loadDashboardData}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-white/5 border border-white/10 text-xs text-slate-200 rounded-lg hover:bg-white/10"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Sync Tickets</span>
                </button>
              </div>

              {tickets.length === 0 ? (
                <div className="text-center py-10 rounded-2xl bg-white/[0.01] border border-white/5">
                  <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-xs font-semibold">You have no outstanding support tickets raised.</p>
                  <p className="text-[11px] text-slate-500 mt-1">If you require engineering platform help, please submit a case using Raise Issue.</p>
                  <button 
                    onClick={() => setSubTab("raise")}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg mt-4 cursor-pointer"
                  >
                    Open New Case
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tickets.map(ticket => (
                    <div 
                      key={ticket.id} 
                      className="glass rounded-xl p-5 border border-white/5 bg-[#0A0A0F]/90 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-4">
                          <span className="font-mono text-[10px] text-purple-400 font-extrabold tracking-wider">{ticket.id}</span>
                          <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider ${
                            ticket.status === "Open" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                            ticket.status === "In Review" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            ticket.status === "Resolved" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            "bg-slate-500/10 text-slate-400 border border-slate-500/10"
                          }`}>
                            {ticket.status}
                          </span>
                        </div>

                        <h4 className="text-white text-xs font-bold leading-normal mt-2.5">{ticket.title}</h4>
                        <p className="text-[11px] text-slate-400 truncate leading-relaxed mt-1.5">{ticket.description}</p>
                        
                        <div className="flex gap-2 flex-wrap text-[10px] mt-3 font-mono">
                          <span className="bg-white/5 border border-white/5 px-2 py-0.5 rounded text-slate-400">
                            Category: {ticket.category}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded ${ticket.priority === "High" ? "bg-red-500/10 text-red-400" : "bg-white/5 text-slate-400"}`}>
                            Priority: {ticket.priority}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-white/5 pt-3.5 mt-4 flex justify-between items-center">
                        <span className="font-mono text-[9px] text-slate-500">Submitted: {ticket.createdAt}</span>
                        {ticket.attachmentName && (
                          <span className="text-[10px] font-mono text-cyan-400 flex items-center">
                            <FileCheck className="h-3 w-3 mr-1" />
                            {ticket.attachmentName}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===========================================
              SUBTAB 4: SEARCHABLE FAQ HUB
             =========================================== */}
          {subTab === "faqHub" && (
            <div className="p-4 rounded-2xl glass border border-white/5">
              <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-white font-sans font-bold text-xs uppercase tracking-wider flex items-center">
                    <Sparkles className="h-4 w-4 mr-1.5 text-purple-400" />
                    Interactive FAQ and Knowledge Index
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Click an FAQ to submit a community-reviewed answer option below.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                {initialFaqs.map(faq => (
                  <div key={faq.id} className="p-3.5 rounded-xl border border-white/5 bg-black/40 hover:border-purple-500/15 transition">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-purple-355 font-bold uppercase">
                        {faq.category}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">{faq.id}</span>
                    </div>
                    <h5 className="text-white font-bold text-xs mt-2">{faq.question}</h5>
                    <p className="text-[11px] text-slate-400 mt-1 lines-clamp-3">{faq.answer}</p>
                    
                    <button 
                      onClick={() => {
                        setSelectedFaqForAns(faq.id);
                        setSubTab("community");
                      }} 
                      className="text-[10px] text-purple-400 hover:underline mt-2.5 block text-right font-semibold"
                    >
                      Submit Community Answer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===========================================
              SUBTAB 5: COMMUNITY ANSWER SYSTEM
             =========================================== */}
          {subTab === "community" && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Submit New Answer form */}
                <div className="glass rounded-2xl p-5 border border-white/5">
                  <span className="font-mono text-[9px] text-[#C084FC] font-extrabold uppercase block tracking-widest">COMMUNITY QA ENGINE</span>
                  <h4 className="text-white font-sans font-semibold text-xs mt-1 mb-4">Submit FAQ Student Response</h4>
                  
                  {commSuccess && (
                    <div className="mb-4 p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-400/5 text-center text-xs text-emerald-400">
                      Answer successfully submitted! Stored with status: <strong>Pending Review</strong>.
                    </div>
                  )}

                  <form onSubmit={handleCommAnswerSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-widest block">Select FAQ Target</label>
                      <select 
                        value={selectedFaqForAns}
                        onChange={(e) => setSelectedFaqForAns(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-[#07070B] p-2.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500/30"
                        required
                      >
                        <option value="">-- Choose FAQ to Answer --</option>
                        {initialFaqs.map(f => (
                          <option key={f.id} value={f.id}>[{f.id}] {f.question.substring(0, 50)}...</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-widest block">Your proposed Answer explanation</label>
                      <textarea
                        placeholder="Please write a clear, accurate, fact-based response conforming with IIT Ropar guidelines..."
                        rows={5}
                        value={commAnswerText}
                        onChange={(e) => setCommAnswerText(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-[#07070B] p-3 text-xs text-white focus:outline-none focus:border-purple-500/30 font-sans leading-relaxed"
                        required
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-white text-xs uppercase tracking-wider cursor-pointer font-sans"
                    >
                      Submit Answer for Admin Moderation
                    </button>
                  </form>
                </div>

                {/* Submissions tracker list */}
                <div className="glass rounded-2xl p-5 border border-white/5 relative overflow-hidden">
                  <span className="font-mono text-[9px] text-[#A855F7] font-bold uppercase tracking-widest">SUBMISSION REVIEWS</span>
                  <h4 className="text-white font-sans font-semibold text-xs mt-1 mb-4">My Answer Submissions Ledger</h4>

                  <div className="space-y-3.5 max-h-[350px] overflow-y-auto">
                    {communityAnswers.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 text-xs">
                        You have not made any community FAQ answers submissions yet. Choose an FAQ on the left to start!
                      </div>
                    ) : (
                      communityAnswers.map(ans => {
                        const originalFaq = initialFaqs.find(f => f.id === ans.faqId);
                        return (
                          <div key={ans.id} className="p-3.5 rounded-xl border border-white/5 bg-black/40 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="font-mono text-[9px] text-cyan-400 bg-cyan-950/20 px-2 border border-cyan-500/10 rounded uppercase font-bold">
                                FAQ ID: {ans.faqId}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-extrabold uppercase ${
                                ans.status === "Approved" ? "bg-emerald-500/15 text-emerald-400" :
                                ans.status === "Rejected" ? "bg-red-500/15 text-red-400" :
                                "bg-amber-500/15 text-amber-500"
                              }`}>
                                {ans.status}
                              </span>
                            </div>
                            
                            {originalFaq && (
                              <p className="text-slate-300 font-bold text-[11px]">
                                Q: {originalFaq.question}
                              </p>
                            )}

                            <p className="text-[11px] text-slate-400 leading-relaxed font-sans mt-1 italic p-2.5 rounded bg-black/25">
                              &ldquo;{ans.answer}&rdquo;
                            </p>

                            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1.5 border-t border-white/5">
                              <span>Submitted: {ans.createdAt}</span>
                              {ans.status === "Approved" && (
                                <span className="text-emerald-400 flex items-center">
                                  <Award className="h-3 w-3 mr-1" /> Verified Badge Earned (+40 XP)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ===========================================
              SUBTAB 6: INTERN PROFILE & CREDENTIALS
             =========================================== */}
          {subTab === "profile" && (
            <div className="max-w-xl mx-auto glass rounded-2xl p-6 border border-white/10 space-y-4">
              <h3 className="text-white text-base font-bold pb-2 border-b border-white/5">Vicharanashala Intern Profile</h3>
              
              <div className="space-y-3 text-xs leading-relaxed font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Full Name</span>
                  <span className="text-slate-100 font-bold">{currentUser?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Institutional Email</span>
                  <span className="text-slate-100 font-bold select-all">{currentUser?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">IIT Ropar Student ID</span>
                  <span className="text-slate-100 font-mono font-bold select-all">{currentUser?.studentId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">College / University</span>
                  <span className="text-slate-100 font-bold">{currentUser?.college}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Security Authorization Level</span>
                  <span className="text-purple-400 font-mono tracking-wider font-extrabold uppercase">
                    {currentUser?.role === "Admin" ? "SYSTEM_ROOT_ADMIN" : "SANDBOX_STUDENT_INTERN"}
                  </span>
                </div>

                <div className="border border-white/5 bg-black/30 rounded-xl p-4 mt-6">
                  <h4 className="text-white font-bold font-mono text-[10px] uppercase tracking-wider mb-2 flex items-center">
                    <Shield className="h-4 w-4 mr-1 text-purple-400" /> Account Security
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    Your account is registered on the persistent Vicharanashala client ledger. Credentials are saved locally on the container volume and sandbox browsers.
                  </p>
                  
                  <button 
                    onClick={() => {
                      localStorage.removeItem("vicha_user_token");
                      window.location.reload();
                    }}
                    className="px-4 py-2 bg-red-950/30 hover:bg-red-950/50 border border-red-500/25 rounded-lg text-xs font-bold text-red-400 transition cursor-pointer"
                  >
                    Logout Intern Session
                  </button>
                </div>
              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
}
