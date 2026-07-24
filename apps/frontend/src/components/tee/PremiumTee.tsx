/**
 * PremiumTee — premium-looking 3D CSS3D T-shirt.
 *
 * Stack:
 *   - An outer `perspective: 1200px` container
 *   - A 3D `transform-style: preserve-3d` wrapper that tracks the cursor
 *     for a subtle hover-tilt (max ±15° on Y, ±6° on X), and floats
 *     gently up and down via framer-motion for the premium "showroom"
 *     feel.
 *   - Two stacked SVG layers: front + back. The back face is rotated
 *     180° on Y so it faces the camera when `side === 'back'`.
 *   - The fabric uses layered `<linearGradient>` for realistic folds
 *     (shoulder yoke shadow, side seams, hem gradient), and a subtle
 *     Gaussian-blur highlight to imply a cotton weave.
 *   - The "VLED Labs" front-left mark is a screen-printed mock with
 *     proper kerning / letter spacing / embroidered feel, positioned
 *     to land exactly where a chest logo sits on a real tee.
 *
 * No new deps. No GLTF/three — pure CSS3D + SVG.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../utils/api';

// ── Color palettes per shirt ───────────────────────────────────────────────
//
// Each palette covers:
//   - body gradient stops (top → mid → deep → base)
//   - shoulder yoke shadow (darker than base — for the fold)
//   - side seam shadow (very dark — for the silhouette)
//   - inner collar ring (warm shadow inside the neck cut)
//   - hem stitch color (slightly darker than base)
//   - soft sheen color (used to draw a subtle cotton weave tint)
//   - matte highlight (the lightest hint — for the fold between
//     sleeves and body where light catches)
interface Palette {
  top: string;
  base: string;
  deep: string;
  yoke: string;
  seam: string;
  inner: string;
  hem: string;
  sheen: string;
  highlight: string;
  // Logo print color hint (the logo element blends slightly with the
  // fabric regardless; this is the base mesh tint).
  printHint: string;
}

const PALETTES: Record<ShirtColorKey, Palette> = {
  black: {
    top: '#1f1f25',
    base: '#16161b',
    deep: '#0e0e12',
    yoke: '#0c0c10',
    seam: '#020203',
    inner: '#0f0f12',
    hem: '#080809',
    sheen: '#3d3d44',
    highlight: '#52525a',
    printHint: '#222229',
  },
  white: {
    top: '#fafaf6',
    base: '#eee9df',
    deep: '#dad4c4',
    yoke: '#d6cebd',
    seam: '#a89e8d',
    inner: '#d4ccbb',
    hem: '#beb6a4',
    sheen: '#faf6ec',
    highlight: '#ffffff',
    printHint: '#e0d9ca',
  },
  navy: {
    top: '#1f3162',
    base: '#162750',
    deep: '#0e1c3b',
    yoke: '#0f1d3f',
    seam: '#06102a',
    inner: '#172748',
    hem: '#0c1830',
    sheen: '#3a5088',
    highlight: '#5573b3',
    printHint: '#1c2f5a',
  },
  maroon: {
    top: '#622029',
    base: '#4d1720',
    deep: '#3a1119',
    yoke: '#3a1017',
    seam: '#1e060a',
    inner: '#561a25',
    hem: '#330c12',
    sheen: '#91343f',
    highlight: '#aa414b',
    printHint: '#581c25',
  },
  olive: {
    top: '#5b582f',
    base: '#4d4a26',
    deep: '#3d3a1c',
    yoke: '#3a3819',
    seam: '#1d1c0a',
    inner: '#56542c',
    hem: '#34321a',
    sheen: '#8b874e',
    highlight: '#a0995a',
    printHint: '#575428',
  },
  sand: {
    top: '#b3986c',
    base: '#a78b5e',
    deep: '#8e754a',
    yoke: '#8d7548',
    seam: '#604d30',
    inner: '#b89b6e',
    hem: '#7c6745',
    sheen: '#d6c096',
    highlight: '#e1cea7',
    printHint: '#b5986c',
  },
};

export const TEXT_COLOR_MAP: Record<TextColorKey, string> = {
  white: '#ffffff',
  black: '#161616',
  gold: '#d4af37',
  silver: '#c8c9cf',
  cream: '#f5ecd9',
};

export const ILLEGIBLE_PAIRS: Record<ShirtColorKey, ShirtColorKey[]> = {
  black: ['black'],
  white: ['white'],
  // Sand is light enough that *pure white* text still reads on it
  // (the reference image confirms white text on sand looks correct).
  // We still avoid pure-white text on pure-white, and pure-black
  // text on pure-black. Every other combination is readable.
  sand: [],
  navy: [],
  maroon: [],
  olive: [],
};

export interface SignatureOverlay {
  id: string;
  dataUrl: string;
  /** Which face this signature was placed on. Defaults to 'back'. */
  face?: 'front' | 'back';
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface PremiumTeeProps {
  /** Named palette key. For v1.87.4+ tees the API may return a
      `#rrggbb` hex string instead — see the palette resolution
      comment in the body. Both shapes are accepted; unknown values
      fall back to the `navy` palette so the renderer never crashes
      on bad data. */
  shirtColor: ShirtColorKey | string;
  textColor: TextColorKey | string;
  /** Optional raw hex override for the shirt fabric. Wins over
      `shirtColor` when set — the rest of the palette (yoke/seam/sheen
      highlights) is auto-derived from this hex so the tee still looks
      premium at any HSL value. Undefined → use the named palette. */
  customShirtHex?: string | null;
  /** Optional raw hex override for the text colour. Wins over
      `textColor` when set; backs both "VLED Labs" branding and the
      back-of-tee name in one go. */
  customTextHex?: string | null;
  nameOnBack: string;
  signatures?: SignatureOverlay[];
  side?: 'front' | 'back';
  editable?: boolean;
  onChangeSignature?: (id: string, next: { x: number; y: number; scale: number; rotation: number }) => void;
  /** When provided, each signature chip gets a delete (✕) button. Owner only. */
  onDeleteSignature?: (id: string) => void;
  size?: number;
  animateEntrance?: boolean;
  float?: boolean;
  disableHoverTilt?: boolean;
}

