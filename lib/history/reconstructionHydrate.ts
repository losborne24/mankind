import type { ReconstructionObject, ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import type { LocalPoint } from '@/map/settlements/romanSettlement';

/**
 * The generator writes buildings and lanes as compact rows (thousands of them) with one note per kind. This expands
 * them into ordinary objects, so the renderer, the map overlay, the legend and the checks all see the same objects.
 */
export interface RawReconstruction extends Omit<ReconstructionSpec, 'streets' | 'courts'> {
  streets: { id: string; width: number; points: LocalPoint[] }[];
  templates: Record<string, { title: string; note: string; sources: string[] }>;
  kinds: string[];
  /** [centreE, centreS, frontE, frontS, width, depth, storeys, kindIndex, tone] */
  lots: number[][];
  /** [width, points] */
  lanes: [number, LocalPoint[]][];
  /** [centreE, centreS, width, depth, heading]: the open courtyards inside blocks (ground only). */
  courts: number[][];
}
export const STOREY_HEIGHT = 3.2;
const AD100 = { start: { year: 100 }, end: { year: 100 } };
const round1 = (v: number) => Math.round(v * 10) / 10;

export function lotFootprint(centre: LocalPoint, front: [number, number], width: number, depth: number): LocalPoint[] {
  const u = [-front[1], front[0]];
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => [round1(centre[0] + u[0] * width / 2 * a + front[0] * depth / 2 * b), round1(centre[1] + u[1] * width / 2 * a + front[1] * depth / 2 * b)] as LocalPoint);
}
function laneRibbon(points: LocalPoint[], width: number): LocalPoint[] {
  const left: LocalPoint[] = [], right: LocalPoint[] = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    left.push([round1(p[0] + n[0] * width / 2), round1(p[1] + n[1] * width / 2)]); right.push([round1(p[0] - n[0] * width / 2), round1(p[1] - n[1] * width / 2)]);
  });
  return [...left, ...right.reverse()];
}

export function hydrateReconstruction(raw: RawReconstruction): ReconstructionSpec {
  const objects: ReconstructionObject[] = [...raw.objects];
  raw.lots.forEach(([cx, cz, fx, fz, w, d, storeys, kindIndex, tone], i) => {
    const kind = raw.kinds[kindIndex] as ReconstructionObject['kind'], t = raw.templates[kind];
    const centre: LocalPoint = [cx, cz], front: [number, number] = [fx, fz];
    objects.push({ id: `${kind}-${i + 1}`, kind, title: t.title, certainty: 'best-guess', note: t.note, sources: t.sources, footprint: lotFootprint(centre, front, w, d), time: AD100, uncertaintyYears: 25,
      shape: { type: 'building', centre, front, size: [w, d], storeys, height: round1(storeys * STOREY_HEIGHT + 0.8), tone, roof: 'gable' } });
  });
  const lanes = raw.lanes.map(([width, points], i) => ({ id: `lane-${i + 1}`, width, points }));
  const t = raw.templates.lane;
  for (const lane of lanes) objects.push({ id: lane.id, kind: 'lane', title: t.title, certainty: 'best-guess', note: t.note, sources: t.sources, footprint: laneRibbon(lane.points, lane.width), time: AD100, uncertaintyYears: 25,
    shape: { type: 'street', points: lane.points, width: lane.width } });
  return { seed: raw.seed, origin: raw.origin, sources: raw.sources, streets: [...raw.streets, ...lanes], waterExtra: raw.waterExtra, objects, courts: raw.courts.map(([cx, cz, w, d, heading]) => ({ offset: [cx, cz] as LocalPoint, width: w, depth: d, heading })) };
}
