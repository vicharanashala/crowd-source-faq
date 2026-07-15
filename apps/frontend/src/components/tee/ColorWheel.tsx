/**
 * ColorWheel — full-spectrum HSL picker for the Sign My Tee wizard.
 *
 * One component, two surfaces:
 *
 *   <ColorWheel value={hex} onChange={setHex} />            ← full picker
 *   <ColorPresets value={hex} onChange={setHex} />          ← curated row of
 *                                                              brand-style
 *                                                              preset chips
 *   <ColorRow value={hex} onChange={setHex} options={...} /> ← simple
 *                                                              multi-choice
 *                                                              (used for the
 *                                                              preset rows on
 *                                                              the wizard)
 *
 * Picker anatomy:
 *   ┌─ hue slider (rainbow strip, click anywhere)  ─┐
 *   │                                                │
 *   │  sat / val pad                                  │   ← large square:
 *   │  (a 2D field where                              │     click/drag any
 *   │   x = HSV saturation,                           │     point to pick a
 *   │   y = HSV value,                                │     colour
 *   │   converted to HSL before                       │
 *   │   being written back)                           │
 *   │                                                │
 *   └────────────────────────────────────────────────┘
 *
 *   + a thumb drag handle, a hex input, and an HSL readout.
 *
 * Numeric `value` is always a `#rrggbb` string so it can be persisted
 * as-is and reused by the tee palette (see `paletteFromHex`).
 *
 * No external deps — we render to a `<canvas>` directly. The user's
 * mouse position is converted to HSL → hex in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── HSL ↔ RGB ↔ Hex helpers (all local) ─────────────────────────────────

export type RGB = [number, number, number];

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
export function normalizeHex(input: string): string | null {
  const s = (input ?? '').trim().replace('#', '').toLowerCase();
  // 3-digit shorthand (#abc → aabbcc) or full (#aabbcc).
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-f]{6}$/.test(full)) return null;
  return `#${full}`;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex)!.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** RGB (0..255) → HSL (h: 0..360, s: 0..1, l: 0..1). */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R: h = ((G - B) / d) % 6; break;
      case G: h = (B - R) / d + 2; break;
      case B: h = (R - G) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

/** HSL → RGB (0..255). */
export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const hh = (((h % 360) + 360) % 360) / 360; // 0..1
  const ss = clamp01(s);
  const ll = clamp01(l);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return [v, v, v];
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const t = (n: number) => {
    if (n < 0) n += 1;
    if (n > 1) n -= 1;
    if (n < 1 / 6) return p + (q - p) * 6 * n;
    if (n < 1 / 2) return q;
    if (n < 2 / 3) return p + (q - p) * (2 / 3 - n) * 6;
    return p;
  };
  return [
    Math.round(t(hh + 1 / 3) * 255),
    Math.round(t(hh) * 255),
    Math.round(t(hh - 1 / 3) * 255),
  ];
}

export function hslToHex(hsl: [number, number, number]): string {
  return rgbToHex(hslToRgb(hsl));
}

export function hexToHsl(hex: string): [number, number, number] {
  return rgbToHsl(hexToRgb(hex));
}

/**
 * Map a cursor (x, y) inside the SV pad to HSL.
 *
 * The pad is laid out so x → HSV saturation and y → HSV value (with
 * y inverted because pixel origin is top-left). We compute those two
 * values directly, then convert HSV → HSL before returning so callers
 * can hand the result straight to `hslToHex`.
 *
 * @param x         Cursor x relative to the pad's left edge (px).
 * @param y         Cursor y relative to the pad's top edge (px).
 * @param boxWidth  Pad width in px (used to normalise x).
 * @param boxHeight Pad height in px (used to normalise y).
 * @param currentHue Hue in degrees; passed through unchanged.
 * @returns         `{ h, s, l }` with h in [0,360) and s/l as 0..100.
 */
