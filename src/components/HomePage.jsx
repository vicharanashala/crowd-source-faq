import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Briefcase, Target, FlaskConical, Calendar, Award,
  AlertTriangle, X, Eye, BookOpen, Users, Layers,
  Medal, Star, Zap, Shield, CheckCircle2, Clock,
  ChevronRight, TrendingUp, ArrowRight
} from 'lucide-react';
import { faqData, trendingData } from '../data/faqData';
import { MouseGlow, TiltCard, ScrollReveal, ScrollRevealItem, MagneticButton } from './ui/Interactions';
import { useInView } from '../lib/animations';
import { useAlerts } from '../contexts/AlertContext';
import * as faqService from '../services/faqService';

const HERO_TITLE = 'VICHARANASHALA';
const CURRENT_WEEK_INDEX = 1;

/* ─── Section metadata (unchanged from original) ─── */
const sectionMeta = {
  noc: { icon: <FileText size={16} />, bg: 'bg-red-50', border: 'border-red-100', iconBg: 'bg-red-100', iconColor: 'text-red-500' },
  internship: { icon: <Briefcase size={16} />, bg: 'bg-amber-50', border: 'border-amber-100', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  vibe: { icon: <Target size={16} />, bg: 'bg-purple-50', border: 'border-purple-100', iconBg: 'bg-purple-100', iconColor: 'text-purple-500' },
  rosetta: { icon: <FlaskConical size={16} />, bg: 'bg-teal-50', border: 'border-teal-100', iconBg: 'bg-teal-100', iconColor: 'text-teal-600' },
  dates: { icon: <Calendar size={16} />, bg: 'bg-blue-50', border: 'border-blue-100', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
  certificate: { icon: <Award size={16} />, bg: 'bg-yellow-50', border: 'border-yellow-100', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600' },
};

/* ─── Timeline data ─── */
const timelineSteps = [
  {
    label: 'Before Week 1',
    tag: 'Pre-start',
    tagColor: 'bg-slate-100 text-slate-600',
    points: ['Accept your selection & confirm participation', 'Access the candidate portal', 'Read the programme handbook'],
  },
  {
    label: 'Week 1',
    tag: 'Onboarding',
    tagColor: 'bg-blue-100 text-blue-700',
    points: ['Orientation session with programme leads', 'Set up tools & communication channels', 'Meet your cohort & assign roles'],
  },
  {
    label: 'Week 2',
    tag: 'Research',
    tagColor: 'bg-purple-100 text-purple-700',
    points: ['Literature scan & gap analysis', 'Define your research question', 'Submit brief research note'],
  },
  {
    label: 'Week 3',
    tag: 'Conversations',
    tagColor: 'bg-teal-100 text-teal-700',
    points: ['Conduct structured interviews or field visits', 'Compile primary data', 'Mid-point check-in with mentor'],
  },
  {
    label: 'Week 4',
    tag: 'Write-up',
    tagColor: 'bg-yellow-100 text-yellow-700',
    points: ['Draft your analytical memo', 'Peer review exchange', 'Incorporate mentor feedback'],
  },
  {
    label: 'Weeks 5–6',
    tag: 'Build Phase',
    tagColor: 'bg-amber-100 text-amber-700',
    points: ['Prototype or implement your core deliverable', 'Weekly standups with cohort', 'Document decisions & blockers'],
  },
  {
    label: 'Week 7',
    tag: 'Submission',
    tagColor: 'bg-orange-100 text-orange-700',
    points: ['Final deliverable due', 'Present to review panel', 'Complete reflection log'],
  },
  {
    label: 'Week 8',
    tag: 'Review & Results',
    tagColor: 'bg-green-100 text-green-700',
    points: ['Panel evaluations', 'Badge certification issued', 'Programme closure & feedback survey'],
  },
];

/* ─── Badge journey data ─── */
const badges = [
  {
    name: 'Bronze',
    phase: 'Training',
    icon: <Shield size={16} />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-600',
    what: 'Complete all onboarding modules and orientation sessions',
    required: 'Orientation quiz + attendance',
  },
  {
    name: 'Silver',
    phase: 'Project',
    icon: <Star size={16} />,
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
    what: 'Submit a documented research note or analytical memo',
    required: 'Research note (approved by mentor)',
  },
  {
    name: 'Gold',
    phase: 'Execution',
    icon: <Medal size={16} />,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    dot: 'bg-yellow-500',
    what: 'Deliver a working prototype or field-tested intervention',
    required: 'Deliverable + panel presentation',
  },
  {
    name: 'Platinum',
    phase: 'Impact',
    icon: <Zap size={16} />,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    what: 'Demonstrate measurable real-world impact from your work',
    required: 'Impact report + endorsement',
  },
];

/* ─── Section health config ─── */
const urgencyConfig = {
  critical: { label: 'Critical', color: 'bg-red-500', track: 'bg-red-100', text: 'text-red-600' },
  high: { label: 'High', color: 'bg-orange-400', track: 'bg-orange-100', text: 'text-orange-600' },
  medium: { label: 'Medium', color: 'bg-yellow-400', track: 'bg-yellow-100', text: 'text-yellow-700' },
  low: { label: 'Low', color: 'bg-green-500', track: 'bg-green-100', text: 'text-green-700' },
};

/* ══════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════ */

/* ── Stat Card ── */
function StatCard({ icon, value, label, accent }) {
  return (
    <TiltCard className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start gap-4" intensity={2.5}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1 font-normal">{label}</p>
      </div>
    </TiltCard>
  );
}

/* ── Timeline ── */
function Timeline() {
  const [lineRef, lineInView] = useInView({ threshold: 0.05 });

  return (
    <ScrollReveal stagger>
      <div className="relative" ref={lineRef}>
        {/* Connecting line — grows downward on reveal */}
        <div
          className={`absolute left-[19px] top-6 bottom-6 w-px bg-slate-200 timeline-line ${lineInView ? 'timeline-line-grow' : ''}`}
          style={{ transform: lineInView ? undefined : 'scaleY(0)' }}
        />

        <div className="space-y-1">
          {timelineSteps.map((step, idx) => (
            <ScrollRevealItem key={idx}>
              <div className="relative flex gap-5">
                {/* Node */}
                <div className="flex flex-col items-center flex-shrink-0 z-10">
                  <div className={`w-10 h-10 rounded-full bg-white border-2 flex items-center justify-center text-[11px] font-bold shadow-sm ${
                    idx === CURRENT_WEEK_INDEX
                      ? 'border-amber-400 text-amber-600 timeline-node-pulse'
                      : 'border-slate-200 text-slate-500'
                  }`}>
                    {idx + 1}
                  </div>
                </div>

                {/* Card */}
                <TiltCard className="flex-1 bg-white border border-slate-100 rounded-xl p-4 mb-3 shadow-sm" intensity={2}>
                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{step.label}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${step.tagColor}`}>
                      {step.tag}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {step.points.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <ChevronRight size={12} className="text-slate-300 flex-shrink-0 mt-0.5" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </TiltCard>
              </div>
            </ScrollRevealItem>
          ))}
        </div>
      </div>
    </ScrollReveal>
  );
}

/* ── VINS Info Card ── */
function VINSCard() {
  const features = [
    { icon: <Users size={14} />, text: 'Open to all selected candidates' },
    { icon: <Layers size={14} />, text: 'Fully online — attend from anywhere' },
    { icon: <Clock size={14} />, text: 'Flexible start date' },
    { icon: <Calendar size={14} />, text: 'Duration: approximately 8 weeks' },
    { icon: <CheckCircle2 size={14} />, text: 'Must complete before programme deadline' },
    { icon: <BookOpen size={14} />, text: 'No stipend — learning-focused' },
  ];

  return (
    <div
      className="rounded-2xl p-5 text-white"
      style={{ background: 'linear-gradient(135deg, #b8860b 0%, #c9a13b 50%, #d4a94e 100%)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-yellow-200">Internship</span>
      </div>
      <h3 className="text-xl font-bold mb-1">VINS – Online</h3>
      <p className="text-[13px] text-yellow-100 mb-4 font-normal leading-relaxed">
        Vicharanashala Internship — the primary pathway for candidates to earn their badges and complete the programme.
      </p>
      <div className="space-y-2.5">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px] text-yellow-50">
            <span className="opacity-80 flex-shrink-0">{f.icon}</span>
            {f.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Badge Table ── */
function BadgeJourney() {
  return (
    <TiltCard className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden" intensity={1.5}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">The Four-Badge Journey</h2>
        <p className="text-xs text-slate-500 mt-0.5">Complete each phase to progress to the next badge</p>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Badge', 'Phase', 'What it is', 'Required to complete'].map(h => (
                <th key={h} className="px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {badges.map((b, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${b.bg} ${b.border} ${b.color}`}>
                    {b.icon}
                    {b.name}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.dot}`} />
                    <span className="text-xs font-medium text-slate-700">{b.phase}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs">{b.what}</p>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-xs text-slate-500 font-normal">{b.required}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked */}
      <div className="sm:hidden divide-y divide-slate-50">
        {badges.map((b, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${b.bg} ${b.border} ${b.color}`}>
                {b.icon}
                {b.name}
              </div>
              <span className="text-xs text-slate-500">{b.phase}</span>
            </div>
            <p className="text-xs text-slate-600 mb-1">{b.what}</p>
            <p className="text-[11px] text-slate-400">{b.required}</p>
          </div>
        ))}
      </div>
    </TiltCard>
  );
}

