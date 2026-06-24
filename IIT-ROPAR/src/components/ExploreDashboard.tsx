import { fetchWithAuth } from "../utils/api.js";
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, Search, ChevronRight, ChevronDown, HelpCircle, 
  BookOpen, Calendar, HelpCircle as QuestionIcon, Plus, ThumbsUp, Send, User, Bot, AlertCircle, 
  CheckCircle2, HelpCircle as HelpIcon, Play, RefreshCw, ArrowRight, CornerDownRight, Info, BookMarked, ShieldCheck, Mail
} from "lucide-react";
import { FAQItem } from "../data/faqs.js";
import FaqIllustration from "./FaqIllustration";
import IITRoparFaqIllustration from "./IITRoparFaqIllustration";

interface ExploreDashboardProps {
  faqs: FAQItem[];
  bookmarkedIds?: string[];
  onBookmarkFAQ?: (id: string) => void;
  onVoteFAQ?: (id: string, type: "up" | "down") => void;
  setActiveTab: (tab: string) => void;
  darkMode: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

export default function ExploreDashboard({ 
  faqs, 
  bookmarkedIds = [], 
  onBookmarkFAQ, 
  onVoteFAQ, 
  setActiveTab, 
  darkMode 
}: ExploreDashboardProps) {

  // State for holographic assistant mouse follow effect
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / 12;
    const y = (e.clientY - rect.top - rect.height / 2) / 12;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // ==========================================
  // SECTION 1 & 2 STATE: Accordion FAQ & Grid
  // ==========================================
  const [faqSearch, setFaqSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>("FAQ-001");
  const [faqLikes, setFaqLikes] = useState<Record<string, number>>({});

  // Unique categories for modern filter pills
  const categoriesList = useMemo(() => {
    return ["all", "About Internship", "NOC", "Rosetta Journal", "Stipends & Banks", "Certificates"];
  }, []);

  // Soft pastel gradients & premium style classes for grid cards
  const gridCategories = [
    {
      id: "About Internship",
      title: "Core Cohort Guide",
      description: "Learn about the program timeline, grading blocks, and IIT Ropar lab standard protocols.",
      bgLight: "from-[#EAF4FF] to-[#FFFFFF] border-[#BCE1FF]/40",
      bgDark: "dark:from-[#1E293B]/60 dark:to-[#0F172A]/80 dark:border-blue-500/15",
      accentText: "text-blue-600 dark:text-blue-400",
      colorBadge: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
      icon: BookOpen,
      badge: "Mandatory"
    },
    {
      id: "NOC",
      title: "NOC Clearance & Verification",
      description: "Dean-signed clearance criteria, lock deadlines, and step-by-step upload exceptions.",
      bgLight: "from-[#F1ECFF] to-[#FFFFFF] border-[#DCD0FF]/40",
      bgDark: "dark:from-[#2E1065]/20 dark:to-[#0F172A]/80 dark:border-purple-500/15",
      accentText: "text-purple-600 dark:text-[#C084FC]",
      colorBadge: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
      icon: ShieldCheck,
      badge: "Deadline: June 10"
    },
    {
      id: "Rosetta Journal",
      title: "Rosetta Journals Log",
      description: "Weekly tracking templates, supervisor evaluation points, and automated feedback engines.",
      bgLight: "from-[#DFF7F0] to-[#FFFFFF] border-[#B9EEDC]/40",
      bgDark: "dark:from-[#064E3B]/10 dark:to-[#0F172A]/80 dark:border-emerald-500/15",
      accentText: "text-emerald-700 dark:text-emerald-400",
      colorBadge: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
      icon: CheckCircle2,
      badge: "Every Friday"
    },
    {
      id: "Stipends & Banks",
      title: "Stipends & Financial Hub",
      description: "Bi-weekly dispatch slots, local bank registration, and attendance correlation parameters.",
      bgLight: "from-[#FFF5E6] to-[#FFFFFF] border-[#FEDCBF]/40",
      bgDark: "dark:from-[#78350F]/10 dark:to-[#0F172A]/80 dark:border-amber-500/15",
      accentText: "text-amber-700 dark:text-amber-400",
      colorBadge: "bg-amber-100 dark:bg-amber-950/40 text-amber-750 dark:text-amber-300",
      icon: Calendar,
      badge: "1st & 15th Cycle"
    }
  ];

  // Map requested Categories to core faqs
  const filteredFAQs = useMemo(() => {
    return faqs.filter(faq => {
      // search match
      const mSearch = faq.question.toLowerCase().includes(faqSearch.toLowerCase()) || 
                      faq.answer.toLowerCase().includes(faqSearch.toLowerCase());
      if (!mSearch) return false;

      // category match
      if (selectedCategory === "all") return true;
      if (selectedCategory === "Stipends & Banks") {
        return faq.category === "ViBe Platform" || faq.category.toLowerCase().includes("stipend") || faq.category.toLowerCase().includes("bank");
      }
      return faq.category.toLowerCase().includes(selectedCategory.toLowerCase());
    });
  }, [faqs, faqSearch, selectedCategory]);

  const handleVoteLocal = (faqId: string) => {
    setFaqLikes(p => ({
      ...p,
      [faqId]: (p[faqId] || 0) + 1
    }));
    if (onVoteFAQ) onVoteFAQ(faqId, "up");
  };

  // ==========================================
  // INSIGHTS TAB FOR OPTION A POPULAR/VIEWED FAQS
  // ==========================================
  const [insightsTab, setInsightsTab] = useState<"popular" | "viewed" | "updated">("popular");

  const popularFAQs = useMemo(() => {
    return [...faqs].sort((a, b) => b.upvotes - a.upvotes).slice(0, 4);
  }, [faqs]);

  const mostViewedFAQs = useMemo(() => {
    return [...faqs].sort((a, b) => b.popularity - a.popularity).slice(0, 4);
  }, [faqs]);

  const recentlyUpdatedFAQs = useMemo(() => {
    return [...faqs]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 4);
  }, [faqs]);

  const activeInsightsFAQs = useMemo(() => {
    if (insightsTab === "popular") return popularFAQs;
    if (insightsTab === "viewed") return mostViewedFAQs;
    return recentlyUpdatedFAQs;
  }, [insightsTab, popularFAQs, mostViewedFAQs, recentlyUpdatedFAQs]);

  const handleScrollToFAQ = (faqId: string) => {
    setExpandedId(faqId);
    setTimeout(() => {
      const element = document.getElementById(faqId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  };

  // ==========================================
  // SECTION 3 STATE: Step-by-Step Troubleshooter
  // ==========================================
  const [troubleshootTrack, setTroubleshootTrack] = useState<"noc" | "rosetta">("noc");
  // Steps: 0, 1, 2, 3
  const [nocStep, setNocStep] = useState(0); 
  const [nocSelections, setNocSelections] = useState<Record<string, boolean>>({});

  const [rosettaStep, setRosettaStep] = useState(0);
  const [rosettaSelections, setRosettaSelections] = useState<Record<string, boolean>>({});

  const handleNocChoice = (option: string, answer: boolean) => {
    setNocSelections(prev => ({ ...prev, [option]: answer }));
    setNocStep(prev => prev + 1);
  };

  const handleRosettaChoice = (option: string, answer: boolean) => {
    setRosettaSelections(prev => ({ ...prev, [option]: answer }));
    setRosettaStep(prev => prev + 1);
  };

  const resetTroubleshooter = () => {
    setNocStep(0);
    setNocSelections({});
    setRosettaStep(0);
    setRosettaSelections({});
  };

  // ==========================================
  // SECTION 4 STATE: Conversational AI Chat
  // ==========================================
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "ai-welcome",
      role: "assistant",
      content: "Hello there! 👋 I am the **IIT Ropar Vicharanashala Intelligent Assistant**. How can I help resolve your academic, stipend, or Rosetta journal clearances today?",
      time: "Just now"
    }
  ]);

  // Handle preset quick芯片
  const presetChips = [
    { label: "🔒 When is the NOC deadline?", query: "noc deadline" },
    { label: "📅 Stipend release date?", query: "stipend dates" },
    { label: "📝 Rosetta journal grade?", query: "rosetta journal grading" },
    { label: "🎓 Certificates format?", query: "certificates" }
  ];

  const handleSendChat = async (text: string) => {
    if (!text.trim()) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsTyping(true);

    try {
      const conversationPayload = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversationPayload })
      });

      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.content || "I apologize, but I could not formulate a response at this moment.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
      setIsTyping(false);
    } catch (err) {
      console.warn("Yaksha local matcher triggered:", err);
      const q = text.toLowerCase();
      let answer = "";

      // 1. Spurti Points (SP)
      if (q.includes("spurti") || q.includes("points") || q.includes(" sp ")) {
        const found = faqs.find(f => f.id === "FAQ-016");
        answer = found ? found.answer : "Spurti Points (SP) are currently in beta and may not accurately reflect effort. Higher SP may occasionally provide recognition or small perks, but they do NOT determine internship outcomes. Importantly, SP may be zero or negative, and this is completely fine and is not a problem.";
      }
      // 2. Attendance & Participation & Rolling Basis
      else if (q.includes("attendance") || q.includes("zoom") || q.includes("requirement") || q.includes("rolling") || q.includes("days") || q.includes("batch") || q.includes("participation") || q.includes("percent") || q.includes("85%")) {
        const found = faqs.find(f => f.id === "FAQ-017");
        answer = found ? found.answer : "The Vicharanashala Internship Program strictly evaluates participation on a rolling basis covering the most recent 5 working days (each new day continuously replaces the oldest day in the evaluation window). Every intern must satisfy three conditions simultaneously: attend at least 85% of Zoom session time, respond to at least 85% of polls and quizzes, and score at least 50% on every quiz. If any falls below, you may be moved to a later batch.";
      }
      // 3. ViBe Platform Devices & Linear Progression
      else if (q.includes("vibe") && (q.includes("mobile") || q.includes("tablet") || q.includes("device") || q.includes("restricted") || q.includes("skip") || q.includes("progression") || q.includes("sequential"))) {
        const found = faqs.find(f => f.id === "FAQ-018");
        answer = found ? found.answer : "The ViBe Platform supports Desktop and Laptop computers only. Mobile phones and tablets are not supported. Linear progression applies: videos and quizzes must be completed sequentially; skipping is not allowed. 'Access Restricted' means an earlier item is incomplete.";
      }
      // 4. Login and DNS cache issues
      else if (q.includes("login") || q.includes("cannot see") || (q.includes("course") && (q.includes("invite") || q.includes("appear") || q.includes("disappear")))) {
        const found = faqs.find(f => f.id === "FAQ-019");
        answer = found ? found.answer : "Always log in using your registered email ID and accept course invitations from Notifications. If courses do not appear: verify your email, clear your browser cache, allow cookies, update your DNS, flush your DNS cache (e.g. ipconfig /flushdns), and re-login.";
      }
      // 5. Video Playback & Progress Store
      else if (q.includes("video") || q.includes("playback") || (q.includes("progress") && (q.includes("track") || q.includes("store") || q.includes("lost")))) {
        const found = faqs.find(f => f.id === "FAQ-020");
        answer = found ? found.answer : "Videos must be watched completely and in sequence on the active ViBe tab. Camera/mic permissions might be required. Player interruptions can be caused by tab-switching, going idle, poor lighting, or background noise. Progress is stored on the server side and securely linked to your registered email ID, so clearing cache or reinstalling your browser will never remove it.";
      }
      // 6. Proctoring, Privacy, Learning Setup & Performance Penalty
      else if (q.includes("penalty") || q.includes("proctor") || q.includes("camera") || q.includes("privacy") || q.includes("lighting") || q.includes("face")) {
        const found = faqs.find(f => f.id === "FAQ-021");
        answer = found ? found.answer : "Penalty scores are generated by anomalies during learning and may require rewatching or retaking quizzes, but currently do not affect HP or final evaluation. Proctoring requires your face to be clearly visible with adequate lighting, only one face in frame, no background voices, and face looking forward. ViBe does not record videos continuously (only real-time checks). Learning Setup: Light facing you, quiet environment, stay on the ViBe tab.";
      }
      // 7. Teams, WhatsApp, communication, active phases
      else if (q.includes("team") || q.includes("whatsapp") || q.includes("member") || q.includes("scrum") || q.includes("group")) {
        const found = faqs.find(f => f.id === "FAQ-023");
        answer = found ? found.answer : "Team participation is strictly mandatory during project phases. Standard team size is 4 members. Team changes are not allowed. Same-college formation is discouraged. Official communication occurs through Samagama announcements and Yaksha. Coordination should occur via LinkedIn or Email; WhatsApp groups for team coordination are strictly prohibited. Inactive members must be reported to mentors/scholars.";
      }
      // 8. Support Escalation & Help
      else if (q.includes("escalate") || q.includes("support") || q.includes("flag") || q.includes("issue") || q.includes("bug")) {
        const found = faqs.find(f => f.id === "FAQ-024");
        answer = found ? found.answer : "For content related issues, please use the ViBe 'Flag' option. For technical/platform issues, contact Yaksha AI directly. For persistent platform issues, utilize the Slack channel '#escalate-ViBe'.\n\nGeneral Principle: These rules are the authoritative source of guidance. We prefer official FAQ guidelines over external assumptions. If a situation is not explicitly covered in these official guidelines, the official FAQ does not specify it.";
      }
      // General fallbacks to other FAQ matches if any
      else {
        const bestMatch = faqs.find(faq => 
          q.includes(faq.category.toLowerCase()) || 
          faq.question.toLowerCase().split(" ").some(word => word.length > 4 && q.includes(word)) ||
          faq.tags.some(tag => q.includes(tag.toLowerCase()))
        );

        if (bestMatch) {
          answer = bestMatch.answer;
        } else {
          answer = "I've processed your query about the Vicharanashala guidelines. If your query concerns specific rules, let me know! Please note: if a situation is not explicitly covered by the official guidelines, the official FAQ does not specify it.";
        }
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: answer,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-12">
      
      {/* BRAND HERO HEADER WITH PASTEL GLASSMORPHISM */}
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative max-w-7xl mx-auto pt-6 md:pt-10 px-4 transition-all duration-300 text-left"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* LEFT COLUMN: HERO TEXTUAL CONTENT */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center space-x-2 rounded-full bg-indigo-500/10 px-4 py-1.5 border border-indigo-400/20 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold uppercase tracking-widest shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-650 dark:text-indigo-300 animate-spin-slow" />
              <span>IIT Ropar Vicharanashala Support Hub</span>
            </motion.div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-none text-slate-900 dark:text-white">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-sky-450 dark:via-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                System Support
              </span>{" "}
              & FAQ Portal
            </h1>

            <p className="text-slate-650 dark:text-slate-405 text-sm sm:text-base max-w-2xl mx-auto lg:mx-0 leading-relaxed font-sans">
              Welcome to your high-fidelity, interactive ed-tech clearing portal. Track NOC legal approvals, 
              weekly Rosetta logs, stipend credit dispatches, and get direct AI-driven assistance below.
            </p>

            {/* Quick statistics layout */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 pt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center space-x-1.5 bg-slate-200/40 dark:bg-white/5 border border-slate-300/30 dark:border-white/5 rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>NOC Verification Active</span>
              </div>
              <div className="flex items-center space-x-1.5 bg-slate-200/40 dark:bg-white/5 border border-slate-300/30 dark:border-white/5 rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                <span>Cycle Summer 2026</span>
              </div>
              <div className="flex items-center space-x-1.5 bg-slate-200/40 dark:bg-white/5 border border-slate-300/30 dark:border-white/5 rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Stipend Sync Status: Live</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LARGE EXPANDED CYBERPUNK FAQ ILLUSTRATION */}
          <div className="lg:col-span-5 flex justify-center items-center w-full">
            <IITRoparFaqIllustration />
          </div>
        </div>
      </div>

      {/* ========================================================
          SECTION 2: INTERACTIVE CARD GRID (CATEGORY NAVIGATOR)
          ======================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">Explore Categories</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs text-left">Click any block to automatically filter our extensive FAQ accordion directory below.</p>
          </div>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 select-none">
            Grid Section ── 02
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {gridCategories.map((card, idx) => {
            const Icon = card.icon;
            const isSelected = selectedCategory.toLowerCase() === card.id.toLowerCase();
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                onClick={() => setSelectedCategory(isSelected ? "all" : card.id)}
                className={`group rounded-2xl p-5 border text-left cursor-pointer transition-all duration-300 shadow-sm relative overflow-hidden flex flex-col justify-between h-[195px]
                  ${card.bgLight} ${card.bgDark}
                  ${isSelected ? "ring-2 ring-purple-500 dark:ring-purple-400 shadow-md scale-[1.02]" : "hover:-translate-y-1.5 hover:shadow-lg"}
                `}
              >
                {/* Floating soft glowing background element */}
                <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-radial from-white/10 to-transparent blur-md opacity-20 pointer-events-none" />

                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className={`p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200/50 dark:border-white/10 shadow-sm text-slate-800 dark:text-white transition group-hover:scale-105`}>
                      <Icon className="h-5 w-5 text-purple-650 dark:text-purple-400" />
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${card.colorBadge}`}>
                      {card.badge}
                    </span>
                  </div>

                  <h4 className="font-display font-extrabold text-sm text-slate-900 dark:text-slate-100 leading-snug group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                    {card.title}
                  </h4>
                </div>

                <p className="text-slate-500 dark:text-slate-450 text-[11px] leading-relaxed line-clamp-2 mt-2">
                  {card.description}
                </p>

                <div className="pt-3 flex items-center justify-between border-t border-slate-100/50 dark:border-white/5 mt-auto">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{card.id}</span>
                  <div className="flex h-5 w-5 rounded-full items-center justify-center bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 group-hover:bg-purple-600 dark:group-hover:bg-purple-500 group-hover:text-white transition duration-200">
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ========================================================
          SECTION 1 (ACCORDION FAQ) FULL-WIDTH
          ======================================================== */}
      <div className="space-y-6 text-left w-full">
          
          {/* ANIMATED FAQ ILLUSTRATION SECTION */}
          <FaqIllustration />

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">Clean Accordion Directory</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs">Certified guidelines from IIT Ropar administration archives.</p>
            </div>
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 select-none">
              UI Section ── 01
            </span>
          </div>

          {/* Search bar inside Section 1 */}
          <div className="relative flex items-center bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-white/10 focus-within:border-purple-500/40 rounded-2xl p-1 shadow-sm transition">
            <Search className="h-4.5 w-4.5 text-slate-400 dark:text-slate-500 ml-2.5 shrink-0" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search compliance, stipends, or certificate rules..."
              className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none p-2"
            />
            {faqSearch && (
              <button 
                onClick={() => setFaqSearch("")} 
                className="p-1 px-2.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-mono"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Pills Scroller */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {categoriesList.map((category) => {
              const isSelected = selectedCategory.toLowerCase() === category.toLowerCase();
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition cursor-pointer shrink-0 border
                    ${isSelected 
                      ? "bg-purple-650 dark:bg-purple-600 text-white border-purple-700/20 shadow-sm font-semibold" 
                      : "bg-white dark:bg-white/5 text-slate-650 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10"
                    }
                  `}
                >
                  {category === "all" ? "🌐 Show All" : category}
                </button>
              );
            })}
          </div>

          {/* Expandable Cards List with Accordion Mechanics */}
          <div className="space-y-3 pt-1">
            <AnimatePresence mode="wait">
              {filteredFAQs.length > 0 ? (
                filteredFAQs.map((faq) => {
                  const isExpanded = expandedId === faq.id;
                  return (
                    <motion.div
                      key={faq.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`overflow-hidden rounded-2xl border transition-all duration-300 bg-white/70 dark:bg-[#0F0F12]/95 backdrop-blur-md shadow-sm
                        ${isExpanded 
                          ? "border-purple-500/30 dark:border-purple-500/25 ring-1 ring-purple-500/10 dark:ring-purple-500/5 shadow-md" 
                          : "border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 hover:shadow-md"
                        }
                      `}
                    >
                      {/* Header bar click area */}
                      <div 
                        onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                        className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none space-x-3.5"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-[9px] font-mono font-bold py-0.5 px-2 rounded-md bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shrink-0">
                            {faq.id}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
                            {faq.category}
                          </span>
                        </div>

                        <h4 className="flex-1 font-display font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 pr-2">
                          {faq.question}
                        </h4>

                        <div className={`h-6 w-6 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300 shrink-0 flex items-center justify-center transition-transform duration-300 ${isExpanded ? "rotate-180 bg-purple-50 text-purple-700 dark:bg-purple-950/60" : ""}`}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </div>
                      </div>

                      {/* Content panel */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "auto" }}
                            exit={{ height: 0 }}
                            transition={{ duration: 0.25 }}
                          >
                            <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-white/5 text-slate-650 dark:text-slate-400 text-xs space-y-4">
                              <p className="leading-relaxed font-sans font-medium whitespace-pre-line text-[12px]">
                                {faq.answer}
                              </p>

                              {/* Footer feedback, like buttons and tags */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100/50 dark:border-white/5 mt-2.5 text-[10px] text-slate-400 font-mono">
                                <div className="flex flex-wrap gap-1.5">
                                  {faq.tags.map(tag => (
                                    <span key={tag} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 hover:text-slate-500 transition">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>

                                <div className="flex items-center space-x-3.5">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleVoteLocal(faq.id); }}
                                    className="flex items-center space-x-1.5 font-bold hover:text-purple-650 dark:hover:text-purple-400 transition cursor-pointer"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5 text-slate-450 hover:scale-110 transition" />
                                    <span> Helpful ({faq.popularity + (faqLikes[faq.id] || 0)})</span>
                                  </button>
                                  <span>·</span>
                                  <span>Updated: {faq.lastUpdated}</span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-12 text-center space-y-3 bg-white/40 dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 rounded-2xl">
                  <span className="inline-block p-3 rounded-full bg-slate-100 dark:bg-white/5 text-slate-400">
                    <Info className="h-6 w-6" />
                  </span>
                  <h4 className="font-display font-bold text-slate-700 dark:text-slate-400 text-sm">No Answers Found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Try checking spelling keywords or resetting your selected category pill to "Show All" above.
                  </p>
                  <button 
                    onClick={() => { setFaqSearch(""); setSelectedCategory("all"); }}
                    className="px-4 py-1.5 bg-purple-600/10 dark:bg-purple-600/20 text-purple-700 dark:text-purple-400 hover:text-purple-300 rounded-xl transition text-[11px] font-bold border border-purple-500/20 cursor-pointer"
                  >
                    Reset Filter Query
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
      </div> {/* Closes full-width Accordion FAQ section */}

      {/* ========================================================
          SUPPORT INSIGHTS & EXPERT CONVERSATIONAL CHATBOT GRID
          ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6">

        {/* COLUMN 1: PORTAL ANALYTICS & INSIGHT PANEL (SPAN 5) */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">FAQ Analytical Center</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs">Instantly resolve and view high-correlation administrative policies.</p>
            </div>
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 select-none">
              UI Section ── 05
            </span>
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#0F0F12]/95 backdrop-blur-xl p-5 shadow-lg flex flex-col justify-between h-[480px]">
            <div>
              {/* Inner Tabs header */}
              <div className="flex bg-slate-100 dark:bg-white/[0.03] p-1.5 rounded-2xl border border-slate-200/50 dark:border-white/5 mb-4 shrink-0">
                <button
                  onClick={() => setInsightsTab("popular")}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer
                    ${insightsTab === "popular"
                      ? "bg-purple-650 dark:bg-purple-600 text-white shadow-sm font-semibold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-805 dark:hover:text-slate-200"
                    }
                  `}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  <span>Popular</span>
                </button>

                <button
                  onClick={() => setInsightsTab("viewed")}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer
                    ${insightsTab === "viewed"
                      ? "bg-purple-650 dark:bg-purple-600 text-white shadow-sm font-semibold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-805 dark:hover:text-slate-200"
                    }
                  `}
                >
                  <BookMarked className="h-3.5 w-3.5" />
                  <span>Viewed</span>
                </button>

                <button
                  onClick={() => setInsightsTab("updated")}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer
                    ${insightsTab === "updated"
                      ? "bg-purple-650 dark:bg-purple-600 text-white shadow-sm font-semibold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-805 dark:hover:text-slate-200"
                    }
                  `}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Updated</span>
                </button>
              </div>

              {/* List entries based on tab */}
              <div className="space-y-3 overflow-y-auto max-h-[305px] pr-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={insightsTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3 font-sans"
                  >
                    {activeInsightsFAQs.map((faq) => (
                      <div
                        key={faq.id}
                        onClick={() => handleScrollToFAQ(faq.id)}
                        className="group p-3.5 rounded-2xl border border-slate-150 dark:border-white/5 bg-white/53 dark:bg-[#121218]/40 hover:bg-slate-100/60 dark:hover:bg-[#161624]/60 hover:border-purple-500/20 dark:hover:border-purple-500/30 cursor-pointer text-left transition-all duration-200 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                            {faq.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {insightsTab === "popular" && `👍 ${faq.upvotes} Upvotes`}
                            {insightsTab === "viewed" && `👁️ ${faq.popularity} Hits`}
                            {insightsTab === "updated" && `🕒 ${faq.lastUpdated}`}
                          </span>
                        </div>
                        <h4 className="font-display font-medium text-xs text-slate-800 dark:text-slate-200 group-hover:text-purple-750 dark:group-hover:text-purple-400 leading-snug transition-colors line-clamp-2">
                          {faq.question}
                        </h4>
                        <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-1 line-clamp-1 italic">
                          Category: {faq.category}
                        </p>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Quick utility system status block */}
            <div className="pt-3 border-t border-slate-150/60 dark:border-white/5 mt-auto text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center justify-between select-none shrink-0">
              <span className="flex items-center space-x-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Administrative Sync Valid</span>
              </span>
              <span>Cleared Queries Ratio: 99.8%</span>
            </div>
          </div>
        </div>

        {/* COLUMN 2: EXTREMELY WIDE INTEGRATED CONVERSATIONAL CHAT (SPAN 7) */}
        <div className="lg:col-span-12 xl:col-span-7 space-y-4 text-left">
          
          {/* CONVERSATIONAL AI CHAT INTERFACE */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">Conversational AI Chat</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs">Centered support widget connected to local intelligence engines.</p>
              </div>
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 select-none">
                UI Section ── 04
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#0F0F12]/95 backdrop-blur-xl shadow-lg relative h-[480px] overflow-hidden flex flex-col justify-between">
            {/* Widget top header */}
            <div className="p-4 border-b border-slate-150/60 dark:border-white/5 bg-slate-100/50 dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="relative">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500 dark:bg-indigo-600 border border-indigo-400 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-[12px] text-slate-800 dark:text-slate-100">Yaksha AI Engine</h4>
                  <p className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">ONLINE · SOLVES DIRECTLY</p>
                </div>
              </div>

              <div className="flex gap-1.5 items-center">
                <span className="px-2 py-0.5 rounded bg-slate-200/50 dark:bg-white/15 border border-slate-300/20 text-slate-500 dark:text-slate-400 font-mono text-[9px] font-bold">confidence: 99%</span>
              </div>
            </div>

            {/* Message streams block */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-hide text-xs">
              {chatMessages.map((msg) => {
                const isAI = msg.role === "assistant";
                return (
                  <div key={msg.id} className={`flex max-w-[85%] ${isAI ? "" : "ml-auto flex-row-reverse"} gap-2`}>
                    <div className={`h-6 w-6 rounded-lg flex items-center justify-center border shrink-0 ${isAI ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-250/20" : "bg-purple-650 text-white border-purple-800"}`}>
                      {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </div>

                    <div className="space-y-1">
                      <div className={`px-3.5 py-2.5 rounded-2xl leading-relaxed text-[11px] font-medium
                        ${isAI 
                          ? "bg-slate-100/70 dark:bg-white/[0.04] text-slate-800 dark:text-slate-200 border border-slate-150/40 dark:border-white/5 rounded-tl-sm text-left" 
                          : "bg-purple-650 dark:bg-purple-600 text-white rounded-tr-sm text-left shadow-sm"
                        }
                      `}>
                        <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                      </div>
                      <p className={`text-[8px] font-mono text-slate-450 dark:text-slate-500 ${isAI ? "text-left" : "text-right"}`}>{msg.time}</p>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex max-w-[85%] gap-2">
                  <div className="h-6 w-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-250/20 flex items-center justify-center shrink-0">
                    <Bot className="h-3 w-3 animate-bounce" />
                  </div>
                  <div className="px-4 py-2.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03] text-slate-500 rounded-tl-sm flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce delay-100" />
                    <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Preset Chips - floating layout */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.01]">
              <p className="text-[9px] uppercase font-mono font-bold tracking-wider text-slate-450 dark:text-slate-550 mb-1.5 text-left select-none">Quick Queries Chips</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-hide">
                {presetChips.map((chip, i) => (
                  <button 
                    key={i}
                    onClick={() => handleSendChat(chip.query)}
                    className="px-2.5 py-1 text-[10px] bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 border border-indigo-100/50 dark:border-indigo-850/40 text-indigo-750 dark:text-indigo-300 font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form area */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendChat(chatInput); }}
              className="p-3 border-t border-slate-150 dark:border-white/5 bg-slate-100/50 dark:bg-white/[0.02] flex items-center space-x-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask stipend cycles, NOC locks, certificate dates..."
                className="flex-1 bg-white dark:bg-[#050505] border border-slate-200 dark:border-white/10 rounded-2xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-450 focus:outline-none focus:border-purple-500/40"
              />
              <button 
                type="submit"
                className="p-2 py-2 bg-gradient-to-r from-purple-500 via-indigo-600 to-blue-600 dark:from-purple-500 dark:via-indigo-500 dark:to-blue-500 text-white rounded-2xl transition shadow hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div> {/* closes Conversational AI Chat wrapper */}
      </div> {/* closes COLUMN 2 wrapper */}

      </div>

      {/* ========================================================
          SECTION 3: STEP-BY-STEP INTERACTIVE FLOWCHART TROUBLESHOOTER
          ======================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">Interactive Step-by-Step Troubleshooter</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs">Horizontal progress flowcharts directly answering critical procedural blocking issues.</p>
          </div>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 select-none">
            UI Section ── 03
          </span>
        </div>

        {/* Main box */}
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#0F0F12]/95 backdrop-blur-xl p-5 md:p-8 shadow-sm">
          
          {/* Top header navigation inside Section 3 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-150/60 dark:border-white/5 pb-4.5 gap-4">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => { setTroubleshootTrack("noc"); resetTroubleshooter(); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer border
                  ${troubleshootTrack === "noc" 
                    ? "bg-purple-600 dark:bg-purple-600 text-white border-purple-500/10 shadow-sm" 
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-505 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                  }
                `}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>NOC Verification Exception Flow</span>
              </button>

              <button 
                onClick={() => { setTroubleshootTrack("rosetta"); resetTroubleshooter(); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer border
                  ${troubleshootTrack === "rosetta" 
                    ? "bg-purple-600 dark:bg-purple-600 text-white border-purple-500/10 shadow-sm" 
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-505 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                  }
                `}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Rosetta Submission Log Flow</span>
              </button>
            </div>

            <button 
              onClick={resetTroubleshooter}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition cursor-pointer"
            >
              <RefreshCw className="h-3 w-3 animate-spin-slow" />
              <span>RESET flowchart WORKSPACE</span>
            </button>
          </div>

          {/* HORIZONTAL PROGRESS PROGRESS TRACKER */}
          <div className="pt-6 pb-8 max-w-2xl mx-auto">
            <div className="flex items-center justify-between relative">
              
              {/* Tracker lines */}
              <div className="absolute left-[8%] right-[8%] top-1/2 h-0.5 bg-slate-200 dark:bg-white/5 -translate-y-1/2 z-0" />
              <div 
                className="absolute left-[8%] top-1/2 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-600 dark:from-purple-500 dark:to-[#8B5CF6] -translate-y-1/2 z-0 transition-all duration-300"
                style={{
                  width: `${
                    troubleshootTrack === "noc" 
                      ? (nocStep / 3) * 84 
                      : (rosettaStep / 3) * 84
                  }%`
                }}
              />

              {/* Steps item nodes count */}
              {[
                { label: "Check Issue", desc: "Initiate ticket" },
                { label: "Valid Format", desc: "Review template" },
                { label: "Stamp & Sign", desc: "Authorized lock" },
                { label: "Dispatch Clear", desc: "Automatic outcome" }
              ].map((val, stepIdx) => {
                const stepLimit = troubleshootTrack === "noc" ? nocStep : rosettaStep;
                const isPassed = stepIdx < stepLimit;
                const isCurrent = stepIdx === stepLimit;
                
                return (
                  <div key={stepIdx} className="flex flex-col items-center z-10 text-center relative max-w-[85px] sm:max-w-none">
                    <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center font-mono font-bold text-xs transition duration-300
                      ${isPassed 
                        ? "bg-purple-600 dark:bg-[#7C3AED] border-purple-650 text-white shadow-sm" 
                        : isCurrent 
                          ? "bg-white dark:bg-[#0a0a0c] border-purple-500 text-purple-650 dark:text-purple-400 scale-110" 
                          : "bg-[#f8fafc] dark:bg-[#050505] border-slate-205 dark:border-white/10 text-slate-400"
                      }
                    `}>
                      {isPassed ? <CheckCircle2 className="h-4.5 w-4.5 text-white" /> : stepIdx + 1}
                    </div>
                    <p className={`text-[10px] font-display font-black mt-2 leading-none tracking-tight ${isCurrent ? "text-purple-600 dark:text-purple-400 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>
                      {val.label}
                    </p>
                    <p className="text-[8px] font-mono mt-0.5 text-slate-400 dark:text-slate-500 hidden sm:block">
                      {val.desc}
                    </p>
                  </div>
                );
              })}

            </div>
          </div>

          {/* FLOWCHART DECISION BOXES ZONE */}
          <div className="rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.01] p-6 max-w-xl mx-auto flex flex-col items-center shadow-inner text-center font-sans mt-2 min-h-[180px] justify-center relative overflow-hidden">
            
            {/* Background design graphics */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-350 dark:border-white/10" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-slate-350 dark:border-white/10" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-slate-350 dark:border-white/10" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-350 dark:border-white/10" />

            <AnimatePresence mode="wait">
              {/* NOC SEGMENT TRACK */}
              {troubleshootTrack === "noc" && (
                <motion.div
                  key={`nocStep-${nocStep}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 w-full"
                >
                  {nocStep === 0 && (
                    <>
                      <div className="flex justify-center mb-1 bg-purple-500/5 p-2 rounded-full border border-purple-500/10 w-fit mx-auto text-purple-700 dark:text-purple-400">
                        <Info className="h-5 w-5" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Exception Step 1: Do you have a copy of the official IIT Ropar NOC format?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        An official pre-cleared letterhead format is required for training placements approvals to register you as a legitimate Vicharanashala scholar.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleNocChoice("hasFormat", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Yes, I have it
                        </button>
                        <button 
                          onClick={() => handleNocChoice("hasFormat", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          No, I need template
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 1 && !nocSelections["hasFormat"] && (
                    <>
                      <div className="flex justify-center mb-1 text-purple-650">
                        <Bot className="h-10 w-10 animate-bounce" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Requirement Action: NOC Template Download Necessary!
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Please download the standardized NOC form template inside your Document Center, fill out candidate sections, and present it to your college registrar.
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button 
                          onClick={() => { setNocSelections(p => ({ ...p, hasFormat: true })); }}
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Okay, Downloaded! Move to Step 2
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-5 py-2 bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px] rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 1 && nocSelections["hasFormat"] && (
                    <>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Exception Step 2: Has the College TPO or Institution Dean signed the NOC?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Vicharanashala administration rules strictly reject self-asserted or unapproved signature exceptions. Stamped approvals are legal mandates.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleNocChoice("isSigned", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition"
                        >
                          Yes, signed & stamped
                        </button>
                        <button 
                          onClick={() => handleNocChoice("isSigned", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                        >
                          No, signature pending
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 2 && !nocSelections["isSigned"] && (
                    <>
                      <div className="flex justify-center mb-1 text-amber-500">
                        <AlertCircle className="h-8 w-8 animate-pulse" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Resolution Needed: Reach out to your College Placement Cell
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Please acquire authorized ink signatures and physical seal validations before proceeding. Alternatively, write class coordinator exceptions to our escalation panel.
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <button 
                          onClick={() => setActiveTab("faq")}
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Read NOC FAQ Guidelines
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-5 py-2 bg-white/5 border border-white/10 text-slate-400 font-bold text-xs rounded-xl"
                        >
                          Retry
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 2 && nocSelections["isSigned"] && (
                    <>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Exception Step 3: Is it formatted as a single, compiled PDF (.pdf) under 5MB?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        The secure cloud depository is strictly automated to parse OCR parameters from standard PDF archives. JPG/PNG images fail validation.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleNocChoice("isPdfFmt", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition"
                        >
                          Yes, standard .pdf
                        </button>
                        <button 
                          onClick={() => handleNocChoice("isPdfFmt", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                        >
                          No, other format (image)
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 3 && !nocSelections["isPdfFmt"] && (
                    <>
                      <div className="flex justify-center mb-1 text-slate-400">
                        <RefreshCw className="h-8 w-8 animate-spin-slow" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Direct Conversion Link
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto font-sans">
                        Please run OCR conversion or compile images into a PDF format using free standard resources (e.g., Smallpdf). Once converted, re-initiate.
                      </p>
                      <div className="flex justify-center pt-2">
                        <button 
                          onClick={() => setNocStep(2)}
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          PDF Ready! Re-Test
                        </button>
                      </div>
                    </>
                  )}

                  {nocStep === 3 && nocSelections["isPdfFmt"] && (
                    <>
                      <div className="flex justify-center mb-1 text-emerald-500">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        Congratulations! NOC Clearance Standard Lock Cleared!
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Your NOC perfectly adheres to Vicharanashala IIT Ropar legal formats and validation metrics. Ready to lock.
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button 
                          onClick={() => setActiveTab("dashboard")} 
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition shrink-0 cursor-pointer flex items-center space-x-1"
                        >
                          <span>Go to Intern Document Panel</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-4 py-2 bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-350 font-bold text-xs rounded-xl"
                        >
                          Restart Troubleshooting
                        </button>
                      </div>
                    </>
                  )}

                </motion.div>
              )}

              {/* ROSETTA SEGMENT TRACK */}
              {troubleshootTrack === "rosetta" && (
                <motion.div
                  key={`rosettaStep-${rosettaStep}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 w-full"
                >
                  {rosettaStep === 0 && (
                    <>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Rosetta Step 1: Have you submitted your weekly summary logs in due time (every Friday 17:00 UTC)?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Lateness checks automatically penalize team sprint indices within 10-15 minutes of system lock.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleRosettaChoice("submittedOnTime", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition"
                        >
                          Yes, submitted on time
                        </button>
                        <button 
                          onClick={() => handleRosettaChoice("submittedOnTime", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                        >
                          No, submission missed
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 1 && !rosettaSelections["submittedOnTime"] && (
                    <>
                      <div className="flex justify-center mb-1 text-red-500 animate-pulse">
                        <AlertCircle className="h-8 w-8" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Resolution Trigger: Backlog Submission Allowed
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Missed journals trigger provisional hold status. Open the Document Workspace, click 'Declare Exception Request' and upload backlog files immediately.
                      </p>
                      <div className="flex justify-center gap-2 pt-2">
                        <button 
                          onClick={() => setActiveTab("dashboard")} 
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition shrink-0 cursor-pointer"
                        >
                          Submit Rosetta Logs Exception
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-5 py-2 bg-white/5 border border-white/10 text-slate-400 font-bold text-xs rounded-xl"
                        >
                          Restart Flow
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 1 && rosettaSelections["submittedOnTime"] && (
                    <>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Rosetta Step 2: Has your assigned Vicharanashala mentor graded the log?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Grading states include 'Draft', 'Submitted', and 'Graded/Signed-off'. Track progress under your Contribution Block.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleRosettaChoice("isGraded", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition"
                        >
                          Yes, graded status visible
                        </button>
                        <button 
                          onClick={() => handleRosettaChoice("isGraded", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                        >
                          No, pending status shown
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 2 && !rosettaSelections["isGraded"] && (
                    <>
                      <div className="flex justify-center mb-1 text-violet-500">
                        <Info className="h-8 w-8 animate-pulse" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Status Protocol: Mentor Evaluation Pending 
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                        Mentors standardly evaluate log dispatches within 48-72 hours. If 4 days have passed, you can use the admin dispatch board to notify the group leader.
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button 
                          onClick={() => setRosettaStep(3)}
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Override & See Final Release Status
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 2 && rosettaSelections["isGraded"] && (
                    <>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Rosetta Step 3: Did you receive at least 6.0/10 milestone clearance?
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Minimum 6.0 summary compliance is mandatory to authenticate contributions toward the official program clearance certificate.
                      </p>
                      <div className="flex items-center justify-center gap-3.5 pt-2">
                        <button 
                          onClick={() => handleRosettaChoice("milestoneOk", true)}
                          className="px-6 py-2 bg-purple-650 hover:bg-purple-750 text-white font-bold text-xs rounded-xl transition"
                        >
                          Yes, 6.0+ recorded
                        </button>
                        <button 
                          onClick={() => handleRosettaChoice("milestoneOk", false)}
                          className="px-6 py-2 bg-slate-200 hover:bg-slate-250 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                        >
                          No, score below 6.0
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 3 && !rosettaSelections["milestoneOk"] && (
                    <>
                      <div className="flex justify-center mb-1 text-red-500 animate-pulse">
                        <AlertCircle className="h-8 w-8" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        Advisory Trigger: Grade Point Appeal Active
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        If grades are below 6.0 or flagged for quality deficits, we recommend improving repository commits and submitting the detailed Rosetta Journal revision before Week close.
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button 
                          onClick={() => setActiveTab("faq")}
                          className="px-5 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Review Evaluation Standards
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-5 py-2 bg-white/5 border border-white/10 text-slate-400 font-bold text-xs rounded-xl"
                        >
                          Restart Track
                        </button>
                      </div>
                    </>
                  )}

                  {rosettaStep === 3 && rosettaSelections["milestoneOk"] && (
                    <>
                      <div className="flex justify-center mb-1 text-emerald-500">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        Cohort Compliance Standard Locked!
                      </h4>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Your Rosetta weekly files are fully verified and signed off. You hold maximum green clearance parameters for stipend credits.
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button 
                          onClick={() => setActiveTab("dashboard")}
                          className="px-6 py-2 bg-purple-650 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Go to My Intern Dashboard
                        </button>
                        <button 
                          onClick={resetTroubleshooter}
                          className="px-4 py-2 bg-slate-200 dark:bg-white/10 text-[10px] font-mono text-slate-500 rounded-xl"
                        >
                          Restart Troubleshooting
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>
      </div>

    </div>
  );
}
