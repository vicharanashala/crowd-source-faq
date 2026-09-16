/**
 * eligibility.ts — pure-function helpers for the Sign My Tee feature.
 *
 * The eligibility window is a rolling 3-day window centred on the
 * internship end date (day-before, day-of, day-after). This must work
 * dynamically for every date throughout the year — no manual
 * grouping, no per-batch config, no hard-coded "summership" /
 * "monsoonship" windows.
 *
 * Date math is local-time anchored (`getFullYear/Month/Date`) so the
 * "day" a user is reading is the day on *their* wall clock. Storing
 * the date as UTC midnight (see validation.ts `internshipEndDate`)
 * keeps storage timezone-agnostic; the delta is computed in local
 * time at evaluation so a user in a UTC+5 zone with `endDate` at
 * `2026-07-15T00:00:00Z` reads "today = 2026-07-15" on their
 * calendar and the day-before / day-of / day-after still lights up
 * correctly without timezone gymnastics.
 */

/**
 * Truncate a Date to local-midnight (the start of the user's calendar
 * day). Returns a new Date; does not mutate.
 */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Number of full calendar days between two local-time day boundaries.
 * Negative means `b` is before `a`. Always returns an integer
 * because we anchor both inputs to local midnight first.
 */
export function daysBetween(a: Date, b: Date): number {
  const aMidnight = startOfLocalDay(a).getTime();
  const bMidnight = startOfLocalDay(b).getTime();
  // Use 86_400_000 ms (which is unaffected by DST transitions because
  // we already anchored both sides to local midnight via getFullYear /
  // getMonth / getDate — the timestamp of "midnight in zone Z" is
  // stable across the DST switch either way).
  const MS_PER_DAY = 86_400_000;
  return Math.round((bMidnight - aMidnight) / MS_PER_DAY);
}

/**
 * Is `today` inside the rolling 3-day eligibility window for someone
 * whose internship ends on `endDate`?
 *
 *   endDate = 15 June → eligible on {14, 15, 16} June (3 days).
 *
 * Pass `today = new Date()` for production use. Tests pass an
 * explicit `today` so they're deterministic.
 *
 * Returns `false` for null/invalid end dates — the caller is
 * expected to gate those into the date-entry modal first, so
 * "no end date" means "not eligible yet".
 */
export function isEligibleForTee(today: Date, endDate: Date | null | undefined): boolean {
  if (!endDate) return false;
  const t = endDate as Date;
  if (Number.isNaN(t.getTime())) return false;
  const diff = daysBetween(t, today);
  return diff >= -1 && diff <= 1;
}

/**
 * Distance in days from today to the end date, for UX ("Your window
 * opens in 2 days", "Last day to sign!", "Window closed 3 days ago").
 * Sign convention: negative = window not yet open, positive = window
 * closed, 0 = day-of.
 */
export type WindowPhase = 'before' | 'open' | 'after';

/**
 * Sign My Tee is an internship-only feature. Given the `programType`
 * of every batch a user has an *active* enrollment in, should we ask
 * them for an `internshipEndDate` at all?
 *
 * - Any active `internship` enrollment -> yes, ask (even if they
 *   also happen to be in a non-internship programme).
 * - Active enrollments exist, none of them `internship` -> no, this
 *   user (e.g. a Vriddhi FDP participant) has no internship to date.
 * - No active enrollments at all -> yes, ask. This preserves the
 *   pre-v1.87 behaviour for the edge case of a user with no
 *   ProgramEnrollment row (shouldn't happen after the v1.69
 *   backfill, but silently hiding a real gate is the worse failure
 *   mode).
 */
export function requiresInternshipTracking(
  enrolledProgramTypes: Array<'internship' | 'fdp' | 'other'>,
): boolean {
  if (enrolledProgramTypes.length === 0) return true;
  return enrolledProgramTypes.includes('internship');
}

export function windowPhase(today: Date, endDate: Date | null | undefined): {
  phase: WindowPhase;
  daysOffset: number;
} {
  if (!endDate) return { phase: 'before', daysOffset: 999 };
  const diff = daysBetween(endDate, today);
  if (Math.abs(diff) <= 1) return { phase: 'open', daysOffset: diff };
  return diff < 0 ? { phase: 'before', daysOffset: diff } : { phase: 'after', daysOffset: diff };
}
