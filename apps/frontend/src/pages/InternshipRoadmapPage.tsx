"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";

// --- Colors & Data Configuration ---
const colors = {
  emerald: "#10B981",
  crimson: "#EF4444",
  amber: "#F59E0B",
  cyan: "#06B6D4",
  purple: "#A855F7",
  board: "#0B132B",
};

const portalLinks = {
  registration: "https://samagama.in",
  discussion: "https://vicharanashala.discourse.group/",
  vibe: "https://vibe.vicharanashala.ai/student/course-registration/6a14258a4fa5339bade5d733",
  matrix: "https://sudarshansudarshan.github.io/codershigh/matrixmystics/",
  matrixEndorsement: "https://samagama.in/spa",
  phase1: "https://github.com/vicharanashala/crowd-source-faq",
};

const registrationChecklist = [
  "Log in to samagama.in",
  "Upload & verify: No Objection Certificate (NOC)",
  "Upload & verify: Offer Letter",
  "Upload & verify: Participation Agreement",
  "Upload & verify: Honor Code",
  "Submit your Zoom ID",
  "Submit your GitHub ID",
];

const standupChecklist = [
  "Join the Zoom meeting using daily email link",
  "Attend session using laptop with camera ON",
  "Participate in all polls during the session",
];

const vibeCourses = ["Onboarding", "Fundamentals of AI", "MERN Stack Development"];

const vibeWeeks = [
  { week: "Week 1", items: ["Onboarding", "70% Fundamentals of AI"] },
  { week: "Week 2", items: ["100% Fundamentals of AI", "50% MERN"] },
  { week: "Week 3", items: ["80% MERN"] },
  { week: "Week 4", items: ["100% All Courses"] },
];

const phase1Steps = [
  "Form a team of 10 members",
  "Team Lead forks official repository",
  "Add all team members as collaborators",
  "Develop and test assigned feature",
  "Submit Pull Request link on Samagama",
];

const phase2Mentors = [
  { project: "ViBe", mentor: "Minakshi Madam" },
  { project: "Spandan", mentor: "Rohit Sir" },
  { project: "PyBe", mentor: "Prakash Sir" },
  { project: "Tenali", mentor: "Jinal Madam" },
  { project: "Spurti", mentor: "Sakshi Madam" },
  { project: "FLN", mentor: "Pavani Madam" },
];

const completionSteps = [
  "Attend daily mentor meetings",
  "Develop and present approved features",
  "Submit Pull Requests for final sign-off",
];

const overviewStops = [
  { label: "Start", dot: colors.emerald, id: "start" },
  { label: "Register", dot: colors.emerald, id: "stop-1" },
  { label: "Stand-up", dot: colors.crimson, id: "stop-2" },
  { label: "ViBe", dot: colors.amber, id: "stop-3" },
  { label: "Matrix", dot: colors.amber, id: "stop-4" },
  { label: "Phase 1", dot: colors.cyan, id: "stop-5" },
  { label: "Phase 2", dot: colors.cyan, id: "stop-6" },
  { label: "Finish", dot: colors.purple, id: "stop-end" },
];

function initials(name: string) {
  return name
    .replace(/madam|sir/gi, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// --- Icons ---
function CheckIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.5}>
      <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.99 12.93a5 5 0 0 0 7.07 7.07L13.5 18.5" />
    </svg>
  );
}

