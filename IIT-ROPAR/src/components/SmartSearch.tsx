import React, { useState, useEffect } from "react";
import { Search, Mic, TrendingUp, History, CornerDownLeft, Sparkles, BookOpen, Clock, X } from "lucide-react";
import { faqData as staticFaq, CATEGORIES, FAQItem } from "../data/faqs.js";

interface SmartSearchProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelectFAQ: (id: string) => void;
  onTriggerVoice: () => void;
  faqs?: FAQItem[];
}

export default function SmartSearch({ searchTerm, setSearchTerm, onSelectFAQ, onTriggerVoice, faqs = staticFaq }: SmartSearchProps) {
  const [suggestions, setSuggestions] = useState<FAQItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    "Rosetta logs template", 
    "How to submit NOC", 
    "IIT Ropar hostel allocation"
  ]);
  const [showDropdown, setShowDropdown] = useState(false);

  const trendingQueries = [
    "NOC upload deadlines",
    "ViBe portal passcode error",
    "Stipend status 2026",
    "Rosetta grading rubric"
  ];

  // Dynamic filter for matching suggestions
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSuggestions([]);
      return;
    }

    const term = searchTerm.toLowerCase();
    const matches = faqs.filter((item) => {
      return (
        item.question.toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        item.category.toLowerCase().includes(term)
      );
    });

    setSuggestions(matches.slice(0, 5)); // Limit to top 5 results
  }, [searchTerm, faqs]);

  const handleSearchCommit = (text: string) => {
    if (!text.trim()) return;
    setSearchTerm(text);
    setShowDropdown(false);
    
    // Append to simple unique history tracker
    if (!recentSearches.includes(text)) {
      setRecentSearches((prev) => [text, ...prev.slice(0, 4)]);
    }
  };

  const clearRecentHistory = () => {
    setRecentSearches([]);
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto z-20 group">
      {/* Decorative gradient glowing backing */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur-md opacity-25 group-focus-within:opacity-50 transition duration-300" />
      
      {/* Prime Search bar container */}
      <div className="relative flex items-center bg-[#0F0F12] border border-white/10 focus-within:border-purple-500/50 rounded-2xl p-1.5 transition-all duration-300 backdrop-blur-md shadow-2xl">
        
        <div className="flex items-center pl-3.5 pr-2">
          <Search className="h-5 w-5 text-slate-400" />
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search NOC compliance, stipends, certificates, ViBe platform, team formation..."
          className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none py-2.5 pr-12 font-sans"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearchCommit(searchTerm);
            }
          }}
        />

        {/* Action icons (Voice Search trigger & clear) */}
        <div className="absolute right-3 flex items-center space-x-2">
          
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(""); setSuggestions([]); }}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={onTriggerVoice}
            title="Search using Voice Speech Capture"
            className="p-2 rounded-xl accent-gradient hover:opacity-90 text-white transition-all shadow-lg shadow-purple-500/20"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

      </div>

      {/* INTELLIGENT DROPDOWN RESULTS (AUTOCOMPLETE-SUGGEST & SEARCH DATA) */}
      {showDropdown && (
        <div className="absolute top-full mt-2.5 w-full bg-[#0F0F12]/95 border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] p-4 max-h-[480px] overflow-y-auto space-y-4 backdrop-blur-xl">
          
          {/* Close button for dropdown */}
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-mono text-[9px] text-slate-500 tracking-wider">INTELLECTUAL LOOKUP ENGINE</span>
            <button 
              onClick={() => setShowDropdown(false)}
              className="text-[10px] text-slate-400 hover:text-slate-100 font-semibold"
            >
              Dismiss
            </button>
          </div>

          {/* SCRIPT RESULTS SUGESTIONS */}
          {suggestions.length > 0 ? (
            <div>
              <p className="text-[10px] text-purple-400 font-mono tracking-wider font-bold mb-2 flex items-center select-none">
                <Sparkles className="h-3 w-3 mr-1.5 animate-spin" />
                FOUND IN VICHERANASHALA DATASET ({suggestions.length} items)
              </p>
              <div className="space-y-1.5">
                {suggestions.map((faq) => (
                  <div
                    key={faq.id}
                    onClick={() => {
                      onSelectFAQ(faq.id);
                      setShowDropdown(false);
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-purple-500/30 cursor-pointer transition duration-200"
                  >
                    <div className="flex items-start space-x-3 truncate">
                      <span className="bg-purple-900/30 border border-purple-500/30 text-purple-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                        {faq.id}
                      </span>
                      <div className="truncate">
                        <p className="text-slate-200 text-xs font-semibold truncate">
                          {faq.question}
                        </p>
                        <p className="text-slate-400 text-[10px] truncate mt-0.5 font-sans">
                          {faq.category} · {faq.tags.join(", ")}
                        </p>
                      </div>
                    </div>
                    <CornerDownLeft className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ) : searchTerm.trim() ? (
            <div className="text-center py-2 text-xs text-slate-500 select-none">
              No matching questions found for "<strong className="text-slate-300 font-normal">{searchTerm}</strong>". Use complete search or ask Yaksha!
            </div>
          ) : null}

          {/* QUICK TRENDING QUERIES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Recent Search Queries history */}
            {recentSearches.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono select-none">
                  <span className="flex items-center space-x-1 uppercase font-bold">
                    <History className="h-3.5 w-3.5" />
                    <span>RECENT SEARCH LOGS</span>
                  </span>
                  <button 
                    onClick={clearRecentHistory}
                    className="hover:text-red-400 transition"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((rec, index) => (
                    <button
                      key={index}
                      onClick={() => handleSearchCommit(rec)}
                      className="w-full text-left text-xs text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] py-1.5 px-2 rounded-lg transition truncate flex items-center space-x-2"
                    >
                      <Clock className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{rec}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Hot Queries */}
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 font-mono select-none flex items-center space-x-1 uppercase font-bold">
                <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                <span>TRENDING NOW</span>
              </div>
              <div className="space-y-1">
                {trendingQueries.map((trend, key) => (
                  <button
                    key={key}
                    onClick={() => handleSearchCommit(trend)}
                    className="w-full text-left text-xs text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] py-1.5 px-2 rounded-lg transition truncate flex items-center space-x-2"
                  >
                    <BookOpen className="h-3 w-3 text-slate-500 shrink-0" />
                    <span className="truncate">{trend}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
