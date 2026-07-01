/**
 * ProgramSettings — v1.69
 *
 * Mirrors the backend model at `backend/models/ProgramSettings.ts`.
 * One ProgramSettings per Batch. The program page reads these to
 * compose its hero, sections, and theme.
 */

export type BackgroundTone = 'cream' | 'mist' | 'ink';
export type FontFamily = 'serif' | 'sans';

export type SectionKey = 'stats' | 'faqs' | 'community' | 'zoom' | 'kb';

export interface ProgramTheme {
  primaryColor: string;
  accentColor: string;
  background: BackgroundTone;
  fontFamily: FontFamily;
}

export interface ProgramHero {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
}

export interface ProgramSections {
  showStats: boolean;
  showFAQs: boolean;
  showCommunity: boolean;
  showZoom: boolean;
  showKB: boolean;
  sectionOrder: SectionKey[];
}

export interface ProgramBranding {
  logoText: string;
  footerText: string;
}

export interface ProgramSettings {
  batchId: string;
  theme: ProgramTheme;
  hero: ProgramHero;
  sections: ProgramSections;
  branding: ProgramBranding;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgramData {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isDefault?: boolean;
  faqCount: number;
}

export interface ProgramResponse {
  program: ProgramData;
  settings: ProgramSettings;
}
