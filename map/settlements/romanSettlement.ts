import { selectRomanVariants, romanVariantIds } from "@/map/settlements/romanVariation";
import type { AssetId } from "@/lib/assets/registry";
import { GLOBE_RADIUS_METERS } from "@/lib/geo";
import type { ContextGroundSpec } from "@/map/settlements/groundMask";

export type Coordinate = readonly [longitude: number, latitude: number];
/** Local X east, Z south, in metres, matching geographicAnchor. */
export type LocalPoint = readonly [east: number, south: number];
export interface SceneryPlacement {
  assetId: AssetId;
  offset: LocalPoint;
  scale?: number;
  headingRadians?: number;
  /** Optional footprint guard for rigid props; metres of displayed terrain rise. */
  maxGroundRiseMeters?: number;
  /** Descriptive tags for future placement rules; no biome/culture inference runs here. */
  tags?: readonly string[];
}
export interface GroundArea {
  id: string;
  kind: "courtyard" | "garden" | "field";
  offset: LocalPoint;
  widthMeters: number;
  depthMeters: number;
  headingRadians?: number;
}
export interface SettlementDefinition {
  /** Existing fixture villagers are opt-out; imported historical layouts disable them. */
  ambientLife?: false;
  profile?: "hamlet" | "village" | "small-town";
  /** Explicit square treatment/receiver size for expanded procedural sites. */
  groundSizeMeters?: number;
  id: string;
  seed?: number;
  origin: Coordinate;
  buildings: readonly {
    id: string;
    assetId: AssetId;
    offset: LocalPoint;
    headingRadians?: number;
  }[];
  roads: readonly { id: string; widthMeters: number; points: readonly LocalPoint[]; accessTo?: string }[];
  scenery?: readonly SceneryPlacement[];
  groundAreas?: readonly GroundArea[];
  /** Lit, textured local ground and river surface in place of the translucent settlement treatment. */
  contextGround?: ContextGroundSpec;
  /** Shared orthogonal road union frame; roads remain in settlement metre coordinates. */
  roadFrameHeadingRadians?: number;
  maxFoundationRiseMeters: number;
}

/** Small-site tangent approximation, not a coordinate system for regional routes. */
export function offsetCoordinate(origin: Coordinate, [east, south]: LocalPoint): Coordinate {
  const degreesPerMeter = 180 / (Math.PI * GLOBE_RADIUS_METERS);
  const cosine = Math.cos(origin[1] * Math.PI / 180);
  if (Math.abs(cosine) < 0.01) throw new Error("Settlement offsets are unsupported near the poles.");
  return [((origin[0] + east * degreesPerMeter / cosine + 540) % 360) - 180,
    origin[1] - south * degreesPerMeter];
}

// Authored clump shape and patch sizes, expanded once into ordinary fixture data.
// Uneven density and rotated shapes replace the old 4 × 3 planted grids.
const tuftOffsets: readonly LocalPoint[] = [
  [0, 0], [-0.7, 0.3], [0.4, -0.6], [0.9, 0.5], [-0.3, 1.1], [-1.2, -0.5],
  [1.4, -0.3], [-0.9, 1.5], [0.7, 1.4], [-1.7, 0.6], [0.1, -1.4], [1.9, 0.9],
  [-1.5, -1.3], [1.2, -1.7], [-0.3, 2.1], [2.3, -0.8], [-2.1, 1.8], [0.6, 2.6],
  [-2.6, -0.2], [2.1, 2.2], [-1.4, 2.7],
];
const grassPatches = [
  { center: [-20, -23], count: 18, spread: 1.05, angle: 0.3 },
  { center: [18, -27], count: 8, spread: 0.85, angle: 1.8 },
  { center: [-19, 1], count: 16, spread: 1.2, angle: 2.5 },
  { center: [20, 9], count: 7, spread: 0.9, angle: 0.7 },
  { center: [-19, 22], count: 21, spread: 1.1, angle: 1.3 },
  { center: [22, 27], count: 12, spread: 1.05, angle: 3.5 },
  { center: [-24, -11], count: 9, spread: 0.9, angle: 4.1 },
  { center: [24, -6], count: 5, spread: 1.2, angle: 2.2 },
] as const;

