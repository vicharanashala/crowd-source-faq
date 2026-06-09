import React from 'react';

/**
 * Contextual page doodles — decorative SVG illustrations placed next to related content.
 * FAQ: question → search → discover → eureka!
 * Community: raise hand → discuss → upvote → solved
 */

export function HomeDoodles() {
  return (
    <>
      {/* Curly bracket doodle */}
      <div className="absolute -top-6 -left-16 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="100" viewBox="0 0 50 100" fill="none" style={{ opacity: 0.3 }}>
          <path d="M40 8 C26 8, 22 18, 22 28 C22 38, 16 44, 6 46 C16 48, 22 54, 22 64 C22 74, 26 84, 40 84" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* "Let's solve it!" speech bubble */}
      <div className="absolute -top-8 left-[40px] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-6deg)' }}>
        <svg width="105" height="80" viewBox="0 0 105 80" fill="none" style={{ opacity: 0.32 }}>
          <ellipse cx="52" cy="28" rx="42" ry="22" stroke="var(--deco-stroke)" strokeWidth="2" strokeDasharray="6 4" fill="none"/>
          <path d="M68 46 L80 68 L62 44" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="22" y="25" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">Let&apos;s</text>
          <text x="18" y="38" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">solve it!</text>
        </svg>
      </div>

      {/* Big sparkle */}
      <div className="absolute top-2 right-[28%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ opacity: 0.35 }}>
          <path d="M14 2 L14 26 M2 14 L26 14 M5 5 L23 23 M23 5 L5 23" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Small star */}
      <div className="absolute top-[20px] left-[16%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ opacity: 0.3 }}>
          <path d="M9 0 L9 18 M0 9 L18 9" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 3 L15 15 M15 3 L3 15" stroke="var(--section-icon)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Curved arrow */}
      <div className="absolute top-[120px] -left-10 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none" style={{ opacity: 0.3 }}>
          <path d="M12 8 C24 30, 36 44, 58 54" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M48 48 L58 54 L50 60" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Lightbulb doodle */}
      <div className="absolute -top-4 -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="55" height="75" viewBox="0 0 55 75" fill="none" style={{ opacity: 0.3 }}>
          <path d="M27 12 C16 12, 10 20, 10 28 C10 36, 16 40, 20 46 L34 46 C38 40, 44 36, 44 28 C44 20, 38 12, 27 12Z" stroke="var(--section-icon)" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="50" x2="34" y2="50" stroke="var(--section-icon)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="54" x2="32" y2="54" stroke="var(--section-icon)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="2" x2="27" y2="7" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="8" y1="12" x2="12" y2="16" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="46" y1="12" x2="42" y2="16" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="2" y1="28" x2="7" y2="28" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="47" y1="28" x2="52" y2="28" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Question mark doodle */}
      <div className="absolute top-[210px] -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.35 }}>
          <path d="M12 16 C12 6, 28 6, 28 16 C28 24, 20 26, 20 36" stroke="var(--deco-stroke)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <circle cx="20" cy="44" r="2.5" fill="#b8a080"/>
        </svg>
      </div>

      {/* Pencil doodle */}
      <div className="absolute top-[200px] left-[-20px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" style={{ opacity: 0.28 }}>
          <path d="M38 5 L12 32 L10 42 L20 40 L46 13 Z" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="30" y1="12" x2="38" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Code brackets */}
      <div className="absolute top-[330px] right-[-12px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="45" height="55" viewBox="0 0 45 55" fill="none" style={{ opacity: 0.28 }}>
          <path d="M16 5 L6 27 L16 49" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M29 5 L39 27 L29 49" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="14" y1="20" x2="31" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="34" x2="31" y2="34" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Wavy squiggle */}
      <div className="absolute top-[170px] right-[12%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="90" height="16" viewBox="0 0 90 16" fill="none" style={{ opacity: 0.3 }}>
          <path d="M2 8 Q12 2, 22 8 Q32 14, 42 8 Q52 2, 62 8 Q72 14, 82 8" stroke="var(--section-icon)" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}

