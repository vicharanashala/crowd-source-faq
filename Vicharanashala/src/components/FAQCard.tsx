import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Search, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Bookmark, MessageSquare, Calendar } from 'lucide-react';
import { FAQItem, CATEGORIES, faqData } from '../data/faqs.js';

interface FAQCardProps {
  initialSearch?: string;
  selectedFaqId?: string | null;
  clearSelectedFaq?: () => void;
  onAskYaksha: (question: string) => void;
}

export const FAQCard: React.FC<FAQCardProps> = ({ 
  initialSearch = '', 
  selectedFaqId = null, 
  clearSelectedFaq, 
  onAskYaksha 
}) => {
  const { user, triggerActivity } = useAuth();
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [userBookmarks, setUserBookmarks] = useState<Record<string, boolean>>({});

  // Load FAQs from API
  const loadFaqs = async () => {
    try {
      const res = await fetch('/api/faqs');
      if (res.ok) {
        const data = await res.json();
        setFaqs(data);
      } else {
        setFaqs(faqData);
      }
    } catch (e) {
      console.warn('Error fetching FAQs, falling back to local dataset:', e);
      setFaqs(faqData);
    }
  };

  // Check bookmarks if user is authenticated
  const checkUserBookmarks = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/user/bookmarks');
      if (res.ok) {
        const data: FAQItem[] = await res.json();
        const bookmarksMap = data.reduce((acc, item) => {
          acc[item.id] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setUserBookmarks(bookmarksMap);
      }
    } catch (e) {
      console.error('Error checking user bookmarks:', e);
    }
  };

  useEffect(() => {
    loadFaqs();
  }, []);

  useEffect(() => {
    checkUserBookmarks();
  }, [user]);

  // Sync external selections (e.g. from 3D Knowledge Graph)
  useEffect(() => {
    if (selectedFaqId) {
      setExpandedId(selectedFaqId);
      // Trigger Read activity for XP reward
      triggerActivity('Read FAQ', selectedFaqId);

      // Scroll to listing
      const el = document.getElementById(`faq-card-${selectedFaqId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedFaqId]);

  const handleToggleExpand = (faqId: string) => {
    if (expandedId === faqId) {
      setExpandedId(null);
      if (clearSelectedFaq) clearSelectedFaq();
    } else {
      setExpandedId(faqId);
      // Award points for reading the FAQ
      triggerActivity('Read FAQ', faqId);
    }
  };

  const handleVote = async (faqId: string, type: 'upvote' | 'downvote') => {
    if (!user) {
      alert('Please log in to vote on FAQs and earn Spurti Points.');
      return;
    }
    // Prevent double voting in current session
    if (userVotes[faqId]) return;

    try {
      const res = await fetch(`/api/faqs/${faqId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = await res.json();
        setFaqs(prev => prev.map(f => f.id === faqId ? { 
          ...f, 
          upvotes: data.upvotes, 
          downvotes: data.downvotes, 
          popularity: data.popularity 
        } : f));
        
        setUserVotes(prev => ({ ...prev, [faqId]: type === 'upvote' ? 'up' : 'down' }));
        // Log XP update if upvoted
        if (type === 'upvote') {
          triggerActivity('Vote logged'); // runs auth states updates
        }
      }
    } catch (e) {
      console.error('Vote failed:', e);
    }
  };

  const handleBookmarkToggle = async (faqId: string) => {
    if (!user) {
      alert('Please log in to bookmark FAQs and earn Spurti Points.');
      return;
    }

    try {
      const res = await fetch(`/api/faqs/${faqId}/bookmark`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setUserBookmarks(prev => ({ ...prev, [faqId]: data.bookmarked }));
        triggerActivity('Bookmark updated');
      }
    } catch (e) {
      console.error('Bookmark toggle failed:', e);
    }
  };

  // Search and Category filters
  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          faq.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      
      {/* Search and Filters Layout */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-[#07071c] p-4 rounded-xl border border-slate-800/80">
        
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search FAQs, tags, or responses..."
            className="w-full bg-slate-950/80 border border-slate-800/60 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]/40 transition-all font-sans"
          />
        </div>

        {/* Category Dropdown/Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Filter:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full md:w-56 bg-slate-950/80 border border-slate-800/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-[#7C3AED] focus:outline-none"
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Pills List */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-300 whitespace-nowrap ${
            selectedCategory === 'All'
              ? 'bg-[#7C3AED] text-white shadow-md shadow-violet-500/25'
              : 'bg-slate-900/60 text-slate-400 border border-slate-850 hover:text-slate-200'
          }`}
        >
          All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-300 whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white shadow-md shadow-cyan-900/30'
                : 'bg-slate-900/60 text-slate-400 border border-slate-850 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQs Cards Listing */}
      <div className="space-y-4">
        {filteredFaqs.length === 0 ? (
          <div className="text-center py-16 bg-[#07071c] border border-slate-850 rounded-2xl">
            <p className="text-slate-500 text-sm">No FAQs match your search parameters.</p>
            <button 
              onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }} 
              className="mt-3 text-xs text-[#06B6D4] font-semibold hover:underline"
            >
              Reset Search & Filters
            </button>
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isExpanded = expandedId === faq.id;
            const hasUpvoted = userVotes[faq.id] === 'up';
            const hasDownvoted = userVotes[faq.id] === 'down';
            const isBookmarked = !!userBookmarks[faq.id];

            // Normalize popularity percentage for score bar
            const popularityPercent = Math.min(100, Math.max(5, Math.round((faq.popularity / 1000) * 100)));

            return (
              <div
                key={faq.id}
                id={`faq-card-${faq.id}`}
                className={`bg-[#07071c]/90 rounded-xl border transition-all duration-350 overflow-hidden relative ${
                  isExpanded
                    ? 'border-[#7C3AED]/50 shadow-lg shadow-violet-950/20'
                    : 'border-slate-850 hover:border-slate-700/60'
                }`}
              >
                {/* Expand Header Button */}
                <div
                  onClick={() => handleToggleExpand(faq.id)}
                  className="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-900/10 transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/30">
                        {faq.category}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {faq.id}
                      </span>
                      {!faq.isOfficial && (
                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">
                          Community Verified
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100 font-sans leading-snug group-hover:text-white">
                      {faq.question}
                    </h4>
                  </div>
                  
                  <div className="text-slate-500 mt-1">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded Card Drawer */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-900 bg-slate-950/40 space-y-4">
                    {/* Q&A Text */}
                    <div className="space-y-2.5">
                      <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Yaksha AI Response</h5>
                      <p className="text-slate-300 text-xs leading-relaxed font-sans whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>

                    {/* Popularity Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                        <span>FAQ Popularity Index</span>
                        <span className="text-cyan-400">{faq.popularity} Rating</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] h-full rounded-full transition-all duration-500"
                          style={{ width: `${popularityPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {faq.tags.map(tag => (
                        <span 
                          key={tag} 
                          onClick={(e) => { e.stopPropagation(); setSearchTerm(tag); }}
                          className="text-[9px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-850 hover:border-[#7C3AED]/50 hover:text-white cursor-pointer transition-colors"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Bottom Actions Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-900">
                      
                      {/* Voting Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleVote(faq.id, 'upvote')}
                          disabled={hasUpvoted || hasDownvoted}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase transition-colors ${
                            hasUpvoted
                              ? 'bg-emerald-950/20 border-emerald-800 text-emerald-400'
                              : 'bg-slate-900/60 border-slate-850 text-slate-400 hover:text-white'
                          }`}
                        >
                          <ThumbsUp size={12} />
                          <span>{faq.upvotes}</span>
                        </button>
                        <button
                          onClick={() => handleVote(faq.id, 'downvote')}
                          disabled={hasUpvoted || hasDownvoted}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase transition-colors ${
                            hasDownvoted
                              ? 'bg-rose-950/20 border-rose-800 text-rose-400'
                              : 'bg-slate-900/60 border-slate-850 text-slate-400 hover:text-white'
                          }`}
                        >
                          <ThumbsDown size={12} />
                          <span>{faq.downvotes}</span>
                        </button>
                      </div>

                      {/* Utility & Redirects */}
                      <div className="flex items-center gap-2">
                        {/* Bookmark Button */}
                        <button
                          onClick={() => handleBookmarkToggle(faq.id)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase transition-colors ${
                            isBookmarked
                              ? 'bg-amber-950/20 border-amber-800 text-amber-400'
                              : 'bg-slate-900/60 border-slate-850 text-slate-400 hover:text-white'
                          }`}
                          title="Bookmark FAQ"
                        >
                          <Bookmark size={12} className={isBookmarked ? 'fill-amber-400' : ''} />
                          <span>{isBookmarked ? 'Saved' : 'Save'}</span>
                        </button>

                        {/* Ask Yaksha redirect */}
                        <button
                          onClick={() => onAskYaksha(faq.question)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED]/20 to-[#06B6D4]/20 border border-[#06B6D4]/30 text-[#06B6D4] hover:brightness-110 text-[10px] font-bold tracking-wider uppercase transition-all"
                        >
                          <MessageSquare size={12} />
                          <span>Query Yaksha</span>
                        </button>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default FAQCard;
