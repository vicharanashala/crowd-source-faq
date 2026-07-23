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

const boardingRequirements = [
  "Log in to samagama.in",
  "Upload and verify required documents — NOC, offer letter, participation agreement, honor code",
  "Submit your Zoom ID and GitHub ID",
  "Join the daily Zoom stand-up meeting",
  "Attend polls during the stand-up session",
];

const silverSteps = [
  "Work in a team of 10 members.",
  "Choose one meaningful feature.",
  "Complete development and testing.",
  "Push your code to your Git branch.",
  "Create a pull request (PR).",
];

const spurProjects = ["PyBe", "Ajrasakha", "FLN", "ViBe", "Tenali", "Spandan", "Spurti"];

const overviewStops = [
  { label: "Start", dot: colors.emerald },
  { label: "Gate", dot: colors.crimson, seg: colors.crimson },
  { label: "AI basics", dot: colors.amber, seg: colors.amber },
  { label: "MERN", dot: colors.amber, seg: colors.amber },
  { label: "Junction", dot: colors.slate, seg: colors.slate },
  { label: "Delivery", dot: "#8B94A0", seg: colors.slate },
];

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3}>
      <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
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
    <div
      className={`${base} ${shapeClass}`}
      style={{ borderColor: color, background: bg, ...clip }}
    >
      <span className="font-mono font-semibold text-[11px]" style={{ color: shape === "solid" ? "#F4F6F7" : color }}>
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
          <p className="mb-6 font-mono text-[12.5px] text-[#7C8590]">
            ORIGIN <span className="text-[#C9D0D6]">Onboarding</span> &nbsp;→&nbsp; TERMINUS{" "}
            <span className="text-[#C9D0D6]">Project Delivery</span>
          </p>

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
                background: `linear-gradient(to bottom, ${colors.emerald} 0%, ${colors.emerald} 6%, ${colors.crimson} 6%, ${colors.crimson} 18%, ${colors.amber} 18%, ${colors.amber} 52%, ${colors.slate} 52%, ${colors.slate} 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, rgba(255,255,255,0.55) 0 2px, transparent 2px 11px)",
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
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">Onboarding</h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Board the internship by completing these requirements first.
              </p>
              <ul className="flex flex-col gap-2.5">
                {boardingRequirements.map((item) => (
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
            </Card>
          </div>

          {/* GATE */}
          <div className="relative mb-8">
            <Marker code="GATE" color={colors.crimson} shape="hexagon" />
            <Card className="!bg-gradient-to-b !from-white !to-[#FAE1DD]">
              <Eyebrow color={colors.crimsonDeep}>Ticket check</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide" style={{ color: colors.crimsonDeep }}>
                Eligibility gate
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed opacity-90" style={{ color: colors.crimsonDeep }}>
                Fall short of any of these three and you may be held at the platform.
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
                className="m-0 flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-[13.5px]"
                style={{ color: colors.crimsonDeep, borderColor: "#EFC4BB" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 flex-none">
                  <path d="M12 2 22 20H2Z" strokeLinejoin="round" />
                  <path d="M12 9v5M12 17h.01" />
                </svg>
                Students who don&apos;t meet these thresholds may be excluded from the internship.
              </p>
            </Card>
          </div>

          {/* BRONZE 1 */}
          <div className="relative mb-8">
            <Marker code="B1" color={colors.amber} />
            <Card accent={colors.amber}>
              <Eyebrow color={colors.amberDeep}>Bronze line · Stop 1</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">Fundamentals of AI</h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Core concepts before you touch a line of project code.
              </p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-mono text-[13px]"
                style={{ background: colors.amberSoft, borderColor: "#EACB9C", color: colors.amberDeep }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Due: DOJ + 1 week
              </span>
            </Card>
          </div>

          {/* BRONZE 2 */}
          <div className="relative mb-8">
            <Marker code="B2" color={colors.amber} />
            <Card accent={colors.amber}>
              <Eyebrow color={colors.amberDeep}>Bronze line · Stop 2</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">MERN stack development</h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Full-stack fundamentals, on a two-checkpoint schedule.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { pct: "50%", when: "DOJ + 2 weeks" },
                  { pct: "100%", when: "DOJ + 3 weeks" },
                ].map((s) => (
                  <div
                    key={s.pct}
                    className="min-w-[150px] rounded-[10px] border px-4 py-2.5 font-mono text-[13px]"
                    style={{ background: colors.amberSoft, borderColor: "#EACB9C", color: colors.amberDeep }}
                  >
                    <b className="block text-[17px]">{s.pct}</b>
                    {s.when}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* SILVER JUNCTION */}
          <div className="relative">
            <Marker code="S1" color={colors.slate} />
            <Card accent={colors.slate}>
              <Eyebrow color={colors.slateDeep}>Silver line · Junction</Eyebrow>
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#12181F]">
                Phase 1 — Crowd source FAQ
              </h2>
              <p className="mb-4 text-[14.5px] leading-relaxed text-[#5C6670]">
                Interchange from learning to real project contribution.
              </p>
              <ul className="flex flex-col gap-2.5">
                {silverSteps.map((step, i) => (
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

              {/* Phase 2 spur */}
              <div className="relative mt-6 pt-7">
                <div
                  className="absolute left-2 right-2 top-[9px] border-t-2 border-dashed opacity-50"
                  style={{ borderColor: colors.slate }}
                />
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-[#98A1A9]">
                  Phase 2 spur · additional project stations
                </p>
                <div className="flex flex-wrap gap-x-2.5 gap-y-4">
                  {spurProjects.map((name) => (
                    <div key={name} className="flex min-w-[78px] flex-col items-center gap-1.5">
                      <span
                        className="h-3 w-3 rounded-full border-2 bg-white"
                        style={{ borderColor: colors.slate }}
                      />
                      <span
                        className="rounded-lg px-2.5 py-1 text-center font-mono text-xs"
                        style={{ background: colors.slateSoft, color: colors.slateDeep }}
                      >
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* END */}
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
              <h2 className="mb-2 text-xl font-bold uppercase tracking-wide text-[#F4F6F7]">Project delivery</h2>
              <p className="text-[14.5px] leading-relaxed text-[#8B94A0]">
                Internship complete. Thanks for riding the line — welcome to the platform.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
Samagama:- https://samagama.in
Matrix Mystics:- https://sudarshansudarshan.github.io/codershigh/matrixmystics/
Endorsement:- https://samagama.in/spa
Discourse:- https://vicharanashala.discourse.group/
ViBe:- https://vibe.vicharanashala.ai/student
CSFAQ (Phase 1):- https://github.com/vicharanashala/crowd-source-faq
*/
