import React, { useEffect, useState } from 'react';
import { FAQItem, getCategoryTheme, getCategoryDescription, getCategoryIcon, formatCategoryName, getQuestionTitle } from './faqUtils';

interface CategoryCardProps {
  name: string;
  items: FAQItem[];
  onOpen: (name: string) => void;
}

export function CategoryCard({ name, items, onOpen }: CategoryCardProps) {
  const theme = getCategoryTheme(name);
  const description = getCategoryDescription(items);
  const previewQuestions = items.slice(0, 2);

  // Detect dark mode to swap theme colors
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const badgeBg = isDark ? theme.badgeBgDark : theme.badgeBg;
  const badgeColor = isDark ? theme.badgeColorDark : theme.badgeColor;
  const ctaColor = isDark ? theme.ctaColorDark : theme.ctaColor;

  // Subtle tinted background — near-white in light, green-dark in dark
  const cardStyle: React.CSSProperties = isDark
    ? {
        backgroundImage: theme.gradientDark,
      }
    : {
        backgroundColor: '#ffffff',
        backgroundImage: theme.gradient,
      };

  // Per-category illustration recolor + soft glow (colors only)
  const illustrationStyle: React.CSSProperties = {
    '--illu-hue': isDark ? theme.illustrationHueDark : theme.illustrationHue,
    '--illu-glow': isDark ? theme.illustrationGlowDark : theme.illustrationGlow,
  } as React.CSSProperties;

  return (
    <button
      onClick={() => onOpen(name)}
      className="faq-card-clay group"
      style={cardStyle}
    >
      {/* Floating SVG illustration — background accent, top right */}
      <img
        src={theme.svgPath}
        alt=""
        className="faq-card-clay__illustration"
        style={illustrationStyle}
        loading="lazy"
        aria-hidden="true"
      />

      {/* Top row: badge + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
        <div
          className="faq-card-clay__badge"
          style={{
            backgroundColor: badgeBg,
            color: badgeColor,
            // Soft colored glow on the icon chip (color change only)
            boxShadow: isDark
              ? `0 0 14px ${theme.illustrationGlowDark}`
              : `0 2px 10px ${theme.illustrationGlow}`,
          }}
        >
          {getCategoryIcon(name)}
        </div>
        <span className="faq-card-clay__count">
          {items.length} {items.length === 1 ? 'question' : 'questions'}
        </span>
      </div>

      {/* Title */}
      <h3 className="faq-card-clay__title">
        {formatCategoryName(name)}
      </h3>

      {/* Description */}
      {description && (
        <p className="faq-card-clay__desc">
          {description}
        </p>
      )}

      {/* Top questions */}
      {previewQuestions.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <hr className="faq-card-clay__questions-divider" />
          <p className="faq-card-clay__questions-label">Top questions</p>
          <ul className="faq-card-clay__questions-list">
            {previewQuestions.map((item, idx) => (
              <li key={item._id}>
                {idx + 1}. {getQuestionTitle(item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <div className="faq-card-clay__cta" style={{ color: ctaColor }}>
        <span>Explore all</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </button>
  );
}

interface CategoryGridProps {
  categories: string[];
  grouped: Record<string, FAQItem[]>;
  onOpen: (name: string) => void;
}

export default function CategoryGrid({ categories, grouped, onOpen }: CategoryGridProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: '1120px' }}>
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((name) => (
          <CategoryCard
            key={name}
            name={name}
            items={grouped[name] || []}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
