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

import {
  sourceBadgeBase,
  sourceBadgeCommunity,
  sourceBadgeExpert,
  sourceBadgeZoom,
  trustBadgeBase,
  trustBadgeExpert,
  trustBadgeHigh,
  trustBadgeLow,
  trustBadgeMedium,
} from '../../styles/style_config';

export function TrustBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { label: string; class: string }> = {
    high:   { label: 'Official',          class: trustBadgeHigh },
    expert: { label: 'Admin Approved',   class: trustBadgeExpert },
    medium: { label: 'Community Approved', class: trustBadgeMedium },
    low:    { label: 'Community',        class: trustBadgeLow },
  };
  const cfg = map[level];
  if (!cfg) return null;
  return (
    <span className={`${trustBadgeBase} ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

export function SourceBadge({ sourceType }: { sourceType?: string }) {
  if (!sourceType || sourceType === 'manual') return null;
  const map: Record<string, { label: string; class: string }> = {
    community_promotion: { label: 'From Community', class: sourceBadgeCommunity },
    zoom_transcript:     { label: 'From Meetings',  class: sourceBadgeZoom },
    expert_verified:     { label: 'Expert Verified', class: sourceBadgeExpert },
  };
  const cfg = map[sourceType];
  if (!cfg) return null;
  return (
    <span className={`${sourceBadgeBase} ${cfg.class}`}>
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

// ── Single source of truth: category configuration ─────────────
// All components should reference this config instead of hardcoding.
// To add a new category, only this mapping needs to change.
export interface CategoryConfig {
  name: string;
  slug: string;
  emoji: string;
  icon: React.ReactNode;
  color: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'Internship Basics': {
    name: 'Internship Basics',
    slug: 'internship-basics',
    emoji: '\uD83C\uDF93',
    icon: <IconGrid />,
    color: '#2563EB',
  },
  'Projects & GitHub': {
    name: 'Projects & GitHub',
    slug: 'projects-github',
    emoji: '\uD83D\uDCC2',
    icon: <IconFolderCode />,
    color: '#14B8A6',
  },
  'Attendance & Zoom': {
    name: 'Attendance & Zoom',
    slug: 'attendance-zoom',
    emoji: '\uD83D\uDCC5',
    icon: <IconClock />,
    color: '#EF4444',
  },
  'Learning Platform': {
    name: 'Learning Platform',
    slug: 'learning-platform',
    emoji: '\uD83D\uDCBB',
    icon: <IconBook />,
    color: '#6366F1',
  },
  'Teams & Collaboration': {
    name: 'Teams & Collaboration',
    slug: 'teams-collaboration',
    emoji: '\uD83D\uDC65',
    icon: <IconUsers />,
    color: '#F97316',
  },
  'Rewards & Certificates': {
    name: 'Rewards & Certificates',
    slug: 'rewards-certificates',
    emoji: '\uD83C\uDFC6',
    icon: <IconBadge />,
    color: '#EC4899',
  },
  'AI & Tools': {
    name: 'AI & Tools',
    slug: 'ai-tools',
    emoji: '\uD83E\uDD16',
    icon: <IconLayers />,
    color: '#7C3AED',
  },
  'Using Yaksha': {
    name: 'Using Yaksha',
    slug: 'using-yaksha',
    emoji: '\uD83D\uDD0D',
    icon: <IconBriefcase />,
    color: '#0891B2',
  },
  'Technical Support': {
    name: 'Technical Support',
    slug: 'technical-support',
    emoji: '\uD83D\uDEE0\uFE0F',
    icon: <IconShieldDoc />,
    color: '#DC2626',
  },
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
const LIGHT_ICON_SAGE = {
  gradient: 'linear-gradient(180deg, rgba(107,143,113,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: '#E6F0E8',
  badgeColor: '#6B8F71',
  ctaColor: '#4C6B52',
  illustrationHue: '-151deg',
  illustrationGlow: 'rgba(107,143,113,0.16)',
};
const LIGHT_ICON_GOLD = {
  gradient: 'linear-gradient(180deg, rgba(212,160,23,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(212,160,23,0.14)',
  badgeColor: '#D4A017',
  ctaColor: '#8A6914',
  illustrationHue: '120deg',
  illustrationGlow: 'rgba(230,198,91,0.18)',
};
const LIGHT_ICON_SKY = {
  gradient: 'linear-gradient(180deg, rgba(95,168,211,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(95,168,211,0.14)',
  badgeColor: '#5FA8D3',
  ctaColor: '#2E6E96',
  illustrationHue: '-79deg',
  illustrationGlow: 'rgba(95,168,211,0.16)',
};
const LIGHT_ICON_TEAL = {
  gradient: 'linear-gradient(180deg, rgba(76,140,120,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(76,140,120,0.14)',
  badgeColor: '#4C8C78',
  ctaColor: '#3A6B5C',
  illustrationHue: '-120deg',
  illustrationGlow: 'rgba(76,140,120,0.16)',
};
const LIGHT_ICON_ROSE = {
  gradient: 'linear-gradient(180deg, rgba(236,72,153,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(236,72,153,0.14)',
  badgeColor: '#DB2777',
  ctaColor: '#BE185D',
  illustrationHue: '60deg',
  illustrationGlow: 'rgba(236,72,153,0.16)',
};
const LIGHT_ICON_VIOLET = {
  gradient: 'linear-gradient(180deg, rgba(124,58,237,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(124,58,237,0.14)',
  badgeColor: '#7C3AED',
  ctaColor: '#6D28D9',
  illustrationHue: '-30deg',
  illustrationGlow: 'rgba(124,58,237,0.16)',
};
const LIGHT_ICON_RED = {
  gradient: 'linear-gradient(180deg, rgba(220,38,38,0.05) 0%, rgba(255,255,255,1) 100%)',
  badgeBg: 'rgba(220,38,38,0.14)',
  badgeColor: '#DC2626',
  ctaColor: '#B91C1C',
  illustrationHue: '0deg',
  illustrationGlow: 'rgba(220,38,38,0.16)',
};

// ── Dark-mode icon color presets (icons/illustrations only) ─────
const DARK_ICON_EMERALD = {
  badgeBgDark: 'rgba(34,197,94,0.12)',
  badgeColorDark: '#4ADE80',
  illustrationHueDark: '-139deg',
  illustrationGlowDark: 'rgba(74,222,128,0.18)',
};
const DARK_ICON_GOLD = {
  badgeBgDark: 'rgba(245,158,11,0.12)',
  badgeColorDark: '#FCD34D',
  illustrationHueDark: '120deg',
  illustrationGlowDark: 'rgba(252,211,77,0.16)',
};
const DARK_ICON_CYAN = {
  badgeBgDark: 'rgba(6,182,212,0.12)',
  badgeColorDark: '#67E8F9',
  illustrationHueDark: '-92deg',
  illustrationGlowDark: 'rgba(103,232,249,0.16)',
};
const DARK_ICON_TEAL = {
  badgeBgDark: 'rgba(20,184,166,0.12)',
  badgeColorDark: '#2DD4BF',
  illustrationHueDark: '-108deg',
  illustrationGlowDark: 'rgba(45,212,191,0.16)',
};
const DARK_ICON_ROSE = {
  badgeBgDark: 'rgba(236,72,153,0.12)',
  badgeColorDark: '#F472B6',
  illustrationHueDark: '60deg',
  illustrationGlowDark: 'rgba(244,114,182,0.16)',
};
const DARK_ICON_VIOLET = {
  badgeBgDark: 'rgba(139,92,246,0.12)',
  badgeColorDark: '#A78BFA',
  illustrationHueDark: '-30deg',
  illustrationGlowDark: 'rgba(167,139,250,0.16)',
};
const DARK_ICON_RED = {
  badgeBgDark: 'rgba(248,113,113,0.12)',
  badgeColorDark: '#FCA5A5',
  illustrationHueDark: '0deg',
  illustrationGlowDark: 'rgba(252,165,165,0.16)',
};

// ── Theme presets for the 9 categories ─────────────────────────
const CATEGORY_THEME_MAP: Record<string, CategoryTheme> = {
  'Internship Basics': {
    gradientDark: 'linear-gradient(135deg, rgba(37,99,235,0.03), rgba(37,99,235,0.008))',
    ctaColorDark: '#6da3e8',
    svgPath: '/book.svg',
    ...LIGHT_ICON_SKY,
    ...DARK_ICON_EMERALD,
  },
  'Projects & GitHub': {
    gradientDark: 'linear-gradient(135deg, rgba(20,184,166,0.03), rgba(20,184,166,0.008))',
    ctaColorDark: '#4db8aa',
    svgPath: '/folder.svg',
    ...LIGHT_ICON_TEAL,
    ...DARK_ICON_TEAL,
  },
  'Attendance & Zoom': {
    gradientDark: 'linear-gradient(135deg, rgba(239,68,68,0.03), rgba(239,68,68,0.008))',
    ctaColorDark: '#f87171',
    svgPath: '/calender.svg',
    ...LIGHT_ICON_GOLD,
    ...DARK_ICON_GOLD,
  },
  'Learning Platform': {
    gradientDark: 'linear-gradient(135deg, rgba(99,102,241,0.03), rgba(99,102,241,0.008))',
    ctaColorDark: '#a88ad8',
    svgPath: '/monitor.svg',
    ...LIGHT_ICON_SAGE,
    ...DARK_ICON_EMERALD,
  },
  'Teams & Collaboration': {
    gradientDark: 'linear-gradient(135deg, rgba(249,115,22,0.03), rgba(249,115,22,0.008))',
    ctaColorDark: '#d89850',
    svgPath: '/team.svg',
    ...LIGHT_ICON_GOLD,
    ...DARK_ICON_GOLD,
  },
  'Rewards & Certificates': {
    gradientDark: 'linear-gradient(135deg, rgba(236,72,153,0.03), rgba(236,72,153,0.008))',
    ctaColorDark: '#f472b6',
    svgPath: '/document.svg',
    ...LIGHT_ICON_ROSE,
    ...DARK_ICON_ROSE,
  },
  'AI & Tools': {
    gradientDark: 'linear-gradient(135deg, rgba(124,58,237,0.03), rgba(124,58,237,0.008))',
    ctaColorDark: '#a78bfa',
    svgPath: '/chat.svg',
    ...LIGHT_ICON_VIOLET,
    ...DARK_ICON_VIOLET,
  },
  'Using Yaksha': {
    gradientDark: 'linear-gradient(135deg, rgba(8,145,178,0.03), rgba(8,145,178,0.008))',
    ctaColorDark: '#67e8f9',
    svgPath: '/chat.svg',
    ...LIGHT_ICON_SKY,
    ...DARK_ICON_CYAN,
  },
  'Technical Support': {
    gradientDark: 'linear-gradient(135deg, rgba(220,38,38,0.03), rgba(220,38,38,0.008))',
    ctaColorDark: '#fca5a5',
    svgPath: '/shield.svg',
    ...LIGHT_ICON_RED,
    ...DARK_ICON_RED,
  },
};

// Fallback theme for unrecognized category names
const FALLBACK_THEME: CategoryTheme = {
  gradientDark: 'linear-gradient(135deg, rgba(16,185,129,0.03), rgba(16,185,129,0.008))',
  ctaColorDark: '#7eb07e',
  svgPath: '/shield.svg',
  ...LIGHT_ICON_SKY,
  ...DARK_ICON_CYAN,
};

export const getCategoryTheme = (name: string = ''): CategoryTheme => {
  if (CATEGORY_THEME_MAP[name]) return CATEGORY_THEME_MAP[name];
  // Fallback: keyword matching for any legacy category names
  const key = name.toLowerCase();
  if (key.includes('intern') || key.includes('about') || key.includes('basics')) return CATEGORY_THEME_MAP['Internship Basics'];
  if (key.includes('project') || key.includes('github')) return CATEGORY_THEME_MAP['Projects & GitHub'];
  if (key.includes('attendance') || key.includes('zoom') || key.includes('timeline')) return CATEGORY_THEME_MAP['Attendance & Zoom'];
  if (key.includes('learn') || key.includes('vibe') || key.includes('platform') || key.includes('resource')) return CATEGORY_THEME_MAP['Learning Platform'];
  if (key.includes('team') || key.includes('mentor')) return CATEGORY_THEME_MAP['Teams & Collaboration'];
  if (key.includes('reward') || key.includes('certif') || key.includes('spurti') || key.includes('golden')) return CATEGORY_THEME_MAP['Rewards & Certificates'];
  if (key.includes('ai') || key.includes('tool')) return CATEGORY_THEME_MAP['AI & Tools'];
  if (key.includes('using') || key.includes('yaksha') || key.includes('faq') || key.includes('community') || key.includes('search')) return CATEGORY_THEME_MAP['Using Yaksha'];
  if (key.includes('technical') || key.includes('support') || key.includes('issue')) return CATEGORY_THEME_MAP['Technical Support'];
  return FALLBACK_THEME;
};

export const getCategoryIcon = (name: string = ''): React.ReactNode => {
  const config = CATEGORY_CONFIG[name];
  if (config) return config.icon;
  // Fallback: keyword matching for legacy names
  const key = name.toLowerCase();
  if (key.includes('intern') || key.includes('about') || key.includes('basics')) return <IconGrid />;
  if (key.includes('project') || key.includes('github')) return <IconFolderCode />;
  if (key.includes('attendance') || key.includes('zoom') || key.includes('timeline')) return <IconClock />;
  if (key.includes('learn') || key.includes('vibe')) return <IconBook />;
  if (key.includes('team') || key.includes('mentor')) return <IconUsers />;
  if (key.includes('cert') || key.includes('reward') || key.includes('spurti') || key.includes('golden')) return <IconBadge />;
  if (key.includes('ai') || key.includes('tool')) return <IconLayers />;
  if (key.includes('support') || key.includes('technical') || key.includes('issue')) return <IconShieldDoc />;
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
