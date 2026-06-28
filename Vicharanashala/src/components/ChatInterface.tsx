import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import YakshaAvatar from './YakshaAvatar.js';
import { Send, Sparkles, HelpCircle, MessageSquareWarning } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'yaksha';
  text: string;
  timestamp: Date;
  citations?: string[];
}

interface ChatInterfaceProps {
  initialQuestion?: string;
  clearInitialQuestion?: () => void;
  onSelectCitation?: (faqId: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  initialQuestion = '', 
  clearInitialQuestion,
  onSelectCitation
}) => {
  const { user, triggerActivity } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'yaksha',
      text: 'Greetings, seeker. I am Yaksha, the AI oracle of Vicharanashala at IIT Ropar. Speak your query regarding NOC compliance, Rosetta logs, stipend allocations, or team sprint configurations. I shall shed light on the truths you seek.',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickChips = [
    { label: "NOC deadline?", query: "What is the NOC submission deadline and requirements?" },
    { label: "Stipend rules?", query: "Is this internship paid and what are the stipend rules?" },
    { label: "Rosetta Journal?", query: "What is the Rosetta Journal requirement?" },
    { label: "ViBe access?", query: "How do I gain developer access to the ViBe platform?" },
    { label: "Team size?", query: "What is the team size limit and team formation rules?" }
  ];

  // Handle external redirect queries (from FAQ cards)
  useEffect(() => {
    if (initialQuestion) {
      setInputValue(initialQuestion);
      if (clearInitialQuestion) clearInitialQuestion();
    }
  }, [initialQuestion]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    if (!user) {
      setChatError('You must authenticate (Enter Portal) to consult Yaksha AI.');
      return;
    }

    setChatError(null);
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      
      let replyText = '';
      let citations: string[] = [];
      if (res.ok) {
        const data = await res.json();
        replyText = data.response;
        citations = data.citations || [];
      } else {
        replyText = getLocalMysticalResponse(text);
        citations = extractMockCitations(text);
      }

      setIsThinking(false);
      setIsResponding(true);

      const yakshaMsg: Message = {
        id: `yaksha-${Date.now()}`,
        sender: 'yaksha',
        text: replyText,
        timestamp: new Date(),
        citations
      };

      setMessages(prev => [...prev, yakshaMsg]);
      
      // Award +10 SP for asking Yaksha
      await triggerActivity('Ask Yaksha');

      setTimeout(() => {
        setIsResponding(false);
      }, 3000);

    } catch (err: any) {
      console.warn('Backend chat API offline, calling local oracle response:', err);
      setIsThinking(false);
      setIsResponding(true);
      
      const localReply = getLocalMysticalResponse(text);
      const mockCitations = extractMockCitations(text);
      const yakshaMsg: Message = {
        id: `yaksha-${Date.now()}`,
        sender: 'yaksha',
        text: localReply,
        timestamp: new Date(),
        citations: mockCitations
      };

      setMessages(prev => [...prev, yakshaMsg]);
      await triggerActivity('Ask Yaksha');

      setTimeout(() => {
        setIsResponding(false);
      }, 3000);
    }
  };

  const extractMockCitations = (queryText: string): string[] => {
    const q = queryText.toLowerCase();
    const matched: string[] = [];
    if (q.includes('noc')) matched.push('FAQ-005');
    if (q.includes('stipend') || q.includes('paid')) matched.push('FAQ-002');
    if (q.includes('rosetta') || q.includes('journal') || q.includes('log')) matched.push('FAQ-012');
    if (q.includes('vibe') || q.includes('platform')) matched.push('FAQ-011', 'FAQ-018');
    if (q.includes('team') || q.includes('size')) matched.push('FAQ-013');
    if (q.includes('participation') || q.includes('zoom') || q.includes('quiz')) matched.push('FAQ-017');
    if (q.includes('interview') || q.includes('evaluation')) matched.push('FAQ-014');
    
    if (matched.length === 0) matched.push('FAQ-001', 'FAQ-010');
    return matched;
  };

  const getLocalMysticalResponse = (query: string): string => {
    const q = query.toLowerCase();
    if (q.includes('noc') || q.includes('objection')) {
      return "Greetings, Seeker. The cosmic guidelines are clear: No Objection Certificates (NOC) must be signed by your college Dean or Training and Placement Officer (TPO) and uploaded via your dashboard by June 10, 2026. A missing NOC blocks the flow of your stipend.";
    }
    if (q.includes('stipend') || q.includes('paid') || q.includes('money')) {
      return "Ah, the temporal energy rewards. Yes, Vicharanashala offers a monthly stipend. Yet, it requires satisfactory milestone evaluations, weekly Rosetta Journal sign-offs, and compliance with the rolling 5-day attendance thresholds.";
    }
    if (q.includes('rosetta') || q.includes('journal') || q.includes('log')) {
      return "The Rosetta Journal is your engineering diary. Record your code commits, milestones, and challenges. Submit it every Saturday by 11:59 PM on the ViBe workspace. It is evaluated directly by your PhD mentors.";
    }
    if (q.includes('vibe') || q.includes('platform')) {
      return "The Vicharanashala Board & Ecosystem (ViBe) is our central workspace. It is restricted to desktop and laptop computers. If you cannot log in, clear your browser cookies and flush your local DNS cache.";
    }
    if (q.includes('team') || q.includes('size') || q.includes('group')) {
      return "Collaboration is the cornerstone. Teams are comprised of 3 to 5 interns. All team communications must occur on Slack or via official emails. WhatsApp groups for Vicharanashala are strictly prohibited.";
    }
    if (q.includes('participation') || q.includes('zoom') || q.includes('quiz')) {
      return "Attend at least 85% of Zoom sessions, answer 85% of polls, and score at least 50% on all quizzes. These conditions are evaluated rolling over the last 5 days. Keep your focus high.";
    }
    return "Greetings, Seeker. The oracle's chamber hums with quiet energy. Your query matches no direct entry, yet the knowledge constellations indicate you can find the truth inside the 3D FAQ Knowledge Graph nodes below.";
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch min-h-[580px]">
      
      {/* Left Column: 3D Entity Core Display */}
      <div className="lg:col-span-4 bg-slate-950/60 rounded-2xl border border-slate-900 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-4 left-4 flex items-center gap-1.5 text-[#06B6D4] font-mono text-[10px] tracking-widest uppercase font-bold">
          <Sparkles size={12} className="animate-spin" />
          <span>Yaksha Core V2.6</span>
        </div>

        <YakshaAvatar isThinking={isThinking} isResponding={isResponding} className="w-64 h-64" />

        <div className="mt-4 space-y-1 z-10">
          <h3 className="font-display font-extrabold text-white text-base tracking-wide">Yaksha AI</h3>
          <p className="text-slate-400 text-xs font-sans max-w-xs">
            {isThinking 
              ? 'Deciphering the scrolls of Vicharanashala...' 
              : isResponding 
                ? 'Relaying celestial system specifications...' 
                : 'Awaiting candidate query inputs...'}
          </p>
        </div>
      </div>

      {/* Right Column: Chat Console */}
      <div className="lg:col-span-8 bg-[#07071c]/90 rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden shadow-2xl">
        
        {/* Chips header */}
        <div className="px-5 py-3 border-b border-slate-900 bg-slate-950/50">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 mb-2">
            <HelpCircle size={12} className="text-[#06B6D4]" />
            Consult Quick Inquiries
          </span>
          <div className="flex flex-wrap gap-2">
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(chip.query)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-[#7C3AED]/15 hover:text-cyan-400 text-[10px] font-semibold text-slate-350 border border-slate-850 hover:border-[#06B6D4]/30 transition-all whitespace-nowrap cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Logs Scroll Area */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[380px] scrollbar-thin scrollbar-thumb-slate-900 scrollbar-track-transparent">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div 
                key={m.id} 
                className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                {/* Avatar Icon placeholder */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[10px] border shadow-md flex-shrink-0 ${
                  isUser 
                    ? 'bg-gradient-to-br from-[#7C3AED] to-violet-800 border-violet-800 text-white' 
                    : 'bg-slate-900 border-[#06B6D4]/30 text-[#06B6D4]'
                }`}>
                  {isUser ? 'U' : 'Y'}
                </div>

                {/* Message Body */}
                <div className="space-y-1">
                  <div className={`p-3.5 rounded-2xl text-xs leading-relaxed font-sans ${
                    isUser 
                      ? 'bg-violet-950/40 text-slate-100 rounded-tr-none border border-violet-900/40' 
                      : 'bg-slate-950/80 text-slate-200 rounded-tl-none border border-slate-900'
                  }`}>
                    {m.text}
                  </div>
                  {!isUser && m.citations && m.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center pt-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider mr-1">Sources:</span>
                      {m.citations.map((citeId) => (
                        <button
                          key={citeId}
                          onClick={() => onSelectCitation?.(citeId)}
                          className="px-1.5 py-0.5 rounded bg-slate-900/80 hover:bg-[#7C3AED]/20 border border-slate-800 hover:border-cyan-400/40 text-[9px] font-mono text-cyan-400 font-bold hover:text-cyan-300 transition-all cursor-pointer"
                          title="View on 3D Knowledge Graph"
                        >
                          {citeId}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className={`text-[9px] text-slate-500 font-mono block ${isUser ? 'text-right' : ''}`}>
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isThinking && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-900 border-[#06B6D4]/30 text-[#06B6D4] font-bold text-[10px] shadow-md">
                Y
              </div>
              <div className="bg-slate-950/80 border border-slate-900 p-3.5 rounded-2xl rounded-tl-none flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar & Error Warnings */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 space-y-3">
          {chatError && (
            <div className="bg-red-950/20 border border-red-900/35 text-red-400 p-2.5 rounded-lg text-xs flex items-center gap-2 font-sans">
              <MessageSquareWarning size={14} className="flex-shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isThinking}
              placeholder={user ? "Ask Yaksha about NOC deadlines, stipend rules, Rosetta..." : "Authenticate via header to chat..."}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none transition-all font-sans"
            />
            <button
              type="submit"
              disabled={isThinking || !inputValue.trim()}
              className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white p-2.5 rounded-lg hover:brightness-110 shadow-lg shadow-cyan-950/30 transition-all flex items-center justify-center cursor-pointer disabled:brightness-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </form>

          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
            <span>Rate Limited: 15 queries/minute</span>
            <span>XP Reward: +10 SP / consultation</span>
          </div>
        </div>

      </div>

    </div>
  );
};

export default ChatInterface;
