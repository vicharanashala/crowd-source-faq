import React from "react";
import { motion } from "motion/react";
import { HelpCircle, Search, Sparkles } from "lucide-react";

export default function FaqIllustration() {
  return (
    <div className="relative rounded-3xl border border-slate-200/85 dark:border-white/10 bg-gradient-to-r from-slate-50/90 to-blue-50/50 dark:from-[#111118] dark:to-[#161622] backdrop-blur-xl p-6 md:p-8 overflow-hidden shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 select-none">
      
      {/* Decorative backdrop gradients */}
      <div className="absolute top-0 right-1/4 w-44 h-44 rounded-full bg-radial from-purple-500/10 dark:from-purple-500/5 to-transparent blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-36 h-36 rounded-full bg-radial from-blue-500/10 dark:from-sky-500/5 to-transparent blur-2xl pointer-events-none" />

      {/* Left side: Editorial promotional callout */}
      <div className="flex-1 space-y-3.5 text-left max-w-md z-15">
        <div className="inline-flex items-center space-x-2 rounded-full bg-purple-550/10 dark:bg-purple-500/10 px-3 py-1 border border-purple-500/15 text-purple-750 dark:text-purple-300 font-mono text-[9.5px] font-bold uppercase tracking-wider">
          <HelpCircle className="h-3.5 w-3.5 animate-pulse" />
          <span>Policy Resolution Assistant</span>
        </div>

        <h3 className="font-display font-black text-2xl md:text-3xl tracking-tight text-slate-900 dark:text-white leading-tight">
          Still Have Queries?
        </h3>

        <p className="text-slate-650 dark:text-slate-400 text-[12.5px] leading-relaxed font-normal">
          IIT Ropar's administrative support maps complex NOC regulatory criteria, Rosetta logs, and stipend clearances. Select a pre-categorized card, browse the interactive directory below, or prompt our live Yaksha AI system.
        </p>

        <div className="flex items-center space-x-1.5 font-sans text-[11px] font-semibold text-purple-700 dark:text-purple-400">
          <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
          <span>Real-time semantic routing actively updated</span>
        </div>
      </div>

      {/* Right side: High-fidelity Vector Illustration */}
      <div className="relative w-64 h-56 flex items-center justify-center shrink-0">
        
        {/* Underlaid radar concentric patterns */}
        <div className="absolute w-48 h-48 rounded-full border border-dashed border-purple-200/50 dark:border-white/[0.04] scale-[1.05] flex items-center justify-center animate-spin-slow" />
        <div className="absolute w-36 h-36 rounded-full border border-indigo-200/30 dark:border-white/[0.02]" />

        {/* Outer Circular Floating Boundary */}
        <motion.div
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: 5,
            ease: "easeInOut"
          }}
          className="relative w-48 h-48 flex items-center justify-center"
        >
          {/* Main SVG Vector Canvas */}
          <svg
            viewBox="0 0 240 240"
            className="w-full h-full relative z-10"
          >
            {/* GRADIENT DEFINITIONS */}
            <defs>
              <radialGradient id="charGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </radialGradient>

              <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffedd5" />
                <stop offset="100%" stopColor="#fed7aa" />
              </linearGradient>

              <linearGradient id="hoodieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>

              <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1e1b4b" />
                <stop offset="100%" stopColor="#4338ca" />
              </linearGradient>

              <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
              </linearGradient>

              <linearGradient id="cyanText" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>

              <linearGradient id="purpleText" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>

            {/* Back ambient aura scale */}
            <circle cx="120" cy="115" r="70" fill="url(#charGlow)" />

            {/* THINKING CLOUD HOVERING SHAPE */}
            <path
              d="M 60 70 Q 50 60, 65 50 Q 80 40, 95 48 Q 110 38, 125 48 C 140 38, 160 50, 155 68 Q 170 80, 155 95 Q 150 102, 138 98 C 120 108, 90 102, 85 92 Q 70 98, 62 88 Z"
              fill="url(#cloudGrad)"
              className="stroke-slate-200/30 dark:stroke-white/[0.04] stroke-[1] backdrop-blur-md"
            />

            {/* STUDENT STUDENT CHARACTER */}
            {/* Shoulders / Torso */}
            <path
              d="M 70 180 C 70 148, 88 135, 120 135 C 152 135, 170 148, 170 180 L 175 220 L 65 220 Z"
              fill="url(#hoodieGrad)"
              className="shadow-md"
            />

            {/* Hoodie Collar Detail */}
            <path
              d="M 98 135 C 98 152, 142 152, 142 135 Z"
              fill="#2563eb"
              opacity="0.9"
            />

            {/* Hoodie Drawstrings */}
            <line x1="112" y1="145" x2="112" y2="175" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            <line x1="128" y1="145" x2="128" y2="168" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            <circle cx="112" cy="177" r="2" fill="#e9d5ff" />
            <circle cx="128" cy="170" r="2" fill="#e9d5ff" />

            {/* Neck */}
            <rect x="110" y="112" width="20" height="28" rx="4" fill="url(#skinGrad)" />
            {/* Neck shadow */}
            <rect x="110" y="122" width="20" height="10" fill="#fdba74" opacity="0.4" />

            {/* Head/Face Oval */}
            <path
              d="M 92 84 C 92 56, 148 56, 148 84 C 148 108, 138 122, 120 122 C 102 122, 92 108, 92 84 Z"
              fill="url(#skinGrad)"
            />

            {/* Human Features for polished SaaS Look */}
            {/* Smiling lips/soft contemplative expression */}
            <path d="M 114 106 Q 120 110, 126 106" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            
            {/* Cheeks blush */}
            <circle cx="102" cy="98" r="4.5" fill="#f87171" opacity="0.4" />
            <circle cx="138" cy="98" r="4.5" fill="#f87171" opacity="0.4" />

            {/* Elegant Techy Smart Glasses */}
            <g stroke="#3b82f6" strokeWidth="2" fill="none">
              <rect x="100" y="86" width="16" height="13" rx="3" className="fill-cyan-400/10 stroke-cyan-500/70" />
              <rect x="124" y="86" width="16" height="13" rx="3" className="fill-cyan-400/10 stroke-cyan-500/70" />
              <line x1="116" y1="92" x2="124" y2="92" stroke="#ea580c" />
            </g>

            {/* Headset/Earphones */}
            <path d="M 92 88 C 92 64, 148 64, 148 88" stroke="#6366f1" strokeWidth="3" fill="none" opacity="0.8" />
            <rect x="88" y="84" width="6" height="12" rx="2" fill="#4f46e5" />
            <rect x="146" y="84" width="6" height="12" rx="2" fill="#4f46e5" />

            {/* Swoosh SaaS Haircut */}
            <path
              d="M 92 80 C 88 56, 152 48, 148 76 C 158 75, 148 58, 130 55 C 110 52, 92 64, 92 80 Z"
              fill="url(#hairGrad)"
            />

            {/* Floating brain waves or thought sparks */}
            <circle cx="120" cy="40" r="1.5" className="fill-yellow-405 dark:fill-yellow-405 animate-ping" />

            {/* THINKING HAND POSTURE (Raised Finger to Chin) */}
            <path
              d="M 85 160 C 85 145, 96 132, 102 122 Q 106 120, 108 123 Q 108 128, 102 135 L 94 175 Z"
              fill="url(#skinGrad)"
              className="drop-shadow-sm"
            />
            {/* Folded sleeve for arm gesture */}
            <path
              d="M 68 180 C 68 180, 75 160, 88 158 C 95 165, 92 180, 92 180 Z"
              fill="#2563eb"
            />
          </svg>

          {/* FLOATING LETTERS WITH DIFFERENT STAGGERED REPEATS */}
          {/* Floating 'F' */}
          <motion.div
            className="absolute font-display font-black text-xs px-2.5 py-1 rounded-lg bg-white/90 dark:bg-[#1C1C24]/90 border border-slate-200/50 dark:border-white/10 shadow-sm text-purple-650 dark:text-purple-400 select-none pointer-events-none"
            style={{ left: "14%", top: "18%" }}
            animate={{
              y: [0, -8, 0],
              rotate: [-5, 5, -5],
            }}
            transition={{
              repeat: Infinity,
              duration: 3,
              ease: "easeInOut",
              delay: 0.1
            }}
          >
            F
          </motion.div>

          {/* Floating 'A' */}
          <motion.div
            className="absolute font-display font-black text-xs px-2.5 py-1 rounded-lg bg-white/90 dark:bg-[#1C1C24]/90 border border-slate-200/50 dark:border-white/10 shadow-sm text-blue-600 dark:text-sky-400 select-none pointer-events-none"
            style={{ left: "41%", top: "3%" }}
            animate={{
              y: [0, -12, 0],
              rotate: [4, -4, 4],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.5,
              ease: "easeInOut",
              delay: 0.6
            }}
          >
            A
          </motion.div>

          {/* Floating 'Q' */}
          <motion.div
            className="absolute font-display font-black text-xs px-2.5 py-1 rounded-lg bg-white/90 dark:bg-[#1C1C24]/90 border border-slate-200/50 dark:border-white/10 shadow-sm text-violet-600 dark:text-purple-300 select-none pointer-events-none"
            style={{ left: "70%", top: "16%" }}
            animate={{
              y: [0, -9, 0],
              rotate: [-4, 6, -4],
            }}
            transition={{
              repeat: Infinity,
              duration: 4,
              ease: "easeInOut",
              delay: 1.2
            }}
          >
            Q
          </motion.div>

          {/* ANIMATED FLOATING GLOWING QUESTION MARKS */}
          {/* Question mark 1 */}
          <motion.span
            className="absolute text-purple-600 dark:text-purple-400 text-lg font-black"
            style={{ left: "10%", top: "60%" }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1.2, 0.8],
              y: [0, -10, 0]
            }}
            transition={{
              repeat: Infinity,
              duration: 3.2,
              ease: "easeInOut",
              delay: 0.2
            }}
          >
            ?
          </motion.span>

          {/* Question mark 2 */}
          <motion.span
            className="absolute text-cyan-500 dark:text-cyan-400 text-xl font-extrabold"
            style={{ right: "12%", top: "55%" }}
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: [0.9, 1.15, 0.9],
              y: [0, -7, 0]
            }}
            transition={{
              repeat: Infinity,
              duration: 2.8,
              ease: "easeInOut",
              delay: 1.5
            }}
          >
            ?
          </motion.span>

          {/* Question mark 3 */}
          <motion.span
            className="absolute text-indigo-505 dark:text-indigo-400 text-sm font-medium"
            style={{ left: "50%", bottom: "5%" }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [0.9, 1.1, 0.9],
              y: [0, -5, 0]
            }}
            transition={{
              repeat: Infinity,
              duration: 4,
              ease: "easeInOut",
              delay: 0.8
            }}
          >
            ?
          </motion.span>

          {/* ORBITING SEARCH GLASS ICON ACCELERATOR */}
          {/* We emulate orbit using Framer motion absolute position coordinate transitions */}
          <motion.div
            className="absolute p-2.5 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 dark:from-sky-400 dark:to-indigo-550 border border-white/20 shadow-md flex items-center justify-center text-white"
            style={{ 
              zIndex: 30,
              width: "36px",
              height: "36px"
            }}
            animate={{
              x: [24, 134, 154, 44, 24],
              y: [120, 135, 75, 45, 120],
              scale: [1, 1.15, 0.9, 1.05, 1],
              rotate: [0, 90, 180, 270, 360]
            }}
            transition={{
              repeat: Infinity,
              duration: 8.5,
              ease: "easeInOut"
            }}
          >
            <Search className="h-4.5 w-4.5 text-white" />
          </motion.div>

        </motion.div>
      </div>

    </div>
  );
}
