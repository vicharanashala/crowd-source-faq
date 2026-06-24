import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowRight, Clock } from 'lucide-react';
import { searchQuestions, urgencyColors } from '../data/faqData';
import { useSearch } from '../contexts/SearchContext';
import EmptyState from './ui/EmptyState';

const INTENT_LABELS = {
  when: '📅 Time-related',
  who: '👤 Person/Role',
  how: '⚙️ Process',
  what: '📖 Definition',
  why: '💡 Reason',
  where: '📍 Location',
  can: '✅ Eligibility',
};

function detectIntent(query) {
  const lower = query.toLowerCase().trim();
  for (const [word, label] of Object.entries(INTENT_LABELS)) {
    if (lower.startsWith(word)) return label;
  }
  return null;
}

/** Highlight matched text */
function HighlightedText({ text, query }) {
  if (!query || query.length < 2 || !text) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-amber-200/60 text-amber-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

export default function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const { performSearch } = useSearch();
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('samagama_recent_search') || '[]'); }
    catch { return []; }
  });
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSearch = useCallback((val) => {
    setQuery(val);
    if (val.length >= 2) {
      const found = searchQuestions(val);
      setResults(found);
      // Log to analytics context (debounced inside)
      performSearch(val);
    } else {
      setResults([]);
    }
  }, [performSearch]);

  const handleSelect = (question) => {
    // Save to recent
    const newRecent = [
      { id: question.id, text: question.question, category: question.categoryLabel },
      ...recent.filter(r => r.id !== question.id),
    ].slice(0, 5);
    setRecent(newRecent);
    localStorage.setItem('samagama_recent_search', JSON.stringify(newRecent));

    navigate(`/faq?section=${question.categoryId}&q=${question.id}`);
    onClose();
  };

  const intent = detectIntent(query);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-xl animate-scale-in">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
          {/* Input row — WOW 8: focus glow */}
          <div className="search-input-wrap flex items-center gap-3 px-4 py-3 border-b border-slate-200">
            <Search size={18} className="search-icon-animate text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search FAQs — try 'NOC dates', 'CGPA', 'certificate'..."
              className="flex-1 bg-transparent text-slate-900 placeholder-slate-400 text-sm outline-none"
            />
            {query && (
              <button onClick={() => handleSearch('')} className="text-slate-400 hover:text-slate-900">
                <X size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 ml-1">
              <kbd className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">ESC</kbd>
            </button>
          </div>

          {/* Intent badge */}
          {intent && (
            <div className="px-4 pt-3 pb-0">
              <span className="text-xs bg-brand-600/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full">
                {intent} query detected
              </span>
            </div>
          )}

          {/* Results */}
          <div className="max-h-72 overflow-y-auto scrollbar-hide">
            {query.length >= 2 && results.length === 0 && (
              <EmptyState variant="search" description={`No results for "${query}". Try different keywords or browse sections below.`} />
            )}

            {results.length > 0 && (
              <div className="p-2">
                <p className="text-xs text-slate-600 px-2 pb-2">{results.length} results</p>
                {results.map(q => (
                  <button
                    key={q.id}
                    onClick={() => handleSelect(q)}
                    className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 group transition-colors"
                  >
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${urgencyColors[q.urgency]?.dot || 'bg-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 truncate">
                        <HighlightedText text={q.question} query={query} />
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{q.categoryLabel}</p>
                    </div>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-600 flex-shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Recent searches */}
            {query.length < 2 && recent.length > 0 && (
              <div className="p-2">
                <p className="text-xs text-slate-600 px-2 pb-2 flex items-center gap-1">
                  <Clock size={11} /> Recent
                </p>
                {recent.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/faq?section=${r.category?.toLowerCase()}&q=${r.id}`) || onClose()}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <Clock size={13} className="text-slate-600" />
                    <span className="truncate">{r.text}</span>
                    <span className="ml-auto text-xs text-slate-600">{r.category}</span>
                  </button>
                ))}
              </div>
            )}

            {query.length < 2 && recent.length === 0 && (
              <EmptyState variant="default" title="Start Searching" description="Type to search across all FAQs" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
