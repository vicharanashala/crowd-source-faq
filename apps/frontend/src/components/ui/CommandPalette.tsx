// CommandPalette — ⌘K / Ctrl+K quick launcher for Yaksha FAQ
// Raycast-style: quick actions + FAQ search + page navigation
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useBatch } from '../../context/BatchContext';

interface FaqSearchResult {
  _id: string;
  question: string;
  category: string;
}

const STATIC_PAGES = [
  { name: 'Home', path: '/' },
  { name: 'FAQ', path: '/faq' },
  { name: 'Community', path: '/community' },
  { name: 'Saved Knowledge', path: '/saved' },
  { name: 'Account', path: '/account' },
  { name: 'Support', path: '/support' },
];

const Spinner = () => (
  <svg className="animate-spin h-4 w-4 text-ink-faint" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function CommandPalette() {
  const navigate = useNavigate();
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [faqResults, setFaqResults] = useState<FaqSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredPages, setFilteredPages] = useState<typeof STATIC_PAGES>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global Cmd+K / Ctrl+K listener — mounted once at App level
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Quick actions — emoji labels (no icon field needed)
  const quickActions = useMemo(() => [
    { label: '🏠  Go to Home',        action: () => { navigate('/');          setOpen(false); } },
    { label: '❓  Browse FAQs',       action: () => { navigate('/faq');       setOpen(false); } },
    { label: '🔖  My Saved',          action: () => { navigate('/saved');     setOpen(false); } },
    { label: '👤  Account',           action: () => { navigate('/account');   setOpen(false); } },
    { label: '🔔  Notifications',     action: () => { navigate('/notifications'); setOpen(false); } },
  ], [navigate]);

  // Build flat list of all navigable items for keyboard nav
  const allItems = useMemo(() => {
    const items: Array<{ type: 'quick' | 'faq' | 'page'; label: string; action: () => void }> = [];
    if (!query) {
      quickActions.forEach((qa) => items.push({ type: 'quick', label: qa.label, action: qa.action }));
    }
    if (query.length >= 2) {
      faqResults.forEach((faq) =>
        items.push({
          type: 'faq',
          label: faq.question,
          action: () => { navigate(`/faq/${faq._id}`); setOpen(false); },
        }),
      );
      filteredPages.forEach((pg) =>
        items.push({
          type: 'page',
          label: pg.name,
          action: () => { navigate(pg.path); setOpen(false); },
        }),
      );
    }
    return items;
  }, [query, faqResults, filteredPages, quickActions, navigate]);

  // Reset selected index when items change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Debounced FAQ search
  const searchFaqs = useCallback(async (q: string) => {
    if (q.length < 2) { setFaqResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params: Record<string, string | number> = { q, limit: 8 };
      if (batchId) params.batchId = batchId;
      const res = await api.get('/api/faq', { params });
      setFaqResults(res.data.faqItems ?? (Array.isArray(res.data) ? res.data : []));
    } catch { setFaqResults([]); }
    finally { setLoading(false); }
  }, [batchId]);

  // Focus input on open + lock body scroll so the page underneath doesn't
  // scroll on mobile while the modal is up. Restore on close/unmount.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFaqResults([]);
    setFilteredPages([]);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Compensate for the missing scrollbar so the page doesn't reflow.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  // Query → debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchFaqs(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchFaqs]);

  // Filter static pages
  useEffect(() => {
    if (query.length >= 2) {
      const lower = query.toLowerCase();
      setFilteredPages(STATIC_PAGES.filter((pg) => pg.name.toLowerCase().includes(lower)));
    } else {
      setFilteredPages([]);
    }
  }, [query]);

  // Keyboard navigation inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        allItems[selectedIndex]?.action();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, allItems, selectedIndex]);

  if (!open) return null;

  const hasResults = faqResults.length > 0 || filteredPages.length > 0;
  const showNoResults = query.length >= 2 && !loading && !hasResults;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-xl mx-4 bg-card rounded-2xl shadow-xl border border-border/50 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50">
          <svg className="h-5 w-5 text-ink-faint shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search FAQs, pages, or quick actions..."
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="shrink-0 inline-flex items-center gap-1 text-xs text-ink-faint bg-mist px-2 py-1 rounded-md border border-border/50 font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          <div className="command-palette-scroll">
            {/* Quick Actions — shown when query is empty */}
            {!query && (
              <div>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-ink-faint uppercase tracking-wider">
                  Quick Actions
                </div>
                {quickActions.map((qa, i) => (
                  <button
                    key={qa.label}
                    className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${
                      selectedIndex === i
                        ? 'bg-accent-light text-accent rounded-xl mx-2'
                        : 'text-ink hover:bg-mist/60 rounded-xl mx-2'
                    }`}
                    onClick={qa.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="text-base w-6 text-center">{qa.label.split('  ')[0]}</span>
                    <span>{qa.label.split('  ')[1]}</span>
                  </button>
                ))}
              </div>
            )}

            {/* FAQs section — shown when typing */}
            {query.length >= 2 && (
              <div>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-ink-faint uppercase tracking-wider flex items-center gap-2">
                  {loading && <Spinner />}
                  <span>FAQs</span>
                </div>
                {faqResults.length === 0 && !loading && (
                  <p className="px-4 py-3 text-sm text-ink-faint">No FAQs found.</p>
                )}
                {faqResults.map((faq, i) => {
                  const globalIdx = quickActions.length + i;
                  return (
                    <button
                      key={faq._id}
                      className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between gap-3 transition-colors ${
                        selectedIndex === globalIdx
                          ? 'bg-accent-light text-accent rounded-xl mx-2'
                          : 'text-ink hover:bg-mist/60 rounded-xl mx-2'
                      }`}
                      onClick={() => { navigate(`/faq/${faq._id}`); setOpen(false); }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="truncate text-sm">{faq.question}</span>
                      <span className="shrink-0 text-xs bg-mist px-2 py-0.5 rounded-full text-ink-faint">
                        {faq.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pages section */}
            {query.length >= 2 && filteredPages.length > 0 && (
              <div className="pb-1">
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-ink-faint uppercase tracking-wider">
                  Pages
                </div>
                {filteredPages.map((pg, i) => {
                  const globalIdx = quickActions.length + faqResults.length + i;
                  return (
                    <button
                      key={pg.path}
                      className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${
                        selectedIndex === globalIdx
                          ? 'bg-accent-light text-accent rounded-xl mx-2'
                          : 'text-ink hover:bg-mist/60 rounded-xl mx-2'
                      }`}
                      onClick={() => { navigate(pg.path); setOpen(false); }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <svg className="h-4 w-4 shrink-0 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{pg.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* No results */}
            {showNoResults && (
              <div className="px-4 py-8 text-center text-sm text-ink-faint">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {/* Empty hint */}
            {!query && (
              <div className="px-4 py-3 text-xs text-ink-faint text-center">
                Start typing to search FAQs...
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 bg-mist/30 text-xs text-ink-faint">
          <span>↑↓  navigate</span>
          <span>↵  select</span>
          <span>Esc  close</span>
        </div>
      </div>
    </div>
  );
}