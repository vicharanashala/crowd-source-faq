import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, Terminal, FileText, CheckCircle2, Bookmark, Flame, Shield, Layout, MapPin, 
  HelpCircle, ChevronRight, GraduationCap, Laptop, BookOpen, Clock, Waves, ArrowUpRight, Send, AlertCircle, Search
} from "lucide-react";

import TopNavbar from "./components/TopNavbar.js";
import SmartSearch from "./components/SmartSearch.js";
import FAQSystem from "./components/FAQSystem.js";
import VoiceAssistant from "./components/VoiceAssistant.js";
import UserDashboard from "./components/UserDashboard.js";
import AdminPanel from "./components/AdminPanel.js";
import YakshaMini from "./components/YakshaMini.js";
import ExploreDashboard from "./components/ExploreDashboard.js";
import AuthSystem from "./components/AuthSystem.js";

import { useTheme } from "./context/ThemeContext.tsx";
import { faqData as initialFaqData, FAQItem } from "./data/faqs.js";
import { DiscussionThread, ModerationLog, UserProfile } from "./types.js";
import { fetchWithAuth } from "./utils/api.js";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [searchTerm, setSearchTerm] = useState("");
  const [directQueryForAI, setDirectQueryForAI] = useState<string | null>(null);

  const { darkMode, setDarkMode } = useTheme();

  // Load state from localStorage or use defaults (merging new additions from the codebase)
  const [faqs, setFaqs] = useState<FAQItem[]>(() => {
    const saved = localStorage.getItem("vicha_faqs");
    if (!saved) return initialFaqData;
    try {
      const parsed = JSON.parse(saved) as FAQItem[];
      // Keep existing items, but merge any new official FAQs that aren't in cached local storage yet
      const parsedIds = new Set(parsed.map(f => f.id));
      const missingFaqs = initialFaqData.filter(f => !parsedIds.has(f.id));
      if (missingFaqs.length > 0) {
        return [...parsed, ...missingFaqs];
      }
      return parsed;
    } catch (e) {
      return initialFaqData;
    }
  });

  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("vicha_bookmarks");
    return saved ? JSON.parse(saved) : [];
  });

  const [faqHistory, setFaqHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("vicha_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [discussionThreads, setDiscussionThreads] = useState<DiscussionThread[]>(() => {
    const saved = localStorage.getItem("vicha_discussions");
    if (saved) return JSON.parse(saved);
    return [
      {
        id: "dsc-201",
        user: "student_ropar_44@iitr.ac.in",
        question: "Is there minor room space assigned inside IIT Ropar utilities block for on-campus work teams?",
        answer: "Yes, teams working on-campus get access to Section 3B of the Academic Block. Coordinate keys with the lab manager (Mr. Sharma).",
        status: "answered",
        timestamp: "2026-05-28 10:15"
      },
      {
        id: "dsc-202",
        user: "curious_fellow_iitr@iitr.ac.in",
        question: "Will late Rosetta Journal submissions (by 10-15 minutes) undergo automatic grade point deductions?",
        status: "open",
        timestamp: "2026-05-30 04:30"
      }
    ];
  });

  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>(() => {
    const saved = localStorage.getItem("vicha_moderation_logs");
    if (saved) return JSON.parse(saved);
    return [
      { id: "mod-101", user: "student_ropar_12@iitr.ac.in", action: "NOC Verification Status Check", score: "0.01 Safe", status: "Clean", timestamp: "2026-05-29" },
      { id: "mod-102", user: "system_robot@vi-ibe.org", action: "API endpoint health probe", score: "0.00 Neutral", status: "Clean", timestamp: "2026-05-30" },
      { id: "mod-103", user: "anonymous_spammer_32", action: "Bulk post 'stipends free voucher clicks'", score: "0.98 Spam", status: "Auto-Blocked", timestamp: "2026-05-30" },
    ];
  });

  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = localStorage.getItem("vicha_user_token");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem("vicha_faqs", JSON.stringify(faqs));
  }, [faqs]);

  useEffect(() => {
    localStorage.setItem("vicha_bookmarks", JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  useEffect(() => {
    localStorage.setItem("vicha_history", JSON.stringify(faqHistory));
  }, [faqHistory]);

  useEffect(() => {
    localStorage.setItem("vicha_discussions", JSON.stringify(discussionThreads));
  }, [discussionThreads]);

  useEffect(() => {
    localStorage.setItem("vicha_moderation_logs", JSON.stringify(moderationLogs));
  }, [moderationLogs]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("vicha_user_token", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("vicha_user_token");
    }
  }, [currentUser]);

  useEffect(() => {
    const loadBackendFaqs = async () => {
      try {
        const res = await fetch("/api/faqs");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.faqs) {
            setFaqs(data.faqs);
          }
        }
      } catch (err) {
        console.error("Failed to load FAQs from backend, using static local definitions", err);
      }
    };
    loadBackendFaqs();
  }, []);

  // Interaction handlers
  const handleAddFAQ = (newFaq: FAQItem) => {
    setFaqs((prev) => [newFaq, ...prev]);
    // Award 50 points to profile for FAQ additions
    if (currentUser) {
      setCurrentUser((p: any) => ({ ...p, contributionScore: p.contributionScore + 50 }));
    }
  };

  const handleDeleteFAQ = async (id: string) => {
    try {
      const response = await fetchWithAuth(`/api/faqs/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setFaqs((prev) => prev.filter((faq) => faq.id !== id));
      } else {
        const errData = await response.json();
        console.error("Failed to delete FAQ:", errData.error || response.statusText);
      }
    } catch (err) {
      console.error("Failed to delete FAQ", err);
    }
  };

  const handleVoteFAQ = (id: string, type: "up" | "down") => {
    setFaqs((prev) => 
      prev.map((faq) => {
        if (faq.id !== id) return faq;
        const upDiff = type === "up" ? 1 : 0;
        const downDiff = type === "down" ? 1 : 0;
        return {
          ...faq,
          upvotes: faq.upvotes + upDiff,
          downvotes: faq.downvotes + downDiff,
          popularity: faq.popularity + (type === "up" ? 15 : -5)
        };
      })
    );
  };

  const handleToggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => 
      prev.includes(id) ? prev.filter((bId) => bId !== id) : [...prev, id]
    );
  };

  const handleRecordHistory = (id: string) => {
    setFaqHistory((prev) => {
      const filtered = prev.filter((hId) => hId !== id);
      return [id, ...filtered].slice(0, 8); // Keep top 8 recently viewed
    });
  };

  // Submit discussion thread
  const handleAddDiscussion = (questionText: string, userEmail: string = "antramishra209@gmail.com") => {
    const checkSpamResult = checkSpam(questionText);
    if (checkSpamResult.isSpam) {
      handleSpamIncident(questionText, userEmail, checkSpamResult.reason);
      return { success: false, isSpam: true };
    }

    const newThread: DiscussionThread = {
      id: `dsc-${Date.now()}`,
      user: userEmail,
      question: questionText,
      status: "open",
      timestamp: new Date().toISOString().substring(0, 16).replace("T", " ")
    };
    setDiscussionThreads((prev) => [newThread, ...prev]);
    if (currentUser) {
      setCurrentUser((p: any) => ({ ...p, contributionScore: (p.contributionScore || 0) + 10 }));
    }
    return { success: true, isSpam: false };
  };

  // Answer discussion thread
  const handleAnswerDiscussion = (threadId: string, answerText: string, publishAsFAQ: boolean, category?: string) => {
    setDiscussionThreads((prev) => 
      prev.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          answer: answerText,
          status: publishAsFAQ ? "published" : "answered"
        };
      })
    );

    const thread = discussionThreads.find(t => t.id === threadId);
    if (publishAsFAQ && thread) {
      const nextNum = Math.max(...faqs.map(f => parseInt(f.id.split("-")[1] || "0"))) + 1;
      const cleanNum = isNaN(nextNum) || nextNum < 15 ? 16 : nextNum;
      const newFaq: FAQItem = {
        id: `FAQ-${String(cleanNum).padStart(3, "0")}`,
        category: category || "About Internship",
        question: thread.question,
        answer: answerText,
        upvotes: 2,
        downvotes: 0,
        popularity: 50,
        lastUpdated: new Date().toISOString().substring(0, 10),
        related: [],
        tags: ["CommunityThread", "VerifiedAnswer"]
      };
      setFaqs((prev) => [newFaq, ...prev]);
    }
  };

  const handleAskAIAboutFAQ = (questionText: string) => {
    setDirectQueryForAI(questionText);
    setActiveTab("chat");
  };

  // Spam checking & controller triggers
  const checkSpam = (text: string) => {
    const list = ["viagra", "online casino", "crypto profit", "lottery", "cash bonus", "free money", "earn bitcoin", "earn dollars", "cheap drugs", "clicks generator"];
    const textLower = text.toLowerCase();
    for (const phrase of list) {
      if (textLower.includes(phrase)) {
        return { isSpam: true, reason: `Spam keyword match '${phrase}'` };
      }
    }
    // Pattern checks: excessive capital letters or URLs
    const urlPattern = /(https?:\/\/[^\s]+)/;
    if (urlPattern.test(textLower) && !textLower.includes("iitr.ac.in") && !textLower.includes("github.com")) {
      return { isSpam: true, reason: "Unauthorized external hypertext links detected" };
    }
    return { isSpam: false, reason: "" };
  };

  const handleSpamIncident = (text: string, userName: string, reason: string) => {
    const newIncident: ModerationLog = {
      id: `mod-${Date.now()}`,
      user: userName,
      action: `Spam filter caught: "${text.substring(0, 45)}..."`,
      score: `0.99 Flagged: ${reason}`,
      status: "Auto-Blocked",
      timestamp: new Date().toISOString().substring(0, 10)
    };
    setModerationLogs((prev) => [newIncident, ...prev]);
  };

  const selectFAQFromSearch = (id: string) => {
    setActiveTab("faq");
    handleRecordHistory(id);
    const targetFaq = faqs.find(f => f.id === id);
    if (targetFaq) {
      setSearchTerm(targetFaq.question);
    }
  };

  const triggerVoiceTab = () => {
    setActiveTab("voice");
  };

  return (
    <div className={`relative min-h-screen bg-slate-50 dark:bg-[#050505] text-slate-800 dark:text-slate-200 overflow-hidden font-sans transition-colors duration-305 ${darkMode ? 'grid-bg-dark' : 'grid-bg-light'}`}>
      
      {/* Decorative Blur Spheres */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-purple-450/10 dark:bg-purple-900/25 blur-[120px] rounded-full -z-10 transition-colors duration-300" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-450/10 dark:bg-blue-900/25 blur-[120px] rounded-full -z-10 transition-colors duration-300" />

      {/* Primary Sticky Header Nav */}
      <TopNavbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        trendingCount={faqs.filter(f => f.popularity > 820).length}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentUser={currentUser}
        onLogInClick={() => setShowAuthModal(true)}
      />

      {/* Main Container */}
      <main className={`w-full mx-auto transition-all duration-300 ${activeTab === "chat" ? "max-w-[1400px] h-[calc(100vh-4.5rem)] px-2 sm:px-4 md:px-6 py-2 md:py-4" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12"}`}>
        <AnimatePresence mode="wait">
          
          {/* LANDING PAGE HERO VIEW */}
          {activeTab === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-12"
            >
              <ExploreDashboard 
                faqs={faqs}
                bookmarkedIds={bookmarkedIds}
                onBookmarkFAQ={handleToggleBookmark}
                onVoteFAQ={handleVoteFAQ}
                setActiveTab={setActiveTab}
                darkMode={darkMode}
              />
            </motion.div>
          )}

          {/* DYNAMIC FAQ VIEW */}
          {activeTab === "faq" && (
            <motion.div
              key="faq"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl md:text-3xl font-extrabold text-white">Intelligent FAQ Ecosystem</h2>
                  <p className="text-slate-400 text-xs md:text-sm">Search detailed guidelines, bookmark favorites, translate answers, or request AI support.</p>
                </div>
                
                {/* Search Bar directly centered in active FAQ page */}
                <div className="w-full md:max-w-md shrink-0">
                  <div className="relative flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 focus-within:border-purple-500/40 transition">
                    <Search className="h-4 w-4 text-slate-500 ml-2.5" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filter NOC, stipends, Rosetta logs..."
                      className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none p-2"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className="p-1.5 text-slate-500 hover:text-slate-200 text-xs">Clear</button>
                    )}
                  </div>
                </div>
              </div>

              <FAQSystem 
                onAskAI={handleAskAIAboutFAQ} 
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                faqs={faqs}
                bookmarkedIds={bookmarkedIds}
                onBookmarkFAQ={handleToggleBookmark}
                onVoteFAQ={handleVoteFAQ}
                faqHistory={faqHistory}
                onRecordHistory={handleRecordHistory}
                onSubmitDiscussion={handleAddDiscussion}
              />
            </motion.div>
          )}

          {/* VOICE ASSISTANT TAB VIEW */}
          {activeTab === "voice" && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl mx-auto"
            >
              <VoiceAssistant />
            </motion.div>
          )}

          {/* CHATBOT AI DIRECT FOCUS TAB */}
          {activeTab === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              <YakshaMini 
                initialQuestion={directQueryForAI}
                clearInitialQuestion={() => setDirectQueryForAI(null)}
                onSpamRecorded={handleSpamIncident}
                isEmbedded={true}
              />
            </motion.div>
          )}

          {/* DYNAMIC USER WORKSPACE DASHBOARD */}
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              {currentUser ? (
                <UserDashboard 
                  onNavigateTab={setActiveTab}
                  onSearchTerm={setSearchTerm}
                  faqs={faqs}
                  bookmarkedIds={bookmarkedIds}
                  faqHistory={faqHistory}
                  currentUser={currentUser}
                  setCurrentUser={setCurrentUser}
                />
              ) : (
                <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-450 mx-auto">
                    <Layout className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-white text-base font-bold">Intern Workspace Protected</h3>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                      Please authenticate your Summer Cohort session using your university email OTP to submit support tickets, upload your NOC verification credentials, and view interactive milestones.
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-2.5 rounded-xl bg-purple-600 font-bold hover:opacity-90 text-white text-xs tracking-wider uppercase cursor-pointer"
                  >
                    Authenticate Session
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ADMINISTRATIVE CONTROL PANEL */}
          {activeTab === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              {currentUser ? (
                currentUser.role === "Admin" ? (
                  <AdminPanel 
                    faqs={faqs}
                    onAddFAQ={handleAddFAQ}
                    onDeleteFAQ={handleDeleteFAQ}
                    moderationLogs={moderationLogs}
                    setModerationLogs={setModerationLogs}
                    currentUser={currentUser}
                  />
                ) : (
                  <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto space-y-4">
                    <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/25 text-red-400 mx-auto">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-white text-base font-bold">Access Restrained</h3>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                        Your account is classified as a Student Intern slot. The IIT Ropar Control Center is restricted to authorized administrative facilitators.
                      </p>
                    </div>
                    <button 
                      onClick={() => setActiveTab("dashboard")}
                      className="w-full py-2.5 rounded-xl bg-purple-600 font-bold hover:opacity-90 text-white text-xs tracking-wider uppercase cursor-pointer"
                    >
                      Return to student dashboard
                    </button>
                  </div>
                )
              ) : (
                <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-450 mx-auto">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-white text-base font-bold">Control Center Access Locked</h3>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                      Administrative features require verified facilitator authorization details. Please authenticate your coordinator account below.
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-2.5 rounded-xl bg-purple-600 font-bold hover:opacity-90 text-white text-xs tracking-wider uppercase cursor-pointer"
                  >
                    Authenticate Coordinator Session
                  </button>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Floating Yaksha AI trigger (always mounted to act as floating assistant except when inside the fullchat workspace tab) */}
      {activeTab !== "chat" && (
        <YakshaMini 
          initialQuestion={directQueryForAI}
          clearInitialQuestion={() => setDirectQueryForAI(null)}
          onSpamRecorded={handleSpamIncident}
        />
      )}

      {/* FOOTER */}
      <footer className="w-full border-t border-slate-900 bg-slate-950 px-4 py-8 mt-16 md:mt-24">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
          <div className="flex items-center space-x-2.5">
            <span className="font-bold text-slate-400">Vicharanashala Lab</span>
            <span className="text-slate-700">|</span>
            <span className="font-semibold text-slate-500">Indian Institute of Technology Ropar</span>
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={() => setActiveTab("faq")} className="hover:text-slate-300 cursor-pointer">Docs</button>
            <span>·</span>
            <span className="flex items-center space-x-1.5 text-emerald-400" title="API gateways active">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SYSTEM ONLINE</span>
            </span>
            <span>·</span>
            <span className="text-slate-600">Cycle 2026</span>
          </div>
        </div>
      </footer>

      {/* Full overlay AuthSystem modal */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthSystem 
            onAuthSuccess={(userObj) => {
              setCurrentUser(userObj);
              setShowAuthModal(false);
              setActiveTab("dashboard");
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
