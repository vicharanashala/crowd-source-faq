"use client";

import type { ReactNode } from "react";

const colors = {
  emerald: "#1B8A5A",
  emeraldSoft: "#DCF1E5",
  emeraldDeep: "#0E5C3B",
  crimson: "#C0392E",
  crimsonSoft: "#FAE1DD",
  crimsonDeep: "#7E241B",
  amber: "#C9821E",
  amberSoft: "#F7E7D0",
  amberDeep: "#7A4C11",
  slate: "#57657A",
  slateSoft: "#E7EAEE",
  slateDeep: "#33404F",
  board: "#0E141C",
};

// Drop each portal's URL in here — leave "" until you have the link.
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
  "Join the Zoom meeting using the daily link shared by email",
  "Attend the session using a laptop",
  "Keep your camera ON throughout the meeting",
  "Participate in all polls during the session",
];

const vibeCourses = ["Onboarding", "Fundamentals of AI", "MERN Stack Development"];

const vibeWeeks = [
  { week: "Week 1", items: ["Complete Onboarding", "Complete 70% of Fundamentals of AI"] },
  { week: "Week 2", items: ["Complete 100% of Fundamentals of AI", "Complete 50% of MERN"] },
  { week: "Week 3", items: ["Complete 80% of MERN"] },
  { week: "Week 4", items: ["Complete 100% of all three courses"] },
];

const phase1Steps = [
  "Form a team of 10 members.",
  "Team Lead forks the official repository.",
  "Add all team members as collaborators.",
  "Clone the repository.",
  "Discuss new feature ideas.",
  "Develop the assigned feature.",
  "Test the feature.",
  "Push the code.",
  "Create a Pull Request.",
  "Submit the Pull Request link on Samagama.",
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
  "Attend daily mentor meetings.",
  "Discuss features with your mentor.",
  "Develop approved features.",
  "Submit Pull Requests.",
  "Once your Pull Requests are approved by the mentor, your internship is successfully completed.",
];

const overviewStops = [
  { label: "Start", dot: colors.emerald },
  { label: "Register", dot: colors.emerald, seg: colors.emerald },
  { label: "Stand-up", dot: colors.crimson, seg: colors.crimson },
  { label: "ViBe", dot: colors.amber, seg: colors.amber },
  { label: "Matrix", dot: colors.amber, seg: colors.amber },
  { label: "Phase 1", dot: colors.slate, seg: colors.slate },
  { label: "Phase 2", dot: colors.slate, seg: colors.slate },
  { label: "Delivery", dot: "#8B94A0", seg: colors.slate },
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

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3}>
      <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.99 12.93a5 5 0 0 0 7.07 7.07L13.5 18.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function Marker({
  code,
  color,
  shape = "circle",
}: {
  code: string;
  color: string;
  shape?: "circle" | "hexagon" | "solid";
}) {
  const base =
    "absolute -left-[70px] top-0.5 w-[58px] h-[58px] flex items-center justify-center bg-white border-[3px] shadow-md z-10";
  const shapeClass = shape === "hexagon" ? "rounded-none" : "rounded-full";
  const clip =
    shape === "hexagon"
      ? { clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)" }
      : {};
  const bg = shape === "solid" ? colors.board : "#ffffff";
  return (
    <div className={`${base} ${shapeClass}`} style={{ borderColor: color, background: bg, ...clip }}>
      <span
        className="font-mono font-semibold text-[11px]"
        style={{ color: shape === "solid" ? "#F4F6F7" : color }}
      >
        {code}
      </span>
    </div>
  );
}

