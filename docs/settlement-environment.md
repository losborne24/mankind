# Roman settlement environment and polish

## Environmental world-building — 28 October 2026

The latest fictional prototype has three connected environmental zones:

- **Centre:** two compacted-earth spaces, pottery/barrel/crate storage, benches,
  low stone boundaries and a gathering awning. A smaller awning shelters a house
  approach. Linen-coloured material copies replace saturated source cloth in
  the settlement only; the original Roman GLBs and cached materials are intact.
- **Outskirts:** two leafy garden plots, low boundary modules and narrow access
  paths. They use generic authored crop art, not claimed species or period data.
- **Countryside:** two grain plots with irregular margins, planted rows, broken
  shrub edges and mixed tree/grass clumps, reached by informal paths.

Five villas, the temple and aqueduct are retained. House positions are staggered,
one villa turns 90° to face a bent approach, plot sizes differ and the gathering
court occupies an open gap. Original building geometry/proportions are unchanged.
The temple and aqueduct move slightly to leave breathing room. Only the final
segment of a bent entrance path blends into the level foundation. Terminal
vertices meet the slab exactly; other segments follow DEM.

`groundAreas` adds six small data records (kind, centre, dimensions and heading).
The existing ground texture draws irregular feathered courtyard/garden/field
masks and row colour variation from those records. These are intentional land-use
shapes on sampled terrain, not slabs or flattened rectangular platforms. The
existing two texture sizes stay 512 × 704; 96 × 128 m local coverage gives roughly
18 cm texels. The two ground meshes use a 2 m grid, sharing terrain queries via
the assembler's frame cache. Shadow coverage grows with the site while retaining
a single 1024² shadow map. This trades some close-up shadow resolution for scope.

There are **508 scenery placements in 20 instanced component batches** (material
groups and shadow rendering can add draws). The full sixteen-asset registry is
**2,510,616 bytes**. Six additions total **335,548 bytes**:

| Addition | Origin | Bytes |
| --- | --- | ---: |
| Low stone boundary | Project-authored builder | 107,064 |
| Wooden crate | Project-authored builder | 41,036 |
| Garden plant | Project-authored builder | 8,708 |
| Grain clump | Project-authored builder | 153,296 |
| Wine barrel | Existing Roman archive | 11,160 |
| Market awning | Existing Roman archive | 14,284 |

No new pack, texture download, package dependency, renderer, canvas or animation
loop was added. The four authored modules use the existing builder/manifest and
registry/GLB cache. The barrel and awning retain the existing Roman licence;
see `public/assets/environment/PROVENANCE.md`. Geometry is shared and all new
scenery follows the existing instance lifecycle. Cloth copies belong to the
batch and are disposed separately from the cache.

Rigid boundaries, crates and awnings can set `maxGroundRiseMeters`: centre and
rotated footprint corners are sampled, unknown coverage stays hidden, known
placement is retained during incomplete DEM updates, and unsuitable rises hide
the prop. Suitable modules seat at their lowest sample, embedding the uphill
edge slightly rather than leaving the downhill side floating. Debug status
reports rejected props separately from rejected building foundations. This is a
short-span guard, not grading, stairs or conforming rigid architecture to hills.

Validation: TypeScript, ESLint, Webpack production build, settlement/Roman asset
checks, geography, hillshade, biomes and whitespace checks pass. The old 263.68 m²
road union regression is retained; the expanded network's analytical union is
394.0675 m². Landing tests now inspect the actual terminal edge rather than a
radius that also includes approach vertices. Added checks cover all three ground
kinds, rigid-prop slope rejection and owned cloth disposal. Existing terrain
uncertainty, cache/instance reuse, relocation, pending unload, retry and lifecycle
checks remain.

Live review: both original and alternate locations loaded 7/7 buildings and
508/508 scenery placements; the checkbox unloaded to 0/7 + 0/508. Close and
visit-angle views, rotation/pitch and 1×/2.5× terrain were inspected. The raw
[updated canvas capture](../.biome-data/review/phase3-world-building/mankind-settlement-world-building.png)
is 3456 × 1786, at alternate origin [12.5515, 41.851], zoom 18.9, pitch 55°,
bearing −25°, terrain 1×. It uses the established viewing angle, half a zoom
level closer than the earlier 18.4 screenshots; this is not a pixel-matched pair.
The optional `scripts/capture-settlement.js` reproduces a capture after selecting
Visit settlement. The ignored review folder also contains camera/timing metadata.

One short desktop development-browser sample during a 1.5 s, 30° rotation and
pitch change recorded 168 rendered frames: median interval **8.6 ms**, 95th
percentile **12.7 ms** at 3456 × 1786 pixels. This is a responsiveness sample,
not a GPU benchmark or a performance guarantee on other devices. Existing globe
fog warnings and occasional remote coarse-DEM 404s remain; loaded local DEM
was available for the settlement review. No settlement shader error was seen.

