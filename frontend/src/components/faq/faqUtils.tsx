import React from 'react';

// Shared FAQ item interface
export interface FAQItem {
  _id: string;
  question?: string;
  title?: string;
  answer?: string;
  body?: string;
  category?: string;
  categoryDescription?: string;
  description?: string;
  summary?: string;
  categoryNumber?: number;
  questionNumber?: string;
  source?: 'faq' | 'community';
  trustLevel?: string;
  sourceType?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  // Freshness system — required for the public FreshnessBadge
  reviewStatus?: 'verified' | 'pending_review' | 'update_requested';
  lastVerifiedDate?: string;
  reviewIntervalDays?: number;
  freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
  [key: string]: unknown;
}

export function TrustBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { label: string; class: string }> = {
    high:   { label: 'Official', class: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/10 dark:text-gray-300 dark:border-white/10' },
    expert: { label: 'Admin Approved', class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-white/10 dark:text-blue-300 dark:border-white/10' },
    medium: { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-white/10 dark:text-emerald-300 dark:border-white/10' },
    low:    { label: 'Community', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-white/10 dark:text-amber-300 dark:border-white/10' },
  };
  const cfg = map[level];
  if (!cfg) return null;
  return (
    <span className={`ml-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

export function SourceBadge({ sourceType }: { sourceType?: string }) {
  if (!sourceType || sourceType === 'manual') return null;
  const map: Record<string, { label: string; class: string }> = {
    community_promotion: { label: 'From Community', class: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-white/10 dark:text-purple-300 dark:border-white/10' },
    zoom_transcript:     { label: 'From Meetings',  class: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-white/10 dark:text-cyan-300 dark:border-white/10' },
    expert_verified:     { label: 'Expert Verified', class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-white/10 dark:text-blue-300 dark:border-white/10' },
  };
  const cfg = map[sourceType];
  if (!cfg) return null;
  return (
    <span className={`ml-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

// Icon components
export const IconBook = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h7a3 3 0 0 1 3 3v11H6a3 3 0 0 0-3 3z" />
    <path d="M21 5h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 3z" />
  </svg>
);

export const IconUsers = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 19a5 5 0 0 1 10 0" />
    <path d="M14 19a4 4 0 0 1 7 0" />
  </svg>
);

export const IconClock = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const IconShieldDoc = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v4h4" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

export const IconFileText = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v4h4" />
    <path d="M8 13h8" />
    <path d="M8 17h8" />
  </svg>
);

export const IconFolderCode = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 13l-2 2 2 2" />
    <path d="M15 13l2 2-2 2" />
  </svg>
);

export const IconLayers = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l9 5-9 5-9-5 9-5z" />
    <path d="M3 12l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </svg>
);

export const IconBadge = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M8 12l-2 8 4-2 2 2 2-2 4 2-2-8" />
  </svg>
);

export const IconBriefcase = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M3 13h18" />
  </svg>
);

export const IconGrid = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const getCategoryTone = (name: string = ''): { accent: string; halo: string } => {
  return { accent: 'text-accent', halo: 'bg-accent/10' };
};

// ── Claymorphism card theme system ──────────────────────────────
export interface CategoryTheme {
  gradient: string;
  gradientDark: string;
  badgeBg: string;
  badgeBgDark: string;
  badgeColor: string;
  badgeColorDark: string;
  ctaColor: string;
  ctaColorDark: string;
  svgPath: string;
  /** Light mode — hue-rotation applied to the (purple-source) illustration */
  illustrationHue: string;
  /** Light mode — soft colored glow for icon + illustration */
  illustrationGlow: string;
  /** Dark mode only — hue-rotation applied to the (purple-source) illustration */
  illustrationHueDark: string;
  /** Dark mode only — soft neon glow color for icon + illustration */
  illustrationGlowDark: string;
}

