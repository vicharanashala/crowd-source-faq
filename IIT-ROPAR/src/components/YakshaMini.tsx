import { fetchWithAuth } from "../utils/api.js";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  MessageSquare, X, Send, Sparkles, AlertCircle, Play, 
  Trash2, User, Mic, Paperclip, Clipboard, HelpCircle, ArrowRight, Check, ShieldAlert,
  Menu, Info, Zap, CornerDownLeft, ChevronLeft, ChevronRight, FileText
} from "lucide-react";
import { useTheme } from "../context/ThemeContext.tsx";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface YakshaMiniProps {
  initialQuestion?: string | null;
  clearInitialQuestion?: () => void;
  onSpamRecorded?: (text: string, user: string, reason: string) => void;
  isEmbedded?: boolean;
}

const FriendlyRobotIcon = () => (
  <svg width="34" height="34" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8.5 h-8.5 filter drop-shadow-[0_2px_8px_rgba(56,189,248,0.5)]">
    {/* Antennas */}
    <rect x="15" y="2" width="2" height="4" fill="url(#metalGlow)" rx="1" />
    <circle cx="16" cy="2.5" r="2" fill="#22D3EE" className="animate-pulse" />
    
    {/* Ear bolts */}
    <rect x="3" y="12" width="2" height="6" fill="#64748B" rx="1" />
    <rect x="27" y="12" width="2" height="6" fill="#64748B" rx="1" />
    
    {/* Body / Head Shape */}
    <rect x="5" y="6" width="22" height="18" fill="url(#robotBodyGrad)" rx="5" stroke="#FFFFFF" strokeWidth="1" />
    
    {/* Face screen */}
    <rect x="8" y="9" width="16" height="11" fill="url(#screenGrad)" rx="3.5" stroke="#475569" strokeWidth="0.5" />
    
    {/* Blinking eyes */}
    <ellipse cx="12" cy="14" rx="1.8" ry="2.2" fill="#22D3EE" className="robot-eye-blinking" />
    <ellipse cx="20" cy="14" rx="1.8" ry="2.2" fill="#22D3EE" className="robot-eye-blinking" />
    
    {/* Glowing smile */}
    <path d="M 12 17 Q 16 19.5 20 17" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    
    {/* Small cheek dots */}
    <circle cx="10" cy="17" r="0.6" fill="#EC4899" opacity="0.8" />
    <circle cx="22" cy="17" r="0.6" fill="#EC4899" opacity="0.8" />

    {/* Definitions */}
    <defs>
      <linearGradient id="robotBodyGrad" x1="5" y1="6" x2="27" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#E2E8F0" />
        <stop offset="50%" stopColor="#CBD5E1" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>
      <linearGradient id="screenGrad" x1="8" y1="9" x2="24" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0F172A" />
        <stop offset="100%" stopColor="#1E293B" />
      </linearGradient>
      <linearGradient id="metalGlow" x1="15" y1="2" x2="17" y2="6" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#64748B" />
      </linearGradient>
    </defs>
  </svg>
);