Files for this milestone: settlement definition, surface materials, scene
assembler, instanced scenery, asset registry, debug panel/status initialization,
asset builder/manifest/provenance, six GLBs, settlement checks, capture helper,
and the settlement layout/environment docs. The original five environment GLBs,
three building GLBs, terrain adapter and rendering integration were preserved.

Source assets remain the visual bottleneck: one simple villa silhouette, planar
roof/gable geometry, sparse openings and thin tree canopies. The crops are small
stylized modules; these are planted prototype plots, not historical agricultural
reconstruction. The 96 × 128 m ground treatment does not enrich the entire globe.
DEM resolution and the finite shadow map can produce small terrain/contact facets
at close or exaggerated views. No arbitrary-slope placement guarantee is made.

Next: review and author one better villa with recessed openings, eaves and actual
roof detail before expanding again. A candidate to evaluate with approval is
[AlexFerrart3D's Low Poly Ancient Roman Villa](https://sketchfab.com/3d-models/low-poly-ancient-roman-villa-475fbafbed4843fa8bd003c65ef2cccc),
whose creator page lists 30.3k triangles and CC Attribution licensing. Its art,
texture rights and historical suitability still need a source-file review.
For a small material trial, [White Plaster 02](https://polyhaven.com/a/white_plaster_02)
and [Plastered Stone Wall](https://polyhaven.com/a/plastered_stone_wall) are specific
[CC0 Poly Haven assets](https://polyhaven.com/license). Evaluate small texture
variants and adapt their appearance rather than treating modern surface scans as
Roman-period evidence. None of these candidates was downloaded or integrated.

## Reference-led composition pass — 28 October 2026

Artistic target: `Ancient Mediterranean Village Overlook.png` supplied in Downloads.
It is a mood/composition reference, not archaeological evidence. The image is not
bundled into the app or used as a terrain texture. The debug settlement remains
fictional and independent of the selected historical date.

Compared with our screenshot, the strongest differences are continuous ground
cover rather than isolated props, uneven planting density, mineral/soil variation,
readable terracotta courses and much richer architectural silhouettes. The image
also has a broad surrounding landscape and distant atmosphere; our fixture is
only a compact site over coarse native DEM/biome data.

| Work | Existing assets/materials | Requires art or later work |
| --- | --- | --- |
| Ground and roads | Break up broad dirt verges; add vegetation/litter/mineral tones at actual scenery positions; vary road shoulders | Survey-scale terrain contact, curved street layout and large surrounding landscape remain later work |
| Vegetation | Compose asymmetric clumps with gaps, uneven grass density, restrained instance tints and rock groups | Fuller tree canopies and more botanical silhouettes need reworked/new GLBs |
| Architecture | Subtle terracotta courses on sloped roof faces; retain rough plaster/stone and deterministic tints | Recessed openings, eaves, detailed masonry, roof silhouettes and distinct house footprints need authored assets |
| Light and atmosphere | Retain the warm geographic sun and softened shadows from the previous pass | Large-view haze needs integration with MapLibre atmosphere; no local fog or postprocessing pass was added |
| Occupation/land use | Existing pottery and benches remain | Fields, fences, workshops, gardens and inhabitants are deferred; the picture alone does not establish their historical accuracy |

Implemented a focused composition/material pass:

- Six olives and four cypresses now form uneven groups rather than a regular
  perimeter. Eighteen shrubs and seventeen rocks form small mixed clusters.
  Ninety-six grass tufts use an irregular authored shape, rotated/scaled across
  eight patches with counts ranging from five to twenty-one, replacing grids.
  The five existing props and all seven building/road placements are preserved.
- There are **146 scenery instances in the same ten component batches**, up
  from 126. No source GLBs, geometry, asset requests or texture dimensions were
  added. Instance colours use stable local offsets and remain fixed on relocation.
- Ground colour now responds to those same scenery coordinates. Bounded local
  splats put green/dry cover at shrubs/grass, litter tones under trees and pale
  mineral earth near rocks. Noise breaks up these transitions. Three temporary
  float fields (~4.1 MiB total) are discarded after the existing two textures
  are built; there is no extra texture, mesh or per-frame generation.
- Narrower, more variable dirt verges reduce the broad halo around roads.
  Fine pale gravel and darker broken shoulders retain the existing joined mesh,
  road landings and terrain placement.
- Terracotta-only shader detail adds gentle tile-to-tile colour and thin courses
  on sloped faces, with derivative antialiasing and a distance fade. Vertical
  roof fascia/gables retain their source colour. This adds one shader variant,
  without texture downloads, displacement, geometry changes or new draw calls.
  It remains a material approximation, not modeled tiles or a documented roof.

Validation for this pass: `pnpm typecheck`, `pnpm lint`,
`pnpm exec next build --webpack`, `node scripts/check-settlement.mjs`
(including Roman GLB/cache checks), geography, hillshade, biomes and
`git diff --check` passed. Added checks enforce canopy/rock/tuft clearance from
roads and building footprints, local ground-stamp influence, and instance-colour
stability after relocation. Browser inspection compared the alternate-origin
visit view at zoom 18.4 with the previous pass, then examined roof/ground detail
at zoom 20.3, keyboard rotation/pitch, 1×/2.5× terrain, and complete
0/7 + 0/146 unload followed by 7/7 + 146/146 reload. Screenshots were inspected
in-session; no FPS or GPU-memory benchmark was taken.

The source models are still the main limit: repeated box-like villas, flat
roof silhouettes, sparse facades, thin botanical canopies and simple foundations
cannot match the reference through surface noise alone. Ground tinting remains
local; the surrounding MapLibre biome is intentionally preserved. Coarse DEM
and shadow-map resolution can still produce small facets at close/exaggerated
views. Do not expand shader detail indefinitely to compensate for missing art.
The next art milestone should improve one villa and one olive canopy through
small, reviewed source-asset revisions, then assess the same small scene again.

## Settlement visual polish — 28 October 2026

The existing seven-building prototype now has a local ground treatment and
weathered surfaces. No building packs, dependencies, renderer, terrain engine,
canvas or historical timeline behavior were added.

- **Ground:** one transparent 64 × 88 m mesh, sampled every 2 m through the
  existing confirmed/retained DEM adapter. Its 512 × 704 RGBA map is authored
  deterministically in local metres at load time. Soil verges follow the road
  network; worn aprons follow measured, rotated GLB footprints. Dry olive grass
  patches and fine grain break up the colour. An irregular interior and fully
  transparent elliptical perimeter expose the underlying MapLibre biome and
  hillshade, with no rectangular platform or terrain flattening. The unlit
  overlay avoids applying a second directional lighting pass over hillshade.
- **Roads:** retain the indexed union and exact entrance ramps. A second map
  provides gravel/soil grain and an irregular inward feather over the last
  roughly half-metre of each edge. Connected segment ends extend the *material
  mask* at junctions to avoid transparent seams. Geometry, junction area and
  landing coordinates remain unchanged. Both maps share local UV coordinates.
- **Buildings:** original geometry, proportions and source UVs remain intact.
  Settlement-owned materials use three restrained brightness variations chosen
  from stable building IDs; copies are shared by source material and variation.
  Roofs are less saturated, plaster/stone are slightly warmer, roughness is
  increased and bright window emission is reduced. A small object-space shader
  adds continuous broad weathering and fine grain, fading the fine detail with
  screen derivatives at distance. Cached materials and the Giza fixture remain
  isolated. Foundations have a warmer stone colour and soil aprons at their base.
- **Light:** a more neutral warm sun, less blue sky fill and wider PCF filtering
  soften contrast without changing shadow-map size. The sun is now exactly
  northwest in the local east/south frame, matching the map-anchored 315°
  hillshade direction. Artistic light remains independent of the timeline.

Ground sits 5 cm above samples and the shadow receiver at 6.5 cm, below the
existing 8 cm road clearance. Both transparent passes retain depth testing and
avoid depth writes. They use explicit render order (ground, shadows, roads);
roads and ground use one face pass. This is still an approximation of the
native terrain mesh, not a terrain replacement.

The extra ground treatment costs one draw call and 2,816 triangles. Refining the
existing shadow receiver from 4 m to 2 m adds another 2,112 triangles, for a
total increase of 4,928 triangles. Each map is
about 1.38 MiB before mipmaps; together they use about 3.67 MiB of GPU texels
including mipmaps. There is no texture download or per-frame texture generation.
The existing 126 scenery placements still use ten instanced component batches.
Textures and material copies are disposed on unload; relocation reuses them.
The fixed receiver/treatment extent is sized for this compact prototype and
would need revisiting for a larger layout.

Validation: TypeScript, ESLint, Webpack production build, settlement (including
Roman assets/cache), geography, hillshade, biomes and whitespace checks passed.
The sandbox build initially could not resolve Google Fonts; the network-enabled
retry passed. New settlement checks cover transparent outer pixels, visible
interior wear, ground height alignment, material variation and texture disposal.
Existing union-area, exact landing, DEM uncertainty/retention, slope rejection,
cache isolation, relocation, pending cancellation, retry and cleanup checks pass.

Live Chrome screenshots were compared at the same alternate origin and visit
camera (zoom 18.4, pitch 55°, bearing −25°), followed by close inspection at
zoom 19.4. Ground now blends into biome green with broken verges; roof tints and
surface grain are visible. Load, unload to 0/7 + 0/126 and reload to 7/7 + 126/126,
2.5× exaggeration, and keyboard rotation/pitch were exercised. Screenshots were
inspected in-session, not saved as repository artifacts. No FPS/GPU benchmark
was taken. Small terrain/shadow facets can still appear at exaggerated close
views where the sampled surface differs from MapLibre's coarse DEM mesh; no
survey-level contact or arbitrary-slope guarantee is made.

The architecture remains visibly limited by flat roof planes, sparse facade
geometry and one repeated villa silhouette. Material weathering cannot supply
missing roof tiles, eaves, door recesses or distinct historical footprints.
The next milestone should be a close-camera art review of this small scene,
then improve one representative villa's authored roof/facade detail and matching
foundation contact before considering more buildings or animated inhabitants.


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
