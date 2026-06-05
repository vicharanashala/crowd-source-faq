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
    high:   { label: 'Official', class: 'bg-mist text-ink-soft border-border' },
    expert: { label: 'Admin Approved', class: 'bg-accent-light text-accent border-accent/30' },
    medium: { label: 'Community Approved', class: 'bg-accent-light text-accent border-accent/30' },
    low:    { label: 'Community', class: 'bg-warning-light text-warning border-warning/30' },
  };
  const cfg = map[level];
  if (!cfg) return null;
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

export function SourceBadge({ sourceType }: { sourceType?: string }) {
  if (!sourceType || sourceType === 'manual') return null;
  const map: Record<string, { label: string; class: string }> = {
    community_promotion: { label: 'From Community', class: 'bg-[rgba(139,92,246,0.1)] text-[#8b5cf6] border-[rgba(139,92,246,0.3)]' },
    zoom_transcript:     { label: 'From Meetings',  class: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    expert_verified:     { label: 'Expert Verified', class: 'bg-accent-light text-accent border-accent/30' },
  };
  const cfg = map[sourceType];
  if (!cfg) return null;
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.class}`}>
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