// ── Light-mode icon color presets (warm sage design system) ─────
// Source illustrations are purple (~281°); hue-rotate shifts them.
// Icons use the system's main colors; CTA text uses deeper shades
// for accessible contrast.
const LIGHT_ICON_SAGE = {
  gradient: 'linear-gradient(180deg, rgba(107,143,113,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: '#E6F0E8',
  badgeColor: '#6B8F71',
  ctaColor: '#4C6B52',
  illustrationHue: '-151deg',   // purple → warm sage (#6B8F71)
  illustrationGlow: 'rgba(107,143,113,0.16)',
};
const LIGHT_ICON_GOLD = {
  gradient: 'linear-gradient(180deg, rgba(212,160,23,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(212,160,23,0.14)',
  badgeColor: '#D4A017',
  ctaColor: '#8A6914',
  illustrationHue: '120deg',    // purple → warm gold (#D4A017–#E6C65B)
  illustrationGlow: 'rgba(230,198,91,0.18)',
};
const LIGHT_ICON_SKY = {
  gradient: 'linear-gradient(180deg, rgba(95,168,211,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(95,168,211,0.14)',
  badgeColor: '#5FA8D3',
  ctaColor: '#2E6E96',
  illustrationHue: '-79deg',    // purple → soft sky blue (#5FA8D3)
  illustrationGlow: 'rgba(95,168,211,0.16)',
};
const LIGHT_ICON_TEAL = {
  gradient: 'linear-gradient(180deg, rgba(76,140,120,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(76,140,120,0.14)',
  badgeColor: '#4C8C78',
  ctaColor: '#3A6B5C',
  illustrationHue: '-120deg',   // purple → deep teal green (#4C8C78)
  illustrationGlow: 'rgba(76,140,120,0.16)',
};

// ── Dark-mode icon color presets (icons/illustrations only) ─────
// Source illustrations are purple (~281°); hue-rotate shifts them.
const DARK_ICON_EMERALD = {
  badgeBgDark: 'rgba(34,197,94,0.12)',
  badgeColorDark: '#4ADE80',
  illustrationHueDark: '-139deg',   // purple → emerald (#22C55E–#4ADE80)
  illustrationGlowDark: 'rgba(74,222,128,0.18)',
};
const DARK_ICON_GOLD = {
  badgeBgDark: 'rgba(245,158,11,0.12)',
  badgeColorDark: '#FCD34D',
  illustrationHueDark: '120deg',    // purple → gold/amber (#F59E0B–#FCD34D)
  illustrationGlowDark: 'rgba(252,211,77,0.16)',
};
const DARK_ICON_CYAN = {
  badgeBgDark: 'rgba(6,182,212,0.12)',
  badgeColorDark: '#67E8F9',
  illustrationHueDark: '-92deg',    // purple → cyan (#06B6D4–#67E8F9)
  illustrationGlowDark: 'rgba(103,232,249,0.16)',
};
const DARK_ICON_TEAL = {
  badgeBgDark: 'rgba(20,184,166,0.12)',
  badgeColorDark: '#2DD4BF',
  illustrationHueDark: '-108deg',   // purple → teal green (#14B8A6)
  illustrationGlowDark: 'rgba(45,212,191,0.16)',
};

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  green: {
    // About Internship — warm sage
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#5ec07e',
    svgPath: '/book.svg',
    ...LIGHT_ICON_SAGE,
    ...DARK_ICON_EMERALD,
  },
  blue: {
    // Phases / courses — soft sky blue
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#6da3e8',
    svgPath: '/folder.svg',
    ...LIGHT_ICON_SKY,
    ...DARK_ICON_EMERALD,
  },
  yellow: {
    // Chat / Yaksha — warm gold
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#d4b04a',
    svgPath: '/chat.svg',
    ...LIGHT_ICON_GOLD,
    ...DARK_ICON_EMERALD,
  },
  purple: {
    // Vibe / platform — warm sage (no purple icons)
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#a88ad8',
    svgPath: '/monitor.svg',
    ...LIGHT_ICON_SAGE,
    ...DARK_ICON_EMERALD,
  },
  teal: {
    // Team / project — deep teal green
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#4db8aa',
    svgPath: '/team.svg',
    ...LIGHT_ICON_TEAL,
    ...DARK_ICON_EMERALD,
  },
  orange: {
    // Timing / schedule — warm gold
    gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
    ctaColorDark: '#d89850',
    svgPath: '/calender.svg',
    ...LIGHT_ICON_GOLD,
    ...DARK_ICON_EMERALD,
  },
};

// Fallback theme (shield — Code of Conduct / Security → soft sky blue)
const FALLBACK_THEME: CategoryTheme = {
  gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
  ctaColorDark: '#7eb07e',
  svgPath: '/shield.svg',
  ...LIGHT_ICON_SKY,
  ...DARK_ICON_CYAN,
};