export type ShirtColorKey = 'black' | 'white' | 'navy' | 'maroon' | 'olive' | 'sand';
export type TextColorKey = 'white' | 'black' | 'gold' | 'silver' | 'cream';

// ── Palette-from-hex ───────────────────────────────────────────────────────
//
// When a user picks an arbitrary colour (full HSL spectrum), we still
// need a complete Palette (top/base/deep/yoke/seam/sheen/highlight/printHint)
// so the SVG renders premium at any colour. This tiny helper derives
// each channel by nudging the base hex's HSL values in small, opinionated
// directions — bright colours lift the highlights, dark colours deepen
// the shadows, neutral greys stay neutral. Cheaper than interpolating
// against the named-palette table and works for the entire colour wheel.
//
// The maths uses sRGB-space arithmetic with clip-to-[0,1] guards so
// fully-saturated, fully-light colours don't accidentally produce
// values outside [0..255] in any channel.
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padStart(6, '0');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => {
    const x = Math.round(clamp01(v) * 255);
    return x.toString(16).padStart(2, '0');
  };
  return `#${c(r)}${c(g)}${c(b)}`;
}
function shiftL(hex: string, deltaL: number, deltaS = 0): string {
  // Quick HSL-space nudge. Working in HSL (instead of HSL conversion
  // via sRGB matrix) is approximate but "good enough" for tone
  // adjustment — Photoshop does the same kind of thing under the
  // hood for soft skews. If we needed an exact perceptual match we'd
  // pull in culori, but we don't.
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l0 = (max + min) / 2;
  const s0 = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l0 - 1));
  const l1 = clamp01(l0 + deltaL);
  const s1 = clamp01(s0 + deltaS);
  // Back to RGB via HSL palette.
  const c1 = (1 - Math.abs(2 * l1 - 1)) * s1;
  const x1 = c1 * (1 - Math.abs(((rgbToHue(r, g, b) ?? 0) / 60) % 2 - 1));
  const m1 = l1 - c1 / 2;
  const hue = rgbToHue(r, g, b);
  if (hue == null || s1 === 0) {
    const v = l1;
    return rgbToHex([v, v, v]);
  }
  let r1 = 0, g1 = 0, b1 = 0;
  if (hue < 60)       { r1 = c1; g1 = x1; }
  else if (hue < 120)  { r1 = x1; g1 = c1; }
  else if (hue < 180)  { g1 = c1; b1 = x1; }
  else if (hue < 240)  { g1 = x1; b1 = c1; }
  else if (hue < 300)  { r1 = x1; b1 = c1; }
  else                { r1 = c1; b1 = x1; }
  return rgbToHex([r1 + m1, g1 + m1, b1 + m1]);
}
function rgbToHue(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return null;
  let h = 0;
  const d = max - min;
  switch (max) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

/**
 * Derive a full Palette from a base hex. The base IS the palette's
 * `base`; the rest are tonal neighbours. Pass `isLightBase` true for
 * the cream/white shirting where the shadows need to be a touch
 * warmer; on the default side we shade toward neutral gray for
 * neutral hues and toward the colour's own hue for saturated colours.
 */
export function paletteFromHex(base: string): Palette {
  return {
    top:        shiftL(base, +0.07, 0),
    base:       base,
    deep:       shiftL(base, -0.18, 0),
    yoke:       shiftL(base, -0.10, 0),
    seam:       shiftL(base, -0.32, 0),
    inner:      shiftL(base, -0.22, 0),
    hem:        shiftL(base, -0.12, 0),
    sheen:      shiftL(base, +0.20, 0),
    highlight:  shiftL(base, +0.30, 0),
    printHint:  shiftL(base, -0.15, 0),
  };
}

/**
 * Resolve a `Palette` for any input the caller might hand us.
 *
 * The API contract (v1.87.4) is that `shirtColor` is either a known
 * palette key OR a `#rrggbb` hex, with `customShirtHex` as the
 * explicit override channel. Real-world data does not always honour
 * that contract: a row from an older app version might carry an
 * unrecognised key, the network might return a partial document, or
 * a stale client might cache a value the server has since changed.
 * This helper guarantees a non-undefined `Palette` for any input —
 * unknown values fall back to the `navy` palette so the renderer
 * always has something to draw.
 *
 * Resolution order:
 *   1. `customShirtHex` if it's a valid `#rrggbb` (paletteFromHex).
 *   2. `shirtColor` if it's a known palette key.
 *   3. `shirtColor` if it parses as a valid `#rrggbb`.
 *   4. Fallback to the `navy` palette (and warn — the FE code path
 *      that produced this should be fixed, but we never crash).
 */
export function resolvePalette(
  shirtColor: ShirtColorKey | string,
  customShirtHex?: string | null,
): Palette {
  if (customShirtHex && /^#[0-9a-f]{6}$/i.test(customShirtHex)) {
    return paletteFromHex(customShirtHex);
  }
  if (typeof shirtColor === 'string' && shirtColor in PALETTES) {
    return PALETTES[shirtColor as ShirtColorKey];
  }
  if (typeof shirtColor === 'string' && /^#[0-9a-f]{6}$/i.test(shirtColor)) {
    return paletteFromHex(shirtColor);
  }
  if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn(
      `[PremiumTee] Unknown shirtColor "${shirtColor}" (no customShirtHex fallback). ` +
      `Rendering with the "navy" palette.`,
    );
  }
  return PALETTES.navy;
}

