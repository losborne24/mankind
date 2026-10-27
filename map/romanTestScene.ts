import { type AssetId } from "@/lib/assets/registry";

export interface AssetPlacement {
  id: string;
  assetId: AssetId;
  lngLat: readonly [number, number];
  rotationRadians?: number;
}

/** Integration fixtures only. These buildings make no historical claim about Giza. */
export const ROMAN_TEST_CENTER = [31.138, 29.9795] as const;
export const ROMAN_TEST_PLACEMENTS: readonly AssetPlacement[] = [
  { id: "test-villa", assetId: "roman-villa-01", lngLat: [31.13787, 29.97945] },
  { id: "test-temple", assetId: "roman-temple-01", lngLat: [31.13805, 29.97945] },
  { id: "test-aqueduct", assetId: "roman-aqueduct-01", lngLat: [31.138, 29.97962], rotationRadians: Math.PI / 2 },
];

export { prepareAsset } from "@/lib/assets/prepareAsset";