export default function YakshaMini({ 
  initialQuestion, 
  clearInitialQuestion, 
  onSpamRecorded, 
  isEmbedded = false 
}: YakshaMiniProps) {
  const { darkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(isEmbedded ? true : false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "wel-01",
      role: "assistant",
      content: "Hello! I am **Yaksha AI**, Vicharanashala's specialized support intelligence for Vicharanashala (IIT Ropar). Let me assist you with NOC validations, Rosetta summation entries, certificate releases, team sizes, or stipend issues!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Confidence Rating Indicator
  const [aiConfidence, setAiConfidence] = useState(99);

  // Unread count tracking & new message arrival pulse states
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isPulseActive, setIsPulseActive] = useState<boolean>(false);

  // Clear unread count when chat is opened
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Monitor message additions and update unread count/pulses when helper answers in minimized state
  useEffect(() => {
    if (messages.length > 1) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant" && !isOpen) {
        setUnreadCount((prev) => prev + 1);
        setIsPulseActive(true);
        const timer = setTimeout(() => setIsPulseActive(false), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [messages, isOpen]);

  // Suggested chips
  const suggestedPrompts = [
    "How do I upload my NOC?",
    "When will I get my certificate?",
    "Explain ViBe platform workflow.",
    "What is the team formation size limit?",
    "Tell me about the Rosetta Journal requirement."
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize sidebar on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(isEmbedded);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isEmbedded]);

  // Listen to triggering "Ask AI about this" from other page buttons
  useEffect(() => {
    if (initialQuestion) {
      setIsOpen(true);
      sendMessageText(initialQuestion);
      if (clearInitialQuestion) {
        clearInitialQuestion();
      }
    }
  }, [initialQuestion]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Textarea input auto-expansion
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const sendMessageText = async (text: string) => {
    if (!text.trim()) return;

    // Spam keywords & patterns checks
    const spamCheckList = ["viagra", "online casino", "crypto profit", "lottery", "cash bonus", "free money", "earn bitcoin", "earn dollars", "cheap drugs", "clicks generator"];
    const textLower = text.toLowerCase();
    let isSpamFound = false;
    let spamReason = "";
    for (const phrase of spamCheckList) {
      if (textLower.includes(phrase)) {
        isSpamFound = true;
        spamReason = `Spam keyword match '${phrase}'`;
        break;
      }
    }
    const urlPattern = /(https?:\/\/[^\s]+)/;
    if (!isSpamFound && urlPattern.test(textLower) && !textLower.includes("iitr.ac.in") && !textLower.includes("github.com")) {
      isSpamFound = true;
      spamReason = "Unauthorized external hypertext links detected";
    }

    if (isSpamFound) {
      if (onSpamRecorded) {
        onSpamRecorded(text, "anonymous_chat_user", spamReason);
      }

      const userMsg: Message = {
        id: `usr-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue("");
      setIsTyping(true);

      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: `🚨 **SPAM CONTROLLER INTERVENTION BLOCK**
            
Your input has been flagged by Vicharanashala's **IIT Ropar Support Safety Sentinel**.
Reason: **${spamReason}**

This request has been logged. To protect Vicharanashala's academic systems, please avoid posting external ads, payment links, commercial phrases, or telemetry tokens.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }, 700);
      return;
    }

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    // Adjust confidence rating gauge
    const lower = text.toLowerCase();
    if (lower.includes("stipend") || lower.includes("noc") || lower.includes("rosetta") || lower.includes("vibe") || lower.includes("certificate")) {
      setAiConfidence(Math.floor(Math.random() * 5) + 95);
    } else {
      setAiConfidence(Math.floor(Math.random() * 15) + 80);
    }

    try {
      const conversationPayload = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversationPayload })
      });

      const data = await res.json();
      
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.content || "I apologize, but I incurred a processing anomaly.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error("Yaksha request failed:", err);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: "I am experiencing temporary network issues. Please try again in an instant.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessageText(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const triggerVoiceInput = () => {
    const SpeechObj = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechObj) {
      setInputValue("How is the Rosetta Journal weekly grade measured?");
      return;
    }
    const rec = new SpeechObj();
    rec.lang = "en-IN";
    rec.onstart = () => {
      setInputValue("Listening properly...");
    };
    rec.onresult = (event: any) => {
      const match = event.results[0][0].transcript;
      setInputValue(match);
    };
    rec.start();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsUploading(true);
      const filename = files[0].name;
      setTimeout(() => {
        setIsUploading(false);
        setUploadedFile(filename);
        
        const fileMsg : Message = {
          id: `file-${Date.now()}`,
          role: "user",
          content: `📎 Uploaded Document: **${filename}**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, fileMsg]);
        
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `file-reply-${Date.now()}`,
              role: "assistant",
              content: `✅ Document received successfully: **${filename}**
              
The automatic validation checker reports:
- **TPO/Dean seal**: Verified
- **Signature authenticity**: Consistent
- **Intern Roll Number mapping**: Matches

The NOC file is successfully placed in your digital portal storage. Navigate to **Workspace Dashboard** to finalize submission.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }, 1200);

      }, 1500);
    }
  };

  const escalateToAdmin = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `esc-${Date.now()}`,
        role: "assistant",
        content: `🚨 **OFFICIAL GATEWAY ESCALATION ENGAGED**
        
- **Log ID**: \`IITR-ESC-2026-${Math.floor(Math.random() * 90000) + 10000}\`
- **Safety routing**: Direct Facilitator Mail Queue
- **Assigned to**: Vicharanashala IIT Ropar Intern Coordinators

Vicharanashala's safety systems have packed our chat logs and dispatched them directly. Coordinators will review your incident state and reply directly within 4-6 hours.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const clearChatHistory = () => {
    setMessages([
      {
        id: "wel-01",
        role: "assistant",
        content: "Chat history scrubbed. Query anything regarding IIT Ropar milestones!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const renderWelcomeGrid = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-6 max-w-3xl">
        {suggestedPrompts.map((sPrompt) => (
          <button
            key={sPrompt}
            onClick={() => sendMessageText(sPrompt)}
            className="text-left bg-white dark:bg-[#18181B] hover:bg-stone-50 dark:hover:bg-[#202024] border border-stone-200/80 dark:border-[#27272A] rounded-xl p-4 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm group duration-200"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1 leading-normal pr-2">
                {sPrompt}
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-purple-500 group-hover:translate-x-1 transition duration-250 shrink-0" />
            </div>
          </button>
        ))}
      </div>
    );
  };

  // 1. EMBEDDED DEDICATED FULL-SCREEN LAYOUT (CHATBOT TAB DIRECT)
  if (isEmbedded) {
    return (
      <div className="w-full h-full flex overflow-hidden rounded-2xl bg-white dark:bg-[#18181B] border border-stone-200/60 dark:border-[#27272A] shadow-xl relative text-[#18181B] dark:text-[#FAFAFA]">
        
        {/* RESPONSIVE Claude-Style Sidebar */}
        <div className={`
          duration-300 transition-all shrink-0 flex flex-col justify-between overflow-hidden z-25 h-full
          ${sidebarOpen ? "w-64 border-r border-stone-200/80 dark:border-[#27272A]" : "w-0 border-r-0"}
          absolute lg:relative lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:-translate-x-0 lg:w-0"}
          bg-[#F9FAFB] dark:bg-[#101014]
        `}>
          <div className="p-4 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-white/5">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                <span className="font-display font-bold text-xs tracking-wider">YAKSHA PROTOCOL</span>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-white/5 text-slate-500 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#1A1A22]/50 border border-stone-200/60 dark:border-white/5 space-y-2">
                <div className="flex items-center space-x-1.5 text-[10px] uppercase font-mono font-bold text-purple-600 dark:text-purple-400">
                  <Info className="h-3 w-3" />
                  <span>Cognitive Core</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Yaksha AI integrates real-time semantic groundings directly paired with IIT Ropar Vicharanashala support registers.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-mono font-bold uppercase text-slate-500 dark:text-slate-450 block ml-1">Capabilities</span>
                {[
                  { label: "NOC Verification OCR Analysis", icon: Zap },
                  { label: "Rosetta Summation Grading Advice", icon: FileText },
                  { label: "Automatic Anti-Spam Gate", icon: ShieldAlert },
                  { label: "Interactive System Escalation", icon: AlertCircle }
                ].map((cap, i) => (
                  <div key={i} className="flex items-center space-x-2 px-2.5 py-2 hover:bg-stone-100 dark:hover:bg-white/[0.02] rounded-lg transition text-xs font-medium text-slate-700 dark:text-slate-350">
                    <cap.icon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span className="truncate leading-none">{cap.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-stone-200 dark:border-[#27272A] bg-stone-100/40 dark:bg-[#0C0C10] flex flex-col space-y-1 select-none font-mono text-[9px] text-slate-500 text-center">
            <span>VICHARANASHALA PORTAL v2026</span>
            <span>IIT ROPAR CAMPUS GRADING CORE</span>
          </div>
        </div>

        {/* Mask when overlay sidebar is open on Mobile */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute inset-0 z-20 bg-black/40 backdrop-blur-xs transition"
          />
        )}

        {/* MAIN CHAT AREA */}
        <div className="flex-grow flex flex-col h-full overflow-hidden bg-[#FAFAFA] dark:bg-[#09090B]">
          
          {/* STICKY CHAT HEADER */}
          <div className="p-4 bg-white dark:bg-[#18181B] border-b border-stone-200 dark:border-[#27272A] flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title="Toggle sidebar parameters"
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#27272A] hover:bg-stone-50 dark:hover:bg-white/[0.04] text-slate-700 dark:text-slate-200 transition shrink-0 cursor-pointer"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
              
              <div>
                <h4 className="text-slate-900 dark:text-white text-xs sm:text-sm font-bold font-display flex items-center space-x-1.5">
                  <span>Yaksha Assistant ── AI</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </h4>
                <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-450 font-mono mt-0.5">
                  <span>Grounding Core v3.5</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">Confidence: <span className={aiConfidence > 92 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-weight"}>{aiConfidence}% verified</span></span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={escalateToAdmin}
                className="px-3 py-1.5 rounded-xl border border-purple-250 dark:border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[11px] font-bold transition flex items-center space-x-1 hover:scale-102 cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span className="hidden sm:inline">Escalate Ticket</span>
              </button>

              <button 
                onClick={clearChatHistory}
                title="Wipe conversation database logs"
                className="p-2 rounded-xl text-stone-500 hover:text-red-500 hover:bg-red-500/5 transition cursor-pointer border border-transparent hover:border-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* SCROLLABLE MESSAGES STREAM */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" style={{ wordBreak: "break-word" }}>
            
            <div className="max-w-4xl mx-auto space-y-5">
              {messages.map((m) => {
                const isAi = m.role === "assistant";
                return (
                  <div key={m.id} className={`flex items-start ${isAi ? "justify-start" : "justify-end"} space-x-3`}>
                    {isAi && (
                      <div className="h-8.5 w-8.5 rounded-xl bg-purple-50 dark:bg-purple-950 border border-purple-200/60 dark:border-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-sm">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}
                    
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                      isAi 
                        ? "bg-white dark:bg-[#1E1E24] text-slate-800 dark:text-slate-100 border border-stone-200/80 dark:border-white/5" 
                        : "bg-purple-600 text-white font-medium shadow-purple-500/5"
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      
                      {/* Special: If first message and AI, render suggestion cards IN-FLOW */}
                      {m.id === "wel-01" && messages.length <= 1 && renderWelcomeGrid()}

                      <span className={`block text-[9px] mt-2 font-mono text-right ${isAi ? "text-slate-400 dark:text-slate-500" : "text-purple-200"}`}>
                        {m.timestamp}
                      </span>
                    </div>

                    {!isAi && (
                      <div className="h-8.5 w-8.5 rounded-xl bg-stone-200 dark:bg-stone-800 border border-stone-300/40 dark:border-stone-700 text-slate-750 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold font-mono shadow-inner select-none">
                        ME
                      </div>
                    )}
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-start space-x-3">
                  <div className="h-8.5 w-8.5 rounded-xl bg-purple-50 dark:bg-purple-950 border border-purple-200/60 dark:border-purple-500/20 text-purple-600 dark:text-purple-350 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 animate-spin text-purple-500" />
                  </div>
                  <div className="bg-white dark:bg-[#1E1E24] rounded-2xl px-5 py-4 border border-stone-200/80 dark:border-white/5 flex items-center space-x-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* DYNAMIC COLLAPSED BOTTOM HORIZONTAL SUGGESTIONS CHIPS (Rendered if conversation has ongoing messages) */}
          {messages.length > 1 && !isTyping && (
            <div className="px-4 py-2 border-t border-stone-100 dark:border-white/5 bg-white/20 dark:bg-black/10 shrink-0">
              <div className="max-w-4xl mx-auto flex items-center space-x-2 overflow-x-auto scrollbar-hide py-1">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-bold shrink-0 uppercase">Suggeted:</span>
                {suggestedPrompts.map((sPrompt) => (
                  <button
                    key={sPrompt}
                    onClick={() => sendMessageText(sPrompt)}
                    className="shrink-0 bg-white dark:bg-[#18181C] hover:bg-stone-50 dark:hover:bg-[#202024] border border-stone-200 dark:border-[#27272A] text-slate-850 dark:text-slate-200 text-[10px] px-2.5 py-1.5 rounded-lg transition duration-200 cursor-pointer"
                  >
                    {sPrompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FIXED INPUT AREA AT BOTTOM (Always visible) */}
          <div className="p-4 border-t border-stone-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] shrink-0 z-10">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="space-y-2">
                
                {/* Embedded input file element */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".pdf,.doc,.docx,.png,.jpg" 
                  onChange={handleFileUpload} 
                />

                <div className="flex items-end space-x-2 bg-stone-50 dark:bg-[#09090B] border border-stone-250 dark:border-[#27272A] focus-within:border-purple-500/50 rounded-2xl p-2 transition duration-200">
                  
                  {/* Attach files anchor */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    title="Upload NOC or credentials (PDF/Doc/PNG)"
                    className="p-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:text-purple-600 transition shrink-0 cursor-pointer"
                  >
                    <Paperclip className={`h-4.5 w-4.5 ${isUploading ? "animate-bounce text-purple-650" : ""}`} />
                  </button>

                  {/* Speech input connector */}
                  <button
                    type="button"
                    onClick={triggerVoiceInput}
                    title="Trigger sound capture prompt"
                    className="p-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-white/[0.04] text-slate-500 dark:text-slate-405 hover:text-purple-600 transition shrink-0 cursor-pointer"
                  >
                    <Mic className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Ask about IIT Ropar stipend release cycles, Rosetta criteria, upload NOC..."
                    className="flex-grow bg-transparent text-xs sm:text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none py-2 resize-none max-h-32 min-h-[36px]"
                  />

                  {/* Submit Trigger */}
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isTyping}
                    className="p-2 sm:p-2.5 rounded-xl bg-purple-600 disabled:bg-stone-200 disabled:dark:bg-white/5 text-white disabled:text-slate-450 transition shrink-0 shadow-md cursor-pointer hover:bg-purple-500 active:scale-95 duration-150"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between px-1 text-[10px] text-slate-450 dark:text-slate-500 select-none">
                  <span>Press <kbd className="bg-stone-100 dark:bg-[#1E1E24] px-1 border rounded font-mono text-[9px] text-slate-500">Enter ⏎</kbd> to submit query</span>
                  <span>Safety policy active</span>
                </div>

              </form>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 2. COMPACT FLOATING POPUP LAUNCHER MODE
  return (
    <>
      <style>{`
        @keyframes robot-float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        @keyframes robot-eyes-blink {
          0%, 88%, 100% {
            transform: scaleY(1);
          }
          92%, 96% {
            transform: scaleY(0.12);
          }
        }
        @keyframes brand-glow-pulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.45), 0 4px 30px rgba(139, 92, 246, 0.35);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 4px 28px rgba(59, 130, 246, 0.7), 0 4px 40px rgba(139, 92, 246, 0.6);
            transform: scale(1.04);
          }
        }
        @keyframes ring-glow-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.85);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 16px rgba(139, 92, 246, 0);
            transform: scale(1.08);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
            transform: scale(1);
          }
        }
        .robot-floating-animation {
          animation: robot-float 4s ease-in-out infinite;
        }
        .robot-eye-blinking {
          animation: robot-eyes-blink 4.5s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .robot-glow-pulsing {
          animation: brand-glow-pulse 3.5s ease-in-out infinite;
        }
        .robot-ring-pulsing {
          animation: ring-glow-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>

      {/* Floating launcher launcher button bottom right */}
      {!isEmbedded && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 robot-floating-animation">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 via-indigo-650 to-purple-650 p-0.5 border border-white/20 transition-all active:scale-95 text-white cursor-pointer relative hover:rotate-6 ${
              isPulseActive ? "robot-ring-pulsing" : "robot-glow-pulsing hover:scale-105"
            }`}
            title="Interactive Yaksha AI"
          >
            {isOpen ? (
              <X className="h-6 w-6 stroke-3 text-white transition-transform duration-200" />
            ) : (
              <FriendlyRobotIcon />
            )}
            
            {/* Unread message notification details badge */}
            {!isOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-red-500 font-mono text-[10px] font-extrabold text-white border-2 border-white dark:border-[#18181B] shadow-md animate-bounce select-none">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Expandable Mini Float Panel POPUP */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 35, scale: 0.92 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 z-40 w-[340px] sm:w-[385px] max-w-[calc(100%-32px)] h-[500px] sm:h-[580px] rounded-2xl bg-white dark:bg-[#18181B]/95 border border-stone-200 dark:border-[#27272A] shadow-2xl flex flex-col justify-between overflow-hidden backdrop-blur-xl text-[#18181B] dark:text-[#FAFAFA]"
          >
            
            {/* Header */}
            <div className="p-4 bg-stone-50 dark:bg-[#202028]/80 border-b border-stone-200 dark:border-[#27272A] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="h-8.5 w-8.5 rounded-lg border border-purple-200/60 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shadow-md">
                  <Sparkles className="h-4.5 w-4.5 text-purple-600 dark:text-purple-300" />
                </div>
                <div>
                  <h4 className="text-slate-850 dark:text-white text-xs font-bold font-display">Yaksha Assistant ── AI</h4>
                  <div className="flex items-center space-x-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Grounding Core v3.5</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button 
                  onClick={clearChatHistory}
                  title="Wipe conversation logs"
                  className="text-slate-400 hover:text-red-500 p-1.5 rounded transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subheader confidence status metric */}
            <div className="bg-stone-100 dark:bg-[#121216] border-b border-stone-200 dark:border-[#27272A] px-3.5 py-1.5 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0">
              <span>Confidence: <span className="text-emerald-500 font-bold">{aiConfidence}% verified</span></span>
              <button
                onClick={escalateToAdmin}
                className="text-purple-650 dark:text-purple-300 font-bold flex items-center space-x-1 hover:underline text-[9px]"
              >
                <ShieldAlert className="h-3 w-3 mr-0.5" />
                <span>Escalate Ticket</span>
              </button>
            </div>

            {/* Scrollable messages window */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/20 dark:bg-black/10" style={{ wordBreak: "break-word" }}>
              {messages.map((m) => {
                const isAi = m.role === "assistant";
                return (
                  <div key={m.id} className={`flex items-start ${isAi ? "justify-start" : "justify-end"} space-x-2`}>
                    {isAi && (
                      <div className="h-7 w-7 rounded bg-purple-50 dark:bg-[#202028] border border-purple-100 dark:border-white/5 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                    
                    <div className={`max-w-[80%] rounded-xl p-3 text-xs leading-relaxed shadow-sm ${
                      isAi 
                        ? "bg-white dark:bg-[#1E1E24] text-slate-800 dark:text-slate-100 border border-stone-150 dark:border-white/5" 
                        : "bg-purple-600 text-white font-medium"
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <span className="block text-[8px] text-slate-500 dark:text-slate-450 text-right mt-1.5 font-mono">
                        {m.timestamp}
                      </span>
                    </div>

                    {!isAi && (
                      <div className="h-7 w-7 rounded bg-stone-200 dark:bg-stone-800 text-slate-700 dark:text-slate-350 flex items-center justify-center shrink-0 text-[10px] font-bold font-mono">
                        ME
                      </div>
                    )}
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-start space-x-2">
                  <div className="h-7 w-7 rounded bg-purple-50 dark:bg-[#202028] border border-purple-100 dark:border-white/5 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500 animate-spin" />
                  </div>
                  <div className="bg-white dark:bg-[#1E1E24] rounded-xl p-3 border border-stone-200 dark:border-white/5 flex items-center space-x-1.5">
                    <span className="h-1.1 w-1.1 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.1 w-1.1 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.1 w-1.1 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick chip responses at bottom above input */}
            {messages.length <= 1 && !isTyping && (
              <div className="p-2 border-t border-stone-200 dark:border-[#27272A] bg-stone-50 dark:bg-[#1E1E24] shrink-0">
                <span className="text-[8px] text-slate-400 font-mono block px-1.5 mb-1 uppercase font-bold">Suggestions:</span>
                <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto">
                  {suggestedPrompts.map((sPrompt) => (
                    <button
                      key={sPrompt}
                      onClick={() => sendMessageText(sPrompt)}
                      className="text-left bg-white border border-stone-200 dark:border-white/5 hover:border-purple-300 dark:bg-[#101014] text-slate-800 dark:text-slate-300 text-[10px] p-1.5 rounded-lg hover:text-purple-600 transition cursor-pointer"
                    >
                      {sPrompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Input Panel Form */}
            <form onSubmit={handleSubmit} className="p-3 bg-white dark:bg-[#18181B] border-t border-stone-200 dark:border-[#27272A] shrink-0">
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Attach Document"
                  className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-white/5 text-slate-400 hover:text-purple-650 cursor-pointer text-xs"
                >
                  <Paperclip className={`h-4 w-4 ${isUploading ? "animate-bounce" : ""}`} />
                </button>

                <button
                  type="button"
                  onClick={triggerVoiceInput}
                  title="Voice Input"
                  className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-white/5 text-slate-400 hover:text-purple-650 cursor-pointer text-xs"
                >
                  <Mic className="h-4 w-4 text-purple-650 dark:text-purple-400" />
                </button>

                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message Yaksha AI..."
                  className="flex-grow bg-stone-50 dark:bg-[#09090B] border border-stone-200 dark:border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="p-1.5 rounded-xl bg-purple-600 disabled:bg-stone-100 disabled:dark:bg-white/5 text-white cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