export function getHSLFromCoordinates(
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  currentHue: number,
): { h: number; s: number; l: number } {
  // 1. Clamp cursor into the box — drags can overshoot by a pixel.
  const cx = Math.min(Math.max(x, 0), boxWidth);
  const cy = Math.min(Math.max(y, 0), boxHeight);

  // 2. Map (x, y) → HSV.
  const S = boxWidth > 0 ? cx / boxWidth : 0;          // [0..1]
  const V = boxHeight > 0 ? 1 - cy / boxHeight : 0;   // [0..1], inverted

  // 3. HSV → HSL (well-known identities).
  //    L  = V · (1 − S/2)
  //    SL = (V · S) / (1 − |2L − 1|)   — guard denom for L ∈ {0, 1}.
  const l = V * (1 - S / 2);
  const denom = 1 - Math.abs(2 * l - 1);
  const sL = denom === 0 ? 0 : (V * S) / denom;

  // 4. Wrap hue into [0, 360); collapse NaN to 0.
  let h = currentHue % 360;
  if (h < 0) h += 360;
  if (Number.isNaN(h)) h = 0;

  return { h, s: sL * 100, l: l * 100 };
}

// ── Hue strip (rainbow) ────────────────────────────────────────────────────
//
// Drawn once to a hidden canvas — width = 360 × 1-pixel-tall, with each
// pixel a strip's hue at s=1, l=0.5. Cheap, pixel-perfect.
//
// We memoize the data URL so React's strict-mode + re-renders don't
// recompute it.
function buildHueStripDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 1;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  for (let x = 0; x < 360; x++) {
    ctx.fillStyle = hslToHex([x, 1, 0.5]);
    ctx.fillRect(x, 0, 1, 1);
  }
  return c.toDataURL();
}

// ── Saturation / value pad ──────────────────────────────────────────────────
//
// Drawn per active hue — a 200×140 box whose axes are HSV, not HSL:
//   • x = 0      → S = 0   (white wash)
//   • x = W      → S = 1   (base hue at full saturation)
//   • y = 0      → V = 1   (top — brightest)
//   • y = H      → V = 0   (bottom — black)
// The cursor hit-test (see `getHSLFromCoordinates` below) follows the
// same convention, then converts to HSL before calling `onChange`.
function buildSatValueDataUrl(hue: number): string {
  const W = 200, H = 140;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  // Base = pure hue across the whole box.
  ctx.fillStyle = hslToHex([hue, 1, 0.5]);
  ctx.fillRect(0, 0, W, H);
  // White wash (left → right) for saturation.
  const gradW = ctx.createLinearGradient(0, 0, W, 0);
  gradW.addColorStop(0, 'rgba(255,255,255,1)');
  gradW.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradW;
  ctx.fillRect(0, 0, W, H);
  // Black wash (top → bottom) for value.
  const gradB = ctx.createLinearGradient(0, 0, 0, H);
  gradB.addColorStop(0, 'rgba(0,0,0,0)');
  gradB.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = gradB;
  ctx.fillRect(0, 0, W, H);
  return c.toDataURL();
}

// ── <ColorWheel /> — the main picker ────────────────────────────────────────

interface PickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Bigger pad for the wizard (default 220×150). */
  padWidth?: number;
  padHeight?: number;
  /** Optional label shown above the picker. */
  label?: string;
}

