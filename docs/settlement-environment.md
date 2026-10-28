# Roman settlement environment and polish

Use **Debug tools → Visit settlement**. **Relocate nearby** and the settlement
checkbox retain their existing roles. The separate Giza fixture is preserved.
There are still seven buildings, with 126 additional data-driven scenery
placements. No new renderer, canvas, animation loop, package dependency, AI
integration, visual skin or settlement generator was added.

## Terrain correction

`map/terrain.ts` now exposes `queryTerrainSample()`, returning displayed metres
and readiness (`confirmed`, `uncertain`, `unavailable`). It feature-detects the
installed MapLibre 6.15 terrain object's `getDrawnElevationForLngLat()` method.
This method reads the drawn DEM coverage and returns `undefined` for absent
data, distinguishing a loaded zero-metre surface from a missing DEM. Loaded
parent coverage is valid rendered height, though potentially coarse.

The optional version-specific call is isolated in this adapter. If it is
unavailable or has no coverage at the location, the public map query remains
the fallback. Nonzero values imply loaded DEM; a fallback zero is explicitly
uncertain. No source-wide `isSourceLoaded` guess is used to claim that an
individual zero sample is valid. Disabling terrain makes samples unavailable.
`queryTerrainHeights()` retains its original physical/display-height API.

The assembler accepts either these samples or trusted numbers (including zero).
Unknown initial ground stays hidden. During partial updates, previously placed
roads/foundations retain the entire previous set of heights, avoiding a mixture
of fresh and stale vertices. Scenery retains known anchor heights. Once all
required samples are available, authoritative height changes are applied.
Relocation and terrain/exaggeration changes invalidate the old coordinate frame.
There is no fabricated altitude, smooth animation concealing bad DEM, or timer
polling loop. The 3 m foundation limit remains in place.

## Joined roads and entrance landings

`terrainSurfaces.ts` builds one union of the orthogonal street/path rectangles.
A shared indexed grid splits at road edges and at intervals no greater than
2 m. Each covered cell is emitted once, removing coplanar intersection overlaps.
The prototype network's horizontal area is 263.68 m², tested against triangle
area. This supports orthogonal segments only; diagonal/curved streets need a
separate future extension. It is not a polygon-boolean road engine.

Each entrance branch names its building with `accessTo`. Its height blends
smoothly from the terrain-following street edge to the level foundation top.
Vertices at the landing meet the slab height exactly. The supplied endpoints
are matched to the current models' measured footprints, with no overlap into
the slabs. Replacing a building with a larger footprint may require updating
its path endpoint in the layout. There is no grading/accessibility solver;
steep sites still reject buildings, and no automatic stairs are generated.

## Environment assets and ownership

The existing registry, base URL, normalization and GLB cache are reused. Five
small botanical/geological meshes are authored by the deterministic offline
script `scripts/build-settlement-environment.mjs`. They use individual leaves,
branched trunks, bent grass blades, rough vertex-colour materials and muted
Mediterranean colours. They are ordinary project geometry, not downloaded
scans or botanical/historical reconstructions. Full source is included; run:

```sh
node scripts/build-settlement-environment.mjs
```

`public/assets/environment/manifest.json` records exact dimensions/bytes;
`PROVENANCE.md` records their origin. These assets introduce no third-party
mesh or texture licence. The existing Roman architecture remains prototype art.
All assets can be replaced through their logical IDs and registry metadata.

| Asset | Placements | GLB bytes |
| --- | ---: | ---: |
| Olive tree | 6 | 1,093,376 |
| Italian cypress | 4 | 705,660 |
| Mediterranean shrub | 8 | 219,672 |
| Limestone rock | 7 | 43,696 |
| Dry grass tuft | 96 | 20,736 |
| Roman amphora | 3 | 19,088 |
| Roman stone bench | 2 | 3,704 |

The two props were extracted unchanged from the already-downloaded official
`LowPolyRomanTown_v1.0.zip`, at `GLB/amphora.glb` and `GLB/stone_bench.glb`.
They use the preserved `public/assets/roman/LICENSE.txt`: project use and
modification permitted, attribution optional; standalone redistribution,
sublicensing and AI training prohibited. They are not CC0.

The ten registry GLBs, including the three buildings, total **2,175,068 bytes**.
There are no runtime texture downloads. The layout uses fixed offsets, headings,
scales and optional descriptive habitat/role tags. Grass clusters are explicit
fixture data, not runtime random scattering. No biome or culture inference runs.

