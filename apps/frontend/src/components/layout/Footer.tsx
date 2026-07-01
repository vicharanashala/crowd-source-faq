import React from 'react';
import { Link } from 'react-router-dom';
import logoWide from '../../assets/logo-wide.png';

export default function Footer({ branding }: { branding?: { logoText?: string; footerText?: string } } = {}) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-bg/50 backdrop-blur-[10px] mt-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 text-center">

        {/* Brand */}
        <Link to="/" className="inline-flex items-center mb-5 no-underline group">
          <img
            src={logoWide}
            alt="Yaksha FAQ"
            className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.8 7.2h-1.6c-.18-.72-.54-1.2-1.2-1.2-.84 0-1.2.6-1.2 1.8v1.2h2.4l-.36 2.4H12.8V18h-2.4v-5.6H8.8v-2.4h1.6v-1.2c0-1.92 1.08-3 3-3 .84 0 1.56.12 2.4.36v2.04z"/>
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