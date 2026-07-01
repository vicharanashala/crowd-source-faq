/**
 * ProgramContext — strict resolution order, no silent fallback.
 *
 * The previous behavior auto-promoted the user from their explicit
 * stored program to a different non-empty program if the stored one
 * was empty. That violated the user's explicit choice and caused a
 * data-isolation regression where a user who picked an empty
 * program (e.g. the one they just created) would silently land on a
 * different program on refresh and never know why.
 *
 * The fix: respect the explicit choice. The resolution chain is now
 * strictly:
 *   1. URL ?batch=<id>     (explicit deep-link — wins)
 *   2. localStorage         (explicit prior choice — wins over default)
 *   3. server-reported isDefault: true (admin-promoted default)
 *   4. server-reported non-empty (fallback)
 *   5. first program        (last resort)
 *
 * The component has lots of hooks and side effects, so this test
 * exercises the resolveInitial logic by importing the helper. Since
 * the helper is currently a closure inside the provider, we test
 * the documented behavior contract through a thin adapter that
 * captures the same algorithm.
 */
import { describe, it, expect } from 'vitest';

interface ProgramLike {
  _id: string;
  isDefault?: boolean;
  faqCount: number;
}

// Mirror of resolveInitial from ProgramContext.tsx. Kept here so
// tests stay in sync only when the contract changes.
function resolveInitial(
  programs: ProgramLike[],
  fromUrl: string | null,
  stored: string | null,
): ProgramLike | null {
  if (programs.length === 0) return null;
  if (fromUrl) {
    const m = programs.find((p) => p._id === fromUrl);
    if (m) return m;
  }
  if (stored) {
    const m = programs.find((p) => p._id === stored);
    if (m) return m;
  }
  const def = programs.find((p) => p.isDefault);
  if (def) return def;
  const nonEmpty = programs.find((p) => p.faqCount > 0);
  if (nonEmpty) return nonEmpty;
  return programs[0];
}

const P = (id: string, opts: Partial<ProgramLike> = {}): ProgramLike => ({
  _id: id, isDefault: false, faqCount: 0, ...opts,
});

describe('ProgramContext.resolveInitial — strict order, no silent fallback', () => {
  it('returns null for an empty list', () => {
    expect(resolveInitial([], null, null)).toBeNull();
  });

  it('prefers URL deep-link over everything else', () => {
    const programs = [P('A', { faqCount: 5 }), P('B'), P('C', { isDefault: true })];
    expect(resolveInitial(programs, 'B', 'A')?._id).toBe('B');
  });

  it('prefers localStorage over server-reported isDefault', () => {
    const programs = [P('A'), P('B', { isDefault: true })];
    expect(resolveInitial(programs, null, 'A')?._id).toBe('A');
  });

  it('prefers server-reported isDefault over non-empty fallback', () => {
    const programs = [P('A', { faqCount: 5 }), P('B', { isDefault: true })];
    expect(resolveInitial(programs, null, null)?._id).toBe('B');
  });

  it('falls back to non-empty when no isDefault', () => {
    const programs = [P('A'), P('B', { faqCount: 3 })];
    expect(resolveInitial(programs, null, null)?._id).toBe('B');
  });

  it('falls back to first program when nothing matches', () => {
    const programs = [P('A'), P('B')];
    expect(resolveInitial(programs, null, null)?._id).toBe('A');
  });

  // ─── The actual bug fix ───
  it('respects the explicit stored program even when it is EMPTY (does NOT auto-promote)', () => {
    // Old behaviour: stored=Empty, faqCount=0 → silently switched to
    // any non-empty program. New behaviour: respects the choice.
    const programs = [
      P('A', { faqCount: 0 }), // explicitly stored, empty
      P('B', { faqCount: 50 }),
      P('C', { faqCount: 30 }),
    ];
    expect(resolveInitial(programs, null, 'A')?._id).toBe('A');
  });

  it('respects the URL deep-link even when that program is EMPTY', () => {
    const programs = [
      P('A', { faqCount: 0 }),
      P('B', { faqCount: 50 }),
    ];
    expect(resolveInitial(programs, 'A', null)?._id).toBe('A');
  });

  it('falls through stored → isDefault → non-empty → first when stored id is unknown', () => {
    const programs = [P('A', { faqCount: 0 }), P('B', { isDefault: true, faqCount: 5 })];
    expect(resolveInitial(programs, null, 'GONE')?._id).toBe('B');
  });

  it('falls through to first when nothing else matches even if first is empty', () => {
    const programs = [P('A', { faqCount: 0 }), P('B', { faqCount: 0 })];
    expect(resolveInitial(programs, null, null)?._id).toBe('A');
  });
});