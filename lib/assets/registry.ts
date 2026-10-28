/** Asset descriptions have no knowledge of dates, settlements or placements. */
export interface AssetDefinition {
  id: string;
  path: string;
  category: "building" | "infrastructure" | "prop" | "vegetation" | "rock";
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

const environmentSource = {
  author: "Living Historical World project",
  url: "scripts/build-settlement-environment.mjs",
  licence: "Project-authored prototype geometry; no third-party mesh or texture content. Repository terms apply.",
  licenceFile: "environment/PROVENANCE.md",
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
  "environment-olive-tree-01": {
    id: "environment-olive-tree-01", path: "environment/olive-tree.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [6.547479, 5.871904, 6.406991], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-italian-cypress-01": {
    id: "environment-italian-cypress-01", path: "environment/italian-cypress.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [2.416225, 8.025345, 2.408554], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-mediterranean-shrub-01": {
    id: "environment-mediterranean-shrub-01", path: "environment/mediterranean-shrub.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [1.641835, 0.906958, 1.565674], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-limestone-rock-01": {
    id: "environment-limestone-rock-01", path: "environment/limestone-rock.glb", category: "rock",
    scale: 1, dimensionsMeters: [1.878645, 0.860655, 1.217526], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-dry-grass-tuft-01": {
    id: "environment-dry-grass-tuft-01", path: "environment/dry-grass-tuft.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [0.429601, 0.475204, 0.433412], groundOffsetMeters: 0, source: environmentSource,
  },
  "roman-amphora-01": {
    id: "roman-amphora-01", path: "roman/props/amphora.glb", category: "prop",
    scale: 1, dimensionsMeters: [1.0, 1.3, 0.66574], groundOffsetMeters: 0, source,
  },
  "roman-stone-bench-01": {
    id: "roman-stone-bench-01", path: "roman/props/stone_bench.glb", category: "prop",
    scale: 1, dimensionsMeters: [1.8, 0.58, 0.5], groundOffsetMeters: 0, source,
  },
} as const satisfies Record<string, AssetDefinition>;

export type AssetId = keyof typeof assetRegistry;
export const ASSET_BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "/assets";
export function assetUrl(path: string, base = ASSET_BASE_URL): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
