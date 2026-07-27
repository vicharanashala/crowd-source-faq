/**
 * TeeDesignerPage — Sign My Tee v1.87.4
 *
 * Three-step wizard (colour → name → text colour) with a live 3D tee
 * preview on the right. v1.87.4 replaces the fixed 6+5 swatch grid
 * with a full-spectrum HSL picker for the tee fabric. The text
 * colour (which drives both "VLED Labs" branding and the back-of-tee
 * name) is selected from the same picker — the user has the entire
 * colour wheel, plus a curated preset row for one-click picks.
 *
 * Layout (unchanged from v1.87.2):
 *   - Hero + stepper get a single `pt-24 sm:pt-28` to clear the fixed
 *     navbar (matches the rest of the auth'd pages).
 *   - Two-column grid (`md:grid-cols-2`) puts the step controls on
 *     the left and the floating tee preview on the right.
 *   - Equal-height cards with shared footer rhythm.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../utils/api';
import { useTeeEligibility, type TeeEligibility } from '../hooks/useTeeEligibility';
import PremiumTee from '../components/tee/PremiumTee';
import {
  ColorWheel,
  ColorPresets,
  contrastRatio,
  recommendTextColor,
} from '../components/tee/ColorWheel';

interface TeeConfig {
  shirtHex: string;
  textHex: string;
  nameOnBack: string;
}

// Default starting configuration — a friendly navy + white pair.
const DEFAULT_CONFIG: TeeConfig = {
  shirtHex: '#1c2c52',
  textHex: '#ffffff',
  nameOnBack: '',
};

// Brief presets shown in addition to the colour wheel — gives the
// user a one-click curated option while still letting them freely
// hunt with the picker. The six brand tones are the old hard-coded
// colours (kept for brand continuity) plus three extras (forest,
// pink, amber) to show how easily the colour wheel extends the range.
const SHIRT_PRESETS = [
  { hex: '#1a1a1f', label: 'Charcoal' },
  { hex: '#f1eee8', label: 'Cream'    },
  { hex: '#1c2c52', label: 'Navy'     },
  { hex: '#4e1720', label: 'Maroon'   },
  { hex: '#4d4a25', label: 'Olive'    },
  { hex: '#a78b5e', label: 'Sand'     },
  { hex: '#22c55e', label: 'Forest'   },
  { hex: '#ec4899', label: 'Pink'     },
  { hex: '#f59e0b', label: 'Amber'    },
];

const TEXT_PRESETS = [
  { hex: '#ffffff', label: 'White' },
  { hex: '#161616', label: 'Black' },
  { hex: '#d4af37', label: 'Gold'  },
  { hex: '#c8c9cf', label: 'Silver'},
  { hex: '#f5ecd9', label: 'Cream' },
];

const STEPS = ['colour', 'name', 'text'] as const;
type StepKey = typeof STEPS[number];

export default function TeeDesignerPage() {
  const navigate = useNavigate();
  const eligibility: TeeEligibility & { refresh: () => Promise<void> } = useTeeEligibility();

  const [step, setStep] = useState<StepKey>('colour');
  const [config, setConfig] = useState<TeeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from existing tee. Accepts BOTH the legacy named keys
  // and the new `customShirtHex` / `customTextHex` shape.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/tee/me');
        if (cancelled) return;
        const t = r.data?.tee;
        if (t) {
          const shirtHex =
            (t.customShirtHex as string | null | undefined) ||
            (typeof t.shirtColor === 'string' && t.shirtColor.startsWith('#')
              ? t.shirtColor
              : null);
          const textHex =
            (t.customTextHex as string | null | undefined) ||
            (typeof t.textColor === 'string' && t.textColor.startsWith('#')
              ? t.textColor
              : null);
          setConfig({
            shirtHex: shirtHex ?? DEFAULT_CONFIG.shirtHex,
            textHex: textHex ?? DEFAULT_CONFIG.textHex,
            nameOnBack: t.nameOnBack ?? '',
          });
        }
      } catch {
        // first time — keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stepIndex = useMemo(() => STEPS.indexOf(step), [step]);

  const goNext = useCallback(() => {
    setError(null);
    const next = STEPS[stepIndex + 1];
    if (!next) return;
    if (step === 'name' && (!config.nameOnBack.trim() || config.nameOnBack.length > 30)) {
      setError('Enter your name (max 30 characters).');
      return;
    }
    setStep(next);
  }, [step, stepIndex, config.nameOnBack]);

  const goBack = useCallback(() => {
    setError(null);
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }, [stepIndex]);

  const handleSubmit = async () => {
    setError(null);
    const ratio = contrastRatio(config.shirtHex, config.textHex);
    if (ratio < 1.5) {
      setError('Text and T-shirt colours clash. Pick a more contrasting text colour.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/tee/me', {
        customShirtHex: config.shirtHex,
        customTextHex: config.textHex,
        // Keep the legacy named keys too — any older dashboards /
        // share cards that render via the named path keep working.
        shirtColor: config.shirtHex,
        textColor: config.textHex,
        nameOnBack: config.nameOnBack.trim(),
      });
      const shareId = r.data?.tee?.shareId;
      await eligibility.refresh();
      if (shareId) navigate(`/tee/share/${shareId}`, { replace: true });
      else navigate('/tee', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const textContrast = useMemo(
    () => contrastRatio(config.shirtHex, config.textHex),
    [config.shirtHex, config.textHex],
  );

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-10 sm:pb-14 relative z-10">
        <header className="mb-5 sm:mb-6 text-center">
          <p className="text-[11px] sm:text-xs uppercase tracking-[0.2em] font-semibold text-accent mb-2 sm:mb-3">
            Summership Memories
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif text-ink leading-tight mb-1.5">
            Design your Tee
          </h1>
          <p className="text-sm sm:text-[15px] text-ink-soft max-w-xl mx-auto leading-relaxed">
            Pick any T-shirt colour, type your name, then choose a text colour for the VLED Labs mark and your name — both must read clearly.
          </p>
        </header>

        <EligibilityNotice eligibility={eligibility} />

        <div className="mb-5 sm:mb-6">
          <Stepper activeIndex={stepIndex} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-5 md:items-stretch">
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-7 flex flex-col md:min-h-[560px]">
            {loading ? (
              <div className="text-sm text-ink-soft">Loading…</div>
            ) : (
              <AnimatePresence mode="wait">
                {step === 'colour' && (
                  <StepWrap key="colour">
                    <StepHeading step={1} title="Choose a T-shirt colour" />
                    <p className="text-sm text-ink-soft mb-5">
                      Pick any colour — use a preset for one-click, or pick any colour on the wheel for full freedom.
                    </p>

                    <ColorWheel
                      label="T-shirt fabric"
                      value={config.shirtHex}
                      onChange={(hex) => setConfig((c) => ({ ...c, shirtHex: hex }))}
                    />

                    <div className="mt-4">
                      <ColorPresets
                        value={config.shirtHex}
                        onChange={(hex) => setConfig((c) => ({ ...c, shirtHex: hex }))}
                        options={SHIRT_PRESETS}
                      />
                    </div>
                  </StepWrap>
                )}

                {step === 'name' && (
                  <StepWrap key="name">
                    <StepHeading step={2} title="Add your name" />
                    <p className="text-sm text-ink-soft mb-5">
                      This prints on the <strong>back</strong> of the tee. Up to 30 characters.
                    </p>
                    <input
                      type="text"
                      value={config.nameOnBack}
                      maxLength={30}
                      onChange={(e) => setConfig((c) => ({ ...c, nameOnBack: e.target.value }))}
                      placeholder="Your Name"
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-ink text-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                    <div className="flex items-center justify-between text-xs text-ink-faint pt-2">
                      <span>This is the name your friends will sign next to.</span>
                      <span>{config.nameOnBack.length} / 30</span>
                    </div>
                  </StepWrap>
                )}

                {step === 'text' && (
                  <StepWrap key="text">
                    <StepHeading step={3} title="Pick a text colour" />
                    <p className="text-sm text-ink-soft mb-5">
                      The same colour drives both the VLED Labs chest mark and your name on the back.
                    </p>

                    <ColorWheel
                      label="Print colour"
                      value={config.textHex}
                      onChange={(hex) => setConfig((c) => ({ ...c, textHex: hex }))}
                    />

                    <div className="mt-4">
                      <ColorPresets
                        value={config.textHex}
                        onChange={(hex) => setConfig((c) => ({ ...c, textHex: hex }))}
                        options={TEXT_PRESETS}
                      />
                    </div>

                    <ContrastAssist
                      shirtHex={config.shirtHex}
                      textHex={config.textHex}
                      contrast={textContrast}
                      onApply={(hex) => setConfig((c) => ({ ...c, textHex: hex }))}
                    />
                  </StepWrap>
                )}
              </AnimatePresence>
            )}

            {error && (
              <p className="mt-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="mt-auto pt-6 border-t border-border/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0 || submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft hover:text-ink hover:bg-mist transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Back
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={step === 'name' && !config.nameOnBack.trim()}
                  className="px-6 py-2.5 rounded-lg bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm flex items-center gap-2"
                >
                  Continue
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md disabled:opacity-60 disabled:hover:translate-y-0 flex items-center gap-2"
                >
                  {submitting && (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-accent-text/30 border-t-accent-text animate-spin" />
                  )}
                  {submitting ? 'Creating…' : 'Create my Tee'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 flex flex-col relative overflow-hidden">
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                top: '15%',
                left: '50%',
                width: '70%',
                height: '70%',
                transform: 'translateX(-50%)',
                background:
                  'radial-gradient(ellipse, rgba(var(--accent-rgb), 0.10) 0%, transparent 65%)',
                filter: 'blur(20px)',
              }}
            />

            <div className="flex items-center justify-between mb-3 relative">
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-ink-faint">
                Live preview
              </p>
              <p className="text-[11px] text-ink-faint">
                {stepIndex >= 1 ? 'Showing back' : 'Showing front'}
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center min-h-[340px] sm:min-h-[400px] relative px-2">
              <div className="w-full max-w-[300px] sm:max-w-[320px]">
                {/* v1.87.5 — live-preview animation fix.
                    Earlier this wrapped the tee in `<AnimatePresence mode="wait">`
                    keyed by `${shirtHex}-${textHex}`. That queued an exit
                    animation on every colour change, so during a fast drag
                    the user kept seeing the OLD tee (the in-flight exit
                    render) while the picker swatch was already showing the
                    new colour — felt like the tee was "stuck". Now we just
                    animate-on-mount and let prop changes repaint the SVG in
                    place. The tee's tonal neighbours are derived per-frame
                    from `customShirtHex`, so a drag still produces an
                    immediate colour update. */}
                <motion.div
                  key="tee-preview"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                >
                  <PremiumTee
                    shirtColor="navy"
                    textColor="white"
                    customShirtHex={config.shirtHex}
                    customTextHex={config.textHex}
                    nameOnBack={config.nameOnBack || 'Your Name'}
                    side={stepIndex >= 1 ? 'back' : 'front'}
                    float
                  />
                </motion.div>
              </div>
            </div>
            <p className="text-[11px] text-ink-faint text-center mt-2 relative">
              {stepIndex < STEPS.length - 1
                ? `Up next: ${labelFor(STEPS[stepIndex + 1])}`
                : 'Your tee is ready — create and share it.'}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="flex-1"
    >
      {children}
    </motion.div>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-accent mb-1.5">
        Step {step} of 3
      </p>
      <h2 className="text-xl sm:text-[1.35rem] font-semibold text-ink leading-tight">{title}</h2>
    </div>
  );
}

