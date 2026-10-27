/** Asset descriptions have no knowledge of dates, settlements or placements. */
export interface AssetDefinition {
  id: string;
  path: string;
  category: "building" | "infrastructure" | "prop";
  /** Authored units → metres. Optional dimensions are [X width, Y height, Z depth]. */
  scale: number;
  dimensionsMeters?: readonly [number, number, number];
  groundOffsetMeters: number;
  orientationRadians?: readonly [number, number, number];
  source: { author: string; url: string; licence: string; licenceFile: string };
}

const source = {
  author: "reodesuxz",
  url: "https://reodesuxz.itch.io/low-poly-roman-town-pack",
  licence: "Personal/commercial project use; no standalone redistribution, sublicensing or AI training. Attribution optional.",
  licenceFile: "roman/LICENSE.txt",
};

export const assetRegistry = {
  "roman-villa-01": {
    id: "roman-villa-01", path: "roman/buildings/villa.glb", category: "building",
    scale: 1, dimensionsMeters: [6, 4.4, 6.6], groundOffsetMeters: 0, source,
  },
  "roman-temple-01": {
    id: "roman-temple-01", path: "roman/buildings/temple_small.glb", category: "building",
    scale: 1, dimensionsMeters: [7.6, 5.6, 8], groundOffsetMeters: 0, source,
  },
  "roman-aqueduct-01": {
    id: "roman-aqueduct-01", path: "roman/buildings/aqueduct_double.glb", category: "infrastructure",
    scale: 1, dimensionsMeters: [8, 9.075, 1.6], groundOffsetMeters: 0, source,
  },
} as const satisfies Record<string, AssetDefinition>;

export type AssetId = keyof typeof assetRegistry;
export const ASSET_BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "/assets";
export function assetUrl(path: string, base = ASSET_BASE_URL): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
