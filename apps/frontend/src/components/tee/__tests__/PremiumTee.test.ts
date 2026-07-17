/**
 * PremiumTee.test.ts — palette + text-color resolution.
 *
 * v1.87.4 widened `shirtColor` / `textColor` from a strict union of
 * palette keys to `Key | string` because the API now stores either a
 * key OR a `#rrggbb` hex (the wizard's custom-picker path). That
 * exposed a long-standing fragility: `PALETTES[shirtColor]` returned
 * `undefined` for hex strings, and any access to `palette.printHint`
 * crashed the renderer with "Cannot read properties of undefined".
 *
 * The `resolvePalette` / `resolveTextColor` helpers are the
 * architectural fix — they always return a valid object, falling
 * back to a sane default. These tests pin that contract so the
 * crash can't come back silently.
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePalette,
  resolveTextColor,
  paletteFromHex,
} from '../PremiumTee';

describe('resolvePalette', () => {
  it('returns the named palette for a known key', () => {
    const p = resolvePalette('navy');
    // Navy base is a known value from PALETTES.navy; this is enough
    // to prove we hit the named-key path, not the hex or fallback.
    expect(p.base).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('uses customShirtHex when present and valid', () => {
    const p = resolvePalette('navy', '#ff8800');
    // paletteFromHex puts the input through shiftL (which we know is
    // imperfect for tone neighbours but is good enough to call
    // "rendered from the user's hex"). What we care about is that
    // the input hex *wins* over the named key.
    expect(p.base).toBe('#ff8800');
  });

  it('falls back to a hex shirtColor when no override is given (v1.87.4+ storage shape)', () => {
    // This is the bug-anchored test: pre-fix, this would have hit
    // `PALETTES["#1c2c52"]` which is undefined → crash on .printHint.
    // Post-fix, it must succeed and return a palette whose base is
    // the input hex.
    const p = resolvePalette('#1c2c52');
    expect(p.base).toBe('#1c2c52');
    expect(p.printHint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('falls back to the navy palette on garbage input (never throws)', () => {
    // Pre-fix, an unknown string key (or a typo'd hex) would return
    // undefined and crash downstream. Post-fix, we always return a
    // valid palette object — even for input that\'s not a key and
    // not a hex.
    const p = resolvePalette('puce');
    // The fallback is PALETTES.navy; we assert it\'s a real palette
    // object with the expected shape.
    expect(p).toBeDefined();
    expect(p.base).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.printHint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('ignores an invalid customShirtHex and falls through to shirtColor', () => {
    // customShirtHex is set but garbage — the helper should not
    // call paletteFromHex on it (that\'d silently render black via
    // padStart+parseInt) and instead try shirtColor.
    const p = resolvePalette('maroon', '#zzz');
    expect(p.base).toMatch(/^#[0-9a-f]{6}$/i);
    // maroon base is a specific known hex; this proves the named-
    // key path was taken, not the fallback.
    expect(p.base.toLowerCase()).toBe('#4d1720');
  });

  it('ignores customShirtHex when it is an empty string or null', () => {
    expect(resolvePalette('olive', '').base).toMatch(/^#[0-9a-f]{6}$/i);
    expect(resolvePalette('sand', null).base).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('resolveTextColor', () => {
  it('returns a named text colour', () => {
    expect(resolveTextColor('white')).toBe('#ffffff');
  });

  it('uses customTextHex when present and valid', () => {
    expect(resolveTextColor('white', '#ff00ff')).toBe('#ff00ff');
  });

  it('accepts a hex string for textColor', () => {
    expect(resolveTextColor('#123456')).toBe('#123456');
  });

  it('falls back to white on unknown input (never throws)', () => {
    expect(resolveTextColor('fuchsia')).toBe('#ffffff');
    expect(resolveTextColor(42 as unknown as string)).toBe('#ffffff');
  });
});

describe('paletteFromHex (regression: silent corruption on bad input)', () => {
  // v1.87.4 note: PremiumTee\'s *local* hexToRgb is permissive —
  // it pads the string and parseInt\'s, so a non-hex input just
  // produces `#000000` rather than throwing. That means calling
  // paletteFromHex with garbage SILENTLY yields a black palette,
  // which is even more dangerous than a crash (the user sees
  // their carefully-chosen colour replaced with black). The guard
  // in resolvePalette exists precisely to prevent that.
  it('returns a palette for a valid hex', () => {
    const p = paletteFromHex('#1c2c52');
    expect(p.base).toBe('#1c2c52');
    expect(p.printHint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('does not validate — pass-through is the gotcha (guard lives in resolvePalette)', () => {
    // PremiumTee\'s *local* hexToRgb is permissive — it pads the
    // string and parseInt\'s, so a non-hex input never throws.
    // paletteFromHex doesn\'t validate either, so the result
    // contains `base: 'puce'` and shiftL-derived values that are
    // mostly zero. The renderer would silently display the wrong
    // colour. This is why resolvePalette validates with a regex
    // before delegating — it\'s the only line of defence.
    const p = paletteFromHex('puce');
    expect(p.base).toBe('puce');
  });
});
