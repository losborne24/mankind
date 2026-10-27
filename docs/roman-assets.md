# Phase 3: Roman GLB prototype

Open the globe and choose **Debug tools → Visit Roman test**. The camera moves
to [31.138, 29.9795], zoom 19, pitch 55°, bearing −25°. All three models appear
together at their authored metre scale. These are temporary integration
fixtures near Giza, not a reconstruction of Roman buildings at Giza.

## Modules

- `lib/assets/registry.ts`: IDs, relative paths, categories, scale, dimensions,
  ground offsets, optional orientation corrections and source/licence records.
- `lib/assets/glbCache.ts`: shared GLTFLoader and reference-counted model leases.
- `map/geographicAnchor.ts`: metre-space to globe/Mercator anchor matrices.
- `map/romanTestScene.ts`: explicit test placements and model normalization.
- `map/threeTestLayer.ts`: existing custom layer extended to draw these assets.
- `components/GlobeView.tsx`, `components/DebugPanel.tsx`: status, visit, toggle,
  and retry controls.
- `public/assets/roman/buildings/`: three original GLBs; no manual downloads needed.
- `public/assets/roman/LICENSE.txt`: original archive licence, preserved verbatim.
- `scripts/check-roman-assets.mjs`: actual GLB parsing and cache/placement checks.

One existing Three.js renderer uses MapLibre's canvas/context and render
lifecycle. Each compact object has its own scene/anchor and uses that renderer
sequentially with the same depth buffer. No second canvas or animation loop was
added. This simple approach is appropriate for three objects; it isn't a large
settlement batching system.

## Add or replace an asset

1. Put the licensed GLB in `public/assets/<culture>/buildings/`.
2. Add a unique registry entry with its real relative filename, category,
   source/licence, scale and ground offset. `scale: 1` means one authored unit
   is one metre. `dimensionsMeters` documents expected [X width, Y height,
   Z depth]; it does not stretch the model. `orientationRadians: [x,y,z]`
   corrects authoring axes, using Three's XYZ Euler convention.
3. Add `{ id, assetId, lngLat: [longitude, latitude], rotationRadians? }` to
   `ROMAN_TEST_PLACEMENTS`. Heading rotates about local +Y; local +X is east,
   +Y up, +Z south. Coordinates belong to placements, not registry entries.
4. Model preparation applies axis correction and scale, centres the bounding
   box in X/Z and seats its minimum Y on the ground, then applies heading.
   `groundOffsetMeters` is a deliberate asset-specific adjustment in metres.
   Use zero for this pack; never use it to mask an uncertain DEM altitude.

To replace a prototype, keep its logical ID and update its registry path,
scale/correction and licence. The placement and projection code need no changes.
The fixture's UI assumes three models; update its count if expanding this test.
A future settlement scene can supply separate placement data to the same loader
and anchor helpers without putting dates or historical claims in the registry.

Set `NEXT_PUBLIC_ASSET_BASE_URL=https://cdn.example.com/assets` before starting
or building Next.js to override `/assets`. Next inlines this value at build
time. Preserve relative paths and enable CORS on an external host. This task
sets up no external hosting and adds no dependencies or compressed-model decoders.

## Loading and ownership

GLBs are requested asynchronously only when enabled, zoom ≥12 and the map centre
is within 0.15° of the test. Initial globe rendering does not wait for models.
The pack is 69,136 bytes across the three uncompressed files, with no textures.
It uses the embedded materials; no per-instance material duplication is needed.

Concurrent acquisitions of the same URL share one pending promise and parsed
source. SkeletonUtils clones the hierarchy for independent transforms, sharing
immutable geometries, materials and textures. Do not dispose or mutate those
shared resources from an individual instance. A consumer owns a `ModelLease`
and calls its idempotent `release()` when done. The last release disposes the
source resources and evicts the cache entry; later visits can load it again
(with normal browser HTTP caching). Per-instance skeletons are released separately.

The Roman checkbox unloads all leases. Removing the layer/map also releases
leases and disposes its renderer without losing MapLibre's shared GL context.
An in-flight request is not aborted: a generation token rejects stale results,
then immediately releases their lease. Failures appear in the debug panel and
leave the globe usable; Retry clears and requests the fixture again. Failed
promises are evicted so retry is possible. There are no animated-model mixers.

