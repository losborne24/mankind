import type { AssetId } from "@/lib/assets/registry";
import { GLOBE_RADIUS_METERS } from "@/lib/geo";

export type Coordinate = readonly [longitude: number, latitude: number];
/** Local X east, Z south, in metres, matching geographicAnchor. */
export type LocalPoint = readonly [east: number, south: number];
export interface SettlementDefinition {
  id: string;
  origin: Coordinate;
  buildings: readonly {
    id: string;
    assetId: AssetId;
    offset: LocalPoint;
    headingRadians?: number;
  }[];
  roads: readonly { id: string; widthMeters: number; points: readonly LocalPoint[] }[];
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
  roads: [
    { id: "main-road", widthMeters: 4, points: [[0, -32], [0, 21]] },
    { id: "north-path", widthMeters: 1.6, points: [[-6.7, -20], [0, -20], [6.7, -20]] },
    { id: "middle-path", widthMeters: 1.6, points: [[-6.7, -6], [0, -6], [6.7, -6]] },
    { id: "temple-path", widthMeters: 1.6, points: [[0, 12], [5.8, 12]] },
    { id: "south-path", widthMeters: 1.6, points: [[-6.7, 10], [0, 10]] },
    { id: "aqueduct-path", widthMeters: 1.6, points: [[0, 21], [0, 27]] },
  ],
};
export const ROMAN_SETTLEMENT_ALTERNATE: Coordinate = [12.5515, 41.851];
