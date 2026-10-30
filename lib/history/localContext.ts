import context from '@/lib/scenarios/fixtures/forum-boarium-context.json';
import type { ContextGroundSpec } from '@/map/settlements/groundMask';
import type { Coordinate, LocalPoint } from '@/map/settlements/romanSettlement';

const METRES_PER_DEGREE = Math.PI / 180 * 6371008.8;
/** Inverse of offsetCoordinate: longitude/latitude to metres east/south of the layout origin. */
function toLocal(origin: Coordinate, [lng, lat]: readonly number[]): LocalPoint {
  return [(lng - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * METRES_PER_DEGREE, -(lat - origin[1]) * METRES_PER_DEGREE];
}
const rings = (id: string, origin: Coordinate) =>
  (context.geometries.find(g => g.id === id)?.coordinates ?? []).map(ring => (ring as number[][]).map(p => toLocal(origin, p)));

/** Local ground for layouts that have one; styling over data already carried by the scenario's map layers. */
export function contextGroundFor(layoutId: string, origin: Coordinate): ContextGroundSpec | undefined {
  if (layoutId !== 'layout:forum-boarium-temples') return undefined;
  return {
    sizeMeters: 1400,
    // The only paved surface shown is the present-day outline of the Forum Boarium site (approximate, modern geometry).
    paving: rings('forum-boarium', origin),
    // Today's Tiber channel: an approximation of the ancient bank, not its ancient course.
    water: rings('tiber', origin),
  };
}
