import type { HistoricalPeriod } from '@/lib/history/schema';
import type { PlanFeature, SpatialBlueprint } from '@/lib/plan/contracts';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import { matchHistoricalTime, periodBounds } from '@/lib/history/time';
import { formatHistoricalYear } from '@/lib/historicalDate';

export type Presence = { present: 'yes' | 'no' | 'unconfirmed'; match: 'within' | 'possible' | 'outside' | 'timeless'; reason: string };

/** The request falls inside the dates the blueprint was made for (its editorial date counts as exact). */
export function withinApplicability(blueprint: SpatialBlueprint, time: HistoricalTime) {
  const [lo, hi] = periodBounds({ start: blueprint.applicability.start, end: blueprint.applicability.end }), [from, to] = periodBounds(time);
  return from >= lo && to <= hi;
}
const year = (p: HistoricalPeriod) => p.start.year;

/**
 * Whether a feature stands at the requested date. Nothing is assumed: an uncertain date is shown only at the date its blueprint was
 * made for, and a feature with only a construction date is confirmed only up to that date.
 */
export function presence(feature: Pick<PlanFeature, 'chronology' | 'existence'>, blueprint: SpatialBlueprint, time: HistoricalTime): Presence {
  if (feature.chronology === 'timeless') return { present: 'yes', match: 'timeless', reason: 'Drawn for every date.' };
  const existence = feature.existence!, own = withinApplicability(blueprint, time);
  if (feature.chronology === 'from-start') {
    const [from] = periodBounds(time), [start] = periodBounds({ start: existence.start });
    if (from < start) return { present: 'no', match: 'outside', reason: `Built in ${fmt(year(existence))}, after the requested date.` };
    return own ? { present: 'yes', match: 'within', reason: `Built in ${fmt(year(existence))}; standing at the blueprint's date.` }
      : { present: 'unconfirmed', match: 'possible', reason: `Only its construction (${fmt(year(existence))}) is recorded; that it still stood at the requested date is not.` };
  }
  const match = matchHistoricalTime(existence, time);
  if (match === 'within') return { present: 'yes', match, reason: `Dated ${fmt(year(existence))}–${fmt(existence.end!.year)}.` };
  if (match === 'outside') return { present: 'no', match, reason: `Dated ${fmt(year(existence))}–${fmt((existence.end ?? existence.start).year)}, outside the requested date.` };
  return own ? { present: 'yes', match, reason: `Dates are approximate; shown at the blueprint's own date as an interpretation.` }
    : { present: 'unconfirmed', match, reason: `Dates are approximate or uncertain around the requested date.` };
}
/** Astronomical year (0 = 1 BCE) as the app labels it. */
export const fmt = (y: number) => formatHistoricalYear(y);
export const timeLabel = (t: HistoricalTime) => t.end && t.end.year !== t.start.year ? `${fmt(t.start.year)}–${fmt(t.end.year)}` : fmt(t.start.year);
