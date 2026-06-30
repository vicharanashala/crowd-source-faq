import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Footer from '../components/layout/Footer';
import api from '../utils/api';
import type { FAQItem } from '../components/faq/faqUtils';
import { getCategoryIcon, formatCategoryName, getQuestionTitle } from '../components/faq/faqUtils';
import { useBatch } from '../context/BatchContext';
import type { ProgramResponse, ProgramSettings, SectionKey } from '../types/program';
import { programThemeStyles, getSectionCopy } from '../utils/programTheme';
import { slugifyProgramName } from '../utils/programSlug';

/**
 * v1.69 — Program microsite, fully driven by the admin's
 * `ProgramSettings`. Every section of the page is conditional on
 * `settings.sections.show*`. The theme colours come from
 * `settings.theme` and drive the hero gradient + accents.
 *
 * Routing:
 *   `/`              → renders the default program's microsite
 *                      (auto-resolves; no slug in the URL)
 *   `/program/:slug` → renders a specific program's microsite
 *
 * Replaces the older FAQ-list-as-program-page build. Now reads as
 * a marketing-quality microsite: hero, stats strip, feature
 * cards, and the actual content sections further down.
 */
export default function ProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const { setCurrentBatch, currentBatch, availableBatches } = useBatch();

  const [data, setData] = useState<ProgramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // v1.69 — if no slug, resolve the default program from the
  // BatchContext (which auto-picks `isDefault: true` on cold start).
  // The slug form (`/program/:slug`) hits the by-slug endpoint.
  const effectiveSlug = useMemo<string | null>(() => {
    if (slug) return slug;
    if (currentBatch?.name) return slugifyProgramName(currentBatch.name);
    return null;
  }, [slug, currentBatch?.name]);

  // Fetch the program + settings by slug (or by resolved default)
  useEffect(() => {
    if (!effectiveSlug) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.get<ProgramResponse>(`/programs/${encodeURIComponent(effectiveSlug)}`, { signal: controller.signal });
        setData(res.data);
        setCurrentBatch(res.data.program._id);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'CanceledError') return;
        setError('This program is unavailable or has been archived.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [effectiveSlug, setCurrentBatch]);

  // Fetch the FAQs for this program
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    setFaqsLoading(true);
    (async () => {
      try {
        const res = await api.get<FAQItem[] | { faqs: FAQItem[] }>('/faq', {
          params: { batchId: data.program._id },
          signal: controller.signal,
        });
        const list: FAQItem[] = Array.isArray(res.data) ? res.data : (res.data?.faqs ?? []);
        const next: Record<string, FAQItem[]> = {};
        for (const faq of list) {
          const cat = faq.category || 'Other';
          if (!next[cat]) next[cat] = [];
          next[cat].push(faq);
        }
        const ordered: Record<string, FAQItem[]> = {};
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
      } finally {
        setFaqsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [data]);

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

  // v1.69 — derive the visible section list from the admin's
  // `sectionOrder` + `show*` flags.
  const orderedVisibleSections = useMemo<SectionKey[]>(() => {
    if (!data) return [];
    const order = data.settings.sections.sectionOrder ?? [];
    const allowed = new Set<SectionKey>(
      order.filter((s) => {
        switch (s) {
          case 'stats':     return data.settings.sections.showStats;
          case 'faqs':      return data.settings.sections.showFAQs;
          case 'community': return data.settings.sections.showCommunity;
          case 'zoom':      return data.settings.sections.showZoom;
          case 'kb':        return data.settings.sections.showKB;
        }
      })
    );
    return Array.from(allowed);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-ink-soft">
        Loading program…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-bg text-ink min-h-screen">
        <div className="max-w-md mx-auto pt-32 px-4 text-center">
          <h1 className="font-serif text-3xl text-ink mb-3">Program not found</h1>
          <p className="text-sm text-ink-soft mb-6">{error ?? 'This program does not exist.'}</p>
          <Link to="/programs" className="btn-base btn-primary text-sm">Browse programs</Link>
        </div>
      </div>
    );
  }

  const { program, settings } = data;
  const theme = programThemeStyles(settings.theme);

  // v1.69 — use the seeded hero copy. If the admin hasn't set a
  // hero, fall back to the program's name + description.
  const heroTitle = settings.hero.title || program.name;
  const heroSubtitle = settings.hero.subtitle || program.description;
  const heroCta = settings.hero.ctaText;

  // v1.69 — links to existing routes for community / zoom / KB so
  // "everything works from here". The batchId query param scopes
  // the downstream page to this program.
  const scopeParam = `?batchId=${program._id}`;

  // v1.69 — show a "Switch program" link in the navbar if more
  // than one program is available. Admins always see it.
  const showSwitcher = availableBatches.length > 1;

  return (
    <div
      className="min-h-screen text-ink relative z-0"
      style={{
        background: theme.backgroundCss,
        fontFamily: theme.fontCss,
      }}
    >

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pt-32 sm:pt-40 pb-20 px-4 sm:px-6 overflow-hidden">
        {settings.hero.imageUrl ? (
          <div className="absolute inset-0 z-[-1]">
            <img
              src={settings.hero.imageUrl}
              alt=""
              className="w-full h-full object-cover opacity-30"
            />
            <div
              className="absolute inset-0"
              style={{ background: theme.overlayCss }}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 z-[-1]"
            style={{ background: theme.gradientCss }}
          />
        )}

        <div className="max-w-[1100px] mx-auto text-center relative z-10">
          <motion.span
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full text-[11px] font-semibold tracking-wider uppercase border"
            style={theme.heroPill}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: settings.theme.accentColor }}
            />
            {settings.branding.logoText}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            className="text-4xl sm:text-6xl lg:text-7xl font-serif tracking-tight text-ink text-glow-spatial mb-6"
            style={theme.heroTitle}
          >
            {heroTitle}
          </motion.h1>
          {heroSubtitle && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-lg sm:text-xl text-ink-soft max-w-2xl mx-auto leading-relaxed"
            >
              {heroSubtitle}
            </motion.p>
          )}
          {(heroCta || program.startDate) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              {heroCta && settings.hero.ctaLink && (
                <a
                  href={settings.hero.ctaLink}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
                  style={theme.primaryButton}
                >
                  {heroCta}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </a>
              )}
              <span className="px-4 py-2 rounded-full bg-card/60 border border-border/60 text-xs font-medium text-ink-soft">
                {new Date(program.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                {' → '}
                {new Date(program.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </span>
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Sections (driven by settings.sections) ──────────────────── */}
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 pb-24">
        {orderedVisibleSections.map((key, idx) => {
          const copy = getSectionCopy(key);
          return (
            <section
              key={key}
              id={key === 'faqs' ? 'faqs' : `section-${key}`}
              className={idx > 0 ? 'mt-20' : ''}
            >
              <header className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: settings.theme.accentColor }}>
                    {copy.eyebrow}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-serif text-ink">
                    {copy.title}
                  </h2>
                </div>
                <span className="text-xs text-ink-faint">{copy.tagline}</span>
              </header>

              {key === 'stats' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'FAQs',          value: totalFaqs,                       sub: 'curated answers' },
                    { label: 'Community',     value: '—',                              sub: 'discussions' },
                    { label: 'Zoom',          value: '—',                              sub: 'recordings' },
                    { label: 'Knowledge',     value: '—',                              sub: 'KB entries' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-2xl border p-5"
                      style={theme.statCard}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-2">
                        {s.label}
                      </p>
                      <p className="text-2xl sm:text-3xl font-serif text-ink leading-none mb-1">
                        {s.value}
                      </p>
                      <p className="text-[11px] text-ink-soft">{s.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {key === 'faqs' && (
                <div>
                  {faqsLoading ? (
                    <p className="text-sm text-ink-soft">Loading FAQs…</p>
                  ) : sections.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-ink-soft">
                      No FAQs have been published for this program yet.{' '}
                      <Link to="/admin/faqs" className="text-accent hover:underline">Add the first one →</Link>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6 max-w-md">
                        <label htmlFor="program-faq-filter" className="sr-only">Filter</label>
                        <input
                          id="program-faq-filter"
                          type="search"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Filter questions…"
                          className="w-full px-4 py-2.5 rounded-full bg-card border border-border/60 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                        />
                      </div>
                      {!filter && filteredSections.length === 0 && (
                        <p className="text-sm text-ink-soft">No matches.</p>
                      )}
                      <div className="space-y-12">
                        {filteredSections.map(([category, items]) => (
                          <div key={category}>
                            <div className="flex items-center gap-3 mb-4">
                              <span className="flex items-center justify-center w-9 h-9 rounded-xl text-accent" style={{ background: theme.iconBubbleBg }}>
                                {getCategoryIcon(category)}
                              </span>
                              <h3 className="text-lg font-serif text-ink">
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
                                          ? 'bg-card shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
                                          : 'bg-card/70 hover:bg-card'
                                      }`}
                                      style={isOpen ? theme.cardOpenBorder : theme.cardBorder}
                                    >
                                      <div className="flex items-start gap-3">
                                        <span className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0" style={{ background: theme.iconBubbleBg, color: settings.theme.accentColor }}>
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
                    </>
                  )}
                </div>
              )}

              {key === 'community' && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm">
                  <p className="text-ink-soft mb-3">Discuss with mentors and peers in the program community.</p>
                  <Link
                    to={`/community${scopeParam}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Open community for this program →
                  </Link>
                </div>
              )}

              {key === 'zoom' && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm">
                  <p className="text-ink-soft mb-3">Catch up on recent Zoom sessions, transcripts, and AI-extracted insights.</p>
                  <Link
                    to={`/community${scopeParam}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Browse Zoom sessions for this program →
                  </Link>
                </div>
              )}

              {key === 'kb' && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm">
                  <p className="text-ink-soft mb-3">Browse the program's auto-extracted knowledge base.</p>
                  <Link
                    to={`/community${scopeParam}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Open knowledge base →
                  </Link>
                </div>
              )}
            </section>
          );
        })}

        {orderedVisibleSections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-ink-soft">
            This program has no visible sections.{' '}
            <Link to={`/admin/programs/${program._id}/settings`} className="text-accent hover:underline">
              Configure them in admin →
            </Link>
          </div>
        )}
      </main>

      <Footer branding={settings.branding} />
    </div>
  );
}
