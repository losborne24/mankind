import { MIN_YEAR, MAX_YEAR } from '@/lib/historicalDate';
import type { HistoricalDate, HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalPeriod } from '@/lib/history/schema';

export function validateHistoricalDate(value: unknown): asserts value is HistoricalDate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected historical date');
  const d = value as Record<string, unknown>;
  if (Object.keys(d).some(k => !['year', 'month', 'day'].includes(k))) throw Error('Unknown date field');
  if (typeof d.year !== 'number' || !Number.isInteger(d.year) || d.year < MIN_YEAR || d.year > MAX_YEAR) throw Error('Historical year outside supported range');
  if (d.day !== undefined && d.month === undefined) throw Error('Day needs month');
  if (d.month !== undefined) {
    if (typeof d.month !== 'number' || !Number.isInteger(d.month) || d.month < 1 || d.month > 12) throw Error('Invalid month');
    const leap = d.year % 4 === 0 && (d.year % 100 !== 0 || d.year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (d.day !== undefined && (typeof d.day !== 'number' || !Number.isInteger(d.day) || d.day < 1 || d.day > days[d.month - 1])) throw Error('Invalid day');
  }
}
/** Order keys, not elapsed-day counts. Partial dates cover the entire named year/month. */
export function dateBounds(date: HistoricalDate): [number, number] {
  validateHistoricalDate(date);
  const key = (month: number, day: number) => date.year * 372 + month * 31 + day;
  return [key(date.month ?? 1, date.day ?? 1), key(date.month ?? 12, date.day ?? 31)];
}
export function periodBounds(period: HistoricalPeriod): [number, number] {
  const lower = dateBounds(period.start)[0], upper = dateBounds(period.end ?? period.start)[1];
  if (lower > upper) throw Error('Reversed historical period');
  return [lower, upper];
}
export function matchHistoricalPeriod(period: HistoricalPeriod, date: HistoricalDate): 'within' | 'possible' | 'outside' {
  return matchHistoricalTime(period, { start: date });
}
export function matchHistoricalTime(period: HistoricalPeriod, selection: HistoricalTime): 'within' | 'possible' | 'outside' {
  const [lower, upper] = periodBounds(period), [from, to] = periodBounds(selection);
  const uncertainty = (period.uncertaintyYears ?? 0) * 372;
  if (to < lower - uncertainty || from > upper + uncertainty) return 'outside';
  return uncertainty || period.approximate || from < lower || to > upper ? 'possible' : 'within';
}
/** Never turn an uncertain historical interval into a falsely exact scenario command. */
export function toHistoricalTime(period: HistoricalPeriod): HistoricalTime {
  periodBounds(period);
  if (period.uncertaintyYears || period.approximate) throw Error('Uncertain period needs an explicit presentation date');
  return { start: { ...period.start }, ...(period.end ? { end: { ...period.end } } : {}) };
}
