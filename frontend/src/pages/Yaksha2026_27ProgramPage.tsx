import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Footer from '../components/layout/Footer';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import type { FAQItem } from '../components/faq/faqUtils';
import { getCategoryIcon, formatCategoryName, getQuestionTitle } from '../components/faq/faqUtils';

interface GroupedFaqs {
  [category: string]: FAQItem[];
}

/**
 * Public program page for the YAKSHA 2026-27 internship cycle.
 *
 * Hero describes the program (free, 2-month, mentor-led open-source
 * internship at the Vicharanashala Lab, IIT Ropar). Below the hero the
 * full FAQ list is rendered, grouped by the 14 sections from
 * backend/faqs.json. No auth required — anyone can read the program
 * brochure.
 *
 * FAQ data is fetched from GET /api/faq and grouped on the client. If
 * the backend is unreachable we fall back to an empty state and the
 * copy still tells visitors what the program is about.
 */
export default function Yaksha2026_27ProgramPage() {
  const [grouped, setGrouped] = useState<GroupedFaqs>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await api.get('/faq', { signal: controller.signal });
        const faqs: FAQItem[] = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.faqs)
            ? res.data.faqs
            : [];
        const next: GroupedFaqs = {};
        for (const faq of faqs) {
          const cat = faq.category || 'Other';
          if (!next[cat]) next[cat] = [];
          next[cat].push(faq);
        }
        // Stable section order — match the seed file's numeric prefix
        // so "1. About..." comes before "2. Timing..." rather than
        // being alphabetised.
        const ordered: GroupedFaqs = {};
        const sorted = Object.keys(next).sort((a, b) => {
          const an = Number(a.match(/^\s*(\d+)/)?.[1] ?? '999');
          const bn = Number(b.match(/^\s*(\d+)/)?.[1] ?? '999');
          if (an !== bn) return an - bn;
          return a.localeCompare(b);
        });
        for (const k of sorted) ordered[k] = next[k];
        setGrouped(ordered);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'CanceledError') return;
        setError('Could not load the full FAQ list right now.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const sections = useMemo(() => Object.entries(grouped), [grouped]);
  const totalFaqs = useMemo(
    () => sections.reduce((sum, [, items]) => sum + items.length, 0),
    [sections]
  );

  const filteredSections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map(([cat, items]) => {
        const matched = items.filter((it) => {
          const title = getQuestionTitle(it).toLowerCase();
          const body = (it.answer || it.body || '').toLowerCase();
          return title.includes(q) || body.includes(q);
        });
        return [cat, matched] as const;
      })
      .filter(([, items]) => items.length > 0);
  }, [sections, filter]);

  return (
    <div className="bg-bg text-ink min-h-screen relative z-0">

      <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden mt-16">
        <HomeDoodles />
      </div>

      <div className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 max-w-[1200px] mx-auto relative z-10">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg px-3 py-1.5 -ml-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </Link>
        </div>

        <div className="flex flex-col items-center mb-12 text-center">
          <motion.span
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full bg-accent-light/40 border border-accent/20 text-accent text-xs font-semibold tracking-wide uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Yaksha 2026-27 cycle
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            className="text-4xl sm:text-6xl font-serif tracking-tight text-ink text-glow-spatial mb-4"
          >
            The Yaksha Program
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-ink-soft max-w-2xl"
          >
            A two-month, full-time research internship at the Vicharanashala
            Lab, IIT Ropar. Real open-source work under a mentor, free of
            charge, with a short training phase tailored to where you
            already are.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-3"
          >
            <span className="px-3 py-1.5 rounded-full bg-card border border-border/60 text-xs font-medium text-ink-soft">
              2 months · full-time
            </span>
            <span className="px-3 py-1.5 rounded-full bg-card border border-border/60 text-xs font-medium text-ink-soft">
              Free · no stipend
            </span>
            <span className="px-3 py-1.5 rounded-full bg-card border border-border/60 text-xs font-medium text-ink-soft">
              Open source
            </span>
            <span className="px-3 py-1.5 rounded-full bg-card border border-border/60 text-xs font-medium text-ink-soft">
              Certificate from IIT Ropar
            </span>
          </motion.div>
        </div>

        {/* Quick link to apply / explore */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <Link
            to="/explore/select"
            className="btn-base btn-primary text-sm"
          >
            Apply for Yaksha 2026-27
          </Link>
          <a
            href="#faqs"
            className="btn-base btn-secondary text-sm"
          >
            Read the FAQs
          </a>
        </div>

        {/* FAQ list */}
        <section id="faqs" className="scroll-mt-32">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-serif text-ink mb-1">
                Frequently asked
              </h2>
              <p className="text-sm text-ink-soft">
                {loading
                  ? 'Loading FAQs…'
                  : error
                    ? error
                    : `${totalFaqs} questions across ${sections.length} sections — everything you need to know before you apply.`}
              </p>
            </div>
            <div className="w-full sm:w-72">
              <label htmlFor="program-faq-filter" className="sr-only">
                Filter FAQs
              </label>
              <input
                id="program-faq-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter questions…"
                className="w-full px-4 py-2.5 rounded-full bg-card border border-border/60 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
            </div>
          </div>

          {!loading && !error && filteredSections.length === 0 && filter && (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-ink-soft">
              No FAQs match <span className="font-semibold text-ink">"{filter}"</span>.
              Try a different keyword.
            </div>
          )}

          <div className="space-y-12">
            {filteredSections.map(([category, items]) => (
              <div key={category}>
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-border/60">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent-light/40 text-accent">
                    {getCategoryIcon(category)}
                  </span>
                  <h3 className="text-lg sm:text-xl font-serif text-ink">
                    {formatCategoryName(category)}
                  </h3>
                  <span className="ml-auto text-xs font-medium text-ink-faint">
                    {items.length} {items.length === 1 ? 'question' : 'questions'}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {items.map((item) => {
                    const id = item._id;
                    const isOpen = openId === id;
                    const title = getQuestionTitle(item);
                    const body = item.answer || item.body || '';
                    return (
                      <li key={id}>
                        <button
                          onClick={() => setOpenId(isOpen ? null : id)}
                          aria-expanded={isOpen}
                          className={`w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 ${
                            isOpen
                              ? 'bg-card border-accent/40 shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
                              : 'bg-card/70 border-border/60 hover:border-ink/20 hover:bg-card'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-accent-light/30 text-accent shrink-0">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                                aria-hidden="true"
                              >
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm sm:text-base font-semibold text-ink">
                                {title}
                              </p>
                              {isOpen && body && (
                                <p className="mt-3 text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                                  {body}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
