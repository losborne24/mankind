import { romanGrounding } from "@/lib/assets/romanGrounding";
import { romanVariants } from "@/lib/assets/romanVariants";

/** Asset descriptions have no knowledge of dates, settlements or placements. */
export interface AssetDefinition {
  id: string;
  path: string;
  /** Prebuilt node in a shared GLB library. */
  nodeName?: string;
  category: "building" | "infrastructure" | "prop" | "vegetation" | "rock" | "character";
  /** Authored units → metres. Optional dimensions are [X width, Y height, Z depth]. */
  scale: number;
  dimensionsMeters?: readonly [number, number, number];
  groundOffsetMeters: number;
  /** Authored ground contacts and entrance, in the prepared/centred metre frame. */
  grounding?: {
    contacts: readonly { offset: readonly [number, number]; width: number; depth: number; base?: number }[];
    entrance: readonly [number, number] | null;
  };
  orientationRadians?: readonly [number, number, number];
  source: { author: string; url: string; licence: string; licenceFile: string };
}

const source = {
  author: "Mankind project",
  url: "scripts/roman-kit/generate.py",
  licence: "Project-authored geometry and textures; repository terms apply.",
  licenceFile: "roman-kit/PROVENANCE.md",
};

const environmentSource = {
  author: "Living Historical World project",
  url: "scripts/build-settlement-environment.mjs",
  licence: "Project-authored prototype geometry; no third-party mesh or texture content. Repository terms apply.",
  licenceFile: "environment/PROVENANCE.md",
};

const variantAssets = Object.fromEntries(Object.entries(romanVariants).map(([name, variant]) => [
  `roman-${name}`, { id: `roman-${name}`, path: "roman-kit/residential-variants.glb", nodeName: name,
    category: "building" as const, scale: 1, dimensionsMeters: variant.dimensionsMeters,
    groundOffsetMeters: 0, grounding: romanGrounding[name as keyof typeof romanGrounding], source },
])) as unknown as { [K in keyof typeof romanVariants as `roman-${K}`]: AssetDefinition & { dimensionsMeters: readonly [number, number, number] } };

export const assetRegistry = {
  "roman-villager-01": {
    id: "roman-villager-01", path: "characters/roman-villager.glb", category: "character",
    scale: 1, dimensionsMeters: [0.67, 1.783, 0.35], groundOffsetMeters: 0,
    source: { author: "Mankind project", url: "scripts/ambient-life/generate.py", licence: "Project-authored; repository terms apply.", licenceFile: "characters/PROVENANCE.md" },
  },
  ...variantAssets,
  "roman-taberna-01": {
    id: "roman-taberna-01", path: "roman-kit/taberna.glb", category: "building",
    scale: 1, dimensionsMeters: [6.039, 4.16, 6.425], groundOffsetMeters: 0, grounding: romanGrounding["taberna"], source,
  },
  "roman-farmhouse-01": {
    id: "roman-farmhouse-01", path: "roman-kit/farmhouse.glb", category: "building",
    scale: 1, dimensionsMeters: [8.190742, 4.75, 7.395], groundOffsetMeters: 0, grounding: romanGrounding["farmhouse"], source,
  },
  "roman-villa-01": {
    id: "roman-villa-01", path: "roman-kit/provincial-house.glb", category: "building",
    scale: 1, dimensionsMeters: [5.989207, 4.33, 6.352367], groundOffsetMeters: 0, grounding: romanGrounding["provincial-house"], source,
  },
  "roman-temple-01": {
    id: "roman-temple-01", path: "roman-kit/small-temple.glb", category: "building",
    scale: 1, dimensionsMeters: [7.48, 5.61, 7.6], groundOffsetMeters: 0, grounding: romanGrounding["small-temple"], source,
  },
  "roman-aqueduct-01": {
    id: "roman-aqueduct-01", path: "roman-kit/aqueduct-section.glb", category: "infrastructure",
    scale: 1, dimensionsMeters: [8.13, 8.7935, 1.72], groundOffsetMeters: 0, grounding: romanGrounding["aqueduct-section"], source,
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
  "environment-low-stone-boundary-01": {
    id: "environment-low-stone-boundary-01", path: "environment/low-stone-boundary.glb", category: "prop",
    scale: 1, dimensionsMeters: [1.799475, 0.53842, 0.470937], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-wooden-crate-01": {
    id: "environment-wooden-crate-01", path: "environment/wooden-crate.glb", category: "prop",
    scale: 1, dimensionsMeters: [0.9, 0.7, 0.805], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-garden-plant-01": {
    id: "environment-garden-plant-01", path: "environment/garden-plant.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [0.752882, 0.532974, 0.558861], groundOffsetMeters: 0, source: environmentSource,
  },
  "environment-grain-clump-01": {
    id: "environment-grain-clump-01", path: "environment/grain-clump.glb", category: "vegetation",
    scale: 1, dimensionsMeters: [0.626516, 1.0661, 0.527335], groundOffsetMeters: 0, source: environmentSource,
  },
  "roman-wine-barrel-01": {
    id: "roman-wine-barrel-01", path: "roman-kit/wine-barrel.glb", category: "prop",
    scale: 1, dimensionsMeters: [0.899964, 0.8, 0.897], groundOffsetMeters: 0, source,
  },
  "roman-market-awning-01": {
    id: "roman-market-awning-01", path: "roman-kit/market-awning.glb", category: "prop",
    scale: 1, dimensionsMeters: [2.6, 2.18, 1.818], groundOffsetMeters: 0, source,
  },
  "roman-amphora-01": {
    id: "roman-amphora-01", path: "roman-kit/amphora.glb", category: "prop",
    scale: 1, dimensionsMeters: [0.6625, 1.0, 0.55], groundOffsetMeters: 0, source,
  },
  "roman-stone-bench-01": {
    id: "roman-stone-bench-01", path: "roman-kit/stone-bench.glb", category: "prop",
    scale: 1, dimensionsMeters: [1.8, 0.58, 0.5], groundOffsetMeters: 0, source,
  },
} as const satisfies Record<string, AssetDefinition>;

export type AssetId = keyof typeof assetRegistry;
export const ASSET_BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "/assets";
export function assetUrl(path: string, base = ASSET_BASE_URL): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