export function ColorWheel({
  value,
  onChange,
  padWidth = 220,
  padHeight = 150,
  label,
}: PickerProps) {
  const safeHex = normalizeHex(value) ?? '#3b82f6';

  const [h, s, l] = useMemo(() => hexToHsl(safeHex), [safeHex]);
  const [hueStripDataUrl, setHueStripDataUrl] = useState<string>('');
  const [satValueDataUrl, setSatValueDataUrl] = useState<string>('');

  // Build the hue strip once on mount.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHueStripDataUrl(buildHueStripDataUrl());
  }, []);

  // Rebuild the SV pad only when the hue changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setSatValueDataUrl(buildSatValueDataUrl(h));
  }, [h]);

  const padRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Pad hit-test — the pad is laid out in HSV (x = saturation,
  // y = value, top = brightest). We hand the raw cursor position to
  // `getHSLFromCoordinates`, which converts HSV → HSL internally.
  const updateFromPad = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const { h: hh, s, l } = getHSLFromCoordinates(x, y, rect.width, rect.height, h);
      onChange(hslToHex([hh, s / 100, l / 100]));
    },
    [h, onChange],
  );

  const updateFromStrip = useCallback(
    (clientX: number) => {
      const el = stripRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newH = Math.round(xRatio * 360);
      onChange(hslToHex([newH, s, l]));
    },
    [s, l, onChange],
  );

  // Pointer events for both surfaces — "move" while held, no native drag.
  const handlePadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateFromPad(e.clientX, e.clientY);
  };
  const handleStripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateFromStrip(e.clientX);
  };

  // Handle the hex text input — accept whatever the user types.
  const [hexInput, setHexInput] = useState(safeHex);
  useEffect(() => { setHexInput(safeHex); }, [safeHex]);
  const commitHex = () => {
    const norm = normalizeHex(hexInput);
    if (norm) onChange(norm);
    else setHexInput(safeHex);
  };

  // The cursor cross-hair on the SV pad. The hex → HSL pass gives us
  // an arbitrary (h, s, l); we invert back to pad-local (x, y) using
  // the HSV layout (x = saturation, top = max value). Each branch is
  // the exact inverse of `getHSLFromCoordinates`, with the corners
  // (white, black, pure hue) handled explicitly so the thumb never
  // escapes the pad rect.
  let padX: number;
  let padY: number;
  const sHsl = clamp01(s);
  const lHsl = clamp01(l);
  if (sHsl === 0) {
    // Greyscale (any L). x pins to the left edge (white wash), y
    // maps brightness: L = 1 → top, L = 0 → bottom.
    padX = 0;
    padY = (1 - lHsl) * padHeight;
  } else if (lHsl === 0) {
    // Pure black: bottom-right corner (max S, min V).
    padX = padWidth;
    padY = padHeight;
  } else {
    // General case — derive V from L and S using the identity
    // L = V · (1 − S/2), then y = (1 − V) · height.
    const V = lHsl / (1 - sHsl / 2);
    padX = sHsl * padWidth;
    padY = (1 - clamp01(V)) * padHeight;
  }
  // The hue strip is rendered at the same width as the pad so the
  // thumb position scales 1:1 with the strip — earlier the strip
  // was `width: 100%` while the thumb was computed against a fixed
  // 220, so on wider parents the thumb floated to the left of
  // where it should be (the user-facing bug: hex & pad updated
  // correctly but the hue-strip thumb was wrong).
  const stripWidth = padWidth;
  const handleX = clamp01(h / 360) * stripWidth;

  return (
    // Pin the whole picker to its declared canvas (padWidth ×
    // padHeight) so the strip and pad thumbs line up with the
    // rendered backgrounds. Without this the strip would stretch
    // to the parent flex container and the thumbs would drift
    // off-position at any width != padWidth.
    <div className="space-y-3" style={{ width: padWidth }}>
      {label && (
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-ink-soft">
          {label}
        </p>
      )}

      {/* SV pad — the large square */}
      <div
        ref={padRef}
        onPointerDown={handlePadDown}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          updateFromPad(e.clientX, e.clientY);
        }}
        // v1.87.6 — hide the OS cursor on the pad so the bubble IS the
        // pointer. With both visible at once the bubble's center sits
        // on the click pixel but the OS cursor's hotspot can sit a few
        // px away (especially on trackpads), and that small gap reads
        // as "the bubble is misaligned with the cursor". Hiding the
        // native cursor removes the perception entirely. The bubble
        // also has a thin cross-hair now so its center is unambiguous
        // against any background.
        className="relative rounded-xl overflow-hidden touch-none select-none"
        style={{
          width: padWidth,
          height: padHeight,
          backgroundImage: satValueDataUrl
            ? `url(${satValueDataUrl})`
            : 'linear-gradient(to right, #fff, transparent), linear-gradient(to bottom, transparent, #000)',
          backgroundColor: 'transparent',
          backgroundSize: '100% 100%',
          border: '1px solid rgb(var(--border-rgb))',
          cursor: 'none',
        }}
      >
        {/* Thumb — outer ring + a thin white cross-hair so the
            bubble's exact center reads against any background. The
            cross-hair stops 1px shy of the ring so it doesn't
            visually merge into it. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: padX - 7,
            top: padY - 7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow:
              '0 0 0 1px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.4)',
            backgroundColor: safeHex,
          }}
        />
        {/* Cross-hair: a horizontal + vertical white line through
            the exact center of the bubble. pointer-events-none so it
            doesn't steal events from the pad. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: padX - 8,
            top: padY - 0.5,
            width: 16,
            height: 1,
            backgroundColor: 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 0 0.5px rgba(0,0,0,0.6)',
          }}
        />
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: padX - 0.5,
            top: padY - 8,
            width: 1,
            height: 16,
            backgroundColor: 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 0 0.5px rgba(0,0,0,0.6)',
          }}
        />
      </div>

      {/* Hue strip */}
      <div
        ref={stripRef}
        onPointerDown={handleStripDown}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          updateFromStrip(e.clientX);
        }}
        // v1.87.6 — bumped h-3 → h-4 (16 px) so the strip is easier
        // to land a click on. 12 px was just thin enough that a
        // pointer capture or a slight hover-above meant clicks never
        // registered, leaving the strip thumb visually "stuck".
        className="relative h-4 rounded-full touch-none select-none"
        style={{
          width: stripWidth,
          backgroundImage: hueStripDataUrl
            ? `url(${hueStripDataUrl})`
            : 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          backgroundSize: '100% 100%',
          cursor: 'none',
        }}
      >
        <div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: handleX - 7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow:
              '0 0 0 1px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.4)',
            backgroundColor: safeHex,
          }}
        />
      </div>

      {/* Readout row — current hex + hsl */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg ring-1 ring-border flex-shrink-0"
          style={{ backgroundColor: safeHex }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value.toLowerCase())}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          spellCheck={false}
          className="w-24 px-2 py-1 text-xs font-mono rounded-md bg-bg border border-border uppercase focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <span className="text-xs text-ink-faint font-mono">
          H {Math.round(h).toString().padStart(3, ' ')}
          {'  '}S {Math.round(s * 100)}%
          {'  '}L {Math.round(l * 100)}%
        </span>
      </div>
    </div>
  );
}

