# Reusable Roman settlement layout

> Historical milestone record. The original Roman Town Pack and its public licence
> have since been removed. Current assets, paths and validation are documented in
> [roman-kit.md](roman-kit.md); the original licence text is preserved only in
> [the historical archive](archive/roman-town-pack-LICENSE.txt).


Choose **Debug tools → Roman settlement layout → Visit settlement**. The layout
is a generic prototype near Rome at [12.55, 41.85], not an archaeological
reconstruction. It contains five villas, one temple and one aqueduct, using only
the three previously imported GLBs. The main road is 4 m wide and smaller paths
range from 1.1 to 1.8 m wide. The environmental world-building milestone adds
508 instanced scenery placements, courtyards, gardens, field margins and shadows; see [settlement-environment.md](settlement-environment.md). The local ground/shadow coverage is 96 × 128 metres; all surface heights follow native DEM samples.

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
and `updateTerrain(sample)`. The sampler returns confirmed displayed metres, null, or a `TerrainSample`
with confirmed/uncertain/unavailable readiness. The assembler supplies local
hemisphere/sun lighting; the host renders with the existing shared renderer.
The assembler creates no renderer, canvas, timers or animation loop.
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
sampled terrain with an 8 cm clearance to reduce depth fighting. One indexed
union grid covers the orthogonal road/path rectangles without duplicate
intersection faces. There is no general junction triangulator or road carving.

Foundations use the normalized GLB's measured X/Z dimensions plus 20 cm on each
edge, rotated with the building. The complete footprint grid is sampled,
including its interior. Each slab has a level top 10 cm above its highest
sample; its lower edge extends 15 cm into the sampled terrain. The model stays
upright on the slab. A required rise above 3 m hides that building/foundation
and reports an unsuitable site. The definition can change this limit.
Buildings are not tilted and global terrain is not modified. Paths with `accessTo` blend from street height to the named foundation
landing. Their end vertices meet the slab top; the rest of the street stays
terrain-following. There is no accessibility or retaining-wall solver.

Sampling uses `queryTerrainSample()` and displayed elevation, including terrain
exaggeration. The adapter uses the installed MapLibre terrain object's optional
`getDrawnElevationForLngLat()` capability to confirm DEM coverage. Its finite
zero is valid sea level. Where the capability/coverage is absent, a fallback
zero is explicitly **uncertain**; null/nonfinite values are unavailable. A
nonzero fallback comes from loaded DEM and is usable. Direct numeric samplers
are trusted, including zero. The adapter isolates the version-specific call.

A surface with no known height at any required vertex stays hidden. If some
samples temporarily become unavailable, its complete previous surface is kept
coherent, rather than combining newly sampled heights with stale neighbours.
Scenery anchors retain their last known heights. Relocation and terrain/source
changes clear cached heights. DEM arrival triggers resampling; there is no
polling loop. Confirmed higher-resolution DEM may still move the surface.

Loaded parent DEM is usable but coarse. The configured Mapterhorn z12 data is
overzoomed at building scale, not survey data. Sampled grids approximate terrain
between vertices, so small gaps/intersections remain possible. If the optional
coverage capability is unavailable, an unconfirmed zero site waits explicitly
rather than being classified as invalid land. Extreme slopes still hide
buildings instead of producing implausibly tall foundations.

Local coordinate conversion uses a small-site spherical tangent approximation.
It wraps longitude and rejects near-polar origins. One scene-wide tangent plane
is suitable for this ~65 m layout, not a town spanning kilometres or polar
sites. There is no automatic site selection, settlement streaming, collision checking,
historical data, runtime AI or new dependency. Repeated scenery is instanced;
prototype botanical GLBs are built offline and two props reuse the licensed pack.

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
level slab tops and terrain-shaped bottoms, confirmed/uncertain zero DEM, coherent retention,
relocation without reloading, steep-site rejection, resource disposal, unload
while requests are pending, valid negative heights and asset-failure retry.

Live Chrome inspection showed the initial waiting-for-terrain state followed
by 7/7 ready and all roads/buildings visible. The second origin also reached
7/7 ready. The scene remained visible after keyboard camera rotation/pitch and
terrain exaggeration changes from 1× to 2.5× and back. Unloading reported 0/7
and removed the scene; visiting again restored 7/7. The separate Giza fixture
was revisited and visibly rendered its three models at 3/3 ready. No FPS or
large-settlement performance benchmark was performed.

The environment milestone supersedes the original overlapping-junction and
zero-elevation limitations. Detailed asset/shadow validation and current limits
are in [settlement-environment.md](settlement-environment.md).