export function FAQDoodles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none mt-12 lg:mt-16" aria-hidden="true">
      <div className="absolute top-[88px] left-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="80" viewBox="0 0 70 80" fill="none" style={{ opacity: 0.28 }}>
          <circle cx="22" cy="50" r="8" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none"/>
          <line x1="22" y1="58" x2="22" y2="72" stroke="var(--deco-stroke)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="22" y1="72" x2="16" y2="80" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="22" y1="72" x2="28" y2="80" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="22" y1="62" x2="14" y2="58" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="22" y1="64" x2="30" y2="60" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="44" cy="28" r="14" stroke="var(--deco-stroke-soft)" strokeWidth="1.5" strokeDasharray="4 3" fill="none"/>
          <circle cx="34" cy="40" r="3" stroke="var(--deco-stroke-soft)" strokeWidth="1" fill="none"/>
          <circle cx="30" cy="44" r="1.5" fill="var(--deco-stroke-soft)" opacity="0.5"/>
        </svg>
      </div>
      <div className="absolute top-[88px] right-[7%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" style={{ opacity: 0.25 }}>
          <circle cx="24" cy="24" r="16" stroke="var(--deco-stroke)" strokeWidth="2" fill="none"/>
          <line x1="36" y1="36" x2="52" y2="52" stroke="var(--deco-stroke)" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="14" y1="18" x2="34" y2="18" stroke="var(--deco-stroke-soft)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
          <line x1="14" y1="24" x2="30" y2="24" stroke="var(--deco-stroke-soft)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
          <line x1="14" y1="30" x2="26" y2="30" stroke="var(--deco-stroke-soft)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
        </svg>
      </div>
      <div className="absolute top-[380px] left-[4%] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-6deg)' }}>
        <svg width="60" height="48" viewBox="0 0 60 48" fill="none" style={{ opacity: 0.25 }}>
          <path d="M30 8 C30 8, 14 4, 6 10 L6 40 C14 34, 30 37, 30 37 C30 37, 46 34, 54 40 L54 10 C46 4, 30 8, 30 8Z" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          <line x1="30" y1="8" x2="30" y2="37" stroke="var(--deco-stroke)" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M42 4 L42 18 L45 14 L48 18 L48 4" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="absolute top-[420px] right-[5%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.25 }}>
          <path d="M20 2 L20 36" stroke="var(--deco-stroke)" strokeWidth="2" strokeLinecap="round"/>
          <path d="M12 36 L20 50 L28 36" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="8" y1="44" x2="12" y2="40" stroke="var(--deco-stroke-soft)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
          <line x1="32" y1="44" x2="28" y2="40" stroke="var(--deco-stroke-soft)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
        </svg>
      </div>
      <div className="absolute top-[660px] left-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="55" height="70" viewBox="0 0 55 70" fill="none" style={{ opacity: 0.28 }}>
          <path d="M27 14 C18 14, 12 22, 12 28 C12 34, 18 38, 20 44 L34 44 C36 38, 42 34, 42 28 C42 22, 36 14, 27 14Z" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="48" x2="34" y2="48" stroke="var(--deco-stroke)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="52" x2="32" y2="52" stroke="var(--deco-stroke)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="2" x2="27" y2="8" stroke="var(--deco-stroke)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="8" y1="10" x2="12" y2="15" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="46" y1="10" x2="42" y2="15" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2" y1="28" x2="8" y2="28" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="46" y1="28" x2="52" y2="28" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="27" y1="22" x2="27" y2="32" stroke="var(--deco-stroke)" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="27" cy="37" r="1.5" fill="var(--deco-stroke)"/>
        </svg>
      </div>
      <div className="absolute top-[700px] right-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="48" height="60" viewBox="0 0 48 60" fill="none" style={{ opacity: 0.25 }}>
          <rect x="6" y="10" width="36" height="46" rx="4" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none"/>
          <rect x="16" y="4" width="16" height="10" rx="3" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none"/>
          <path d="M14 34 L20 42 L34 24" stroke="var(--deco-stroke)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="absolute top-[180px] left-[3%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="30" height="450" viewBox="0 0 30 450" fill="none" style={{ opacity: 0.12 }}>
          <path d="M15 0 C20 60, 10 120, 15 180 C20 240, 10 300, 15 360 C18 400, 15 440, 15 450" stroke="var(--deco-stroke-soft)" strokeWidth="1.5" strokeDasharray="6 8" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[950px] left-[8%] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-10deg)' }}>
        <svg width="50" height="36" viewBox="0 0 50 36" fill="none" style={{ opacity: 0.22 }}>
          <path d="M8 4 C4 4, 2 8, 2 12 C2 16, 4 18, 8 18 L42 18 L42 30 L8 30 C4 30, 2 28, 2 24" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <ellipse cx="44" cy="18" rx="4" ry="14" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
      <div className="absolute top-[980px] right-[10%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="40" viewBox="0 0 50 40" fill="none" style={{ opacity: 0.25 }}>
          <path d="M12 0 L14 8 L22 8 L16 14 L18 22 L12 17 L6 22 L8 14 L2 8 L10 8 Z" stroke="var(--deco-stroke)" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
          <path d="M36 10 L37.5 15 L42 15 L38.5 18.5 L40 23 L36 20 L32 23 L33.5 18.5 L30 15 L34.5 15 Z" stroke="var(--deco-stroke)" strokeWidth="1" fill="none" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

