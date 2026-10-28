import type { AssetId } from "@/lib/assets/registry";
import { GLOBE_RADIUS_METERS } from "@/lib/geo";

export type Coordinate = readonly [longitude: number, latitude: number];
/** Local X east, Z south, in metres, matching geographicAnchor. */
export type LocalPoint = readonly [east: number, south: number];
export interface SceneryPlacement {
  assetId: AssetId;
  offset: LocalPoint;
  scale?: number;
  headingRadians?: number;
  /** Descriptive tags for future placement rules; no biome/culture inference runs here. */
  tags?: readonly string[];
}
export interface SettlementDefinition {
  id: string;
  origin: Coordinate;
  buildings: readonly {
    id: string;
    assetId: AssetId;
    offset: LocalPoint;
    headingRadians?: number;
  }[];
  roads: readonly { id: string; widthMeters: number; points: readonly LocalPoint[]; accessTo?: string }[];
  scenery?: readonly SceneryPlacement[];
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

// Generic prototype near Rome; no claim to reconstruct a real site or period.
export const ROMAN_SETTLEMENT: SettlementDefinition = {
  id: "roman-layout-prototype",
  origin: [12.55, 41.85],
  maxFoundationRiseMeters: 3,
  buildings: [
    { id: "villa-west-1", assetId: "roman-villa-01", offset: [-10, -20], headingRadians: Math.PI / 2 },
    { id: "villa-west-2", assetId: "roman-villa-01", offset: [-10, -6], headingRadians: Math.PI / 2 },
    { id: "villa-west-3", assetId: "roman-villa-01", offset: [-10, 10], headingRadians: Math.PI / 2 },
    { id: "villa-east-1", assetId: "roman-villa-01", offset: [10, -20], headingRadians: -Math.PI / 2 },
    { id: "villa-east-2", assetId: "roman-villa-01", offset: [10, -6], headingRadians: -Math.PI / 2 },
    { id: "temple", assetId: "roman-temple-01", offset: [10, 12], headingRadians: -Math.PI / 2 },
    { id: "aqueduct", assetId: "roman-aqueduct-01", offset: [0, 28] },
  ],
  scenery: [
    ...([[-20,-27], [21,-24], [-22,-1], [23,4], [-20,24], [20,29]] as const).map((offset, i) => ({ assetId: "environment-olive-tree-01" as const, offset, scale: 0.85 + i % 3 * 0.12, headingRadians: i * 1.7, tags: ["mediterranean", "tree"] })),
    ...([[-17,-34], [17,-34], [-18,32], [18,32]] as const).map((offset) => ({ assetId: "environment-italian-cypress-01" as const, offset, tags: ["mediterranean", "tree"] })),
    ...([[-16,-14], [-16,3], [17,-13], [17,0], [-16,18], [17,21], [-23,12], [24,-10]] as const).map((offset, i) => ({ assetId: "environment-mediterranean-shrub-01" as const, offset, scale: 0.8 + i % 3 * 0.2, tags: ["mediterranean", "understory"] })),
    ...([[-23,-20], [23,-31], [-19,5], [21,18], [-23,31], [26,-1], [-25,-8]] as const).map((offset, i) => ({ assetId: "environment-limestone-rock-01" as const, offset, scale: 0.6 + i % 3 * 0.25, headingRadians: i * 2.1 })),
    // Fixed planted clusters, not a runtime scatter generator. Keep roads/footprints clear.
    ...([[-18,-22], [19,-18], [-19,1], [20,10], [-19,21], [21,26], [-25,-12], [25,-7]] as const).flatMap(([x,z], cluster) =>
      Array.from({length: 12}, (_, i) => ({ assetId: "environment-dry-grass-tuft-01" as const,
        offset: [x + (i % 4) * 0.65, z + Math.floor(i / 4) * 0.7] as LocalPoint,
        scale: 0.8 + (i + cluster) % 4 * 0.13, headingRadians: i * 2.4, tags: ["dry-grass", "ground-cover"] }))),
    { assetId: "roman-amphora-01", offset: [-6.0,-16.5], scale: 0.75 },
    { assetId: "roman-amphora-01", offset: [-6.7,-16.2], scale: 0.62 },
    { assetId: "roman-amphora-01", offset: [6.0,-2.5], scale: 0.8 },
    { assetId: "roman-stone-bench-01", offset: [4,5], headingRadians: Math.PI / 2 },
    { assetId: "roman-stone-bench-01", offset: [-4,18], headingRadians: -Math.PI / 2 },
  ],
  roads: [
    { id: "main-road", widthMeters: 4, points: [[0, -32], [0, 21]] },
    { id: "north-west-path", widthMeters: 1.6, points: [[-2, -20], [-6.5, -20]], accessTo: "villa-west-1" },
    { id: "north-east-path", widthMeters: 1.6, points: [[2, -20], [6.5, -20]], accessTo: "villa-east-1" },
    { id: "middle-west-path", widthMeters: 1.6, points: [[-2, -6], [-6.5, -6]], accessTo: "villa-west-2" },
    { id: "middle-east-path", widthMeters: 1.6, points: [[2, -6], [6.5, -6]], accessTo: "villa-east-2" },
    { id: "temple-path", widthMeters: 1.6, points: [[2, 12], [5.8, 12]], accessTo: "temple" },
    { id: "south-path", widthMeters: 1.6, points: [[-2, 10], [-6.5, 10]], accessTo: "villa-west-3" },
    { id: "aqueduct-path", widthMeters: 1.6, points: [[0, 21], [0, 27]], accessTo: "aqueduct" },
  ],
};
export const ROMAN_SETTLEMENT_ALTERNATE: Coordinate = [12.5515, 41.851];