// Generic prototype near Rome; no claim to reconstruct a real site or period.
const baseSettlement: SettlementDefinition = {
  id: "roman-layout-prototype",
  origin: [12.55, 41.85],
  maxFoundationRiseMeters: 3,
  buildings: [
    { id: "villa-west-1", assetId: "roman-villa-01", offset: [-11, -22], headingRadians: Math.PI / 2 },
    { id: "villa-west-2", assetId: "roman-villa-01", offset: [-9, -7], headingRadians: Math.PI / 2 },
    { id: "villa-west-3", assetId: "roman-farmhouse-01", offset: [-12, 10], headingRadians: Math.PI },
    { id: "villa-east-1", assetId: "roman-villa-01", offset: [11, -18], headingRadians: -Math.PI / 2 },
    { id: "villa-east-2", assetId: "roman-taberna-01", offset: [12, -1], headingRadians: -Math.PI / 2 },
    { id: "temple", assetId: "roman-temple-01", offset: [9, 16], headingRadians: -Math.PI / 2 },
    { id: "aqueduct", assetId: "roman-aqueduct-01", offset: [0, 31] },
  ],
  groundAreas: [
    { id: "gathering-court", kind: "courtyard", offset: [6.5, 7], widthMeters: 8, depthMeters: 7 },
    { id: "storage-yard", kind: "courtyard", offset: [-7, -16.5], widthMeters: 6, depthMeters: 4 },
    { id: "west-garden", kind: "garden", offset: [-14, -14], widthMeters: 7, depthMeters: 5 },
    { id: "east-garden", kind: "garden", offset: [20, -12], widthMeters: 8, depthMeters: 5 },
    { id: "north-field", kind: "field", offset: [-23, -40], widthMeters: 20, depthMeters: 11, headingRadians: -0.12 },
    { id: "south-field", kind: "field", offset: [26, 40], widthMeters: 18, depthMeters: 10, headingRadians: 0.15 },
  ],
  scenery: [
    ...([[-20,-24], [-23,-17], [22,-2], [19,5], [-20,23], [22,29]] as const).map((offset, i) => ({ assetId: "environment-olive-tree-01" as const, offset, scale: 0.85 + i % 3 * 0.12, headingRadians: i * 1.7, tags: ["mediterranean", "tree"] })),
    ...([[-18,-32], [-22,-29], [18,27], [24,21]] as const).map((offset, i) => ({ assetId: "environment-italian-cypress-01" as const, offset, scale: 0.85 + i % 3 * 0.1, tags: ["mediterranean", "tree"] })),
    ...([[-19,-20], [-22,-22], [-17,-15], [-23,-13], [-19,-1], [-21,2], [-17,4],
      [21,-4], [24,-1], [18,7], [22,9], [-17,20], [-22,23], [-18,26],
      [20,25], [24,28], [17,-28], [19,-30]] as const).map((offset, i) => ({ assetId: "environment-mediterranean-shrub-01" as const, offset, scale: 0.7 + i % 4 * 0.18, headingRadians: i * 2.3, tags: ["mediterranean", "understory"] })),
    ...([[-23,-20], [-22,-19], [-24,-18], [19,-29], [20,-30], [-19,5], [-20,6],
      [22,10], [23,11], [-23,25], [-22,26], [-24,24], [24,28], [25,27],
      [26,-1], [-25,-8], [-24,-9]] as const).map((offset, i) => ({ assetId: "environment-limestone-rock-01" as const, offset, scale: 0.45 + i % 4 * 0.22, headingRadians: i * 2.1 })),
    ...grassPatches.flatMap(({ center: [x,z], count, spread, angle }, cluster) =>
      tuftOffsets.slice(0, count).map(([dx,dz], i) => ({ assetId: "environment-dry-grass-tuft-01" as const,
        offset: [x + spread * (dx * Math.cos(angle) - dz * Math.sin(angle)),
          z + spread * (dx * Math.sin(angle) + dz * Math.cos(angle))] as LocalPoint,
        scale: 0.65 + (i * 7 + cluster * 3) % 9 * 0.095, headingRadians: i * 2.4 + angle, tags: ["dry-grass", "ground-cover"] }))),
    // Centre: storage and a sheltered gathering place, with open pedestrian gaps.
    { assetId: "roman-market-awning-01", maxGroundRiseMeters: 0.45, offset: [8,7.5] },
    { assetId: "roman-market-awning-01", maxGroundRiseMeters: 0.45, offset: [5.8,-18], scale: 0.7, headingRadians: Math.PI / 2 },
    ...([[-8,-16.7], [-7,-17.1], [9.2,6]] as const).map((offset, i) => ({assetId: "roman-wine-barrel-01" as const, offset, scale: 0.8 + i * 0.07})),
    ...([[-8.8,-16], [-7.8,-15.8], [9.4,8.6]] as const).map((offset) => ({assetId: "environment-wooden-crate-01" as const, maxGroundRiseMeters: 0.25, offset})),
    ...([[-6.4,-16.8], [-6.9,-16.5], [6.1,9.5], [9.2,5.5]] as const).map((offset, i) => ({assetId: "roman-amphora-01" as const, offset, scale: 0.6 + i % 3 * 0.1})),
    { assetId: "roman-stone-bench-01", offset: [4.5,9.5], headingRadians: Math.PI / 2 },
    { assetId: "roman-stone-bench-01", offset: [-5,19], headingRadians: -Math.PI / 2 },
    // Low modules follow short local terrain spans; leave gardens/court entrances open.
    ...([-16.5,-14.7,-12.9].flatMap((x) => [-17,-11].map((z) => ({assetId: "environment-low-stone-boundary-01" as const, maxGroundRiseMeters: 0.35, offset: [x,z] as LocalPoint})))),
    ...([16.8,18.6,20.4,22.2].map((x) => ({assetId: "environment-low-stone-boundary-01" as const, maxGroundRiseMeters: 0.35, offset: [x,-15] as LocalPoint}))),
    ...([4.3,6.1,7.9,9.7].map((x) => ({assetId: "environment-low-stone-boundary-01" as const, maxGroundRiseMeters: 0.35, offset: [x,11] as LocalPoint}))),
    ...([[-15,-22], [-15,-20.2], [-15,-18.4], [15.5,-18], [15.5,-16.2]] as const).map((offset) => ({assetId: "environment-low-stone-boundary-01" as const, maxGroundRiseMeters: 0.35, offset, headingRadians: Math.PI / 2})),
    // Generic leafy plants and grain, authored plot rows; no species/date claim.
    ...[{x:-16.3,z:-15.7,columns:6,rows:4}, {x:17.3,z:-13.8,columns:7,rows:4}].flatMap((plot) =>
      Array.from({length:plot.columns*plot.rows}, (_,i) => ({assetId:"environment-garden-plant-01" as const,
        offset:[plot.x+i%plot.columns*0.9,plot.z+Math.floor(i/plot.columns)*1.1] as LocalPoint,
        scale:0.58+i%4*0.06,headingRadians:i*2.4,tags:["cultivated", "garden"]}))),
    ...[{x:-23,z:-40,columns:14,rows:7,angle:-0.12}, {x:26,z:40,columns:13,rows:6,angle:0.15}].flatMap((plot) =>
      Array.from({length:plot.columns*plot.rows}, (_,i) => {
        const dx=(i%plot.columns-(plot.columns-1)/2)*1.25+Math.sin(i*2.3)*0.13;
        const dz=(Math.floor(i/plot.columns)-(plot.rows-1)/2)*1.1+Math.cos(i*1.7)*0.1;
        return {assetId:"environment-grain-clump-01" as const,
          offset:[plot.x+dx*Math.cos(plot.angle)+dz*Math.sin(plot.angle),plot.z-dx*Math.sin(plot.angle)+dz*Math.cos(plot.angle)] as LocalPoint,
          scale:0.85+i%5*0.04,headingRadians:i*1.7,tags:["cultivated", "field"]};
      })),
    // Countryside clumps and broken field margins; the centre stays open.
    ...([[-33,-29],[-29,-25],[-35,-21],[-30,-17],[30,18],[34,22],[31,26],[37,30]] as const).map((offset,i)=>({assetId:"environment-olive-tree-01" as const,offset,scale:0.8+i%3*0.13,headingRadians:i*2.4,tags:["tree","countryside"]})),
    ...([[-31,-32],[-28,-32],[-24,-33],[-19,-32],[-33,-24],[-32,-19],[-28,-18],
      [20,33],[23,33],[28,33],[32,34],[35,26],[32,21],[29,19]] as const).map((offset,i)=>({assetId:"environment-mediterranean-shrub-01" as const,offset,scale:0.8+i%4*0.13,tags:["countryside"]})),
    ...([[-30,-25],[-33,-19],[31,22],[35,28]] as const).flatMap(([x,z],patch)=>tuftOffsets.map(([dx,dz],i)=>({assetId:"environment-dry-grass-tuft-01" as const,offset:[x+dx*1.5,z+dz*1.4] as LocalPoint,scale:0.7+i%5*0.12,headingRadians:patch+i*2.4,tags:["ground-cover","countryside"]}))),
  ],
  roads: [
    { id: "main-road", widthMeters: 4, points: [[0, -34], [0, 24]] },
    { id: "north-west-path", widthMeters: 1.6, points: [[-2, -22], [-7.6, -22]], accessTo: "villa-west-1" },
    { id: "north-east-path", widthMeters: 1.6, points: [[2, -18], [7.6, -18]], accessTo: "villa-east-1" },
    { id: "middle-west-path", widthMeters: 1.6, points: [[-2, -7], [-5.6, -7]], accessTo: "villa-west-2" },
    { id: "middle-east-path", widthMeters: 1.6, points: [[2, -1], [8.6, -1]], accessTo: "villa-east-2" },
    { id: "temple-path", widthMeters: 1.6, points: [[2, 16], [5.0, 16]], accessTo: "temple" },
    { id: "south-path", widthMeters: 1.6, points: [[-2, 1.5], [-12, 1.5], [-12, 6.1]], accessTo: "villa-west-3" },
    { id: "aqueduct-path", widthMeters: 1.6, points: [[0, 24], [0, 30]], accessTo: "aqueduct" },
    { id: "court-path", widthMeters: 1.8, points: [[2, 7], [6, 7]] },
    { id: "west-garden-path", widthMeters: 1.1, points: [[-2, -13.5], [-10.5, -13.5]] },
    { id: "east-garden-path", widthMeters: 1.1, points: [[2, -7.5], [19, -7.5], [19, -9.5]] },
    { id: "north-field-path", widthMeters: 1.2, points: [[0, -32], [-10, -32], [-10, -38], [-12.5, -38]] },
    { id: "south-field-path", widthMeters: 1.2, points: [[0, 24], [9, 24], [9, 39], [16, 39]] },
  ],
};
export const ROMAN_SETTLEMENT_ALTERNATE: Coordinate = [12.5515, 41.851];