/* ── Section Health ── */
function SectionHealth() {
  const allQuestions = faqData.flatMap(c => c.questions);
  const total = allQuestions.length;
  const counts = allQuestions.reduce((acc, q) => {
    acc[q.urgency] = (acc[q.urgency] || 0) + 1;
    return acc;
  }, {});

  return (
    <TiltCard className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm" intensity={1.5}>
      <h2 className="text-sm font-bold text-slate-900 mb-1">Section Health</h2>
      <p className="text-xs text-slate-500 mb-4">Distribution of FAQ urgency across all sections</p>
      <div className="space-y-3">
        {Object.entries(urgencyConfig).map(([key, cfg]) => {
          const count = counts[key] || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className={`text-[11px] font-semibold w-14 flex-shrink-0 ${cfg.text}`}>{cfg.label}</span>
              <div className={`flex-1 h-2 rounded-full overflow-hidden ${cfg.track}`}>
                <div className={`h-full rounded-full transition-all duration-700 ${cfg.color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] text-slate-500 w-16 text-right font-normal">{count} FAQs · {pct}%</span>
            </div>
          );
        })}
      </div>
    </TiltCard>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
export default function HomePage({ onSearchOpen }) {
  const navigate = useNavigate();
  const [panicDismissed, setPanicDismissed] = useState(false);
  const heroRef = useRef(null);

  const totalFAQs = faqData.reduce((a, c) => a + c.questions.length, 0);
  const totalSecs = faqData.length;
  const totalViews = faqData.reduce((a, c) => a + c.questions.reduce((b, q) => {
    const real = faqService.getFAQAnalytics(q.id);
    return b + (q.clicks || 0) + (real.views || 0);
  }, 0), 0);
  const critCount = faqData.flatMap(c => c.questions).filter(q => q.urgency === 'critical').length;

  const trending = (trendingData || []).slice(0, 5);

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: '#FAF6EF', paddingTop: '56px' }}>

      {/* ── Panic Alert / Admin Pinned Alert ── */}
      {!panicDismissed && <AlertBar onDismiss={() => setPanicDismissed(true)} />}

      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">

        {/* ── Section label ── */}
        <section className="premium-hero relative" ref={heroRef}>
          <MouseGlow containerRef={heroRef} />

          <span className="hero-label relative z-10">
            OVERVIEW
          </span>

          <div className="title-wrapper relative z-10">

            <h1 className="premium-title">
              {HERO_TITLE.split('').map((char, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.055}s` }}>
                  {char}
                </span>
              ))}
            </h1>

            <h2 className="premium-subtitle">
              INTERNSHIP
            </h2>

          </div>

          <p className="hero-description relative z-10">
            Your complete guide to the Vicharanashala Internship Programme.
          </p>

        </section>

        {/* ── 1. Stats row ── */}
        <ScrollReveal stagger>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ScrollRevealItem>
              <StatCard
                icon={<FileText size={18} className="text-blue-600" />}
                value={totalFAQs}
                label="Total FAQs"
                accent="bg-blue-50"
              />
            </ScrollRevealItem>
            <ScrollRevealItem>
              <StatCard
                icon={<Layers size={18} className="text-purple-600" />}
                value={totalSecs}
                label="Sections"
                accent="bg-purple-50"
              />
            </ScrollRevealItem>
            <ScrollRevealItem>
              <StatCard
                icon={<AlertTriangle size={18} className="text-red-500" />}
                value={critCount}
                label="Critical Items"
                accent="bg-red-50"
              />
            </ScrollRevealItem>
            <ScrollRevealItem>
              <StatCard
                icon={<Eye size={18} className="text-teal-600" />}
                value={totalViews.toLocaleString()}
                label="Total Views"
                accent="bg-teal-50"
              />
            </ScrollRevealItem>
          </div>
        </ScrollReveal>

        {/* ── 2. Programme intro card ── */}
        <ScrollReveal>
          <TiltCard className="doc-card bg-white border border-slate-100 rounded-2xl p-6 shadow-sm" intensity={2}>
            <p className="text-[11px] font-bold tracking-[0.18em] text-amber-600 uppercase mb-2">The Programme</p>
            <p className="text-slate-700 text-sm leading-relaxed max-w-2xl">
              Every selected candidate sees a result panel when they log in. That panel contains the next steps —
              what to read, what to submit, and which badge phase you're currently in. This dashboard maps the
              full eight-week arc so you know exactly what's coming before it arrives.
            </p>
            <MagneticButton
              onClick={onSearchOpen ?? (() => { })}
              className="mt-4 flex items-center gap-2 text-xs text-amber-700 border border-amber-200 bg-amber-50 px-4 py-2 rounded-full hover:bg-amber-100 font-medium"
            >
              <span>Search any FAQ</span>
              <ChevronRight size={12} className="doc-arrow" />
            </MagneticButton>
          </TiltCard>
        </ScrollReveal>

        {/* ── 3. Timeline + VINS side panel ── */}
        <ScrollReveal>
          <h2 className="text-sm font-bold text-slate-900 mb-1">Week-by-Week Timeline</h2>
          <p className="text-xs text-slate-500 mb-5 font-normal">Eight weeks from onboarding to results</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Timeline */}
            <div className="lg:col-span-2">
              <Timeline />
            </div>

            {/* VINS card + trending */}
            <div className="space-y-4">
              <VINSCard />

              {/* Trending */}
              {trending.length > 0 && (
                <TiltCard className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm" intensity={2}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-slate-600" />
                    <span className="text-sm font-bold text-slate-900">Trending this week</span>
                  </div>
                  <div className="space-y-0.5">
                    {trending.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => navigate(`/faq?q=${item.id}`)}
                        className="w-full text-left flex items-start gap-3 px-1 py-2 rounded-lg hover:bg-slate-50 group transition-colors"
                      >
                        <span className="text-sm font-bold text-slate-300 w-4 flex-shrink-0 mt-px">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-800 font-medium leading-snug line-clamp-2">{item.question}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-500 font-normal">{item.category}</span>
                            <span className="text-[11px] text-green-600 font-medium">{item.delta}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </TiltCard>
              )}

              {/* FAQ sections quick-nav */}
              <TiltCard className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm" intensity={2}>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.12em] mb-3">Browse Sections</p>
                <div className="space-y-1">
                  {faqData.map(section => {
                    const meta = sectionMeta[section.id] || sectionMeta.noc;
                    const crit = section.questions.filter(q => q.urgency === 'critical').length;
                    return (
                      <button
                        key={section.id}
                        onClick={() => navigate(`/faq?section=${section.id}`)}
                        className="doc-card w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 group transition-colors"
                      >
                        <span className={`doc-icon ${meta.iconColor} flex-shrink-0`}>{meta.icon}</span>
                        <span className="text-xs text-slate-700 font-medium flex-1 group-hover:text-slate-900 truncate">{section.title}</span>
                        {crit > 0 && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{crit}</span>
                        )}
                        <ArrowRight size={11} className="doc-arrow text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </TiltCard>
            </div>
          </div>
        </ScrollReveal>

        {/* ── 4. Badge Journey ── */}
        <ScrollReveal>
          <BadgeJourney />
        </ScrollReveal>

        {/* ── 5. Section Health ── */}
        <ScrollReveal>
          <SectionHealth />
        </ScrollReveal>

      </div>
    </div>
  );
}

/* ── Alert Bar — reads from admin pinned alert ── */
function AlertBar({ onDismiss }) {
  const { pinnedAlert } = useAlerts();

  if (!pinnedAlert) return null;

  const priorityColors = {
    low: 'bg-blue-600',
    normal: 'bg-amber-600',
    high: 'bg-orange-600',
    critical: 'bg-[#c0392b]',
  };

  return (
    <div className={`${priorityColors[pinnedAlert.priority] || 'bg-[#c0392b]'} text-white px-5 py-2.5 flex items-center gap-2.5 text-sm`}>
      <AlertTriangle size={14} className="flex-shrink-0 text-white/90" />
      <span>
        <span className="font-semibold">{pinnedAlert.title}.</span>{' '}
        {pinnedAlert.message}
      </span>
      <button onClick={onDismiss} className="ml-auto text-white/70 hover:text-white p-0.5 rounded">
        <X size={14} />
      </button>
    </div>
  );
}