/**
 * ContrastAssist — when the user's print colour is unreadable on the
 * tee fabric, surface a one-click "Use Black/White" recommendation.
 * Above contrast 3:1 we trust the user and just call it readable.
 */
function ContrastAssist({
  shirtHex,
  textHex,
  contrast,
  onApply,
}: {
  shirtHex: string;
  textHex: string;
  contrast: number;
  onApply: (hex: string) => void;
}) {
  if (contrast >= 3) {
    return (
      <p className="text-xs text-success mt-3 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Readable — contrast is {contrast.toFixed(1)}:1.
      </p>
    );
  }
  const suggested = recommendTextColor(shirtHex, textHex);
  const suggestedContrast = contrastRatio(shirtHex, suggested);
  return (
    <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/30 text-xs text-ink-soft space-y-2">
      <p className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-warning flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>
          This text reads poorly on this T-shirt (contrast {contrast.toFixed(1)}:1).
        </span>
      </p>
      <button
        type="button"
        onClick={() => onApply(suggested)}
        className="ml-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg border border-border hover:bg-mist transition-colors"
      >
        <span className="w-4 h-4 rounded ring-1 ring-border" style={{ background: suggested }} />
        Use <strong className="font-semibold">{suggested === '#ffffff' ? 'white' : 'black'}</strong>
        <span className="text-ink-faint">(contrast {suggestedContrast.toFixed(1)}:1)</span>
      </button>
    </div>
  );
}