// ── <ColorPresets /> — flat row of pre-picked colours ─────────────────────

interface PresetsProps {
  value: string;
  onChange: (hex: string) => void;
  /** An array of hex colours plus labels. Defaults to a curated
      set that covers the palette names from the old hard-coded set
      so existing users don't lose their muscle memory. */
  options?: Array<{ hex: string; label: string }>;
}

const DEFAULT_PRESETS: Array<{ hex: string; label: string }> = [
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

export function ColorPresets({
  value,
  onChange,
  options = DEFAULT_PRESETS,
}: PresetsProps) {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
      {options.map((opt) => {
        const selected = normalizeHex(value) === opt.hex.toLowerCase();
        return (
          <button
            key={opt.hex}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.hex)}
            aria-pressed={selected}
            className={`relative aspect-square rounded-xl ring-1 transition-all ${
              selected
                ? 'ring-accent ring-2 scale-[1.03] shadow'
                : 'ring-border hover:ring-accent/40 hover:scale-[1.02]'
            }`}
          >
            <span
              className="absolute inset-1 rounded-lg"
              style={{ background: opt.hex }}
            />
            {selected && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-accent-text grid place-items-center shadow">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Contrast helper ────────────────────────────────────────────────────────
//
// Both the tee fabric and the on-tee print share one text colour.
// If the user picks a colour combination where the text disappears
// (white on near-white, black on near-black, or any contrast ratio
// under ~1.5), we recommend a "Auto-pick Black/White" toggle.
//
// Standard W3C-style luminance is used — 0..1 — for a perceptual-ish
// hint; we deliberately don't compute WCAG ratios because the cue is
// "this is unreadable", not "this fails AA".
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Recommend the better single-colour text choice for `bg`. If
 * `current` already passes the threshold (≥3) we return it unchanged
 * — users who picked an on-brand colour should keep their pick.
 * Otherwise we return black or white, whichever has higher contrast.
 */
export function recommendTextColor(bg: string, current: string): string {
  if (contrastRatio(bg, current) >= 3) return current;
  return relativeLuminance(bg) < 0.5 ? '#ffffff' : '#161616';
}
