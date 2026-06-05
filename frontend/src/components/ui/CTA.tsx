import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function CTA() {
  const navigate = useNavigate();

  return (
    <section className="mt-8 sm:mt-14 mb-6 sm:mb-8">
      <div className="bg-card rounded-2xl border border-border p-5 sm:p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative overflow-hidden">
        <svg className="absolute top-4 right-8" width="50" height="35" viewBox="0 0 50 35" style={{ opacity: 0.07, pointerEvents: 'none' }}>
          <path d="M5 28 Q15 5 28 18 Q42 32 48 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M38 32 L46 26 L42 22" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg className="absolute bottom-8 left-[45%]" width="30" height="20" viewBox="0 0 30 20" style={{ opacity: 0.06, pointerEvents: 'none' }}>
          <path d="M5 15 L15 5 L25 15" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        <div className="flex items-center gap-5">
          <div className="hidden sm:block flex-shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="38" fill="#eef0ff" stroke="#dde0f0" strokeWidth="1"/>
              <rect x="28" y="50" width="24" height="18" rx="4" fill="#6b92e0" opacity="0.8"/>
              <circle cx="40" cy="35" r="12" fill="#f5e0c3"/>
              <path d="M28 33 Q30 22 40 20 Q50 22 52 33" fill="#5a4030"/>
              <circle cx="36" cy="34" r="1.5" fill="var(--color-ink)"/>
              <circle cx="44" cy="34" r="1.5" fill="var(--color-ink)"/>
              <path d="M36 39 Q40 43 44 39" stroke="#333" strokeWidth="1" fill="none" strokeLinecap="round"/>
              <text x="58" y="22" fontSize="14" fill="var(--doodle-green)" opacity="0.6" fontWeight="bold">?</text>
              <text x="16" y="28" fontSize="10" fill="var(--doodle-accent)" opacity="0.5" fontWeight="bold">?</text>
              <text x="60" y="40" fontSize="9" fill="var(--color-success)" opacity="0.4" fontWeight="bold">?</text>
            </svg>
          </div>

          <div>
            <h3 className="font-serif text-xl md:text-2xl text-ink mb-1.5">
              Still have a question?
            </h3>
            <p className="text-sm text-ink-soft max-w-md">
              Ask the community and get answers from real people.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/community')}
          className="flex-shrink-0 w-full sm:w-auto px-7 py-3 sm:py-3.5 bg-ink text-bg text-sm font-semibold rounded-xl hover:bg-ink/85 hover:shadow-lg transition-all cursor-pointer text-center"
        >
          Ask the Community 
        </button>
      </div>
    </section>
  );
}