/** Existing plots/roads/headings and landmarks are retained; only ordinary assets change. */
export function createRomanSettlement(seed = 20261028): SettlementDefinition {
  const selected = selectRomanVariants(seed, ["house", "house", "farmhouse", "house", "workshop"]);
  return { ...baseSettlement, seed, buildings: baseSettlement.buildings.map((building, i) =>
    i < selected.length ? { ...building, assetId: selected[i] } : building) };
}
export const ROMAN_SETTLEMENT = createRomanSettlement();
export const ROMAN_SETTLEMENT_BASELINE = baseSettlement;

/** Review fixture: twelve distinct buildings plus repeated houses, using ordinary terrain placement. */
export const ROMAN_VARIATION_PREVIEW: SettlementDefinition = {
  id: "roman-variation-review", origin: baseSettlement.origin, maxFoundationRiseMeters: 3,
  buildings: [...romanVariantIds, ...romanVariantIds.slice(0, 3)].map((assetId, i) => ({
    id: `variant-${i}`, assetId, offset: [(i % 5 - 2) * 12, (Math.floor(i / 5) - 1) * 14] as LocalPoint,
  })),
  roads: [-7, 7, 21].map((z, i) => ({ id: `review-street-${i}`, widthMeters: 2, points: [[-30,z],[30,z]] as LocalPoint[] })),
};
