import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, HelpCircle, MessageSquare, FileText, Check, Shield, Bookmark
} from "lucide-react";

export default function IITRoparFaqIllustration() {
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / 18; // smooth parallax
    const y = (e.clientY - rect.top - rect.height / 2) / 18;
    setMouseOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 });
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full h-[370px] sm:h-[385px] p-6 rounded-3xl bg-slate-50 dark:bg-[#0C0B14]/90 border border-slate-200 dark:border-white/10 shadow-[0_20px_50px_rgba(124,58,237,0.06)] dark:shadow-[0_25px_60px_rgba(124,58,237,0.22)] flex flex-col justify-between overflow-hidden group select-none text-slate-800 dark:text-white font-sans"
      style={{
        perspective: 1000
      }}
    >
      {/* 3D Pixar Animation Theme Style Rules */}
      <style>{`
        @keyframes robot-breath-heavy {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(1deg);
          }
        }
        @keyframes subtle-bounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        @keyframes blink-eyes {
          0%, 90%, 100% {
            transform: scaleY(1);
          }
          93%, 97% {
            transform: scaleY(0.1);
          }
        }
        @keyframes pupil-wander {
          0%, 100% {
            transform: translate(0px, 0px);
          }
          20% {
            transform: translate(1px, -0.5px);
          }
          40% {
            transform: translate(-1px, 0.5px);
          }
          60% {
            transform: translate(0.5px, 0.8px);
          }
          80% {
            transform: translate(-0.5px, -0.6px);
          }
        }
        @keyframes holographic-glow {
          0%, 100% {
            opacity: 0.7;
            filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.4)) drop-shadow(0 0 25px rgba(59, 130, 246, 0.2));
          }
          50% {
            opacity: 0.95;
            filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.75)) drop-shadow(0 0 35px rgba(59, 130, 246, 0.5));
          }
        }
        @keyframes floating-card-1 {
          0%, 100% {
            transform: translateY(0px) rotate(-1.5deg);
          }
          50% {
            transform: translateY(-12px) rotate(0.5deg);
          }
        }
        @keyframes floating-card-2 {
          0%, 100% {
            transform: translateY(0px) rotate(2deg);
          }
          50% {
            transform: translateY(-8px) rotate(-1deg);
          }
        }
        @keyframes floating-card-3 {
          0%, 100% {
            transform: translateY(0px) rotate(-3deg);
          }
          50% {
            transform: translateY(-10px) rotate(1deg);
          }
        }
        .pixar-breath {
          animation: robot-breath-heavy 5s ease-in-out infinite;
        }
        .pixar-blink {
          animation: blink-eyes 5s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .pixar-pupil {
          animation: pupil-wander 10s ease-in-out infinite;
        }
        .holo-glow {
          animation: holographic-glow 4s ease-in-out infinite;
        }
        .holo-card-1 {
          animation: floating-card-1 6s ease-in-out infinite;
        }
        .holo-card-2 {
          animation: floating-card-2 5.2s ease-in-out infinite;
          animation-delay: 0.6s;
        }
        .holo-card-3 {
          animation: floating-card-3 5.8s ease-in-out infinite;
          animation-delay: 1.2s;
        }
      `}</style>

      {/* Premium Studio Gradient Lighting backdrops */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-radial from-violet-500/20 via-blue-500/5 to-transparent blur-[80px] pointer-events-none dark:from-violet-500/25" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-radial from-pink-500/15 via-indigo-500/5 to-transparent blur-[80px] pointer-events-none dark:from-purple-500/20" />

      {/* Header Accent Branding: Clean, minimalistic */}
      <div className="flex items-center justify-between z-10 shrink-0">
        <span className="text-[10px] sm:text-xs font-display font-bold tracking-wider text-slate-400 dark:text-slate-450 uppercase">
          AI Copilot Hub
        </span>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
          <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold tracking-wider uppercase">
            3D Yaksha Active
          </span>
        </div>
      </div>

      {/* MAIN CONTAINER FOR ROBOT MODEL & HOLOGRAMS */}
      <div className="relative flex-1 flex items-center justify-center my-1 z-10">
        
        {/* PARALLAX ENVELOPE FOR DEPTH EFFECT */}
        <motion.div
          animate={{
            x: mouseOffset.x,
            y: mouseOffset.y
          }}
          transition={{ type: "spring", stiffness: 90, damping: 22 }}
          className="relative scale-[0.78] sm:scale-[0.80] w-72 h-72 flex items-center justify-center"
        >
          {/* Main Pixar 3D-styled cute Robot Vector Illustration */}
          <svg
            viewBox="0 0 320 320"
            className="w-full h-full drop-shadow-[0_20px_45px_rgba(99,102,241,0.25)] dark:drop-shadow-[0_25px_55px_rgba(99,102,241,0.45)] pixar-breath"
          >
            <defs>
              {/* Metallic 3D gradients */}
              <linearGradient id="armorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="40%" stopColor="#F1F5F9" />
                <stop offset="85%" stopColor="#CBD5E1" />
                <stop offset="100%" stopColor="#94A3B8" />
              </linearGradient>

              <linearGradient id="bodyBlueAccent" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="50%" stopColor="#4F46E5" />
                <stop offset="100%" stopColor="#3730A3" />
              </linearGradient>

              <linearGradient id="sphereShadow" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#475569" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#475569" stopOpacity="0" />
              </linearGradient>

              {/* Face screen gradient with high glass luster */}
              <linearGradient id="screenGloss" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E1B4B" />
                <stop offset="60%" stopColor="#0F172A" />
                <stop offset="100%" stopColor="#020617" />
              </linearGradient>

              {/* Luminous Pixar eye gradient */}
              <radialGradient id="eyeBlueRing" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#E0F2FE" />
                <stop offset="45%" stopColor="#38BDF8" />
                <stop offset="80%" stopColor="#0284C7" />
                <stop offset="100%" stopColor="#0369A1" />
              </radialGradient>
              
              <radialGradient id="eyePupilHeart" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0F172A" />
                <stop offset="100%" stopColor="#020617" />
              </radialGradient>

              {/* Specular glare overlay for 3D look */}
              <linearGradient id="glareHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                <stop offset="15%" stopColor="#FFFFFF" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>

              <linearGradient id="softPinkCheek" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EC4899" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
              </linearGradient>

              {/* Hologram cards glow gradients */}
              <linearGradient id="holoPurpleGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D8B4FE" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#818CF8" stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* Ambient Shadow beneath the robot body */}
            <ellipse cx="160" cy="272" rx="68" ry="14" fill="#020617" opacity="0.18" className="dark:opacity-40" />

            {/* ROBOT SHOULDER ARM JOINTS */}
            <circle cx="95" cy="214" r="14" fill="url(#armorGradient)" />
            <circle cx="225" cy="214" r="14" fill="url(#armorGradient)" />
            
            {/* Specular overlay on joints */}
            <circle cx="95" cy="214" r="14" fill="url(#sphereShadow)" />
            <circle cx="225" cy="214" r="14" fill="url(#sphereShadow)" />

            {/* ROBOT TORSO / BODY (ROUND PIXAR CHEST) */}
            <rect x="104" y="180" width="112" height="78" rx="38" fill="url(#armorGradient)" stroke="#E2E8F0" strokeWidth="1" />
            <rect x="104" y="180" width="112" height="78" rx="38" fill="url(#sphereShadow)" />

            {/* Inner Premium Indigo Core Panel on Chest */}
            <rect x="122" y="196" width="76" height="46" rx="20" fill="url(#bodyBlueAccent)" />
            
            {/* Glossy heart of the robot (Breathing pulse ring) */}
            <circle cx="160" cy="219" r="12" fill="#38BDF8" className="animate-pulse" />
            <circle cx="160" cy="219" r="6" fill="#FFFFFF" />

            {/* Specular glare line across torso */}
            <path d="M 112 201 C 122 195, 198 195, 208 201" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" fill="none" />

            {/* NECK SPHERE */}
            <circle cx="160" cy="174" r="15" fill="#64748B" />
            <circle cx="160" cy="174" r="15" fill="url(#sphereShadow)" />

            {/* ROBOT HEAD (SPHERICAL OVERSIZE SHIELD COATED GLASS) */}
            <rect x="80" y="64" width="160" height="114" rx="55" fill="url(#armorGradient)" stroke="#E2E8F0" strokeWidth="1.2" />
            <rect x="80" y="64" width="160" height="114" rx="55" fill="url(#sphereShadow)" />

            {/* SPECULAR GLARE OVERLAY ON METAL HELMET (TOP ARC SHINE) */}
            <path d="M 94 85 C 114 74, 206 74, 226 85" stroke="url(#glareHighlight)" strokeWidth="6" strokeLinecap="round" fill="none" />

            {/* ROBOT EARS: CUTE CAPACITIVE DISKS */}
            <g>
              {/* Left ear */}
              <ellipse cx="76" cy="121" rx="10" ry="22" fill="url(#bodyBlueAccent)" />
              <ellipse cx="78" cy="121" rx="5" ry="14" fill="url(#armorGradient)" />
              <ellipse cx="78" cy="121" rx="5" ry="14" fill="url(#sphereShadow)" />
              
              {/* Right ear */}
              <ellipse cx="244" cy="121" rx="10" ry="22" fill="url(#bodyBlueAccent)" />
              <ellipse cx="242" cy="121" rx="5" ry="14" fill="url(#armorGradient)" />
              <ellipse cx="242" cy="121" rx="5" ry="14" fill="url(#sphereShadow)" />
            </g>

            {/* CUTE TOP ANTENNA NODE */}
            <rect x="156" y="38" width="8" height="28" rx="4" fill="url(#armorGradient)" />
            <rect x="156" y="38" width="8" height="28" rx="4" fill="url(#sphereShadow)" />
            <circle cx="160" cy="38" r="11" fill="url(#bodyBlueAccent)" />
            {/* Luminous beacon dot */}
            <circle cx="160" cy="38" r="5" fill="#38BDF8" className="animate-pulse" />

            {/* ROBOT FACE SCREEN (INTEGRATED GLASS FACEPLATE) */}
            <rect x="94" y="80" width="132" height="82" rx="36" fill="url(#screenGloss)" stroke="#334155" strokeWidth="1" />
            
            {/* SPECULAR REFLECTION FOR CHROME GLASS EFFECT */}
            <path d="M 104 96 Q 160 84 216 96" stroke="url(#glareHighlight)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />

            {/* CUTE BLUSHING CHEEKS */}
            <ellipse cx="114" cy="138" rx="9" ry="5" fill="url(#softPinkCheek)" />
            <ellipse cx="206" cy="138" rx="9" ry="5" fill="url(#softPinkCheek)" />

            {/* CUTE EXPRESSIVE LARGE PIXAR EYES (BLINKABLE RESIZING) */}
            <g className="pixar-blink">
              {/* Left Eye Luminous Ring */}
              <ellipse cx="128" cy="118" rx="18" ry="18" fill="url(#eyeBlueRing)" />
              {/* Center Pupil */}
              <ellipse cx="128" cy="118" rx="9" ry="9" fill="url(#eyePupilHeart)" className="pixar-pupil" />
              {/* Specular Eye Highlights (Double shine gives Pixar quality) */}
              <circle cx="123" cy="113" r="4" fill="#FFFFFF" />
              <circle cx="133" cy="122" r="1.8" fill="#FFFFFF" />

              {/* Right Eye Luminous Ring */}
              <ellipse cx="192" cy="118" rx="18" ry="18" fill="url(#eyeBlueRing)" />
              {/* Center Pupil */}
              <ellipse cx="192" cy="118" rx="9" ry="9" fill="url(#eyePupilHeart)" className="pixar-pupil" />
              {/* Specular Eye Highlights */}
              <circle cx="187" cy="113" r="4" fill="#FFFFFF" />
              <circle cx="197" cy="122" r="1.8" fill="#FFFFFF" />
            </g>

            {/* CUTE TINY SMILE PATH */}
            <path d="M 152 144 Q 160 151 168 144" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.95" />
          </svg>

          {/* ========================================================
              FLOATING HOLOGRAPHIC FAQ CARDS (NO CLUTTERED TEXT LABELS)
              ======================================================== */}

          {/* HOLOGRAM CARD 1: CUTE FILE-FAQ GLOW SHEET (LEFT) */}
          <div className="absolute top-1/2 -left-8 md:-left-12 -translate-y-12 holo-card-1 z-20">
            <div className="w-[110px] sm:w-[125px] p-3.5 rounded-2xl bg-white/70 dark:bg-[#1E1E28]/70 backdrop-blur-md border border-purple-500/30 shadow-[0_12px_24px_rgba(139,92,246,0.18)] dark:shadow-[0_12px_30px_rgba(139,92,246,0.35)] flex flex-col items-start text-left text-xs gap-2 select-none hover:scale-105 transition-transform duration-300">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                <FileText className="h-4.5 w-4.5" />
              </div>
              {/* Abstract decorative bar representing clean interface lines */}
              <div className="space-y-1.5 w-full">
                <div className="h-2 w-3/4 rounded bg-purple-650 dark:bg-purple-500/40" />
                <div className="h-1.5 w-full rounded bg-slate-300 dark:bg-slate-300/15" />
                <div className="h-1.5 w-5/6 rounded bg-slate-300 dark:bg-slate-300/15" />
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-emerald-500 dark:text-emerald-400 mt-0.5">
                <Check className="h-3 w-3 stroke-3" />
                <span>Resolved</span>
              </div>
            </div>
          </div>

          {/* HOLOGRAM CARD 2: CUTE QUESTION CHIP (RIGHT TOP) */}
          <div className="absolute -top-6 -right-4 sm:-right-8 holo-card-2 z-20">
            <div className="w-[105px] sm:w-[120px] p-3 rounded-2xl bg-white/75 dark:bg-[#1E1E28]/75 backdrop-blur-md border border-cyan-500/30 shadow-[0_12px_24px_rgba(6,182,212,0.18)] dark:shadow-[0_12px_30px_rgba(6,182,212,0.35)] flex flex-col items-start gap-1.5 hover:scale-105 transition-transform duration-300">
              <div className="flex items-center justify-between w-full">
                <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <div className="space-y-1 w-full mt-1">
                <div className="h-1.5 w-5/6 rounded bg-cyan-500/50" />
                <div className="h-1.5 w-full rounded bg-slate-250 dark:bg-slate-300/15" />
              </div>
            </div>
          </div>

          {/* HOLOGRAM CARD 3: CHAT MESSAGE CARD (RIGHT BOTTOM) */}
          <div className="absolute top-1/2 -right-10 md:-right-16 translate-y-8 holo-card-3 z-20">
            <div className="w-[115px] sm:w-[130px] p-3 rounded-2xl bg-white/70 dark:bg-[#1E1E28]/70 backdrop-blur-md border border-indigo-500/30 shadow-[0_12px_24px_rgba(99,102,241,0.18)] dark:shadow-[0_12px_30px_rgba(99,102,241,0.35)] flex flex-col items-start gap-2 hover:scale-105 transition-transform duration-300">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div className="h-1.5 w-12 rounded bg-indigo-500/30" />
              </div>
              <div className="space-y-1 w-full">
                <div className="h-1.5 w-full rounded bg-slate-250 dark:bg-slate-300/15" />
                <div className="h-1.5 w-5/6 rounded bg-slate-250 dark:bg-slate-300/15" />
              </div>
            </div>
          </div>

          {/* SPARKLES DECORATIVE BACKGROUNDS */}
          <div className="absolute -top-10 left-10 text-purple-400/55 dark:text-purple-400/40 select-none pointer-events-none animate-bounce" style={{ animationDuration: "4s" }}>
            <Sparkles className="h-6 w-6 stroke-1.5" />
          </div>
          <div className="absolute bottom-6 left-12 text-indigo-400/40 select-none pointer-events-none animate-bounce" style={{ animationDuration: "5s" }}>
            <Sparkles className="h-4 w-4 stroke-1.5" />
          </div>

        </motion.div>
      </div>

      {/* OVERLAY EXPLANATORY META FOOTER - CLEAN SAAS DESIGN */}
      <div className="z-10 mt-2 text-center shrink-0">
        <h4 className="text-xs sm:text-sm font-display font-bold text-slate-800 dark:text-slate-100">
          How can Yaksha assist you today?
        </h4>
        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-1 max-w-[400px] mx-auto leading-relaxed">
          Search for administrative guidelines, submit formal tickets, or request automated compliance reviews directly.
        </p>
      </div>

    </motion.div>
  );
}