export function CommunityDoodles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none mt-12 lg:mt-16" aria-hidden="true">
      <div className="absolute top-[82px] left-[5%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="60" height="80" viewBox="0 0 60 80" fill="none" style={{ opacity: 0.28 }}>
          <circle cx="30" cy="26" r="9" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none"/>
          <line x1="30" y1="35" x2="30" y2="56" stroke="var(--deco-stroke)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="30" y1="56" x2="22" y2="70" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="30" y1="56" x2="38" y2="70" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="30" y1="42" x2="18" y2="50" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="30" y1="42" x2="44" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="48" y1="14" x2="52" y2="12" stroke="var(--deco-stroke-soft)" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
          <line x1="48" y1="20" x2="54" y2="20" stroke="var(--deco-stroke-soft)" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
          <line x1="46" y1="26" x2="52" y2="28" stroke="var(--deco-stroke-soft)" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
        </svg>
      </div>
      <div className="absolute top-[82px] right-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="65" viewBox="0 0 70 65" fill="none" style={{ opacity: 0.25 }}>
          <path d="M4 4 L44 4 Q48 4, 48 8 L48 22 Q48 26, 44 26 L16 26 L8 34 L10 26 L8 26 Q4 26, 4 22 L4 8 Q4 4, 8 4 Z" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="12" x2="40" y2="12" stroke="var(--deco-stroke-soft)" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
          <line x1="12" y1="18" x2="32" y2="18" stroke="var(--deco-stroke-soft)" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
          <path d="M22 36 L62 36 Q66 36, 66 40 L66 54 Q66 58, 62 58 L34 58 L42 64 L38 58 L26 58 Q22 58, 22 54 L22 40 Q22 36, 26 36 Z" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="absolute top-[380px] left-[4%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="55" viewBox="0 0 70 55" fill="none" style={{ opacity: 0.22 }}>
          <circle cx="35" cy="14" r="7" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none"/>
          <path d="M24 38 C24 28, 46 28, 46 38" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <circle cx="14" cy="18" r="5.5" stroke="var(--deco-stroke-soft)" strokeWidth="1.3" fill="none"/>
          <path d="M6 36 C6 28, 22 28, 22 36" stroke="var(--deco-stroke-soft)" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <circle cx="56" cy="18" r="5.5" stroke="var(--deco-stroke-soft)" strokeWidth="1.3" fill="none"/>
          <path d="M48 36 C48 28, 64 28, 64 36" stroke="var(--deco-stroke-soft)" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[420px] right-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.28 }}>
          <path d="M20 6 L8 22 L15 22 L15 42 L25 42 L25 22 L32 22 Z" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 50 C16 47, 20 44, 20 48 C20 44, 24 47, 24 50 C24 54, 20 57, 20 57 C20 57, 16 54, 16 50Z" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[620px] left-[6%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="60" height="45" viewBox="0 0 60 45" fill="none" style={{ opacity: 0.22 }}>
          <rect x="6" y="2" width="48" height="28" rx="3" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none"/>
          <line x1="2" y1="34" x2="58" y2="34" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="22" cy="16" r="2.5" fill="var(--deco-stroke-soft)" opacity="0.6"/>
          <circle cx="30" cy="16" r="2.5" fill="var(--deco-stroke-soft)" opacity="0.45"/>
          <circle cx="38" cy="16" r="2.5" fill="var(--deco-stroke-soft)" opacity="0.3"/>
        </svg>
      </div>
      <div className="absolute top-[680px] right-[7%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="44" height="62" viewBox="0 0 44 62" fill="none" style={{ opacity: 0.25 }}>
          <circle cx="22" cy="22" r="16" stroke="var(--deco-stroke)" strokeWidth="2" fill="none"/>
          <circle cx="22" cy="22" r="11" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" opacity="0.5"/>
          <path d="M22 12 L24 18 L30 18 L25 22 L27 28 L22 24 L17 28 L19 22 L14 18 L20 18 Z" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
          <line x1="14" y1="36" x2="10" y2="56" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="30" y1="36" x2="34" y2="56" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="10" y1="56" x2="18" y2="48" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="34" y1="56" x2="26" y2="48" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[170px] right-[4%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="24" height="400" viewBox="0 0 24 400" fill="none" style={{ opacity: 0.1 }}>
          <path d="M12 0 C16 50, 8 100, 12 150 C16 200, 8 250, 12 300 C14 350, 12 380, 12 400" stroke="var(--deco-stroke-soft)" strokeWidth="1.5" strokeDasharray="6 8" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[900px] left-[7%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="60" height="50" viewBox="0 0 60 50" fill="none" style={{ opacity: 0.22 }}>
          <path d="M6 34 L18 18 L22 22 L14 36" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="18" y1="18" x2="16" y2="10" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="20" y1="16" x2="20" y2="8" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="22" y1="18" x2="24" y2="10" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M54 34 L42 18 L38 22 L46 36" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="42" y1="18" x2="44" y2="10" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="40" y1="16" x2="40" y2="8" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="38" y1="18" x2="36" y2="10" stroke="var(--deco-stroke)" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="26" y1="12" x2="34" y2="12" stroke="var(--deco-stroke)" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="30" y1="6" x2="30" y2="18" stroke="var(--deco-stroke)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute top-[940px] right-[9%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="48" viewBox="0 0 40 48" fill="none" style={{ opacity: 0.25 }}>
          <path d="M20 6 C14 6, 8 12, 8 20 L8 30 L4 34 L36 34 L32 30 L32 20 C32 12, 26 6, 20 6Z" stroke="var(--deco-stroke)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 34 C16 38, 24 38, 24 34" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M32 10 C36 8, 38 12, 36 16" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <path d="M36 6 C42 4, 44 12, 40 18" stroke="var(--deco-stroke)" strokeWidth="1" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="2" x2="20" y2="6" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

export default { FAQDoodles, CommunityDoodles, HomeDoodles };