// --- Canvas Ocean Wave Background ---
function OceanBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles = Array.from({ length: 35 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.5 + 1,
      alpha: Math.random() * 0.5 + 0.1,
      speedY: Math.random() * 0.3 + 0.1,
      speedX: (Math.random() - 0.5) * 0.2,
    }));

    let step = 0;

    const render = () => {
      step += 0.006;
      ctx.clearRect(0, 0, width, height);

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#020617");
      grad.addColorStop(0.5, "#07172F");
      grad.addColorStop(1, "#0B2545");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const waves = [
        { color: "rgba(14, 165, 233, 0.07)", speed: 1, heightOffset: 0.2, length: 0.004, amp: 45 },
        { color: "rgba(6, 182, 212, 0.1)", speed: 1.4, heightOffset: 0.55, length: 0.007, amp: 30 },
        { color: "rgba(59, 130, 246, 0.05)", speed: 0.8, heightOffset: 0.85, length: 0.003, amp: 55 },
      ];

      waves.forEach((w) => {
        ctx.beginPath();
        ctx.fillStyle = w.color;
        const waveY = height * w.heightOffset;
        ctx.moveTo(0, height);
        ctx.lineTo(0, waveY);

        for (let x = 0; x <= width; x += 12) {
          const y =
            Math.sin(x * w.length + step * w.speed) * w.amp +
            Math.cos(x * 0.002 + step * 0.4) * (w.amp * 0.4) +
            waveY;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
      });

      particles.forEach((p) => {
        p.y -= p.speedY;
        p.x += p.speedX;
        if (p.y < 0) p.y = height;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

// --- Interactive Engine Unit ---
function ExpressTrainEngine({
  isMoving,
  headlightOn,
  onWhistle,
  whistleActive,
}: {
  isMoving: boolean;
  headlightOn: boolean;
  onWhistle: () => void;
  whistleActive: boolean;
}) {
  return (
    <div
      onClick={onWhistle}
      className="relative w-16 h-20 flex flex-col items-center justify-center cursor-pointer group select-none"
      title="Click Engine or Press 'W' to Honk Whistle!"
    >
      {/* Whistle Steam Plume Effect */}
      <AnimatePresence>
        {whistleActive && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.4 }}
            animate={{ opacity: 1, y: -45, scale: 1.6 }}
            exit={{ opacity: 0, y: -60, scale: 2 }}
            transition={{ duration: 0.6 }}
            className="absolute -top-10 z-50 flex items-center justify-center"
          >
            <span className="font-mono text-[10px] font-extrabold text-amber-300 bg-black/80 border border-amber-400 px-2 py-0.5 rounded-full shadow-[0_0_15px_#f59e0b] whitespace-nowrap animate-bounce">
              💨 CHOON! CHOON!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Motion Smoke Puff */}
      <div className="absolute -top-6 flex flex-col items-center pointer-events-none">
        {isMoving && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.3, y: 0 }}
              animate={{ opacity: [0.8, 0], scale: [0.5, 2], y: [-5, -30], x: [-3, -12] }}
              transition={{ repeat: Infinity, duration: 0.6, ease: "easeOut" }}
              className="w-3 h-3 bg-white/50 rounded-full blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.2, y: 0 }}
              animate={{ opacity: [0.6, 0], scale: [0.4, 2.5], y: [-2, -40], x: [3, 14] }}
              transition={{ repeat: Infinity, duration: 0.9, delay: 0.15, ease: "easeOut" }}
              className="w-4 h-4 bg-cyan-200/40 rounded-full blur-[3px]"
            />
          </>
        )}
      </div>

      {/* Train Engine Vector Body */}
      <svg width="52" height="72" viewBox="0 0 52 72" fill="none" className="transition-transform group-hover:scale-105">
        <ellipse cx="26" cy="38" rx="22" ry="32" fill="black" fillOpacity="0.35" />

        {/* Headlight Beam Cone */}
        {headlightOn && (
          <polygon
            points="26,12 -10,90 62,90"
            fill="url(#headlight-beam)"
            opacity={isMoving ? 0.85 : 0.5}
          />
        )}

        {/* Engine Shell */}
        <rect x="10" y="14" width="32" height="48" rx="6" fill="#1E293B" stroke="#38BDF8" strokeWidth="2" />
        <rect x="12" y="42" width="28" height="18" rx="3" fill="#0F172A" />
        <rect x="15" y="45" width="22" height="12" rx="2" fill="#0284C7" opacity="0.9" />

        {/* Engine Bonnet */}
        <rect x="15" y="18" width="22" height="22" rx="3" fill="#334155" />
        <line x1="15" y1="24" x2="37" y2="24" stroke="#64748B" strokeWidth="1.5" />
        <line x1="15" y1="30" x2="37" y2="30" stroke="#64748B" strokeWidth="1.5" />

        {/* Steam Pipe Chimney */}
        <circle cx="26" cy="14" r="5" fill="#EF4444" stroke="#F87171" strokeWidth="1.5" />
        <circle cx="26" cy="14" r="2" fill="#FEE2E2" />

        {/* Headlight Bulb */}
        <circle
          cx="26"
          cy="8"
          r="4.5"
          fill={headlightOn ? "#F59E0B" : "#475569"}
          className={headlightOn ? "animate-pulse" : ""}
        />
        <circle cx="26" cy="8" r="2" fill={headlightOn ? "#FEF3C7" : "#1E293B"} />

        {/* Wheels / Pistons */}
        <rect x="6" y="22" width="4" height="12" rx="1" fill="#94A3B8" />
        <rect x="42" y="22" width="4" height="12" rx="1" fill="#94A3B8" />
        <rect x="6" y="42" width="4" height="12" rx="1" fill="#94A3B8" />
        <rect x="42" y="42" width="4" height="12" rx="1" fill="#94A3B8" />

        <defs>
          <linearGradient id="headlight-beam" x1="26" y1="12" x2="26" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F59E0B" stopOpacity="0.75" />
            <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// --- Glassmorphism Milestone Card ---
function GlassCard({
  accent,
  children,
  className = "",
  glow = false,
}: {
  accent?: string;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`relative rounded-3xl border border-white/15 bg-slate-900/40 backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-white/30 ${
        glow ? "ring-2 ring-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.25)] bg-slate-900/60" : ""
      } ${className}`}
      style={accent ? { borderLeft: `5px solid ${accent}` } : undefined}
    >
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-transparent to-black/20 pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

// --- Eyebrow Tag ---
function Eyebrow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-2 flex items-center gap-2" style={{ color }}>
      <span className="inline-block w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: color }} />
      {children}
    </p>
  );
}

