import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.js';
import TopNavbar from './components/TopNavbar.js';
import ThreeScene from './components/ThreeScene.js';
import YakshaAvatar from './components/YakshaAvatar.js';
import KnowledgeGraph from './components/KnowledgeGraph.js';
import FAQCard from './components/FAQCard.js';
import ChatInterface from './components/ChatInterface.js';
import SpurtiDashboard from './components/SpurtiDashboard.js';
import VoicePortal from './components/VoicePortal.js';
import AdminPanel from './components/AdminPanel.js';
import { FAQItem } from './data/faqs.js';
import { Sparkles, ArrowRight, HelpCircle, MessageSquare, BookOpen, UserPlus } from 'lucide-react';

export function App() {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('home');
  
  // Cross-component redirection states
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(null);
  const [chatPreFill, setChatPreFill] = useState<string>('');

  // Suggestions state
  const [suggestQuestion, setSuggestQuestion] = useState('');
  const [suggestAnswer, setSuggestAnswer] = useState('');
  const [suggestStatus, setSuggestStatus] = useState<string | null>(null);

  const handleAskYakshaRedirect = (questionText: string) => {
    setChatPreFill(questionText);
    setCurrentTab('chat');
  };

  const handleSelectFaqFromGraph = (faq: FAQItem) => {
    setSelectedFaqId(faq.id);
  };

  const handleSelectCitation = (faqId: string) => {
    setSelectedFaqId(faqId);
    setCurrentTab('faqs');
    setTimeout(() => {
      const container = document.getElementById('faqs-container');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleSuggestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestQuestion || !suggestAnswer) return;

    try {
      const res = await fetch('/api/faqs/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: suggestQuestion, answer: suggestAnswer }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestStatus('Suggestion submitted to moderation queue! You will receive points (+50 SP) once verified.');
        setSuggestQuestion('');
        setSuggestAnswer('');
      } else {
        setSuggestStatus(`Error: ${data.error}`);
      }
    } catch (e) {
      setSuggestStatus('Failed to submit suggestion.');
    }
  };

  return (
    <div className="relative min-h-screen z-10 flex flex-col">
      {/* 3D Drifting Particle Field Background */}
      <ThreeScene />

      {/* Navigation Header */}
      <TopNavbar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative">
        
        {/* ================= 1. HOME / LANDING TAB ================= */}
        {currentTab === 'home' && (
          <div className="space-y-16 py-8">
            
            {/* Hero Section */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: Heading */}
              <div className="md:col-span-7 space-y-6 text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/35 text-[#06B6D4] text-[10px] font-mono tracking-widest uppercase font-bold">
                  <Sparkles size={12} className="animate-pulse" />
                  <span>Vicharanashala Summer 2026</span>
                </div>

                <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-none">
                  New to <span className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">Vicharanashala</span>?<br />
                  Yaksha Knows Everything.
                </h1>

                <p className="text-slate-450 text-sm max-w-lg leading-relaxed font-sans">
                  Enter the oracle's chamber. Access instant, context-aware answers concerning academic regulations, NOC procedures, Rosetta logs, team allocations, and evaluation milestones.
                </p>

                <div className="flex flex-wrap gap-4 pt-2">
                  <button
                    onClick={() => setCurrentTab('faqs')}
                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] hover:brightness-110 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-950/40 flex items-center gap-2 cursor-pointer"
                  >
                    <span>Consult Database</span>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentTab('chat')}
                    className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 text-xs font-bold tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Ask Yaksha AI
                  </button>
                </div>
              </div>

              {/* Right Column: Hero Floating geometric avatar */}
              <div className="md:col-span-5 flex justify-center">
                <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-3xl backdrop-blur-md shadow-2xl">
                  <YakshaAvatar isThinking={false} isResponding={false} className="w-80 h-80" />
                </div>
              </div>

            </div>

            {/* Glowing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
              
              <div 
                onClick={() => setCurrentTab('faqs')}
                className="bg-[#07071c]/90 border border-slate-850 rounded-2xl p-6 hover:border-[#7C3AED]/50 transition-all cursor-pointer shadow-lg hover:shadow-violet-950/15 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#7C3AED]/5 blur-3xl rounded-full" />
                <BookOpen className="text-[#7C3AED] mb-4" size={28} />
                <h3 className="font-display text-base font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">Explore FAQs</h3>
                <p className="text-slate-450 text-xs font-sans leading-relaxed">
                  Browse our structured knowledge clusters and interact with the 3D FAQ Knowledge Graph nodes.
                </p>
              </div>

              <div 
                onClick={() => setCurrentTab('chat')}
                className="bg-[#07071c]/90 border border-slate-850 rounded-2xl p-6 hover:border-[#06B6D4]/50 transition-all cursor-pointer shadow-lg hover:shadow-cyan-950/15 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#06B6D4]/5 blur-3xl rounded-full" />
                <MessageSquare className="text-[#06B6D4] mb-4" size={28} />
                <h3 className="font-display text-base font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">Ask Yaksha AI</h3>
                <p className="text-slate-450 text-xs font-sans leading-relaxed">
                  Engage in an immersive context-rich conversation with the Yaksha AI of IIT Ropar.
                </p>
              </div>

              <div 
                onClick={() => setCurrentTab('faqs')}
                className="bg-[#07071c]/90 border border-slate-850 rounded-2xl p-6 hover:border-[#F43F5E]/50 transition-all cursor-pointer shadow-lg hover:shadow-rose-950/15 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#F43F5E]/5 blur-3xl rounded-full" />
                <HelpCircle className="text-rose-500 mb-4" size={28} />
                <h3 className="font-display text-base font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">Browse by Topic</h3>
                <p className="text-slate-450 text-xs font-sans leading-relaxed">
                  Filter questions by domain directories like NOC documents, Rosetta logs, and ViBe platform access.
                </p>
              </div>

            </div>

          </div>
        )}

        {/* ================= 2. FAQ EXPLORER TAB ================= */}
        {currentTab === 'faqs' && (
          <div id="faqs-container" className="space-y-10 py-4">
            <div>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">FAQ Knowledge Network</h2>
              <p className="text-xs text-slate-450 mt-0.5">Interact with the 3D FAQ constellation nodes or search the catalog below</p>
            </div>

            {/* 3D Knowledge Graph Constellation */}
            <KnowledgeGraph onSelectFAQ={handleSelectFaqFromGraph} focusFaqId={selectedFaqId} />

            {/* Searchable Listing fallback */}
            <FAQCard 
              selectedFaqId={selectedFaqId} 
              clearSelectedFaq={() => setSelectedFaqId(null)}
              onAskYaksha={handleAskYakshaRedirect} 
            />

            {/* Community Answer Submission Form */}
            <div className="bg-[#07071c]/80 rounded-2xl border border-slate-850 p-6 max-w-2xl mx-auto space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="text-[#06B6D4]" size={20} />
                <h3 className="font-display text-sm font-extrabold text-white">Submit Community FAQ</h3>
              </div>
              <p className="text-slate-400 text-xs">
                Have a recurring question or a verified tip that should be officially documented? Suggest it here. Approvals reward you with <span className="text-cyan-400 font-mono font-bold">+50 SP</span>.
              </p>

              {suggestStatus && (
                <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/35 text-[#06B6D4] p-3 rounded-lg text-xs font-medium">
                  {suggestStatus}
                </div>
              )}

              {user ? (
                <form onSubmit={handleSuggestSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Question</label>
                    <input
                      type="text"
                      value={suggestQuestion}
                      onChange={(e) => setSuggestQuestion(e.target.value)}
                      required
                      placeholder="e.g. Is there a Slack channel for daily standups?"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Proposed Answer</label>
                    <textarea
                      value={suggestAnswer}
                      onChange={(e) => setSuggestAnswer(e.target.value)}
                      required
                      rows={3}
                      placeholder="Provide a clear, accurate response..."
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-[#06B6D4]/15 border border-[#06B6D4]/30 text-[#06B6D4] hover:brightness-110 font-bold px-4 py-2 rounded text-[10px] tracking-wider uppercase cursor-pointer transition-all"
                  >
                    Submit Suggestion
                  </button>
                </form>
              ) : (
                <div className="bg-slate-950/80 border border-slate-900/60 p-4 rounded-xl text-center text-slate-500 text-xs">
                  Please log in (Enter Portal) to suggest FAQs for the queue.
                </div>
              )}
            </div>

          </div>
        )}

        {/* ================= 3. YAKSHA AI CHAT TAB ================= */}
        {currentTab === 'chat' && (
          <div className="py-4 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">Yaksha AI Chamber</h2>
              <p className="text-xs text-slate-450 mt-0.5">Consult Yaksha regarding Vicharanashala specifications and logs</p>
            </div>
            <ChatInterface 
              initialQuestion={chatPreFill} 
              clearInitialQuestion={() => setChatPreFill('')} 
              onSelectCitation={handleSelectCitation}
            />
          </div>
        )}

        {/* ================= 4. VOICE PORTAL TAB ================= */}
        {currentTab === 'voice' && (
          <div className="py-4 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">Speech Synthesizer Console</h2>
              <p className="text-xs text-slate-450 mt-0.5">Voice-to-text queries with live waveform responses</p>
            </div>
            <VoicePortal />
          </div>
        )}

        {/* ================= 5. SPURTI GAMIFICATION TAB ================= */}
        {currentTab === 'spurti' && (
          <div className="py-4 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">Spurti Contribution Hub</h2>
              <p className="text-xs text-slate-450 mt-0.5">Track your rank, claims, streaks, and view leadership standings</p>
            </div>
            <SpurtiDashboard />
          </div>
        )}

        {/* ================= 6. ADMIN Council TAB ================= */}
        {currentTab === 'admin' && (
          <div className="py-4 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">Council chamber</h2>
              <p className="text-xs text-slate-450 mt-0.5">System aggregates, cataloging, and submission moderation queue</p>
            </div>
            <AdminPanel />
          </div>
        )}

      </main>

      {/* Footer banner */}
      <footer className="bg-slate-950/40 border-t border-slate-900 py-6 text-center text-[10px] text-slate-500 font-mono tracking-widest uppercase z-10 relative">
        <span>Built by Vicharanshala interns for Vicharanashala Summer 2026 • IIT Ropar</span>
      </footer>
    </div>
  );
}

export default App;
