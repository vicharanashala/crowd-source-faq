import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, SortAsc, SortDesc,
  FileText, Briefcase, Target, FlaskConical, Calendar, Award,
  LayoutDashboard, ListChecks
} from 'lucide-react';
import FAQCard from './FAQCard';
import TrendingPanel from './TrendingPanel';
import BubbleChart from './BubbleChart';
import ProgressBar from './ProgressBar';
import EmptyState from './ui/EmptyState';
import { SkeletonList, FadeInContent } from './ui/SkeletonCard';
import { ScrollReveal, ScrollRevealItem, TiltCard } from './ui/Interactions';
import { urgencyOrder, faqData } from '../data/faqData';

const sectionIcons = {
  noc:         <FileText size={16} />,
  internship:  <Briefcase size={16} />,
  vibe:        <Target size={16} />,
  rosetta:     <FlaskConical size={16} />,
  dates:       <Calendar size={16} />,
  certificate: <Award size={16} />,
};

const sectionIconColors = {
  noc:         'text-red-500',
  internship:  'text-amber-600',
  vibe:        'text-purple-500',
  rosetta:     'text-teal-600',
  dates:       'text-blue-600',
  certificate: 'text-yellow-600',
};

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ data, onCategoryClick, onTrendingClick }) {
  const totalFAQs   = data.reduce((a, c) => a + c.questions.length, 0);
  const critCount   = data.reduce((a, c) => a + c.questions.filter(q => q.urgency === 'critical').length, 0);
  const totalViews  = data.reduce((a, c) => a + c.questions.reduce((b, q) => b + q.clicks, 0), 0);

  const stats = [
    { label: 'Total FAQs',      value: totalFAQs,                    color: 'text-slate-900' },
    { label: 'Sections',        value: data.length,                  color: 'text-slate-900' },
    { label: 'Critical Items',  value: critCount,                    color: 'text-red-600'   },
    { label: 'Total Views',     value: totalViews.toLocaleString(),  color: 'text-slate-900' },
  ];

  return (
    <ScrollReveal stagger className="max-w-6xl mx-auto px-4 lg:px-8 py-6 pb-12">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {stats.map(s => (
          <ScrollRevealItem key={s.label}>
            <TiltCard className="bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm" intensity={2}>
              <p className={`text-2xl font-bold leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 font-normal">{s.label}</p>
            </TiltCard>
          </ScrollRevealItem>
        ))}
      </div>

      {/* Main analytics panels */}
      <ScrollReveal>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TiltCard className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" intensity={1.5}>
          <div className="px-4 pt-4 pb-2 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Doubt Cluster Map</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Question volume by section — click to explore</p>
          </div>
          <div className="p-4">
            <BubbleChart onCategoryClick={onCategoryClick} />
          </div>
          </TiltCard>

          <TiltCard className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" intensity={1.5}>
          <div className="px-4 pt-4 pb-2 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Trending This Week</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Questions with the highest recent activity</p>
          </div>
          <div className="p-4">
            <TrendingPanel onQuestionClick={onTrendingClick} />
          </div>
          </TiltCard>
        </div>
      </ScrollReveal>

      {/* Section urgency breakdown */}
      <ScrollReveal>
        <TiltCard className="mt-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" intensity={1.5}>
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-900">Section Health</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Urgency distribution across all sections</p>
        </div>
        <div className="divide-y divide-slate-100">
          {data.map(section => {
            const counts = section.questions.reduce((acc, q) => {
              acc[q.urgency] = (acc[q.urgency] || 0) + 1;
              return acc;
            }, {});
            const total = section.questions.length;
            const critPct = Math.round(((counts.critical || 0) / total) * 100);

            return (
              <button
                key={section.id}
                onClick={() => onCategoryClick(section.id)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors text-left group"
              >
                <span className={`flex-shrink-0 ${sectionIconColors[section.id] || 'text-slate-400'}`}>
                  {sectionIcons[section.id] || <FileText size={15} />}
                </span>
                <span className="text-sm font-medium text-slate-800 w-40 truncate">{section.title}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full transition-all"
                    style={{ width: `${critPct}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-500 w-16 text-right">
                  {counts.critical || 0} critical
                </span>
                <span className="text-[11px] text-slate-400 group-hover:text-slate-700 transition-colors">→</span>
              </button>
            );
          })}
        </div>
        </TiltCard>
      </ScrollReveal>
    </ScrollReveal>
  );
}

// ─── Main FAQPage ─────────────────────────────────────────────────────────────

