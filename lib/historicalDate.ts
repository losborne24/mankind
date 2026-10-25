/**
 * Historical date utilities.
 *
 * We use **astronomical year numbering** as the single source of truth for
 * historical years. This model, unlike the common BCE/CE convention, includes
 * a year zero, which makes arithmetic across the BCE/CE boundary continuous and
 * free of off-by-one errors:
 *
 *   astronomical  1  =    1 CE
 *   astronomical  0  =    1 BCE
 *   astronomical -1  =    2 BCE
 *   astronomical -2999 = 3000 BCE
 *
 * We deliberately do NOT use the JavaScript `Date` object as the source of
 * truth: `Date` cannot represent years before 1 CE in the calendar model we
 * need, applies Gregorian/Julian proleptic rules we don't want, and ties us to
 * a wall-clock calendar rather than a plain integer year axis.
 */

/** Earliest year the experience covers: 3000 BCE. */
export const MIN_YEAR = -2999;

/**
 * Latest year the experience covers ("present day").
 *
 * Hardcoded on purpose so that server and client render identical output and
 * so historical years never depend on the runtime clock. Bump this constant as
 * the project's notion of "present" advances.
 */
export const MAX_YEAR = 2025;

/** A sensible starting point for the timeline: the dawn of the covered range. */
export const DEFAULT_YEAR = -2999;

export type Era = "BCE" | "CE";

export interface HistoricalYearParts {
  /** The positive year number as humans write it (e.g. 3000 for 3000 BCE). */
  readonly year: number;
  readonly era: Era;
}

/**
 * Convert an astronomical year to its human-facing (year, era) parts.
 *
 * Astronomical years <= 0 are BCE; the displayed number is `1 - year`
 * (so 0 -> "1 BCE", -1 -> "2 BCE"). Years >= 1 are CE and display unchanged.
 */
export function toHistoricalYearParts(astronomicalYear: number): HistoricalYearParts {
  const year = Math.trunc(astronomicalYear);
  if (year <= 0) {
    return { year: 1 - year, era: "BCE" };
  }
  return { year, era: "CE" };
}

/**
 * Format an astronomical year as a human-readable label, e.g.
 * `-2999 -> "3000 BCE"`, `0 -> "1 BCE"`, `1 -> "1 CE"`, `2025 -> "2025 CE"`.
 */
export function formatHistoricalYear(astronomicalYear: number): string {
  const { year, era } = toHistoricalYearParts(astronomicalYear);
  return `${year} ${era}`;
}

/** Inverse of {@link toHistoricalYearParts}: (year, era) -> astronomical year. */
export function fromHistoricalYearParts(year: number, era: Era): number {
  const magnitude = Math.max(1, Math.trunc(Math.abs(year)));
  return era === "BCE" ? 1 - magnitude : magnitude;
}

/** Clamp an astronomical year to the supported [MIN_YEAR, MAX_YEAR] range. */
export function clampYear(astronomicalYear: number): number {
  if (astronomicalYear < MIN_YEAR) return MIN_YEAR;
  if (astronomicalYear > MAX_YEAR) return MAX_YEAR;
  return Math.trunc(astronomicalYear);
}

/**
 * Position of a year within the supported range, as a 0..1 fraction.
 * Useful for driving slider UIs without leaking the numbering convention.
 */
export function yearToFraction(astronomicalYear: number): number {
  const span = MAX_YEAR - MIN_YEAR;
  return span === 0 ? 0 : (clampYear(astronomicalYear) - MIN_YEAR) / span;
}

/** Inverse of {@link yearToFraction}. */
export function fractionToYear(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return clampYear(Math.round(MIN_YEAR + clamped * (MAX_YEAR - MIN_YEAR)));
}
