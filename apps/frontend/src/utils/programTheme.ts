/**
 * Program theme + copy helpers for the v1.69 microsite.
 *
 * The ProgramSettings payload is a flat data structure; this file
 * turns it into CSS-in-JS objects the React tree can spread onto
 * elements. No theme library — we stay within the project's
 * existing `style={...}` convention.
 */

import type { ProgramTheme, SectionKey } from '../types/program';

interface ThemeCss {
  backgroundCss: string;
  gradientCss: string;
  overlayCss: string;
  heroPill: React.CSSProperties;
  heroTitle: React.CSSProperties;
  primaryButton: React.CSSProperties;
  iconBubbleBg: string;
  cardBorder: React.CSSProperties;
  cardOpenBorder: React.CSSProperties;
  statCard: React.CSSProperties;
  fontCss: string;
}

export function programThemeStyles(theme: ProgramTheme): ThemeCss {
  const bg = theme.background;
  const isDark = bg === 'ink';
  return {
    fontCss: theme.fontFamily === 'sans' ? 'var(--font-sans, system-ui, sans-serif)' : 'var(--font-serif, Georgia, serif)',
    backgroundCss: isDark ? '#0f1110' : bg === 'mist' ? '#f3f1ec' : '#fbf8f1',
    gradientCss:
      `radial-gradient(ellipse at 20% 0%, ${hexA(theme.primaryColor, 0.18)} 0%, transparent 50%),` +
      `radial-gradient(ellipse at 80% 30%, ${hexA(theme.accentColor, 0.14)} 0%, transparent 50%),` +
      `linear-gradient(180deg, ${hexA(theme.primaryColor, 0.04)} 0%, transparent 80%)`,
    overlayCss: `linear-gradient(180deg, ${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'} 0%, ${isDark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)'} 100%)`,
    heroPill: {
      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
      color: theme.accentColor,
      borderColor: hexA(theme.accentColor, 0.3),
    },
    heroTitle: {
      // text-glow effect uses the primary color softly
      textShadow: `0 0 60px ${hexA(theme.primaryColor, 0.18)}`,
    },
    primaryButton: {
      background: theme.primaryColor,
      color: '#ffffff',
      boxShadow: `0 10px 30px ${hexA(theme.primaryColor, 0.32)}`,
    },
    iconBubbleBg: hexA(theme.accentColor, 0.16),
    cardBorder: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
    cardOpenBorder: { borderColor: hexA(theme.accentColor, 0.4) },
    statCard: {
      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
  };
}

/**
 * Section eyebrow + title copy. Each entry returns the small
 * accent text and the bigger section heading shown above the
 * section body.
 */
export function getSectionCopy(key: SectionKey): { eyebrow: string; title: string; tagline: string } {
  switch (key) {
    case 'stats':     return { eyebrow: 'At a glance',  title: 'Program stats',   tagline: 'Counts per content type' };
    case 'faqs':      return { eyebrow: 'Knowledge',    title: 'Frequently asked', tagline: 'Curated by mentors' };
    case 'community': return { eyebrow: 'Discussion',   title: 'Community',       tagline: 'Ask, answer, learn' };
    case 'zoom':      return { eyebrow: 'Live sessions', title: 'Zoom recordings', tagline: 'Transcripts + insights' };
    case 'kb':        return { eyebrow: 'Library',      title: 'Knowledge base',  tagline: 'Auto-extracted, always fresh' };
  }
}

// tiny utility: append alpha (0–1) to a #rrggbb hex → #rrggbbaa
function hexA(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  const aa = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex}${aa}`;
}

// Re-export the slug helper so program-page code can compute the
// slug from the program name when rendering per-program links.
export { slugifyProgramName } from './programSlug';