export default function FAQPage({ data, vote, markSectionRead, trackClick, readSections, readCount, totalSections }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'faq'
  const [sortDesc, setSortDesc] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(null);

  const activeSection = searchParams.get('section') || data[0]?.id;
  const focusedQ = searchParams.get('q');

  // If a deep-link includes ?section= or ?q=, jump straight to the FAQ tab
  useEffect(() => {
    if (searchParams.get('section') || searchParams.get('q')) {
      setActiveTab('faq');
    }
  }, []);

  const setActiveSection = (id) => {
    setSearchParams({ section: id });
    markSectionRead(id);
    setActiveTab('faq');
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, [activeSection, activeTab]);

  useEffect(() => {
    if (activeSection) markSectionRead(activeSection);
  }, [activeSection, markSectionRead]);

  useEffect(() => {
    if (focusedQ) {
      setTimeout(() => {
        const el = document.getElementById(`faq-${focusedQ}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [focusedQ]);

  const currentSection = data.find(s => s.id === activeSection) || data[0];
  const sortedQuestions = currentSection
    ? [...currentSection.questions].sort((a, b) => {
        const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        return sortDesc ? diff : -diff;
      })
    : [];

  const handleRelatedClick = (relatedQ) => {
    const cat = data.find(c => c.questions.some(q => q.id === relatedQ.id));
    if (cat) { setSearchParams({ section: cat.id, q: relatedQ.id }); setActiveTab('faq'); }
  };

  const handleTrendingClick = (item) => {
    const cat = data.find(c => c.questions.some(q => q.id === item.id));
    if (cat) { setSearchParams({ section: cat.id, q: item.id }); setActiveTab('faq'); }
  };

  const handleCategoryClick = (catId) => {
    setActiveSection(catId);
  };

  // ── Tab bar ────────────────────────────────────────────────────────────────
  const TabBar = () => (
    <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 lg:px-8">
      <div className="flex items-center gap-1 max-w-6xl mx-auto">
        {[
          { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={13} /> },
          { id: 'faq',      label: 'FAQ',      icon: <ListChecks size={13} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-4 py-3 text-sm font-medium
              border-b-2 transition-all duration-150 -mb-px
              ${activeTab === tab.id
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }
            `}
          >
            <span className={activeTab === tab.id ? 'text-amber-500' : 'text-slate-400'}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#faf6f0] flex flex-col overflow-hidden" style={{ paddingTop: '56px' }}>
      <TabBar />

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          <OverviewTab
            data={data}
            onCategoryClick={handleCategoryClick}
            onTrendingClick={handleTrendingClick}
          />
        </div>
      )}

      {/* FAQ tab — sidebar + content */}
      {activeTab === 'faq' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside
            className={`
              flex-shrink-0 border-r border-slate-200 bg-white
              flex flex-col overflow-hidden transition-all duration-300 ease-in-out
              ${sidebarOpen ? 'w-56 lg:w-64' : 'w-12'}
            `}
          >
            <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
              {sidebarOpen && (
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sections</span>
              )}
              <button
                onClick={() => setSidebarOpen(p => !p)}
                className="ml-auto text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
              >
                {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-1">
              {data.map(section => {
                const critCount = section.questions.filter(q => q.urgency === 'critical').length;
                const isActive  = section.id === activeSection;
                const isRead    = readSections.includes(section.id);
                const iconCol   = sectionIconColors[section.id] || 'text-slate-500';

                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    title={!sidebarOpen ? section.title : undefined}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150
                      border-r-2 text-left
                      ${isActive
                        ? 'bg-amber-50 border-amber-500 text-slate-900'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }
                    `}
                  >
                    <span className={`flex-shrink-0 ${isActive ? iconCol : 'text-slate-400'}`}>
                      {sectionIcons[section.id] || <FileText size={16} />}
                    </span>
                    {sidebarOpen && (
                      <>
                        <span className="text-sm font-medium truncate flex-1">{section.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {critCount > 0 && (
                            <span className="w-[18px] h-[18px] rounded-full bg-red-100 text-red-600 text-[10px] flex items-center justify-center font-bold border border-red-200">
                              {critCount}
                            </span>
                          )}
                          {isRead && <span className="text-green-600 text-xs font-bold">✓</span>}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </nav>

            {sidebarOpen && (
              <div className="p-3 border-t border-slate-200">
                <ProgressBar readCount={readCount} totalSections={totalSections} />
              </div>
            )}
          </aside>

          {/* Main content */}
          <main ref={contentRef} className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6">
              {currentSection && (
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                      <button
                        onClick={() => setActiveTab('overview')}
                        className="hover:text-slate-700 font-medium transition-colors"
                      >
                        Overview
                      </button>
                      <span>/</span>
                      <span className="text-slate-700 font-medium">{currentSection.title}</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <span className={sectionIconColors[currentSection.id] || 'text-slate-600'}>
                        {sectionIcons[currentSection.id]}
                      </span>
                      {currentSection.title}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">{currentSection.questions.length} questions</p>
                  </div>
                  <button
                    onClick={() => setSortDesc(p => !p)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-400 bg-white px-2.5 py-1.5 rounded-lg transition-all font-medium shadow-sm"
                  >
                    {sortDesc ? <SortDesc size={12} /> : <SortAsc size={12} />}
                    {sortDesc ? 'Critical first' : 'Low first'}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {loading ? (
                  <SkeletonList count={5} />
                ) : sortedQuestions.length === 0 ? (
                  <EmptyState variant="faq" />
                ) : (
                  <FadeInContent>
                    {sortedQuestions.map(q => (
                      <div key={q.id} id={`faq-${q.id}`}>
                        <FAQCard
                          question={q}
                          onVote={vote}
                          onRelatedClick={handleRelatedClick}
                          onOpen={trackClick}
                        />
                      </div>
                    ))}
                  </FadeInContent>
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
