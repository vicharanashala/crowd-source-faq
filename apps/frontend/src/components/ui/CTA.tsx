import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function CTA() {
  const navigate = useNavigate();

  return (
    <section className="mt-8 sm:mt-14 mb-6 sm:mb-8">
      <div className="bg-card rounded-2xl border border-border p-5 sm:p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative overflow-hidden">
        <div className="flex items-center gap-5">
          {/* Avatar stack — overlapping circles suggesting community */}
          <div className="hidden sm:flex avatar-stack flex-shrink-0">
            <div className="avatar-stack__item bg-[#E8DCC4] text-[#00635D] text-[10px]">AK</div>
            <div className="avatar-stack__item bg-[#00635D] text-white text-[10px]">RJ</div>
            <div className="avatar-stack__item bg-[#2C3E50] text-white text-[10px]">SP</div>
            <div className="avatar-stack__item bg-[#E8DCC4] text-[#00635D] text-[10px]">+</div>
          </div>

          <div>
            <h3 className="font-serif text-xl md:text-2xl text-ink mb-1.5">
              Didn&apos;t find your answer?
            </h3>
            <p className="text-sm text-ink-soft max-w-md">
              Ask the community and get answers from real people.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/community')}
          className="btn-cta flex-shrink-0 w-full sm:w-auto cursor-pointer text-center group"
        >
          <span>Ask the Community</span>
          <svg
            className="btn-cta-icon inline-block group-hover:translate-x-0.5 transition-transform"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </section>
  );
}