export const getCategoryTheme = (name: string = ''): CategoryTheme => {
  const key = name.toLowerCase();
  if (key.includes('intern') || key.includes('about')) return CATEGORY_THEMES.green;
  if (key.includes('phase') || key.includes('course')) return CATEGORY_THEMES.blue;
  if (key.includes('chat') || key.includes('yaksha')) return CATEGORY_THEMES.yellow;
  if (key.includes('vibe') || key.includes('platform')) return CATEGORY_THEMES.purple;
  if (key.includes('team')) return CATEGORY_THEMES.teal;
  if (key.includes('timing') || key.includes('date') || key.includes('schedule')) return CATEGORY_THEMES.orange;
  if (key.includes('noc')) return { ...CATEGORY_THEMES.green, ...LIGHT_ICON_TEAL, ...DARK_ICON_TEAL, svgPath: '/document.svg' };
  if (key.includes('certificate')) return { ...CATEGORY_THEMES.green, ...LIGHT_ICON_GOLD, ...DARK_ICON_GOLD, svgPath: '/document.svg' };
  if (key.includes('offer')) return { ...CATEGORY_THEMES.blue, svgPath: '/document.svg' };
  if (key.includes('project')) return { ...CATEGORY_THEMES.teal, svgPath: '/folder.svg' };
  if (key.includes('rosetta')) return { ...CATEGORY_THEMES.purple, svgPath: '/folder.svg' };
  // Achievement-type categories — gold icons (illustration unchanged)
  if (key.includes('cert') || key.includes('achievement')) return { ...FALLBACK_THEME, ...LIGHT_ICON_GOLD, ...DARK_ICON_GOLD, svgPath: FALLBACK_THEME.svgPath };
  // Interviews — warm sage (illustration unchanged)
  if (key.includes('interview')) return { ...FALLBACK_THEME, ...LIGHT_ICON_SAGE, ...DARK_ICON_EMERALD, svgPath: FALLBACK_THEME.svgPath };
  return FALLBACK_THEME;
};

export const getCategoryIcon = (name: string = ''): React.ReactNode => {
  const key = name.toLowerCase();
  if (key.includes('vibe') || key.includes('learning')) return <IconBook />;
  if (key.includes('team')) return <IconUsers />;
  if (key.includes('timing') || key.includes('schedule')) return <IconClock />;
  if (key.includes('noc') || key.includes('no objection')) return <IconShieldDoc />;
  if (key.includes('offer')) return <IconFileText />;
  if (key.includes('project')) return <IconFolderCode />;
  if (key.includes('rosetta')) return <IconLayers />;
  if (key.includes('cert')) return <IconBadge />;
  if (key.includes('interview')) return <IconBriefcase />;
  return <IconGrid />;
};

export const getCategoryDescription = (items: FAQItem[] = []): string => {
  if (!items.length) return '';
  const candidate = items[0]?.categoryDescription
    || items[0]?.description
    || items[0]?.summary
    || '';
  return typeof candidate === 'string' ? candidate : '';
};

export const getCategoryIndex = (name: string = ''): string => {
  const match = name.match(/^\s*(\d+)/);
  return match ? match[1] : '';
};

export const applyQuestionNumbers = (grouped: Record<string, FAQItem[]>): Record<string, FAQItem[]> => {
  const result: Record<string, FAQItem[]> = {};
  
  // Sort category names to determine their 1, 2, 3... index
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const an = Number(a.match(/^\s*(\d+)/)?.[1] ?? '0');
    const bn = Number(b.match(/^\s*(\d+)/)?.[1] ?? '0');
    if (an !== bn) return an - bn;
    return a.localeCompare(b);
  });

  sortedCategories.forEach((catName, catIndex) => {
    const items = grouped[catName];
    // Start index from 1
    const categoryNumber = catIndex + 1;
    
    result[catName] = items.map((item, idx) => ({
      ...item,
      categoryNumber: categoryNumber,
      questionNumber: `${categoryNumber}.${idx + 1}`,
    }));
  });
  
  return result;
};

export const formatCategoryName = (name: string = ''): string => (
  name.replace(/^\s*\d+\s*[.)-]?\s*/g, '').trim()
);

export const getQuestionTitle = (item: FAQItem): string => item?.question || item?.title || 'Untitled question';
export const getAnswerText = (item: FAQItem): string => item?.answer || item?.body || '';

export const formatDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
