import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-bg/50 backdrop-blur-[10px] mt-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 text-center">
        {/* Brand */}
        <Link to="/" className="inline-flex items-center gap-2.5 mb-5 no-underline group">
          <div className="w-8 h-8 rounded-[8px] border-2 border-ink flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <span className="font-serif text-base text-ink tracking-tight">Yaksha FAQ</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center justify-center gap-6 mb-6" aria-label="Footer navigation">
          {[
            { label: 'Home', to: '/' },
            { label: 'FAQ', to: '/faq' },
            { label: 'Community', to: '/community' },
          ].map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="text-sm text-ink-soft hover:text-ink transition-colors no-underline"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="w-10 h-px bg-border mx-auto mb-6" />

        {/* Social */}
        <div className="flex items-center justify-center gap-5 mb-5">
          <a
            href="https://www.linkedin.com/company/vicharanashala/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Vicharanashala on LinkedIn"
            className="text-ink-faint hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
              <rect x="2" y="9" width="4" height="12"/>
              <circle cx="4" cy="4" r="2"/>
            </svg>
          </a>
          <a
            href="https://samagama.in/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="samagama.in"
            className="text-ink-faint hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-ink-faint">
          &copy; {currentYear} Yaksha FAQ &middot; Vicharanashala, IIT Ropar
          &nbsp;&middot;&nbsp;
          Questions? Ask the{' '}
          <a
            href="https://samagama.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-faint hover:text-ink underline underline-offset-2 transition-colors"
          >
            community
          </a>
        </p>
      </div>
    </footer>
  );
}
