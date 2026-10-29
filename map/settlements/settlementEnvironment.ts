import { assetRegistry, type AssetDefinition } from "@/lib/assets/registry";
import type { LocalPoint, SceneryPlacement, SettlementDefinition } from "@/map/settlements/romanSettlement";
import { settlementEnvironmentConfig as config } from "@/map/settlements/environmentConfig";

export interface ContactFootprint { offset: LocalPoint; width: number; depth: number; heading: number; base?: number }
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const fade = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function localToSettlement(point: LocalPoint, offset: LocalPoint, heading: number): LocalPoint {
  const c = Math.cos(heading), s = Math.sin(heading);
  return [offset[0] + c * point[0] + s * point[1], offset[1] - s * point[0] + c * point[1]];
}
export function footprintDistance(point: LocalPoint, f: ContactFootprint): number {
  const dx = point[0] - f.offset[0], dz = point[1] - f.offset[1], c = Math.cos(f.heading), s = Math.sin(f.heading);
  const x = Math.abs(c * dx - s * dz) - f.width / 2, z = Math.abs(s * dx + c * dz) - f.depth / 2;
  return Math.hypot(Math.max(x, 0), Math.max(z, 0)) + Math.min(Math.max(x, z), 0);
}
export function segmentDistance(point: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp01(((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}
export function buildingContacts(building: SettlementDefinition['buildings'][number]): ContactFootprint[] {
  const asset: AssetDefinition = assetRegistry[building.assetId];
  const heading = building.headingRadians ?? 0;
  const contacts = asset.grounding?.contacts ?? [{offset: [0, 0] as LocalPoint, width: asset.dimensionsMeters![0], depth: asset.dimensionsMeters![2]}];
  return contacts.map((f) => ({...f, offset: localToSettlement(f.offset, building.offset, heading), heading}));
}

/** Generated once per load from local layout; no camera, date, world origin or random state. */
export function createSettlementEnvironment(definition: SettlementDefinition) {
  const seed = definition.seed ?? [...definition.id].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261);
  const random = (x: number, z: number) => {
    let n = Math.imul(Math.round(x * 1000) ^ seed, 374761393) ^ Math.imul(Math.round(z * 1000), 668265263);
    n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296;
  };
  const contacts = definition.buildings.flatMap(buildingContacts);
  const occupied = definition.buildings.map((b) => ({offset: b.offset, width: assetRegistry[b.assetId].dimensionsMeters[0],
    depth: assetRegistry[b.assetId].dimensionsMeters[2], heading: b.headingRadians ?? 0}));
  const entrances = definition.buildings.flatMap((b) => {
    const asset: AssetDefinition = assetRegistry[b.assetId];
    if (!asset.grounding?.entrance) return [];
    const point = localToSettlement(asset.grounding.entrance, b.offset, b.headingRadians ?? 0);
    const access = definition.roads.find((r) => r.accessTo === b.id);
    return [{point, from: access?.points.at(-1) ?? point}];
  });
  const segments = definition.roads.flatMap((r) => r.points.slice(1).map((b, i) => ({a:r.points[i], b, width:r.widthMeters})));
  const roadDistance = (p: LocalPoint) => Math.min(Infinity, ...segments.map((s) => segmentDistance(p, s.a, s.b) - s.width / 2));
  const entranceWear = (p: LocalPoint) => Math.max(0, ...entrances.map((e) =>
    1 - fade(0.3, config.entranceRadiusMeters, Math.min(Math.hypot(p[0] - e.point[0], p[1] - e.point[1]), segmentDistance(p, e.from, e.point)))));
  const traffic = (p: LocalPoint) => Math.max(entranceWear(p), 1 - fade(0, config.trafficFalloffMeters, roadDistance(p)));
  const clearance = (p: LocalPoint, radius: number) => roadDistance(p) > radius + 0.15 &&
    occupied.every((f) => footprintDistance(p, f) > radius + 0.12) &&
    entrances.every((e) => segmentDistance(p, e.from, e.point) > radius + 0.7);
  const scenery = (definition.scenery ?? []).filter((p) => {
    const asset = assetRegistry[p.assetId];
    if (asset.category !== 'vegetation') return true;
    const radius = Math.max(asset.dimensionsMeters[0], asset.dimensionsMeters[2]) * (p.scale ?? 1) / 2;
    if (!clearance(p.offset, radius)) return false;
    if (p.tags?.includes('cultivated') || p.tags?.includes('tree')) return true;
    return random(...p.offset) > traffic(p.offset) * 0.9;
  });
  // Reuse an existing ground-cover species, with a strict per-settlement cap.
  const plant = definition.scenery?.find((p) => p.tags?.includes('ground-cover'));
  let added = 0;
  if (plant) {
    for (const f of occupied) for (const side of [-1, 1]) {
      if (added >= config.maxWallPlants) break;
      const p = localToSettlement([side * (f.width / 2 + 0.65), (random(...f.offset) - 0.5) * f.depth * 0.65], f.offset, f.heading);
      if (!clearance(p, 0.22) || traffic(p) > 0.2 || definition.groundAreas?.some((a) =>
        footprintDistance(p, {offset:a.offset,width:a.widthMeters,depth:a.depthMeters,heading:a.headingRadians??0}) < 0.5)) continue;
      added++;
      scenery.push({...plant, offset:p, scale:0.65 + random(...p) * 0.3, headingRadians:random(p[1],p[0]) * Math.PI * 2} satisfies SceneryPlacement);
    }
  }
  return { seed, random, contacts, entrances, scenery, roadDistance, entranceWear, traffic, clearance };
}
