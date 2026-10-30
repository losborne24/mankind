import context from '@/lib/scenarios/fixtures/forum-boarium-context.json';
import reconstruction from '@/lib/scenarios/fixtures/forum-boarium-reconstruction.json';
import type { ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import type { ContextGroundSpec } from '@/map/settlements/groundMask';
import type { Coordinate, LocalPoint } from '@/map/settlements/romanSettlement';

const METRES_PER_DEGREE = Math.PI / 180 * 6371008.8;
/** Inverse of offsetCoordinate: longitude/latitude to metres east/south of the layout origin. */
function toLocal(origin: Coordinate, [lng, lat]: readonly number[]): LocalPoint {
  return [(lng - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * METRES_PER_DEGREE, -(lat - origin[1]) * METRES_PER_DEGREE];
}
const rings = (id: string, origin: Coordinate) =>
  (context.geometries.find(g => g.id === id)?.coordinates ?? []).map(ring => (ring as number[][]).map(p => toLocal(origin, p)));

/** The generated best-guess neighbourhood (scripts/context/forum-boarium/build-reconstruction.mjs), shared by the scene and the map layer. */
export const forumReconstruction = reconstruction as unknown as ReconstructionSpec;
export function reconstructionFor(layoutId: string): ReconstructionSpec | undefined { return layoutId === 'layout:forum-boarium-temples' ? forumReconstruction : undefined; }

/** Local ground for layouts that have one; styling over data already carried by the scenario's map layers. */
export function contextGroundFor(layoutId: string, origin: Coordinate): ContextGroundSpec | undefined {
  if (layoutId !== 'layout:forum-boarium-temples') return undefined;
  return {
    sizeMeters: 1400,
    // The only paved surface shown is the present-day outline of the Forum Boarium site (approximate, modern geometry).
    paving: rings('forum-boarium', origin),
    // Today's Tiber channel: an approximation of the ancient bank, not its ancient course.
    water: rings('tiber', origin),
    // Everything below is guessed and switches off with the best-guess toggle.
    streets: forumReconstruction.streets.map(({ width, points }) => ({ width, points })),
    squares: forumReconstruction.objects.filter(o => o.kind === 'square').map(o => o.footprint),
    built: forumReconstruction.objects.filter(o => o.shape.type === 'building').map(o => ({ offset: o.shape.centre, width: o.shape.size[0], depth: o.shape.size[1], heading: Math.atan2(-o.shape.front[0], -o.shape.front[1]) })),
  };
}
