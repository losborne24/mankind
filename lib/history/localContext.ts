import context from '@/lib/scenarios/fixtures/forum-boarium-context.json';
import reconstruction from '@/lib/scenarios/fixtures/forum-boarium-reconstruction.json';
import { hydrateReconstruction, type RawReconstruction } from '@/lib/history/reconstructionHydrate';
import type { ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import type { ContextGroundSpec } from '@/map/settlements/groundMask';
import type { Coordinate, LocalPoint } from '@/map/settlements/romanSettlement';

const METRES_PER_DEGREE = Math.PI / 180 * 6371008.8;
/** Inverse of offsetCoordinate: longitude/latitude to metres east/south of the layout origin. */
function toLocal(origin: Coordinate, [lng, lat]: readonly number[]): LocalPoint {
  return [(lng - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * METRES_PER_DEGREE, -(lat - origin[1]) * METRES_PER_DEGREE];
}
const ringArea = (ring: LocalPoint[]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const rings = (id: string, origin: Coordinate) =>
  (context.geometries.find(g => g.id === id)?.coordinates ?? []).map(ring => (ring as number[][]).map(p => toLocal(origin, p)));

/** The generated best-guess neighbourhood (scripts/context/forum-boarium/build-reconstruction.mjs), shared by the scene and the map layer. */
export const forumReconstruction: ReconstructionSpec = hydrateReconstruction(reconstruction as unknown as RawReconstruction);
export function reconstructionFor(layoutId: string): ReconstructionSpec | undefined { return layoutId === 'layout:forum-boarium-temples' ? forumReconstruction : undefined; }

/** Local ground for layouts that have one; styling over data already carried by the scenario's map layers. */
export function contextGroundFor(layoutId: string, origin: Coordinate): ContextGroundSpec | undefined {
  if (layoutId !== 'layout:forum-boarium-temples') return undefined;
  return {
    sizeMeters: 1400,
    // The only paved surface shown is the present-day outline of the Forum Boarium site (approximate, modern geometry).
    paving: rings('forum-boarium', origin),
    // Today's Tiber channel, plus the strip of river the 19th-century embankments took (the bank Lanciani surveyed, about 3-5 m).
    // Holes under 1,000 m² in today's outline are left out: the Ponte Rotto (the ruin of the Pons Aemilius itself, drawn as
    // a bridge) and a small islet off Tiber Island, so no patch of modern ground stands up out of the river.
    water: rings('tiber', origin).filter((ring, i) => i === 0 || ringArea(ring) >= 1000),
    waterExtra: forumReconstruction.waterExtra,
    // Everything below is guessed and switches off with the best-guess toggle.
    streets: forumReconstruction.streets.map(({ width, points }) => ({ width, points })),
    squares: forumReconstruction.objects.filter(o => o.kind === 'square').map(o => o.footprint),
    built: forumReconstruction.objects.filter(o => o.shape.type === 'building').map(o => ({ offset: o.shape.centre, width: o.shape.size[0], depth: o.shape.size[1], heading: Math.atan2(-o.shape.front[0], -o.shape.front[1]) })),
    courts: forumReconstruction.courts,
  };
}