// --- Interactive Link Button ---
function PortalLink({ href, color, label = "Portal Link" }: { href?: string; color: string; label?: string }) {
  if (!href) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-2 font-mono text-xs text-white/50">
        <LinkIcon />
        {label} — Pending Link
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-mono text-xs font-semibold text-white transition-all hover:bg-white/20 hover:scale-[1.03] active:scale-[0.97]"
      style={{ boxShadow: `0 4px 14px ${color}33` }}
    >
      <LinkIcon />
      {label} ↗
    </a>
  );
}

// --- Main Interactive Roadmap ---
export default function InternshipRoadmapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [trainY, setTrainY] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [headlightOn, setHeadlightOn] = useState(true);
  const [whistleActive, setWhistleActive] = useState(false);
  const [activeStop, setActiveStop] = useState("start");

  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Native Scroll bindings
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  // Calculate position along railway line
  useEffect(() => {
    const updatePosition = () => {
      if (!trackRef.current) return;
      const trackHeight = trackRef.current.getBoundingClientRect().height;
      const progress = smoothProgress.get();
      const newY = Math.max(0, Math.min(trackHeight - 80, progress * trackHeight));
      setTrainY(newY);

      const totalStops = overviewStops.length;
      const idx = Math.min(totalStops - 1, Math.floor(progress * totalStops));
      setActiveStop(overviewStops[idx].id);
    };

    const unsub = smoothProgress.on("change", () => {
      updatePosition();
      setIsMoving(true);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => setIsMoving(false), 160);
    });

    window.addEventListener("resize", updatePosition);
    updatePosition();

    return () => {
      unsub();
      window.removeEventListener("resize", updatePosition);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [smoothProgress]);

  // Audio / Visual Whistle Trigger
  const triggerWhistle = useCallback(() => {
    setWhistleActive(true);
    setTimeout(() => setWhistleActive(false), 800);
  }, []);

  // Keyboard Navigation Controls (Drive train with Arrow Keys or 'W' Whistle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        window.scrollBy({ top: 120, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        window.scrollBy({ top: -120, behavior: "smooth" });
      } else if (e.key.toLowerCase() === "w") {
        triggerWhistle();
      } else if (e.key.toLowerCase() === "h") {
        setHeadlightOn((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerWhistle]);

  const progressPercent = useTransform(smoothProgress, [0, 1], [0, 100]);
  const [progressText, setProgressText] = useState("0%");

  useMotionValueEvent(progressPercent, "change", (v) => {
    setProgressText(`${Math.round(v)}%`);
  });

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div ref={containerRef} className="relative min-h-screen text-slate-100 font-sans selection:bg-cyan-500 selection:text-white pb-32">
      <OceanBackground />

      {/* Floating HUD Controller Deck */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl p-2.5 shadow-2xl">
          <button
            onClick={triggerWhistle}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-mono font-bold text-amber-300 hover:bg-amber-500/30 transition-all active:scale-95"
            title="Press 'W' to Whistle"
          >
            📢 Whistle (W)
          </button>
          <button
            onClick={() => setHeadlightOn(!headlightOn)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition-all active:scale-95 ${
              headlightOn
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
            title="Press 'H' to toggle Headlight"
          >
            💡 Light (H)
          </button>
          <div className="h-4 w-px bg-white/20 mx-1" />
          <button
            onClick={() => window.scrollBy({ top: -250, behavior: "smooth" })}
            className="rounded-xl bg-white/10 p-2 text-xs hover:bg-white/20 active:scale-95"
            title="Drive Up (Up Arrow)"
          >
            ▲
          </button>
          <button
            onClick={() => window.scrollBy({ top: 250, behavior: "smooth" })}
            className="rounded-xl bg-white/10 p-2 text-xs hover:bg-white/20 active:scale-95"
            title="Drive Down (Down Arrow)"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Main Roadmap Wrapper */}
      <div className="relative z-10 mx-auto max-w-4xl px-4 pt-8 md:pt-12">

        {/* Departure Board Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl border border-white/20 bg-slate-900/85 backdrop-blur-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] mb-12"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 font-mono text-xs font-bold text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              LINE 01 · AI INTERNSHIP EXPRESS
            </span>
            <span className="font-mono text-xs tracking-widest text-slate-400">KEYBOARD DRIVE ENABLED</span>
          </div>

          <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white md:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-slate-400">
            The Internship Express
          </h1>
          <p className="mb-6 font-mono text-xs text-slate-300 md:text-sm">
            ORIGIN: <span className="text-emerald-400">Registration</span> &nbsp;→&nbsp; TERMINUS:{" "}
            <span className="text-cyan-400">Internship Completion</span>
          </p>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <a
              href={portalLinks.discussion}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 font-mono text-xs text-amber-300 transition-all hover:bg-amber-500/20"
            >
              💬 Discussion Forum ↗
            </a>
          </div>

          {/* Progress Bar */}
          <div className="mb-6 flex items-center gap-4 font-mono text-xs text-slate-300 bg-black/40 p-3.5 rounded-2xl border border-white/10">
            <span className="font-bold text-cyan-400">PROGRESS</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800 relative">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500"
                style={{ width: `${progressPercent.get()}%` }}
              />
            </div>
            <span className="w-10 text-right font-bold text-white">{progressText}</span>
          </div>

          {/* Mini Interactive Station Line Map */}
          <div className="flex items-center overflow-x-auto pb-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {overviewStops.map((stop, i) => {
              const isActive = activeStop === stop.id;
              return (
                <button
                  key={stop.label}
                  onClick={() => scrollToSection(stop.id)}
                  className="relative flex min-w-[85px] flex-col items-center group focus:outline-none"
                >
                  {i > 0 && (
                    <div className="absolute left-[-42px] right-[42px] top-[10px] h-0.5 bg-slate-700 group-hover:bg-cyan-500/50 transition-colors" />
                  )}
                  <div
                    className={`z-10 mb-2 h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                      isActive
                        ? "scale-125 border-white bg-cyan-500 shadow-[0_0_15px_#06b6d4]"
                        : "border-slate-500 bg-slate-900 group-hover:border-cyan-400"
                    }`}
                  >
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span
                    className={`font-mono text-[11px] tracking-wide transition-colors ${
                      isActive ? "text-cyan-300 font-bold" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  >
                    {stop.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Railway Journey Grid */}
        <div ref={trackRef} className="relative pl-12 md:pl-20">

          {/* Railway Tracks */}
          <div className="absolute top-0 bottom-0 left-[22px] md:left-[38px] w-6 flex justify-center pointer-events-none">
            <div className="w-1 h-full bg-slate-600/80 shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
            <div className="absolute inset-y-0 w-6 flex flex-col justify-between py-2 opacity-60">
              <div
                className="w-full h-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, #475569 0px, #475569 3px, transparent 3px, transparent 18px)",
                }}
              />
            </div>
            <div className="w-1 h-full bg-slate-600/80 shadow-[0_0_8px_rgba(255,255,255,0.2)]" />

            {/* Glowing Active Track */}
            <motion.div
              className="absolute top-0 w-1 bg-gradient-to-b from-emerald-400 via-cyan-400 to-purple-400 shadow-[0_0_12px_#06b6d4]"
              style={{ height: trainY, left: "3px" }}
            />
          </div>

          {/* Interactive Dynamic Train Unit */}
          <div
            className="absolute left-[2px] md:left-[18px] top-0 z-30 transition-transform duration-75 ease-out"
            style={{ transform: `translateY(${trainY}px)` }}
          >
            <ExpressTrainEngine
              isMoving={isMoving}
              headlightOn={headlightOn}
              onWhistle={triggerWhistle}
              whistleActive={whistleActive}
            />
          </div>

          {/* START MILESTONE */}
          <div id="start" className="relative mb-16 pt-2">
            <GlassCard accent={colors.emerald} glow={activeStop === "start"}>
              <Eyebrow color={colors.emerald}>Platform 01 · Departure</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Internship Journey Begins</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Welcome to the AI Internship. Drive along the tracks to navigate through mandatory setup, daily stand-up requirements, and team projects.
              </p>
              <PortalLink href={portalLinks.discussion} color={colors.emerald} label="Discussion Forum" />
            </GlassCard>
          </div>

          {/* STOP 1: Registration */}
          <div id="stop-1" className="relative mb-16">
            <GlassCard accent={colors.emerald} glow={activeStop === "stop-1"}>
              <Eyebrow color={colors.emerald}>Stop 1 · Boarding Pass</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Internship Registration</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Complete all mandatory document uploads and profile verification steps.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4">
                {registrationChecklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-xs text-slate-200 bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex-none">
                      <CheckIcon color={colors.emerald} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <PortalLink href={portalLinks.registration} color={colors.emerald} label="Samagama Registration Portal" />
            </GlassCard>
          </div>

          {/* STOP 2: Mandatory Stand-ups */}
          <div id="stop-2" className="relative mb-16">
            <GlassCard accent={colors.crimson} glow={activeStop === "stop-2"}>
              <Eyebrow color={colors.crimson}>Stop 2 · Ticket Inspection</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Mandatory Daily Stand-up Sessions</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Active engagement in daily sessions is necessary to remain eligible for project allocation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                {[
                  { value: "85%", label: "Stand-up Attendance" },
                  { value: "85%", label: "Poll Participation" },
                  { value: "50%", label: "Poll Accuracy" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-center">
                    <span className="block font-mono text-2xl font-extrabold text-red-400">{m.value}</span>
                    <span className="mt-1 block text-[11px] text-slate-300">{m.label}</span>
                  </div>
                ))}
              </div>

              <ul className="flex flex-col gap-2 mb-4">
                {standupChecklist.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-red-200/90">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>

          {/* STOP 3: ViBe Learning Platform */}
          <div id="stop-3" className="relative mb-16">
            <GlassCard accent={colors.amber} glow={activeStop === "stop-3"}>
              <Eyebrow color={colors.amber}>Stop 3 · Knowledge Hub</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">ViBe Learning Platform</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Complete coursework according to the week-wise plan below:
              </p>

              <div className="mb-4 flex flex-wrap gap-2">
                {vibeCourses.map((c) => (
                  <span key={c} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-300">
                    {c}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {vibeWeeks.map((w) => (
                  <div key={w.week} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <span className="block font-mono text-xs font-bold text-amber-400 mb-1">{w.week}</span>
                    <ul className="space-y-1">
                      {w.items.map((it) => (
                        <li key={it} className="text-xs text-slate-300 flex items-center gap-1.5">
                          <span className="text-amber-500">▸</span> {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <PortalLink href={portalLinks.vibe} color={colors.amber} label="Access ViBe Platform" />
            </GlassCard>
          </div>

          {/* STOP 4: Matrix Mystics */}
          <div id="stop-4" className="relative mb-16">
            <GlassCard accent={colors.amber} glow={activeStop === "stop-4"}>
              <Eyebrow color={colors.amber}>Stop 4 · Peer Assessment</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Matrix Mystics</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center font-mono">
                  <span className="block text-2xl font-bold text-amber-300">53</span>
                  <span className="text-[11px] text-slate-300">Math Problems</span>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center font-mono">
                  <span className="block text-2xl font-bold text-amber-300">2 Months</span>
                  <span className="text-[11px] text-slate-300">Time Limit</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <PortalLink href={portalLinks.matrix} color={colors.amber} label="Matrix Portal" />
                <PortalLink href={portalLinks.matrixEndorsement} color={colors.amber} label="Viva Endorsements" />
              </div>
            </GlassCard>
          </div>

          {/* STOP 5: Phase 1 */}
          <div id="stop-5" className="relative mb-16">
            <GlassCard accent={colors.cyan} glow={activeStop === "stop-5"}>
              <Eyebrow color={colors.cyan}>Stop 5 · Engineering Sprint</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Phase 1 – Crowd Source FAQ</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Form teams of 10 and submit open-source contributions.
              </p>

              <div className="space-y-2 mb-4">
                {phase1Steps.map((step, idx) => (
                  <div key={step} className="flex items-center gap-3 text-xs text-slate-200 bg-white/5 p-2 rounded-lg">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>

              <PortalLink href={portalLinks.phase1} color={colors.cyan} label="Explore FAQ Repository" />
            </GlassCard>
          </div>

          {/* STOP 6: Phase 2 Mentor Projects */}
          <div id="stop-6" className="relative mb-16">
            <GlassCard accent={colors.cyan} glow={activeStop === "stop-6"}>
              <Eyebrow color={colors.cyan}>Stop 6 · Industry Mentorship</Eyebrow>
              <h2 className="text-2xl font-bold text-white mb-2">Phase 2 – Mentor Projects</h2>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/10 font-mono text-cyan-300 uppercase">
                    <tr>
                      <th className="p-3">Project</th>
                      <th className="p-3">Mentor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {phase2Mentors.map((row) => (
                      <tr key={row.project} className="hover:bg-white/5 transition-colors">
                        <td className="p-3 font-semibold text-white">{row.project}</td>
                        <td className="p-3 flex items-center gap-2 text-slate-300">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/30">
                            {initials(row.mentor)}
                          </span>
                          {row.mentor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>

          {/* FINAL STOP */}
          <div id="stop-end" className="relative">
            <GlassCard accent={colors.purple} glow={activeStop === "stop-end"} className="bg-slate-950/80 border-purple-500/30">
              <Eyebrow color="#C084FC">Final Destination · Completion</Eyebrow>
              <h2 className="text-3xl font-extrabold text-white mb-2">Internship Completion</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Submit PRs approved by your mentor to successfully graduate.
              </p>

              <ul className="space-y-2 mb-6">
                {completionSteps.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-xs text-purple-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    {step}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>

        </div>
      </div>
    </div>
  );
}