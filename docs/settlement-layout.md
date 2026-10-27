# Reusable Roman settlement layout

Choose **Debug tools → Roman settlement layout → Visit settlement**. The layout
is a generic prototype near Rome at [12.55, 41.85], not an archaeological
reconstruction. It contains five villas, one temple and one aqueduct, using only
the three previously imported GLBs. The main road is 4 m wide and smaller paths
are 1.6 m wide. The layout covers roughly 30 × 65 metres.

**Relocate nearby** alternates between the original location and
[12.5515, 41.851]. The **Settlement scene** checkbox unloads/reloads it. Errors
include a Retry button. **Visit Roman test** still visits the independent
three-model integration fixture near Giza. Both scenes share the GLB cache.
The debug panel scrolls when its controls exceed the available screen height.

## Definition and assembler

`map/settlements/romanSettlement.ts` defines `SettlementDefinition` and the
prototype data. A definition includes an ID, geographic origin, building asset
IDs/local offsets/headings, road polylines/widths and a foundation height limit.
Offsets are `[east, south]` in metres; heading rotates around +Y. Scale,
orientation corrections, filenames and licensing remain in the asset registry.

```ts
const layout: SettlementDefinition = {
  id: "small-prototype",
  origin: [12.55, 41.85],
  maxFoundationRiseMeters: 3,
  buildings: [
    { id: "house-1", assetId: "roman-villa-01", offset: [-10, -6], headingRadians: Math.PI / 2 },
  ],
  roads: [{ id: "street", widthMeters: 4, points: [[0, -20], [0, 20]] }],
};
```

`SettlementScene` assembles any such definition. It owns a Three.js scene and
provides `load()`, `unload()`, `relocate(origin)`, `invalidateTerrain(reset?)`
and `updateTerrain(sample)`. The sampler returns displayed metres or null.
The host supplies lighting and renders the scene with the existing shared
renderer; the assembler creates no renderer, canvas, timers or animation loop.
Status and repaint callbacks connect it to the host/UI. `load()` is idempotent.

The MapLibre layer anchors the assembled scene at its origin and zero altitude.
Scene vertices contain displayed elevations in metre-space. It reuses the same
projection blending, horizon culling and depth buffer as the beacon/test.
Source data, terrain changes and camera `moveend` events invalidate sampling;
the next map frame performs the update. Unchanged heights do not rewrite GPU
attributes. All event listeners are detached when the layer is removed.
Detailed geometry is hidden below zoom 12; loading is explicitly requested by
the settlement controls and does not delay globe startup.

Relocation changes only the origin and geographic anchor. It reuses model
instances and procedural geometries, clears all old-location terrain samples,
and hides surfaces until the new site can be sampled. Unload releases every
model lease and disposes only the assembler's own foundation/road geometries
and shared surface materials. The cache owns the models' geometry/materials.
A generation token releases late load results after an unload; they cannot
repopulate a removed scene. An in-flight network request finishes normally.

Model normalization was moved to `lib/assets/prepareAsset.ts` for reuse;
`map/romanTestScene.ts` re-exports it to preserve existing imports/checks.

## Roads, foundations and unavailable terrain

`terrainSurfaces.ts` builds indexed road grids and foundation slabs, with
samples no more than 2 m apart along/across surfaces. Road vertices follow
sampled terrain with an 8 cm clearance to reduce depth fighting. Junctions are
simple overlapping strips; there is no junction triangulator or road carving.

Foundations use the normalized GLB's measured X/Z dimensions plus 20 cm on each
edge, rotated with the building. The complete footprint grid is sampled,
including its interior. Each slab has a level top 10 cm above its highest
sample; its lower edge extends 15 cm into the sampled terrain. The model stays
upright on the slab. A required rise above 3 m hides that building/foundation
and reports an unsuitable site. The definition can change this limit.
Buildings are not tilted and global terrain is not modified. Access paths end
at the foundation edges; steps/ramps are not generated.

Sampling uses the existing public `queryTerrainHeights()` and its
`displayMeters`, so heights follow terrain exaggeration. MapLibre returns zero
for missing DEM as well as real sea level. To avoid starting buildings below
the ground, this assembler treats null, zero and nonfinite samples as unknown.
Valid negative elevations are supported. A surface with no known height at any
required vertex stays hidden and contributes to the waiting count. If it had
known heights already, temporary missing samples retain those heights and are
reported as retained/stale. Relocation and terrain/exaggeration changes clear
that cache. DEM arrival triggers resampling; there is no polling loop.

This conservative policy cannot display a genuinely zero-elevation site until
a future API supplies per-location DEM readiness. Parent DEM samples can be
usable but coarse. The configured Mapterhorn z12 data is overzoomed at building
scale; these samples are not survey data. Grids approximate the terrain between
samples, so small gaps/intersections remain possible. Surface heights can
adjust as better DEM data arrives, or after a camera move ends. Extreme
slopes hide buildings rather than solving grading/retaining-wall engineering.

Local coordinate conversion uses a small-site spherical tangent approximation.
It wraps longitude and rejects near-polar origins. One scene-wide tangent plane
is suitable for this ~65 m layout, not a town spanning kilometres or polar
sites. There is no automatic site selection, settlement streaming, instancing,
collision checking, historical data, AI, new asset download or dependency.

## Validation

Passed on 27 October 2026:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec next build --webpack`
- `node scripts/check-settlement.mjs` (also runs the existing Roman asset checks)
- `node scripts/check-geography.mjs`
- `node scripts/check-hillshade.mjs`
- `node scripts/check-biomes.mjs`

The settlement check uses the real GLBs/GLTFLoader with controlled terrain to
verify seven placements share three requests, metre offsets, road heights,
level slab tops and terrain-shaped bottoms, unavailable/zero DEM, retention,
relocation without reloading, steep-site rejection, resource disposal, unload
while requests are pending, valid negative heights and asset-failure retry.

Live Chrome inspection showed the initial waiting-for-terrain state followed
by 7/7 ready and all roads/buildings visible. The second origin also reached
7/7 ready. The scene remained visible after keyboard camera rotation/pitch and
terrain exaggeration changes from 1× to 2.5× and back. Unloading reported 0/7
and removed the scene; visiting again restored 7/7. The separate Giza fixture
was revisited and visibly rendered its three models at 3/3 ready. No FPS or
large-settlement performance benchmark was performed.
