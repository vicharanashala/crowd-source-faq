/**
 * ColorWheel.test.ts — colour-math round-trips.
 *
 * v1.87.4 — the wizard now lets users pick any HSL value. The pure
 * functions in `ColorWheel.tsx` (hex ↔ rgb ↔ hsl, contrast, palette
 * derivation) need to stay bug-free so the photo-realistic tee
 * keeps rendering at every colour.
 *
 * These tests run in plain node/vitest — no DOM needed because the
 * math helpers don't touch `<canvas>`. The DOM-bound picker
 * (ColorWheel, ColorPresets) is covered by the live browser walk.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  hexToHsl,
  hslToHex,
  getHSLFromCoordinates,
  relativeLuminance,
  contrastRatio,
  recommendTextColor,
} from '../ColorWheel';

describe('hex helpers', () => {
  it('normalizeHex accepts 6-digit hex with or without leading #', () => {
    expect(normalizeHex('#1c2c52')).toBe('#1c2c52');
    expect(normalizeHex('1c2c52')).toBe('#1c2c52');
    expect(normalizeHex('  #1C2C52  ')).toBe('#1c2c52');
  });

  it('normalizeHex expands 3-digit shorthand', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
  });

  it('normalizeHex rejects garbage', () => {
    expect(normalizeHex('zzz')).toBeNull();
    expect(normalizeHex('#xyzz')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });

  it('hexToRgb / rgbToHex round-trip', () => {
    for (const hex of ['#000000', '#ffffff', '#1c2c52', '#ff8800', '#22c55e']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it('hexToRgb maps known values correctly', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]);
    expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]);
  });
});

describe('HSL round-trips', () => {
  // We don't expect a perfect inverse — HSL → RGB is rounded
  // twice — so we assert within ±1 per channel.
  it.each([
    '#000000', '#ffffff', '#1c2c52', '#a78b5e', '#ec4899',
    '#f59e0b', '#22c55e', '#808080',
  ])('hex → HSL → hex for %s', (hex) => {
    const hsl = hexToHsl(hex);
    const back = hslToHex(hsl);
    const [r1, g1, b1] = hexToRgb(hex);
    const [r2, g2, b2] = hexToRgb(back);
    expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
    expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
    expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
  });

  it('rgbToHsl → hslToRgb round-trips', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [255, 255, 255],
      [128, 64, 200],
      [10, 200, 50],
    ];
    for (const rgb of cases) {
      const [h, s, l] = rgbToHsl(rgb);
      const back = hslToRgb([h, s, l]);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(rgb[i] - back[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('pure black & white land at expected HSL corners', () => {
    expect(hslToHex([0, 0, 0])).toBe('#000000');
  });

  it('grey stays achromatic', () => {
    const [, s] = rgbToHsl([128, 128, 128]);
    expect(s).toBe(0);
  });
});

describe('getHSLFromCoordinates (SV pad → HSL)', () => {
  // Pick a hue. We don't test hue behaviour here — the helper is
  // pass-through on hue, which is owned by the hue slider.
  const HUE = 238; // blue, matches the bug example

  it('top-right corner → S 100, L 50 (pure, mid-lightness hue)', () => {
    const { h, s, l } = getHSLFromCoordinates(200, 0, 200, 140, HUE);
    expect(h).toBe(HUE);
    expect(s).toBeCloseTo(100, 1);
    expect(l).toBeCloseTo(50, 1);
  });

  it('top-left corner → white (S 0, L 100) with hue ignored', () => {
    const { s, l } = getHSLFromCoordinates(0, 0, 200, 140, HUE);
    expect(s).toBeCloseTo(0, 1);
    expect(l).toBeCloseTo(100, 1);
  });

  it('bottom-right corner → black (S 0, L 0)', () => {
    // The HSL saturation is mathematically undefined when L=0 — we
    // return 0 by construction. The visual result is still black.
    const { s, l } = getHSLFromCoordinates(200, 140, 200, 140, HUE);
    expect(s).toBe(0);
    expect(l).toBeCloseTo(0, 1);
  });

  it('bottom-left corner → black (V=0 along the whole x axis)', () => {
    const { l } = getHSLFromCoordinates(0, 140, 200, 140, HUE);
    expect(l).toBeCloseTo(0, 1);
  });

  it('center → S ≈ 33, L ≈ 37.5', () => {
    const { s, l } = getHSLFromCoordinates(100, 70, 200, 140, HUE);
    expect(s).toBeCloseTo(33.333, 0);
    expect(l).toBeCloseTo(37.5, 0);
  });

  it('clamps cursor coordinates that overshoot the pad', () => {
    const inside = getHSLFromCoordinates(200, 0, 200, 140, HUE);
    const overshoot = getHSLFromCoordinates(500, -50, 200, 140, HUE);
    expect(overshoot.s).toBeCloseTo(inside.s, 5);
    expect(overshoot.l).toBeCloseTo(inside.l, 5);
  });

  it('wraps hue into [0, 360) and tolerates NaN', () => {
    const wrap = getHSLFromCoordinates(200, 0, 200, 140, 720 + HUE);
    expect(wrap.h).toBe(HUE);
    const neg = getHSLFromCoordinates(200, 0, 200, 140, -360 + HUE);
    expect(neg.h).toBe(HUE);
    const nan = getHSLFromCoordinates(200, 0, 200, 140, Number.NaN);
    expect(nan.h).toBe(0);
  });

  it('agrees with the picker surface — blue corner hits pure blue, not pale gray', () => {
    // The original bug: dragging to the top-right of the blue pad
    // produced H 238 S 9% L 87% (a pale gray/creme).
    const { h, s, l } = getHSLFromCoordinates(200, 0, 200, 140, 238);
    expect(h).toBe(238);
    // Saturation must be high, lightness must be mid — not the
    // old broken values of ~9% / ~87%.
    expect(s).toBeGreaterThan(80);
    expect(l).toBeLessThan(70);
    expect(l).toBeGreaterThan(30);
  });
});

describe('luminance + contrast', () => {
  it('luminance orderings: black < dark < white', () => {
    expect(relativeLuminance('#000000')).toBeLessThan(relativeLuminance('#444444'));
    expect(relativeLuminance('#444444')).toBeLessThan(relativeLuminance('#ffffff'));
  });

  it('contrast ratio: black/white hits 21:1', () => {
    const r = contrastRatio('#000000', '#ffffff');
    expect(r).toBeGreaterThan(20);
    expect(r).toBeLessThan(22);
  });

  it('contrast ratio: same colour = 1', () => {
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 5);
    expect(contrastRatio('#1c2c52', '#1c2c52')).toBeCloseTo(1, 5);
  });

  it('contrast ratio: navy + white is large', () => {
    const r = contrastRatio('#1c2c52', '#ffffff');
    expect(r).toBeGreaterThan(8);
  });

  it('recommendTextColor returns white over dark bg', () => {
    expect(recommendTextColor('#000000', '#ffffff')).toBe('#ffffff');
    expect(recommendTextColor('#1c2c52', '#ffffff')).toBe('#ffffff');
  });

  it('recommendTextColor returns black over light bg', () => {
    // White-bg + black-text is already a perfect-contrast pair
    // (21:1), so we keep the user's pick rather than override to
    // a "threshold black".
    expect(recommendTextColor('#ffffff', '#000000')).toBe('#000000');
  });

  it('recommendTextColor picks threshold-black when current pick is illegible on white', () => {
    // White-bg + white-text is unreadable → fix to dark.
    expect(recommendTextColor('#ffffff', '#ffffff')).toBe('#161616');
  });

  it('recommendTextColor trusts the user when contrast is already fine', () => {
    expect(recommendTextColor('#1c2c52', '#ffffff')).toBe('#ffffff');
    expect(recommendTextColor('#ffffff', '#161616')).toBe('#161616');
  });

  it('recommendTextColor fixes an illegible pair', () => {
    expect(recommendTextColor('#1c2c52', '#1c2c52')).toBe('#ffffff');
    expect(recommendTextColor('#ffffff', '#ffffff')).toBe('#161616');
  });
});
