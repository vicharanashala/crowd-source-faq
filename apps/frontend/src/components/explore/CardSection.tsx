// CardSection — shared wrapper for the three home-page section cards.
// Renders a title with an icon, a "View all" link on the right, and
// a body region. Matches the existing FAQ Hive card aesthetic.

import React from 'react';

interface CardSectionProps {
  icon: React.ReactNode;
  title: string;
  rightAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function CardSection({
  icon,
  title,
  rightAction,
  className = '',
  children,
}: CardSectionProps): React.ReactElement {
  return (
    <section
      className={`bg-card rounded-2xl border border-border p-6 flex flex-col h-full ${className}`}
    >
      <header className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-2 text-accent">
          {icon}
          <h2 className="font-serif text-lg text-ink leading-none">{title}</h2>
        </div>
        {rightAction}
      </header>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </section>
  );
}
