import type { Interpretation } from '@/lib/ai/interpret';
import type { Coordinate } from '@/lib/scenarios/schema';

/** One case of lib/ai/evals/interpret-cases.json. */
export interface InterpretCase {
  id: string;
  text: string;
  expect: { outcome: Interpretation['outcome']; placeId?: string; newPlace?: { near: Coordinate; km: number; tradition?: string | null }; years?: [number, number]; end?: [number, number]; scope?: string; target?: string };
}
/** Deterministic grading: every stated expectation must hold; unstated ones are free. Returns the failures (empty when it passes). */
export function gradeInterpretation(c: InterpretCase, got: Interpretation | { error: string }): string[] {
  if ('error' in got) return [`error: ${got.error}`];
  const e = c.expect, failures: string[] = [];
  if (got.outcome !== e.outcome) return [`outcome ${got.outcome}, expected ${e.outcome}`];
  if (got.outcome !== 'request') return failures;
  const r = got.request, place = r.place;
  if (e.placeId && !('id' in place && place.id === e.placeId)) failures.push(`place ${'id' in place ? place.id : place.title}, expected ${e.placeId}`);
  if (e.newPlace) {
    if ('id' in place) failures.push(`place ${place.id}, expected a new place near ${e.newPlace.near}`);
    else {
      const [lng, lat] = place.coordinate, km = Math.hypot((lng - e.newPlace.near[0]) * Math.cos(lat * Math.PI / 180) * 111.32, (lat - e.newPlace.near[1]) * 110.95);
      if (km > e.newPlace.km) failures.push(`${place.title} is ${km.toFixed(1)} km from the expected point`);
      if (e.newPlace.tradition !== undefined && (place.tradition ?? null) !== e.newPlace.tradition) failures.push(`tradition ${place.tradition ?? 'none'}, expected ${e.newPlace.tradition ?? 'none'}`);
    }
  }
  if (e.years && (r.time.start.year < e.years[0] || r.time.start.year > e.years[1])) failures.push(`start ${r.time.start.year}, expected ${e.years[0]}–${e.years[1]}`);
  if (e.end) { const end = r.time.end?.year ?? r.time.start.year; if (end < e.end[0] || end > e.end[1]) failures.push(`end ${end}, expected ${e.end[0]}–${e.end[1]}`); }
  if (e.scope && r.scope !== e.scope) failures.push(`scope ${r.scope}, expected ${e.scope}`);
  if (e.target && r.target !== e.target) failures.push(`target ${r.target ?? 'none'}, expected ${e.target}`);
  return failures;
}
export function summarise(results: { id: string; expected: string; failures: string[]; costUsd: number }[]) {
  const by = (o: string) => results.filter(r => r.expected === o), rate = (rs: typeof results) => rs.length ? rs.filter(r => !r.failures.length).length / rs.length : null;
  return { cases: results.length, passed: results.filter(r => !r.failures.length).length, accuracy: rate(results), byOutcome: { request: rate(by('request')), clarify: rate(by('clarify')), refuse: rate(by('refuse')) }, costUsd: results.reduce((s, r) => s + r.costUsd, 0) };
}