## Terrain and rendering limits

The existing public `queryTerrainHeights()` uses MapLibre's loaded DEM and
returns both physical and exaggerated displayed height. Anchors use
`displayMeters`, resampled on every map-rendered frame, so tile arrival, mesh
changes and exaggeration changes update the objects. The globe anchor moves
radially by altitude/planet radius; Mercator uses altitude in metres. The
Mercator south axis is corrected from the old symmetric beacon's north axis.

MapLibre can return zero for unloaded DEM. The public map query does not expose
a per-location loaded flag, so provisional zero is used until subsequent
frames provide terrain. Missing data can remain at that fallback. No reliable
survey altitude is claimed. Mapterhorn's configured z12 data is overzoomed at
building scale. Each model has a flat base sampled at its centre: slopes can
produce small gaps/intersections across the footprint. There is no foundation
mesh, footprint fitting, slope tilt or terrain flattening yet.

The layer resets Three's GL state but **does not clear MapLibre's depth**;
terrain can occlude buildings. Object depth is shared between the three draws.
The existing globe/Mercator MVP blend and far-side horizon culling remain.
At zoom ≥12 the oversized 150 km beacon is hidden to avoid engulfing the test;
at lower zoom it remains a navigation reference and the small GLBs are hidden.
The compact matrix blend retains the original large-object projection limit.
No performance benchmark or exhaustive terrain-occlusion survey was performed.
These flat-shaded prototype meshes do not represent the final visual target.

## Provenance and licence

Official source: [Low Poly Roman Town Pack by reodesuxz](https://reodesuxz.itch.io/low-poly-roman-town-pack).
Retrieved 27 October 2026 through itch.io's free download flow. Archive:
`LowPolyRomanTown_v1.0.zip`, SHA-256
`e8e2a3e682ffdd648dd022a72d4fc4513aa4866ce5fa18474c8cbdeaa93b12d5`.
Only these GLBs were extracted unchanged from `LowPolyRomanTown_v1.0/GLB/`:

| File | Bytes | Dimensions X × Y × Z (m) | SHA-256 |
| --- | ---: | --- | --- |
| villa.glb | 9,928 | 6 × 4.4 × 6.6 | fdd6f08d7b0d31a600d0e2461dc429cdcbee9472c9db1df765d219f258353c3b |
| temple_small.glb | 47,856 | 7.6 × 5.6 × 8 | dd4526ec5100a3e974a4c873db0d77ffd5bbe2b6a71d3fa42abc33ce7b0e1df4 |
| aqueduct_double.glb | 11,352 | 8 × 9.075 × 1.6 | 8a9b7d27755dd59ab8efd9d1b99e100303e4fccc64cf89a26f78ad8c98cbb959 |

The archive's licence permits unlimited personal/commercial projects and
modification for project use. Attribution is optional. Standalone asset resale,
sublicensing or redistribution, including in another asset pack/library, is
prohibited, as is AI model training/fine-tuning. Keep these files within the
project; do not publish an asset-library/source download containing them. This
is a custom licence, not CC0. Full terms are in the preserved LICENSE.txt.

## Validation (27 October 2026)

Passed: `pnpm typecheck`, `pnpm lint`, `pnpm exec next build --webpack`,
`node scripts/check-roman-assets.mjs`, `node scripts/check-geography.mjs`,
`node scripts/check-hillshade.mjs`.
The asset check parses all GLBs with the real GLTFLoader, compares normalized
bounds, checks Mercator orientation/altitude, concurrent request reuse,
independent instances, shared geometry, last-user disposal and failed-load retry.

Live Chrome inspection showed all three models simultaneously at zoom 19;
they remained present after keyboard rotation/pitch and zooming to 18.
The checkbox reported unloaded and visiting again restored 3/3 ready.
Exaggeration 2.5× was also inspected. No automated FPS measurement was taken.

Next: introduce a small reusable settlement scene with local metre offsets,
roads and footprint-aware foundations at a suitable Roman prototype location,
then replace one asset with higher-quality PBR art through the same registry.

## Following milestone

The reusable layout, paths and slope-aware foundations are now implemented in
[settlement-layout.md](settlement-layout.md). The original Giza integration
fixture remains independent and retains its original centre-point placement.