function Stepper({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex items-center justify-center gap-3 sm:gap-6">
      {STEPS.map((s, i) => {
        const completed = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s} className="flex items-center gap-3 sm:gap-6">
            <div
              className={`flex items-center gap-2 ${
                active ? 'text-accent' : completed ? 'text-ink-soft' : 'text-ink-faint'
              }`}
            >
              <span
                className={`w-8 h-8 rounded-full grid place-items-center text-xs font-semibold transition-all ${
                  completed
                    ? 'bg-accent text-accent-text shadow-sm'
                    : active
                    ? 'bg-accent/20 text-accent border-2 border-accent shadow-sm'
                    : 'bg-mist text-ink-faint'
                }`}
              >
                {completed ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="text-sm font-medium capitalize hidden sm:inline">{labelFor(s)}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`hidden sm:block h-px transition-colors ${
                  completed ? 'w-12 bg-accent/50' : 'w-8 bg-border'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function labelFor(s: StepKey): string {
  if (s === 'colour') return 'Colour';
  if (s === 'name') return 'Name';
  return 'Text colour';
}

function EligibilityNotice({
  eligibility,
}: {
  eligibility: { eligible: boolean; endDate: string | null; shareId: string | null };
}) {
  if (eligibility.eligible) return null;
  if (!eligibility.endDate) return null;
  return (
    <div className="max-w-2xl mx-auto mb-5 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-sm text-ink-soft flex items-center gap-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>
        You're outside the 3-day signing window right now. You can still design your tee — signing opens around your end date.
      </span>
    </div>
  );
}