function Card({
  accent,
  dark,
  children,
  className = "",
}: {
  accent?: string;
  dark?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,20,27,0.05),0_10px_28px_-10px_rgba(15,20,27,0.14)] transition-transform hover:-translate-y-0.5 hover:shadow-lg ${
        dark ? "bg-[#0E141C] border-[#0E141C]" : "bg-white border-[#D7DEE2]"
      } ${className}`}
      style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

function Eyebrow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-widest font-medium mb-1.5" style={{ color }}>
      {children}
    </p>
  );
}

function PortalLink({ href, color, label = "Portal link" }: { href?: string; color: string; label?: string }) {
  if (!href) {
    return (
      <div
        className="mt-4 flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-2.5 font-mono text-[12.5px] opacity-70"
        style={{ borderColor: color, color }}
      >
        <LinkIcon />
        {label} — paste URL here
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 font-mono text-[12.5px] transition-opacity hover:opacity-75"
      style={{ borderColor: color, color }}
    >
      <LinkIcon />
      {label} ↗
    </a>
  );
}

export default function InternshipRoadmapPage() {
  return (
    <div className="min-h-screen bg-[#E9EDEF] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        {/* Departure board header */}
        <div className="relative overflow-hidden rounded-[20px] bg-[#0E141C] px-6 pt-7 pb-6 shadow-[0_1px_2px_rgba(15,20,27,0.05),0_10px_28px_-10px_rgba(15,20,27,0.14)] md:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span
              className="rounded-full px-3 py-1 font-mono text-[11.5px] font-semibold tracking-wider"
              style={{ background: colors.amber, color: colors.board }}
            >
              LINE 01 · AI INTERNSHIP
            </span>
            <span className="font-mono text-[11.5px] tracking-wider text-[#8B94A0]">DEPARTURES</span>
          </div>

          <h1 className="mb-1 text-3xl font-bold uppercase tracking-wide text-[#F4F6F7] md:text-4xl">
            The Internship Express
          </h1>
          <p className="mb-4 font-mono text-[12.5px] text-[#7C8590]">
            ORIGIN <span className="text-[#C9D0D6]">Registration</span> &nbsp;→&nbsp; TERMINUS{" "}
            <span className="text-[#C9D0D6]">Internship Completion</span>
          </p>

          <a
            href={portalLinks.discussion}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 font-mono text-[12px] transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(201,130,30,0.5)", color: colors.amber }}
          >
            <ChatIcon />
            Discussion Forum ↗
          </a>

          <div className="mb-6 flex items-center gap-3 font-mono text-[11.5px] text-[#8B94A0]">
            <span>PROGRESS</span>
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#232C36]">
              <div className="h-full rounded-full" style={{ width: "2%", background: colors.emerald }} />
            </div>
            <span>0%</span>
          </div>

          {/* mini overview line map */}
          <div className="flex overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {overviewStops.map((s, i) => (
              <div key={s.label} className="relative flex min-w-[74px] flex-col items-center">
                {i > 0 && (
                  <div className="absolute left-[-37px] right-[37px] top-[7px] h-0.5" style={{ background: s.seg }} />
                )}
                <div
                  className="z-10 mb-2 h-4 w-4 rounded-full border-[2.5px]"
                  style={{ background: colors.board, borderColor: s.dot }}
                />
                <span className="font-mono text-[10.5px] tracking-wide text-[#8B94A0]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Journey */}
        <div className="relative mt-10 pl-[70px]">
          {/* rail */}
          <div className="absolute bottom-1.5 left-[29px] top-1.5 w-1 overflow-hidden rounded-[3px]">
            <div
              className="h-full w-full opacity-85"
              style={{
                background: `linear-gradient(to bottom, ${colors.emerald} 0%, ${colors.emerald} 10%, ${colors.emerald} 10%, ${colors.emerald} 22%, ${colors.crimson} 22%, ${colors.crimson} 34%, ${colors.amber} 34%, ${colors.amber} 60%, ${colors.slate} 60%, ${colors.slate} 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.55) 0 2px, transparent 2px 11px)",
              }}
            />
          </div>

          {/* START */}
          <div className="relative mb-8">
            <div className="absolute -left-[70px] -top-[30px] flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: colors.emerald }}
                />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: colors.emerald }} />
              </span>
              <span
                className="font-mono text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: colors.emeraldDeep }}
              >
                You are here
              </span>
            </div>
            <Marker code="START" color={colors.emerald} />
            <Card>
              <Eyebrow color={colors.emeraldDeep}>Departure · Platform 1</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                Internship Journey Begins
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Welcome to the AI Internship. Complete the following steps in order to successfully
                finish your internship.
              </p>
              <PortalLink href={portalLinks.discussion} color={colors.emerald} label="Discussion Forum" />
            </Card>
          </div>

          {/* STOP 1 — Registration */}
          <div className="relative mb-8">
            <Marker code="S1" color={colors.emerald} />
            <Card accent={colors.emerald}>
              <Eyebrow color={colors.emeraldDeep}>Stop 1 · Platform 1</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                Internship Registration
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Board the internship by completing these requirements first.
              </p>
              <ul className="flex flex-col gap-2.5">
                {registrationChecklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-[#12181F]">
                    <span
                      className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border"
                      style={{ background: colors.emeraldSoft, borderColor: colors.emerald }}
                    >
                      <CheckIcon color={colors.emeraldDeep} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <PortalLink href={portalLinks.registration} color={colors.emerald} label="Samagama portal" />
            </Card>
          </div>

          {/* STOP 2 — Mandatory Daily Stand-up + Eligibility Gate */}
          <div className="relative mb-8">
            <Marker code="GATE" color={colors.crimson} shape="hexagon" />
            <Card className="!bg-gradient-to-b !from-white !to-[#FAE1DD]">
              <Eyebrow color={colors.crimsonDeep}>Stop 2 · Ticket check</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide" style={{ color: colors.crimsonDeep }}>
                Mandatory Daily Stand-up Sessions
              </h2>
              <ul className="mb-4 flex flex-col gap-2.5">
                {standupChecklist.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[14.5px] leading-relaxed"
                    style={{ color: colors.crimsonDeep }}
                  >
                    <span
                      className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border"
                      style={{ background: colors.crimsonSoft, borderColor: colors.crimson }}
                    >
                      <CheckIcon color={colors.crimsonDeep} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider" style={{ color: colors.crimsonDeep }}>
                Eligibility requirements
              </p>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { value: "85%", label: "Stand-up attendance" },
                  { value: "85%", label: "Poll participation" },
                  { value: "50%", label: "Poll accuracy" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border px-3.5 py-3.5 text-center"
                    style={{ background: colors.crimsonSoft, borderColor: "#EFC4BB" }}
                  >
                    <span className="block font-mono text-[25px] font-semibold" style={{ color: colors.crimsonDeep }}>
                      {m.value}
                    </span>
                    <span className="mt-1 block text-xs text-[#5C6670]">{m.label}</span>
                  </div>
                ))}
              </div>
              <p
                className="mb-4 flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-[13.5px]"
                style={{ color: colors.crimsonDeep, borderColor: "#EFC4BB" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="mt-0.5 flex-none"
                >
                  <path d="M12 2 22 20H2Z" strokeLinejoin="round" />
                  <path d="M12 9v5M12 17h.01" />
                </svg>
                Students who do not meet these requirements may be removed from the internship.
              </p>

              <div
                className="flex items-center gap-2 rounded-lg border px-3.5 py-2.5 font-mono text-[12.5px]"
                style={{ background: colors.crimsonSoft, borderColor: "#EFC4BB", color: colors.crimsonDeep }}
              >
                <MailIcon />
                Daily Zoom link is sent to your registered email every morning
              </div>
            </Card>
          </div>

          {/* STOP 3 — ViBe Learning Platform */}
          <div className="relative mb-8">
            <Marker code="B1" color={colors.amber} />
            <Card accent={colors.amber}>
              <Eyebrow color={colors.amberDeep}>Bronze line · Stop 3</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                ViBe Learning Platform
              </h2>
              <p className="mb-3 text-[14.5px] leading-relaxed text-[#5C6670]">Courses on this line:</p>
              <div className="mb-5 flex flex-wrap gap-2">
                {vibeCourses.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border px-3.5 py-1.5 font-mono text-[12.5px]"
                    style={{ background: colors.amberSoft, borderColor: "#EACB9C", color: colors.amberDeep }}
                  >
                    {c}
                  </span>
                ))}
              </div>

              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-[#98A1A9]">Week-wise plan</p>
              <div className="flex flex-col gap-3">
                {vibeWeeks.map((w) => (
                  <div
                    key={w.week}
                    className="rounded-[10px] border px-4 py-3"
                    style={{ background: colors.amberSoft, borderColor: "#EACB9C" }}
                  >
                    <span className="mb-1 block font-mono text-[13px] font-semibold" style={{ color: colors.amberDeep }}>
                      {w.week}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {w.items.map((it) => (
                        <li key={it} className="text-[13.5px] leading-relaxed text-[#5C4319]">
                          • {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <PortalLink href={portalLinks.vibe} color={colors.amberDeep} label="ViBe platform" />
            </Card>
          </div>

          {/* STOP 4 — Matrix Mystics */}
          <div className="relative mb-8">
            <Marker code="B2" color={colors.amber} />
            <Card accent={colors.amber}>
              <Eyebrow color={colors.amberDeep}>Bronze line · Stop 4</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">Matrix Mystics</h2>
              <div className="mb-4 flex flex-wrap gap-3">
                <div
                  className="min-w-[150px] rounded-[10px] border px-4 py-2.5 font-mono text-[13px]"
                  style={{ background: colors.amberSoft, borderColor: "#EACB9C", color: colors.amberDeep }}
                >
                  <b className="block text-[17px]">53</b>
                  Mathematics questions
                </div>
                <div
                  className="min-w-[150px] rounded-[10px] border px-4 py-2.5 font-mono text-[13px]"
                  style={{ background: colors.amberSoft, borderColor: "#EACB9C", color: colors.amberDeep }}
                >
                  <b className="block text-[17px]">2 Months</b>
                  Time limit
                </div>
              </div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[#98A1A9]">Endorsement rule</p>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Students who already solved a question will conduct a viva for another student. If the
                student answers correctly, they receive an endorsement, and can then conduct vivas for
                other students and endorse them — creating a peer-learning cycle.
              </p>
              <div className="flex flex-wrap gap-3">
                <PortalLink href={portalLinks.matrix} color={colors.amberDeep} label="Matrix Mystics portal" />
                <PortalLink href={portalLinks.matrixEndorsement} color={colors.amberDeep} label="Endorsement (viva)" />
              </div>
            </Card>
          </div>

          {/* STOP 5 — Phase 1: Crowd Source FAQ */}
          <div className="relative mb-8">
            <Marker code="P1" color={colors.slate} />
            <Card accent={colors.slate}>
              <Eyebrow color={colors.slateDeep}>Silver line · Stop 5</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                Phase 1 – Crowd Source FAQ Project
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Interchange from learning to real project contribution.
              </p>
              <ul className="flex flex-col gap-2.5">
                {phase1Steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-[#12181F]">
                    <span
                      className="mt-0.5 flex h-[21px] w-[21px] flex-none items-center justify-center rounded-full border font-mono text-[11px]"
                      style={{ background: colors.slateSoft, borderColor: colors.slate, color: colors.slateDeep }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
              <span
                className="mt-3.5 inline-block rounded-full px-3.5 py-1.5 font-mono text-[12.5px]"
                style={{ background: colors.slateSoft, color: colors.slateDeep }}
              >
                Team of 10 · Shared branch
              </span>
              <PortalLink href={portalLinks.phase1} color={colors.slateDeep} label="Repository" />
            </Card>
          </div>

          {/* STOP 6 — Phase 2: Mentor Projects */}
          <div className="relative">
            <Marker code="P2" color={colors.slate} />
            <Card accent={colors.slate}>
              <Eyebrow color={colors.slateDeep}>Silver line · Stop 6</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                Phase 2 – Mentor Projects
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                After completing Phase 1, students move to Phase 2 and contribute to one of the
                mentor-guided projects below.
              </p>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#D7DEE2" }}>
                <table className="w-full border-collapse text-[13.5px]">
                  <thead>
                    <tr style={{ background: colors.slateSoft }}>
                      <th
                        className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider"
                        style={{ color: colors.slateDeep }}
                      >
                        Project
                      </th>
                      <th
                        className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider"
                        style={{ color: colors.slateDeep }}
                      >
                        Mentor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase2Mentors.map((row, i) => (
                      <tr
                        key={row.project}
                        className={`transition-colors hover:bg-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-[#F5F7F8]"}`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-[#12181F]">{row.project}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 flex-none items-center justify-center rounded-full border font-mono text-[11px] font-semibold"
                              style={{
                                background: colors.slateSoft,
                                borderColor: colors.slate,
                                color: colors.slateDeep,
                              }}
                            >
                              {initials(row.mentor)}
                            </span>
                            <span className="text-[#5C6670]">{row.mentor}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* FINAL STOP — Internship Completion */}
          <div className="relative mt-8">
            <Marker code="END" color={colors.board} shape="solid" />
            <Card dark>
              <div className="mb-3 grid grid-cols-6 grid-rows-2 overflow-hidden rounded-[3px]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className={`h-[9px] w-[9px] ${i % 2 === 0 ? "bg-white" : "bg-[#0E141C]"}`} />
                ))}
              </div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[#7C8590]">
                Arrival · Final stop
              </p>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#F4F6F7]">
                Internship Completion
              </h2>
              <ul className="mb-2 flex flex-col gap-2">
                {completionSteps.map((step) => (
                  <li key={step} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-[#C9D0D6]">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#8B94A0]" />
                    {step}
                  </li>
                ))}
              </ul>
              <PortalLink href={portalLinks.discussion} color="#8B94A0" label="Discussion Forum" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}