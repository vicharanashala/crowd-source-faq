import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { TimelineCardHeader } from '../ui/TimelineCardHeader';
import api from '../../utils/api';

/* ────────────────────────────────────────────────────────
   Icon Palette (20 curated icons)
   ──────────────────────────────────────────────────────── */
const ICON_PALETTE: Record<string, React.ReactNode> = {
  document: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  question: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  cube: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  flag: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  check: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  star: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  book: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  code: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  users: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  rocket: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>,
  trophy: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  clock: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  link: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  settings: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  video: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  target: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  zap: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  award: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  chat: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  calendar: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

/* ────────────────────────────────────────────────────────
   Interfaces
   ──────────────────────────────────────────────────────── */
interface ChecklistItem {
  _id: string;
  label: string;
  order: number;
  isMandatory: boolean;
}

interface StepResource {
  _id: string;
  title: string;
  url: string;
  type: 'link' | 'pdf' | 'video' | 'github' | 'doc' | 'discord';
}

interface CMSTimelineStep {
  _id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  isMandatory: boolean;
  isLocked: boolean;
  status: 'active' | 'inactive';
  completionType: 'checklist' | 'manual' | 'automatic';
  estimatedTime?: string;
  rewards?: string;
  mentorNotes?: string;
  resources: StepResource[];
  checklistItems: ChecklistItem[];
}

/* ────────────────────────────────────────────────────────
   Reusable Components
   ──────────────────────────────────────────────────────── */
function ProgressBar({ percent, color = 'accent', delay = 0 }: { percent: number; color?: string; delay?: number }) {
  const bg = color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-accent';
  return (
    <div className="w-full bg-border/40 rounded-full h-2 overflow-hidden">
      <motion.div
        initial={{ width: 0 }} animate={{ width: `${percent}%` }}
        transition={{ duration: 1.2, ease: 'easeOut', delay }}
        className={`${bg} h-2 rounded-full`}
      />
    </div>
  );
}

function StatusChip({ status }: { status: 'locked' | 'in-progress' | 'completed' }) {
  const styles = {
    'locked': 'bg-ink/5 text-ink-faint border-ink/10',
    'in-progress': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    'completed': 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  };
  const labels = { 'locked': 'Locked', 'in-progress': 'In Progress', 'completed': 'Completed' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded-full border ${styles[status]}`}>
      {status === 'completed' && <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
      {status === 'in-progress' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
      {labels[status]}
    </span>
  );
}

function CheckItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange(); }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full text-left group/check bg-bg/40 hover:bg-bg/80 border border-border/50 rounded-xl p-4 transition-all hover:border-accent/40">
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center border transition-all flex-shrink-0 ${
          checked ? 'bg-green-500 border-green-500 text-white scale-100' : 'bg-transparent border-border group-hover/check:border-green-500 scale-95 group-hover/check:scale-100'
        }`}>
          {checked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
        </div>
        <div>
          <div className={`text-base font-medium transition-colors ${checked ? 'text-ink-soft line-through' : 'text-ink group-hover/check:text-accent'}`}>{label}</div>
          <div className="text-sm text-ink-faint mt-1">Status: {checked ? <span className="text-green-500 font-medium">Completed</span> : <span className="text-amber-500 font-medium">Pending</span>}</div>
        </div>
      </div>
    </button>
  );
}

function StatBlock({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-bg/40 rounded-xl p-5 border border-border/50">
      <div className="text-[11px] text-ink-faint uppercase font-bold tracking-wider mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export default function ProjectTimelineTab() {
  const { user } = useAuth();
  const [expandedNodes, setExpandedNodes] = useState<number[]>([]);
  const [cmsSteps, setCmsSteps] = useState<CMSTimelineStep[]>([]);
  const [loading, setLoading] = useState(true);

  // Use localStorage to persist checklists locally for the session/user
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`timeline_checks_${user?._id}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  useEffect(() => {
    if (user?._id) {
      localStorage.setItem(`timeline_checks_${user._id}`, JSON.stringify(checklistState));
    }
  }, [checklistState, user?._id]);

  useEffect(() => {
    const fetchSteps = async () => {
      try {
        const res = await api.get('/welcome/timeline-steps');
        setCmsSteps(res.data);
        // Expand all by default
        setExpandedNodes([...Array(res.data.length + 1).keys()]); // +1 for the project card
      } catch (error) {
        console.error('Error fetching steps:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSteps();
  }, []);

  const toggleNode = (index: number) => {
    setExpandedNodes(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const toggleCheck = (id: string) => {
    setChecklistState(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // State specifically for the static Project card (still kept as hardcoded state for now)
  const [projectChecks, setProjectChecks] = useState({
    repoCloned: false,
    envSetup: false,
    docsRead: false,
    firstCommit: false,
  });
  const projectPercent = user?.projectAssigned
    ? Math.round(Object.values(projectChecks).filter(Boolean).length / Object.values(projectChecks).length * 100)
    : 0;

  // Compute total completion for the Hero progress bar
  let overallPercent = 0;
  if (cmsSteps.length > 0) {
    let totalItems = 0;
    let checkedItems = 0;
    
    cmsSteps.forEach(step => {
      step.checklistItems.forEach(item => {
        totalItems++;
        if (checklistState[item._id]) checkedItems++;
      });
    });

    Object.values(projectChecks).forEach(val => {
      totalItems++;
      if (val) checkedItems++;
    });

    overallPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  }

  // Render CMS Steps
  const renderedCmsSteps = cmsSteps.map((step, index) => {
    let percent = 0;
    if (step.checklistItems.length > 0) {
      const checkedCount = step.checklistItems.filter(item => checklistState[item._id]).length;
      percent = Math.round((checkedCount / step.checklistItems.length) * 100);
    } else {
      percent = 0; // manual completion not handled here yet
    }

    const isStepCompleted = step.completionType === 'checklist' && step.checklistItems.length > 0 && percent === 100;
    const isStepLocked = step.isLocked;
    const cardStatus = isStepLocked ? 'locked' : isStepCompleted ? 'completed' : 'in-progress';

    return {
      title: step.title,
      status: isStepCompleted ? ('completed' as const) : ('current' as const),
      cardStatus: cardStatus as 'locked' | 'completed' | 'in-progress',
      estimatedTime: step.estimatedTime || '-',
      lastUpdated: new Date().toLocaleDateString(),
      extraBadge: undefined,  // explicit undefined so the inferred union type matches the projectStep shape (TimelineCardHeader expects ReactNode)
      icon: ICON_PALETTE[step.icon] || ICON_PALETTE['document'],
      content: (
        <div className="space-y-5 text-left">
          <p className="text-sm text-ink-soft leading-relaxed">{step.description}</p>
          
          {/* Progress Hero */}
          <div className="bg-bg/50 rounded-xl p-5 border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink">{step.title} Progress</h4>
              <StatusChip status={cardStatus} />
            </div>
            {step.checklistItems.length > 0 && (
              <ProgressBar percent={percent} color={percent >= 100 ? 'green' : 'amber'} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Type" value={step.completionType === 'checklist' ? 'Checklist' : 'Manual'} />
              {step.checklistItems.length > 0 && (
                <StatBlock label="Completion" value={`${percent}%`} accent />
              )}
            </div>
          </div>

          {/* Checklist */}
          {step.checklistItems.length > 0 && (
            <div className="bg-bg/50 rounded-xl p-4 border border-border space-y-3">
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider">Requirements</div>
              {step.checklistItems.map(item => (
                <CheckItem 
                  key={item._id} 
                  label={item.label} 
                  checked={!!checklistState[item._id]} 
                  onChange={() => toggleCheck(item._id)} 
                />
              ))}
            </div>
          )}

          {/* Resources */}
          {step.resources.length > 0 && (
            <div className="bg-bg/50 rounded-xl p-5 border border-border">
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-4">Resources</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {step.resources.map(res => (
                  <div key={res._id} className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border/60 group/link cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={(e) => { e.stopPropagation(); window.open(res.url, '_blank'); }}>
                    <div className="w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center group-hover/link:border-accent group-hover/link:text-accent transition-colors text-ink-soft flex-shrink-0">
                      {ICON_PALETTE[res.type === 'video' ? 'video' : res.type === 'github' ? 'code' : res.type === 'discord' ? 'chat' : 'link']}
                    </div>
                    <div className="min-w-0">
                      <span className="group-hover/link:text-accent transition-colors font-semibold text-ink block truncate">{res.title}</span>
                      <span className="text-xs text-ink-faint capitalize">{res.type} Resource</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rewards */}
          {step.rewards && (
            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              Reward: {step.rewards}
            </div>
          )}
        </div>
      )
    };
  });

  // Project Step (Always injected at the end)
  const projectStep = {
    title: user?.projectAssigned || 'Pending Selection',
    status: (user?.projectAssigned ? 'current' : 'upcoming') as 'current' | 'upcoming',
    cardStatus: user?.projectAssigned ? 'in-progress' as const : 'locked' as const,
    estimatedTime: user?.projectAssigned ? 'Ongoing' : '-',
    lastUpdated: user?.projectAssignedAt ? user.projectAssignedAt.toLocaleDateString() : '-',
    extraBadge: user?.projectAssigned ? (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-accent/10 text-accent border border-accent/20">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" style={{ animationDuration: '2s' }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]"></span>
        </span>
        HERO PROJECT
      </span>
    ) : null,
    icon: ICON_PALETTE['cube'],
    content: user?.projectAssigned ? (
      <div className="space-y-5 text-left">
        <p className="text-sm text-ink-soft leading-relaxed">
          You are officially assigned to this project track. Set up your local environment, review project documentation, and begin your first contributions.
        </p>

        {/* Progress Hero */}
        <div className="bg-bg/50 rounded-xl p-5 border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink">Project Progress</h4>
            <StatusChip status={projectPercent >= 100 ? 'completed' : 'in-progress'} />
          </div>
          <ProgressBar percent={projectPercent} delay={0.4} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBlock label="Project" value={String(user.projectAssigned)} />
            <StatBlock label="Mentor" value={String(user.mentorAssigned || 'TBA')} />
            <StatBlock label="Stage" value="Environment Setup" />
            <StatBlock label="Progress" value={`${projectPercent}%`} accent />
          </div>
        </div>

        {/* Setup Checklist */}
        <div className="bg-bg/50 rounded-xl p-4 border border-border space-y-3">
          <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider">Setup Checklist</div>
          <CheckItem label="Clone Repository" checked={projectChecks.repoCloned} onChange={() => setProjectChecks(s => ({ ...s, repoCloned: !s.repoCloned }))} />
          <CheckItem label="Environment Setup (Node, DB, .env)" checked={projectChecks.envSetup} onChange={() => setProjectChecks(s => ({ ...s, envSetup: !s.envSetup }))} />
          <CheckItem label="Read Project Documentation" checked={projectChecks.docsRead} onChange={() => setProjectChecks(s => ({ ...s, docsRead: !s.docsRead }))} />
          <CheckItem label="Make First Commit / PR" checked={projectChecks.firstCommit} onChange={() => setProjectChecks(s => ({ ...s, firstCommit: !s.firstCommit }))} />
        </div>

        {/* Resources */}
        <div className="bg-bg/50 rounded-xl p-5 border border-border">
          <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-4">Project Resources</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border/60 group/link cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center group-hover/link:border-accent group-hover/link:text-accent transition-colors text-ink-soft flex-shrink-0">
                {ICON_PALETTE['code']}
              </div>
              <div className="min-w-0">
                <span className="group-hover/link:text-accent transition-colors font-semibold text-ink block truncate">Project Repository</span>
                <span className="text-xs text-ink-faint">Clone & run locally</span>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border/60 group/link cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center group-hover/link:border-accent group-hover/link:text-accent transition-colors text-ink-soft flex-shrink-0">
                {ICON_PALETTE['book']}
              </div>
              <div className="min-w-0">
                <span className="group-hover/link:text-accent transition-colors font-semibold text-ink block truncate">Setup Documentation</span>
                <span className="text-xs text-ink-faint">Installation & configuration guide</span>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border/60 group/link cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center group-hover/link:border-accent group-hover/link:text-accent transition-colors text-ink-soft flex-shrink-0">
                {ICON_PALETTE['users']}
              </div>
              <div className="min-w-0">
                <span className="group-hover/link:text-accent transition-colors font-semibold text-ink block truncate">Mentor Office Hours</span>
                <span className="text-xs text-ink-faint">Contact {user.mentorAssigned || 'your mentor'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-4 text-left">
        <p className="text-sm text-ink-soft leading-relaxed">
          Project selection is a mandatory step. Once you select a project, you will be assigned a mentor and provided with specific repositories and guides to begin your work.
        </p>
        <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
          <div className="text-[10px] text-yellow-600 dark:text-yellow-400 uppercase font-bold tracking-wider mb-1">Action Required</div>
          <div className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">Please select a project from the Project Discovery tab.</div>
        </div>
      </div>
    )
  };

  const timelineItems = [...renderedCmsSteps, projectStep];

  if (loading) {
    return <div className="text-center py-20 text-ink-soft">Loading timeline...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Premium Glass Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-12 p-8 md:p-10 rounded-[2rem] border border-[rgb(var(--border-rgb))]/30 bg-[rgb(var(--bg-card-rgb))]/40 backdrop-blur-xl overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--bg-primary-rgb))]/10 to-transparent opacity-50"></div>
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[80px] pointer-events-none translate-x-1/2 -translate-y-1/2 group-hover:bg-accent/10 transition-colors duration-700"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                <line x1="4" y1="22" x2="4" y2="15"></line>
              </svg>
            </div>
            <div className="text-left flex-1">
              <h2 className="text-3xl font-serif text-ink tracking-tight mb-2">Project Journey</h2>
              <p className="text-ink-soft text-base max-w-xl">
                Track your onboarding progression and access your assigned project environment.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full md:w-auto text-left border-t md:border-t-0 md:border-l border-border pt-6 md:pt-0 md:pl-8">
            <div>
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Overall Progress</div>
              <div className="text-3xl font-bold text-accent">{overallPercent}%</div>
            </div>
            <div>
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Current Stage</div>
              <div className="text-sm font-semibold text-ink truncate mt-2">{user?.projectAssigned ? 'Project Setup' : 'Orientation'}</div>
            </div>
            <div>
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Timeline Status</div>
              <div className="text-sm font-semibold text-green-500 mt-2">On Track</div>
            </div>
            <div>
              <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Next Milestone</div>
              <div className="text-sm font-semibold text-ink mt-2">{user?.projectAssigned ? 'First PR' : 'Project Selection'}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Timeline nodes */}
      <div className="space-y-8 relative before:absolute before:inset-0 before:left-10 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border/10 before:via-border before:to-border/10">
        {timelineItems.map((item, index) => {
          const isExpanded = expandedNodes.includes(index);

          return (
            <div key={index} className="relative flex flex-row items-start w-full group pt-2 pb-6">
              
              <div className="absolute left-10 w-10 h-10 rounded-full border border-border bg-bg shadow-sm transform -translate-x-1/2 flex items-center justify-center z-20 group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                <div className="flex items-center justify-center w-full h-full text-ink-soft group-hover:text-accent transition-colors m-0 p-0 leading-none">
                  {item.icon}
                </div>
              </div>

              <div className="w-full pl-20">
                <div
                  onClick={() => toggleNode(index)}
                  className="spatial-glass-card bg-[rgb(var(--bg-card-rgb))]/50 border border-[rgb(var(--border-rgb))]/30 rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] group-hover:border-accent/30 transition-all duration-300 cursor-pointer text-left"
                >
                  <TimelineCardHeader
                    status={item.status}
                    isExpanded={isExpanded}
                    isLeft={false}
                    extraBadge={item.extraBadge}
                  />

                  <h3 className="text-xl font-semibold text-ink mb-1 mt-2 group-hover:text-accent transition-colors">{item.title}</h3>

                  <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-faint">
                    {item.estimatedTime && item.estimatedTime !== '-' && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {item.estimatedTime}
                      </span>
                    )}
                    {item.lastUpdated && item.lastUpdated !== '-' && (
                      <span>Updated: {item.lastUpdated}</span>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 border-t border-border/50 mt-4 cursor-default" onClick={e => e.stopPropagation()}>
                          {item.content}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
