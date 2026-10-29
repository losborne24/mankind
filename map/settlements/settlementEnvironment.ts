import { assetRegistry, type AssetDefinition } from "@/lib/assets/registry";
import type { GroundArea, LocalPoint, SceneryPlacement, SettlementDefinition } from "@/map/settlements/romanSettlement";
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

/** Local layout candidates for procedural scenes, using the same clearance, traffic and seeded samples. */
export function populateSettlementEnvironment(definition: SettlementDefinition, extent: number, profile?: { vegetation: number; farmland: number }) {
  const environment = createSettlementEnvironment(definition);
  const areas: GroundArea[] = [...definition.groundAreas ?? []];
  const scenery: NonNullable<SettlementDefinition["scenery"]>[number][] = [];
  // Small safe cultivated patches outside the street. All cells/props use shared clearance.
  const safe = (p: LocalPoint, radius: number) => environment.clearance(p, radius) && areas.every((a) => footprintDistance(p, {offset:a.offset,width:a.widthMeters,depth:a.depthMeters,heading:a.headingRadians??0}) > radius + 0.3);
  for (let i = 0; i < (profile ? 32 : 12); i++) {
    const p: LocalPoint = [(environment.random(i, 5) - 0.5) * extent * 0.9, (environment.random(i, 9) - 0.5) * extent * 0.9];
    if (!safe(p, 4.5)) continue;
    const kind = (profile ? Math.hypot(...p) > extent * 0.32 : i % 2) ? "field" : "garden";
    areas.push({id: `cultivated-${i}`, kind, offset:p, widthMeters:6, depthMeters:5});
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) scenery.push({assetId:kind === "garden" ? "environment-garden-plant-01" : "environment-grain-clump-01", offset:[p[0]+x,p[1]+z], scale:0.65, tags:["cultivated",kind]});
    if (areas.filter(a=>a.kind!=="courtyard").length === (profile?.farmland ?? 3)) break;
  }
  if (profile) {
    // A few useful boundaries and storage details, all outside the clear shared spaces.
    for (const area of areas) {
      const candidates: SceneryPlacement[] = area.kind === "courtyard"
        ? [{assetId:"roman-stone-bench-01",offset:localToSettlement([area.widthMeters/2+2.3,0],area.offset,area.headingRadians??0),scale:0.75,headingRadians:(area.headingRadians??0)+Math.PI/2}]
        : [{assetId:"environment-low-stone-boundary-01",offset:[area.offset[0],area.offset[1]+area.depthMeters/2+1.7],scale:0.85,maxGroundRiseMeters:0.35},
           {assetId:"roman-wine-barrel-01",offset:[area.offset[0]+area.widthMeters/2+1.5,area.offset[1]],scale:0.75}];
      for (const prop of candidates) {
        const size=assetRegistry[prop.assetId].dimensionsMeters, radius=Math.max(size[0],size[2])*(prop.scale??1)/2;
        if(safe(prop.offset,radius)) scenery.push(prop);
      }
    }
  }
  for (let i = 0; i < (profile?.vegetation ?? 160); i++) {
    const p: LocalPoint = [(environment.random(i, 11) - 0.5) * extent, (environment.random(i, 17) - 0.5) * extent];
    const assetId = i % 13 === 0 ? "environment-olive-tree-01" : i % 7 === 0 ? "environment-mediterranean-shrub-01" : i % 11 === 0 ? "environment-limestone-rock-01" : "environment-dry-grass-tuft-01";
    const asset = assetRegistry[assetId], scale = 0.65 + environment.random(i, 21) * 0.3;
    const radius = Math.max(asset.dimensionsMeters[0],asset.dimensionsMeters[2]) * scale / 2;
    if (profile && Math.hypot(...p) < extent * 0.2) continue;
    if (!safe(p,radius) || scenery.some((s) => Math.hypot(s.offset[0]-p[0],s.offset[1]-p[1]) < radius + Math.max(assetRegistry[s.assetId].dimensionsMeters[0],assetRegistry[s.assetId].dimensionsMeters[2]) * (s.scale ?? 1) / 2 + 0.2)) continue;
    scenery.push({assetId,offset:p,scale,headingRadians:environment.random(i, 25)*Math.PI*2,tags:assetId.includes("grass") ? ["ground-cover"] : assetId.includes("tree") ? ["tree"] : []});
  }
  definition.groundAreas = areas; definition.scenery = scenery;
}