/**
 * Resolve a text colour for any input. Same robustness story as
 * `resolvePalette` — the API may hand us a hex or a named key, and
 * we never want to render with `undefined`.
 */
export function resolveTextColor(
  textColor: TextColorKey | string,
  customTextHex?: string | null,
): string {
  if (customTextHex && /^#[0-9a-f]{6}$/i.test(customTextHex)) {
    return customTextHex;
  }
  if (typeof textColor === 'string' && textColor in TEXT_COLOR_MAP) {
    return TEXT_COLOR_MAP[textColor as TextColorKey];
  }
  if (typeof textColor === 'string' && /^#[0-9a-f]{6}$/i.test(textColor)) {
    return textColor;
  }
  if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn(
      `[PremiumTee] Unknown textColor "${textColor}". Falling back to white.`,
    );
  }
  return '#ffffff';
}

export default function PremiumTee({
  shirtColor,
  textColor,
  customShirtHex,
  customTextHex,
  nameOnBack,
  signatures = [],
  side = 'front',
  editable = false,
  onChangeSignature,
  onDeleteSignature,
  size,
  animateEntrance = false,
  float = true,
  disableHoverTilt = false,
}: PremiumTeeProps) {
  const id = useId().replace(/:/g, '');
  // Palette + text-color resolution — see `resolvePalette` /
  // `resolveTextColor` for the full story. In short: a `customShirtHex`
  // wins when valid; otherwise we look up the named palette key, then
  // accept a hex string, and finally fall back to a sane default. The
  // component used to crash when `shirtColor` was a hex string (the
  // v1.87.4+ storage shape) and `customShirtHex` wasn't passed through
  // from the share/sign pages. This is the architectural fix: the
  // renderer is now correct for any input the API can return.
  const palette = resolvePalette(shirtColor, customShirtHex);
  const textHex = resolveTextColor(textColor, customTextHex);

  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [mockupBackUrl, setMockupBackUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [backImageLoaded, setBackImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    api.get('/public/settings')
      .then(res => {
        const url = res.data?.settings?.teeMockupUrl;
        const backUrl = res.data?.settings?.teeMockupBackUrl;
        
        let loadedFront = false;
        let loadedBack = false;

        const checkAllLoaded = () => {
          if (loadedFront && loadedBack) {
            setImageLoaded(true);
            setBackImageLoaded(true);
          }
        };

        if (url) {
          setMockupUrl(url);
          const img = new Image();
          img.src = url;
          img.onload = () => {
            loadedFront = true;
            checkAllLoaded();
          };
          img.onerror = () => {
            console.error('Front mockup image failed to load');
            setImageError(true);
          };
        } else {
          setImageError(true);
        }

        if (backUrl) {
          setMockupBackUrl(backUrl);
          const imgBack = new Image();
          imgBack.src = backUrl;
          imgBack.onload = () => {
            loadedBack = true;
            checkAllLoaded();
          };
          imgBack.onerror = () => {
            console.error('Back mockup image failed to load');
            setImageError(true);
          };
        } else {
          setImageError(true);
        }
      })
      .catch(err => {
        console.error('Failed to load mockup url', err);
        setImageError(true);
      });
  }, []);

  const showFrontRaster = mockupUrl && imageLoaded && !imageError;
  const showBackRaster = mockupBackUrl && backImageLoaded && !imageError;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const sideTransform = side === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)';

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disableHoverTilt || animateEntrance) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / r.width;
    const dy = (e.clientY - cy) / r.height;
    // Clamp to ±15° / ±6°.
    setTilt({ x: -dy * 6, y: dx * 15 });
  };
  const onMouseLeave = () => setTilt({ x: 0, y: 0 });

  // ── Name Line-Breaking & Dynamic Typography ──
  const nameStr = (nameOnBack || '').trim();
  const firstSpaceIdx = nameStr.indexOf(' ');
  let line1 = nameStr;
  let line2 = '';
  if (firstSpaceIdx !== -1) {
    line1 = nameStr.substring(0, firstSpaceIdx);
    line2 = nameStr.substring(firstSpaceIdx + 1).trim();
  }

  const maxLineLen = Math.max(line1.length, line2.length || 0);
  const fontScaleFactor = Math.max(6, maxLineLen);
  const nameFontSize = `clamp(0.65rem, ${17.5 / fontScaleFactor}rem, 1.3rem)`;

  return (
    <div
      className="relative w-full h-full flex items-center justify-center select-none"
      style={{ perspective: 1500 }}
    >
      {/* Soft floor shadow — sits BEHIND the tee and doesn't move
          with hover-tilt. Two stacked radial gradients (a hard inner
          shadow + a wide ambient one) fake a real product-shot
          shadow at any zoom level. */}
      <div
        className="absolute pointer-events-none"
        aria-hidden
        style={{
          bottom: '4%',
          left: '8%',
          right: '8%',
          height: '8%',
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 45%, transparent 75%)',
          filter: 'blur(10px)',
          zIndex: 0,
        }}
      />

      <motion.div
        ref={wrapRef}
        initial={animateEntrance ? { rotateY: -90, opacity: 0 } : false}
        animate={
          animateEntrance
            ? { rotateY: 0, opacity: 1 }
            : {
                rotateY: (side === 'back' ? 180 : 0) + tilt.y,
                rotateX: tilt.x,
                y: float ? [0, -6, 0] : 0,
              }
        }
        transition={
          animateEntrance
            ? { duration: 0.9, type: 'spring', bounce: 0.3 }
            : float
            ? {
                rotateY: { duration: 0.7, type: 'spring', bounce: 0.12 },
                rotateX: { duration: 0.6, type: 'spring', bounce: 0.18 },
                y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
              }
            : {
                rotateY: { duration: 0.7, type: 'spring', bounce: 0.12 },
                rotateX: { duration: 0.6, type: 'spring', bounce: 0.18 },
              }
        }
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="relative mx-auto w-full"
        style={{
          maxWidth: typeof size === 'number' ? `${size}px` : '360px',
          aspectRatio: '1 / 1',
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d',
          willChange: 'transform',
          zIndex: 1,
        }}
      >
        {/* FRONT FACE */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            opacity: side === 'front' ? 1 : 0,
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: side === 'front' ? 'auto' : 'none',
          }}
          aria-hidden={side !== 'front'}
        >
          {showFrontRaster ? (
            <>
              <div 
                className="absolute inset-0"
                style={{
                  backgroundColor: palette.base,
                  maskImage: `url(${mockupUrl})`,
                  maskSize: 'contain',
                  maskPosition: 'center',
                  maskRepeat: 'no-repeat',
                  WebkitMaskImage: `url(${mockupUrl})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  WebkitMaskRepeat: 'no-repeat',
                }}
              />
              
              {/* Logo under the multiply image so it is shaded and folded naturally */}
              <SummershipLogo
                textColor={textHex}
                visible={side === 'front'}
              />

              <img 
                src={mockupUrl || undefined} 
                alt="" 
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
              />
            </>
          ) : (
            <div className={`w-full h-full ${!imageError ? 'animate-pulse' : ''}`} style={{ opacity: 0.85 }}>
              <TeeSvg palette={palette} svgId={`${id}-front-fallback`} />
              <SummershipLogo
                textColor={textHex}
                visible={side === 'front'}
              />
            </div>
          )}
          {/* Front-face signatures */}
          {signatures
            .filter((s) => !s.face || s.face === 'front')
            .map((s) => (
            <SignatureChip
              key={s.id}
              sig={s}
              editable={editable}
              onDelete={onDeleteSignature}
              onChange={(next) => onChangeSignature?.(s.id, next)}
            />
          ))}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            WebkitTransform: 'rotateY(180deg)',
            opacity: side === 'back' ? 1 : 0,
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: side === 'back' ? 'auto' : 'none',
          }}
          aria-hidden={side !== 'back'}
        >
          {showFrontRaster ? (
            <>
              <div 
                className="absolute inset-0"
                style={{
                  backgroundColor: palette.base,
                  maskImage: `url(${mockupUrl})`,
                  maskSize: 'contain',
                  maskPosition: 'center',
                  maskRepeat: 'no-repeat',
                  WebkitMaskImage: `url(${mockupUrl})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  WebkitMaskRepeat: 'no-repeat',
                }}
              />

              {/* Upper back name (Underneath multiply layer for natural texture / folds overlay) */}
              <div
                className="absolute pointer-events-none select-none flex flex-col items-center justify-center leading-tight"
                style={{
                  top: '28%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '58%', // Printable width (shoulder-to-shoulder), ensures generous margins and never overflows shoulders
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: textHex,
                    fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
                    fontWeight: 700,
                    fontSize: nameFontSize,
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    textShadow: textColor === 'black'
                      ? '0 0.5px 0px rgba(255,255,255,0.12), 0 -0.5px 0.5px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)'
                      : '0 -0.5px 0.5px rgba(0,0,0,0.25), 0 0.5px 0px rgba(255,255,255,0.15), 0 1.5px 3px rgba(0,0,0,0.3)',
                  }}
                >
                  <div>{line1}</div>
                  {line2 && <div className="mt-0.5">{line2}</div>}
                </div>
              </div>

              <img 
                src={mockupUrl || undefined} 
                alt="" 
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
              />
              <BackCollarPatch palette={palette} />
            </>
          ) : (
            <div className={`w-full h-full ${!imageError ? 'animate-pulse' : ''}`} style={{ opacity: 0.85 }}>
              <TeeSvg palette={palette} svgId={`${id}-back-fallback`} isBack />
              <div
                className="absolute pointer-events-none select-none flex flex-col items-center justify-center leading-tight"
                style={{
                  top: '28%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '58%',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: textHex,
                    fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
                    fontWeight: 700,
                    fontSize: nameFontSize,
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    textShadow: textColor === 'black'
                      ? '0 0.5px 0px rgba(255,255,255,0.12), 0 -0.5px 0.5px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)'
                      : '0 -0.5px 0.5px rgba(0,0,0,0.25), 0 0.5px 0px rgba(255,255,255,0.15), 0 1.5px 3px rgba(0,0,0,0.3)',
                  }}
                >
                  <div>{line1}</div>
                  {line2 && <div className="mt-0.5">{line2}</div>}
                </div>
              </div>
            </div>
          )}
          {/* Back-face signatures */}
          {signatures
            .filter((s) => !s.face || s.face === 'back')
            .map((s) => (
            <SignatureChip
              key={s.id}
              sig={s}
              editable={editable}
              onDelete={onDeleteSignature}
              onChange={(next) => onChangeSignature?.(s.id, next)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── VLED Labs chest logo ──────────────────────────────────────────────────
//
// Screen-printed wordmark matching the page's own typography
// (`font-serif` → Playfair Display / Georgia). One block, two words,
// lowercase-weight "Labs" against an italic-bold "VLED" — the
// same dual-style typographic move that minimal fashion brands
// (A.P.C., Klättermusen) use to differentiate the brand from the
// discipline. Positioned exactly where a chest logo sits on a real
// tee (top 22%, left 17%), with a subtle -2° rotation so it doesn't
// look stamped-on.

function BackCollarPatch({ palette }: { palette: Palette }) {
  return (
    <svg
      viewBox="0 0 220 260"
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="back-collar-shadow" cx="50%" cy="0%" r="50%">
          <stop offset="0%" stopColor={palette.seam} stopOpacity="0.4" />
          <stop offset="100%" stopColor={palette.seam} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 1. Cover the front neck dip with the shirt base color */}
      <path
        d="M 78 28 C 88 43 132 43 142 28 C 130 18 90 18 78 28 Z"
        fill={palette.base}
      />
      {/* 2. Soft shadow inside the back collar dip */}
      <path
        d="M 78 28 C 88 43 132 43 142 28 Z"
        fill="url(#back-collar-shadow)"
      />
      {/* 3. Render the back collar rib tape */}
      <path
        d="M 78 28 C 88 22 132 22 142 28 C 134 16 120 12 110 12 C 100 12 86 16 78 28 Z"
        fill={palette.yoke}
        fillOpacity="0.95"
      />
      {/* 4. Subtle trim stitching on back collar */}
      <path
        d="M 78 28 C 88 22 132 22 142 28"
        stroke={palette.highlight}
        strokeOpacity="0.3"
        strokeWidth="0.5"
        fill="none"
      />
      <path
        d="M 82 25 C 90 19 130 19 138 25"
        stroke={palette.seam}
        strokeOpacity="0.25"
        strokeWidth="0.5"
        fill="none"
      />
    </svg>
  );
}

function SummershipLogo({
  textColor,
  visible,
}: {
  textColor: string;
  visible: boolean;
}) {
  if (!visible) return null;

  const textShadowStyle = textColor === 'black'
    ? '0px 0.5px 0px rgba(255,255,255,0.1), 0px -0.5px 0.5px rgba(0,0,0,0.2)'
    : '0px -0.5px 0.5px rgba(0,0,0,0.2), 0px 0.5px 0px rgba(255,255,255,0.12)';

  return (
    <div
      className="absolute pointer-events-none select-none flex flex-col items-center justify-center text-center"
      style={{
        top: '32%',
        left: '50%',
        transform: 'translate(-50%, -50%) rotate(-1deg)',
        width: '38%',
      }}
    >
      <svg
        viewBox="0 0 100 42"
        className="w-full h-auto overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>
          {`
            .summership-txt {
              font-family: "DM Serif Display", "Playfair Display", Georgia, serif;
              font-weight: 700;
              fill: ${textColor};
              opacity: 0.9;
              text-anchor: middle;
            }
          `}
        </style>
        <text
          x="50"
          y="12"
          fontSize="11.5"
          textLength="98"
          lengthAdjust="spacingAndGlyphs"
          className="summership-txt"
          style={{ textShadow: textShadowStyle }}
        >
          SUMMERSHIP
        </text>
        <text
          x="50"
          y="38"
          fontSize="28"
          textLength="98"
          lengthAdjust="spacingAndGlyphs"
          className="summership-txt"
          style={{ textShadow: textShadowStyle }}
        >
          2026
        </text>
      </svg>
    </div>
  );
}

// ── Signature overlay chip ─────────────────────────────────────────────────
//
// Each signature sits in the back-face absolute container at its
// normalized (x, y) coordinate. When `editable`, the chip exposes
// drag (move) + corner-handle drag (resize) + top-handle drag
// (rotate) interactions. The parent (the wizard) owns the stateful
// array and provides an `onChangeSignature` callback.

// ── T-shirt SVG ───────────────────────────────────────────────────────────
//
// Realistic 3D product mock with:
//   - drop-shoulder sleeves (set-in cap past the shoulder seam)
//   - ribbed crew collar (single tape + thin trim stitches)
//   - side rim shadows (vertical blurred bands along each side)
//   - centre body fold (highlight + 2 shadow lines running down the torso)
//   - soft radial vignette at the hem for depth
//   - subtle cotton-weave texture overlay
//
// Per-color palettes control every fill so no colour looks flat.
function TeeSvg({ palette, svgId, isBack }: { palette: Palette; svgId: string; isBack?: boolean }) {
  const gid = `g-${svgId}`;
  return (
    <svg
      viewBox="0 0 220 260"
      className="block w-full h-full drop-shadow-2xl"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Body — top-to-base is essentially flat; the form is shaped
            by the rim shadows + sleeves, not by a vertical gradient. */}
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.top} />
          <stop offset="60%" stopColor={palette.base} />
          <stop offset="100%" stopColor={palette.deep} />
        </linearGradient>

        {/* Left sleeve shading — darker near the sleeve cap, lightens
            outward toward the cuff. Mirrored for the right. */}
        <linearGradient id={`${gid}-sleeve-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.yoke} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.base} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`${gid}-sleeve-r`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.yoke} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.base} stopOpacity="0.95" />
        </linearGradient>

        {/* Side rim shadow — soft dark vertical band on each side of
            the torso, suggesting the body curves away from the camera. */}
        <linearGradient id={`${gid}-rim-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.seam} stopOpacity="0.45" />
          <stop offset="100%" stopColor={palette.seam} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gid}-rim-r`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={palette.seam} stopOpacity="0.45" />
          <stop offset="100%" stopColor={palette.seam} stopOpacity="0" />
        </linearGradient>

        {/* Centre body fold — soft light highlight running down the
            middle of the torso, plus two narrower shadow folds on each
            side. The reference image shows exactly this kind of fabric
            drape. */}
        <linearGradient id={`${gid}-fold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={palette.seam}  stopOpacity="0" />
          <stop offset="40%"  stopColor={palette.seam}  stopOpacity="0.18" />
          <stop offset="50%"  stopColor={palette.highlight} stopOpacity="0.22" />
          <stop offset="60%"  stopColor={palette.seam}  stopOpacity="0.18" />
          <stop offset="100%" stopColor={palette.seam}  stopOpacity="0" />
        </linearGradient>

        {/* Subtle cotton-weave texture — a faint dot pattern masked
            over the body so the fabric never looks like a flat fill
            on a high-DPI screen. */}
        <pattern id={`${gid}-weave`} x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.35" fill={palette.sheen} fillOpacity="0.08" />
        </pattern>

        {/* Soft radial vignette at the bottom of the body so the
            tee reads as a real 3D object, not a sticker. */}
        <radialGradient id={`${gid}-vignette`} cx="50%" cy="100%" r="80%">
          <stop offset="0%"   stopColor={palette.seam} stopOpacity="0.30" />
          <stop offset="100%" stopColor={palette.seam} stopOpacity="0" />
        </radialGradient>

        {/* Soft cloth shadow — used to blur out the rim band edges
            so they don't look stamped. */}
        <filter id={`${gid}-cloth`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id={`${gid}-clothtight`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {/* ── Sleeves (drawn first so the body sits on top) ─────────── */}
      {/* Drop-shoulder sleeves — the cap attaches slightly past the
          shoulder seam giving the modern relaxed shoulder crop the
          reference shows. Each sleeve is a curved triangle
          that falls from the cap down to a soft hem. */}
      <path
        d="
          M 8 64
          C 8 64 22 84 36 90
          L 50 86
          C 56 94 62 100 66 108
          L 70 132
          L 30 96
          C 28 88 22 80 18 76
          C 14 72 11 68 8 64 Z
        "
        fill={`url(#${gid}-sleeve-l)`}
      />
      <path
        d="
          M 212 64
          C 212 64 198 84 184 90
          L 170 86
          C 164 94 158 100 154 108
          L 150 132
          L 190 96
          C 192 88 198 80 202 76
          C 206 72 209 68 212 64 Z
        "
        fill={`url(#${gid}-sleeve-r)`}
      />

      {/* Sleeve cuff hems — small curved hem shadows at each cuff,
          matching the reference's sleeve stitch line. */}
      <path
        d="M 14 88 C 30 100 50 110 64 112"
        stroke={palette.seam}
        strokeOpacity="0.35"
        strokeWidth="0.7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 206 88 C 190 100 170 110 156 112"
        stroke={palette.seam}
        strokeOpacity="0.35"
        strokeWidth="0.7"
        fill="none"
        strokeLinecap="round"
      />

      {/* ── Main body — single closed path with drop-shoulder seam ── */}
      {/* Width: 220. Sleeve cap from 36..64 and 156..184 respectively
          with the classic raglan curve. Body width at chest
          (52..168) and slim waist (60..160), ending in a curved
          hem that drops slightly in the middle. */}
      <path
        d="
          M 110 12
          C 96 12 86 20 84 30
          C 70 30 56 34 44 42
          L 36 48
          C 36 48 48 60 52 70
          C 56 90 60 120 60 160
          L 62 240
          C 70 244 90 246 110 246
          C 130 246 150 244 158 240
          L 160 160
          C 160 120 164 90 168 70
          C 172 60 184 48 184 48
          L 176 42
          C 164 34 150 30 136 30
          C 134 20 124 12 110 12
          Z
        "
        fill={`url(#${gid})`}
      />

      {/* Horizontal sheen overlay — a soft horizontal sheen strip
          running across the chest at 40% height, suggesting the
          light hits the fabric there. */}
      <path
        d="
          M 110 12
          C 96 12 86 20 84 30
          C 70 30 56 34 44 42
          L 36 48
          C 36 48 48 60 52 70
          C 56 90 60 120 60 160
          L 62 240
          C 70 244 90 246 110 246
          C 130 246 150 244 158 240
          L 160 160
          C 160 120 164 90 168 70
          C 172 60 184 48 184 48
          L 176 42
          C 164 34 150 30 136 30
          C 134 20 124 12 110 12
          Z
        "
        fill={`url(#${gid}-weave)`}
      />

      {/* Centre body fold (highlight + 2 shadow lines) */}
      <path
        d="
          M 110 12
          C 96 12 86 20 84 30
          C 70 30 56 34 44 42
          L 36 48
          C 36 48 48 60 52 70
          C 56 90 60 120 60 160
          L 62 240
          C 70 244 90 246 110 246
          C 130 246 150 244 158 240
          L 160 160
          C 160 120 164 90 168 70
          C 172 60 184 48 184 48
          L 176 42
          C 164 34 150 30 136 30
          C 134 20 124 12 110 12
          Z
        "
        fill={`url(#${gid}-fold)`}
      />

      {/* Side rim shadow on the left and right (the rim where the
          body curves into shadow). Drawn as wide rectangles clipped
          by the body path via the same fill — instead, we use soft
          blurred ellipses aligned with the side seams. */}
      <ellipse
        cx="62"
        cy="150"
        rx="12"
        ry="80"
        fill={`url(#${gid}-rim-l)`}
        filter={`url(#${gid}-cloth)`}
      />
      <ellipse
        cx="158"
        cy="150"
        rx="12"
        ry="80"
        fill={`url(#${gid}-rim-r)`}
        filter={`url(#${gid}-cloth)`}
      />

      {/* Bottom vignette — softens the bottom hem */}
      <rect
        x="40"
        y="200"
        width="140"
        height="60"
        fill={`url(#${gid}-vignette)`}
      />

      {/* Hem fold — a single subtle stitching line near the bottom.
          The reference shows a near-seamless hem; we use a soft
          dashed line that's almost invisible. */}
      <path
        d="M 64 234 L 156 234"
        stroke={palette.seam}
        strokeOpacity="0.35"
        strokeWidth="0.5"
        fill="none"
        strokeDasharray="1 1.2"
      />

      {/* ── Crew collar (ribbed, set-in) ──────────────────────────── */}
      {isBack ? (
        <>
          <path
            d="M 80 26 C 88 22 132 22 140 26 C 134 16 120 12 110 12 C 100 12 86 16 80 26 Z"
            fill={palette.yoke}
            fillOpacity="0.9"
          />
          <path
            d="M 82 25 C 90 19 130 19 138 25 C 132 17 118 16 110 16 C 102 16 88 17 82 25 Z"
            fill={palette.deep}
            fillOpacity="0.55"
          />
          <path
            d="M 82 25 C 90 19 130 19 138 25"
            stroke={palette.seam}
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 82 25 C 90 19 130 19 138 25"
            stroke={palette.highlight}
            strokeOpacity="0.6"
            strokeWidth="0.6"
            fill="none"
          />
          <path
            d="M 80 26 C 88 22 132 22 140 26"
            stroke={palette.highlight}
            strokeOpacity="0.45"
            strokeWidth="0.5"
            fill="none"
            filter={`url(#${gid}-clothtight)`}
          />
        </>
      ) : (
        <>
          <path
            d="M 80 26 C 88 40 132 40 140 26 C 134 16 120 12 110 12 C 100 12 86 16 80 26 Z"
            fill={palette.yoke}
            fillOpacity="0.9"
          />
          <path
            d="M 84 30 C 92 44 128 44 136 30 C 130 20 118 18 110 18 C 102 18 90 20 84 30 Z"
            fill={palette.deep}
            fillOpacity="0.55"
          />
          <path
            d="M 88 30 C 96 44 124 44 132 30"
            stroke={palette.seam}
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 84 30 C 92 44 128 44 136 30"
            stroke={palette.highlight}
            strokeOpacity="0.6"
            strokeWidth="0.6"
            fill="none"
          />
          <path
            d="M 80 26 C 88 40 132 40 140 26"
            stroke={palette.highlight}
            strokeOpacity="0.45"
            strokeWidth="0.5"
            fill="none"
            filter={`url(#${gid}-clothtight)`}
          />
        </>
      )}

      {/* Soft chest highlight — a gentle, blurred column of light on
          the left chest where the reference shows the strongest highlight. */}
      <ellipse
        cx="92"
        cy="110"
        rx="36"
        ry="60"
        fill={palette.sheen}
        fillOpacity="0.18"
        filter={`url(#${gid}-cloth)`}
      />
      {/* Faint shadow on the right chest for the opposite falloff */}
      <ellipse
        cx="140"
        cy="160"
        rx="28"
        ry="48"
        fill={palette.deep}
        fillOpacity="0.22"
        filter={`url(#${gid}-cloth)`}
      />
    </svg>
  );
}

function SignatureChip({
  sig,
  editable,
  onDelete,
  onChange,
}: {
  sig: SignatureOverlay;
  editable: boolean;
  onDelete?: (id: string) => void;
  onChange: (next: { x: number; y: number; scale: number; rotation: number }) => void;
}) {
  const dragStateRef = useRef<null | {
    type: 'move' | 'resize' | 'rotate';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originScale: number;
    originRotation: number;
  }>(null);

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    type: 'move' | 'resize' | 'rotate',
  ) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      originX: sig.x,
      originY: sig.y,
      originScale: sig.scale,
      originRotation: sig.rotation,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    if (!s) return;
    const parent = (e.currentTarget as HTMLElement).offsetParent as HTMLElement | null;
    if (!parent) return;
    const pw = parent.clientWidth || 1;
    const ph = parent.clientHeight || 1;
    const dx = (e.clientX - s.startX) / pw;
    const dy = (e.clientY - s.startY) / ph;

    if (s.type === 'move') {
      onChange({
        x: clamp(s.originX + dx, 0.02, 0.98),
        y: clamp(s.originY + dy, 0.02, 0.98),
        scale: sig.scale,
        rotation: sig.rotation,
      });
    } else if (s.type === 'resize') {
      const pxDelta = e.clientX - s.startX + (e.clientY - s.startY);
      onChange({
        x: sig.x,
        y: sig.y,
        scale: clamp(s.originScale + pxDelta * 0.0025, 0.2, 1.5),
        rotation: sig.rotation,
      });
    } else if (s.type === 'rotate') {
      const parentRect = (parent as HTMLElement).getBoundingClientRect();
      const cxPx = parentRect.left + sig.x * parentRect.width;
      const cyPx = parentRect.top + sig.y * parentRect.height;
      const a0 = Math.atan2(s.startY - cyPx, s.startX - cxPx);
      const a1 = Math.atan2(e.clientY - cyPx, e.clientX - cxPx);
      const deg = (a1 - a0) * (180 / Math.PI);
      onChange({
        x: sig.x,
        y: sig.y,
        scale: sig.scale,
        rotation: clamp(s.originRotation + deg, -45, 45),
      });
    }
  };

  const endDrag = () => {
    dragStateRef.current = null;
  };

  return (
    <div
      className="absolute group"
      style={{
        left: `${sig.x * 100}%`,
        top: `${sig.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${sig.rotation}deg) scale(${sig.scale})`,
        transformOrigin: 'center',
        width: '38%',
        pointerEvents: editable || onDelete ? 'auto' : 'none',
        cursor: editable ? 'grab' : 'default',
        touchAction: 'none',
      }}
      onPointerDown={(e) => editable && beginDrag(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img
        src={sig.dataUrl}
        alt=""
        draggable={false}
        className="block w-full h-auto select-none drop-shadow-md"
      />
      {/* Delete button — visible on hover when onDelete is provided */}
      {onDelete && (
        <button
          type="button"
          title="Remove signature"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(sig.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:scale-110 z-10"
          style={{ fontSize: '10px', lineHeight: 1 }}
        >
          ✕
        </button>
      )}
      {editable && (
        <>
          <div
            className="absolute left-1/2 -top-3 w-3 h-3 rounded-full bg-accent border border-bg shadow"
            style={{ transform: 'translate(-50%, -100%)' }}
            onPointerDown={(e) => beginDrag(e, 'rotate')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          <div
            className="absolute right-0 bottom-0 w-3 h-3 rounded-sm bg-accent border border-bg shadow cursor-nwse-resize"
            style={{ transform: 'translate(40%, 40%)' }}
            onPointerDown={(e) => beginDrag(e, 'resize')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
        </>
      )}
    </div>
  );
}

// Suppress unused-import warning while keeping `motion` available for
// future motion enhancement.
void motion;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Suppress unused-import warning for `useEffect` (kept for future hooks).
void useEffect;