`InstancedScenery.ts` acquires one cache lease per scenery asset, and builds
one InstancedMesh per source mesh component, baking the normalized source
transform into each instance. The 126 objects use **10 component batches**
(material groups can still add draws). Models share geometry/materials; the
instance transforms belong to the batch. Hidden/unknown anchors get zero-scale
matrices. Relocation reuses geometry and model leases, invalidates terrain and
updates instances. Unload disposes instance buffers, then releases leases;
only the cache disposes source geometry/materials. Pending results cannot
resurrect an unloaded scene. Sources are static meshes, without animation.

## Lighting and shared-context shadows

A warm directional sun and cool sky/warm ground hemisphere provide simple
atmospheric lighting. Sun direction is an artistic fixed local direction,
not an astronomical reconstruction driven by the historical timeline. No
postprocessing, custom sky, local distance fog or extra rendering context is
introduced. The existing MapLibre atmosphere remains unchanged.

A 1024² PCF shadow map covers the compact settlement. Buildings, foundation
walls, trees, shrubs, rocks and props cast shadows. Grass receives shadows but
is too small to justify casting them. Roads/foundations receive shadows;
a transparent 64 × 88 m sampled terrain mesh receives nearby ground shadows
without recolouring MapLibre's land. Its 4 m grid follows available DEM with
2.5 cm clearance, has no depth writes and is hidden if ground is unknown.
The light's target height follows coherent visible foundation levels.

MapLibre reserves a depth sub-range for its layers. Three's shadow maps compare
against full [0,1] depth. `terrainShadows.ts` sets [0,1] only in each offscreen
shadow draw's `onBeforeShadow`, and restores the incoming range in
`onAfterShadow`. This corrects the shadow texture's depth convention while preserving terrain
occlusion in the main draw. Closed building meshes also use back-face shadow
casting to reduce self-shadowing on their double-sided faces. Their material
copies are shared within the settlement and disposed on unload; cached/Giza
materials stay unchanged. Three resets GL state at
the existing layer boundary; its viewport is synchronized to the map drawing
buffer after resize. MapLibre's main depth is never cleared. Giza/beacon draws
remain outside the settlement shadow setup.

Shadow maps update when assets, terrain, layout or camera coverage change,
not continuously. Unload
also disposes the light's shadow target. There is no dynamic sun, wind, animated
foliage, cascading shadows, SSAO, contact-shadow postprocessing or full terrain
shadow casting. The small receiver cannot cast global mountain shadows.

## Checks and remaining limits

Established checks: TypeScript, ESLint, Webpack production build, Roman GLB/cache
checks (included by settlement checks), settlement, geography, hillshade and
biome checks. Settlement checks now also verify confirmed/uncertain/unsupported
zero queries, coherent partial DEM retention, road union area, exact entrance
landing heights, instanced reuse, shadow range restoration, static shadow update
gating, owned shadow-material cleanup/cache isolation, relocation without new requests, pending unload, cleanup and retry.

The optional drawn-coverage capability is coupled to the installed MapLibre
version; keep its adapter/test when upgrading. DEM resolution remains coarse
at building scale. Better confirmed tiles can change heights; no survey-level
placement is promised. Roads/foundations/ground receiver approximate terrain
between samples. The prototype's rectangular shadow coverage and sample grid
are sized for this small layout, and require adjustment for larger definitions.
Filtered shadows can alias at very close zoom; there is no device-specific GPU
budget or FPS benchmark. Foliage is lightweight authored geometry, and original
architecture/props are flat-shaded; the scene is a step toward the requested
semi-realistic direction, not final Civilization-quality art.


Final validation on 27 October 2026: `pnpm typecheck`, `pnpm lint`,
`pnpm exec next build --webpack`, `node scripts/check-settlement.mjs`
(including `check-roman-assets.mjs`), `node scripts/check-geography.mjs`,
`node scripts/check-hillshade.mjs`, `node scripts/check-biomes.mjs`, and
`git diff --check` passed. Live Chrome inspection showed 7/7 buildings and
126/126 scenery instances ready, joined landings, leaf/ground shadows,
relocation, 1×/2.5× terrain controls and complete 0/7 + 0/126 unloading.
The original Giza fixture also returned to 3/3 ready, and revisiting the
settlement restored 7/7 buildings and 126/126 scenery instances.
Closed-building back-face shadow casting removed the prominent roof striping
seen during development. No automated FPS or GPU-memory benchmark was taken.
