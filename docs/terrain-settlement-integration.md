# Terrain-to-settlement integration

28 October 2026. The Roman fixture now uses authored contact feet instead of a
platform fitted to its roof bounds. Narrow wall wear, door aprons, broken cart
tracks and vegetation clearance share deterministic local settlement data.
MapLibre remains the only terrain engine; the existing custom Three.js layer,
road union, building variants, timeline and lighting remain in place.

1. **Implementation.** Building supports follow the authored ground-contact
   rectangles, including separate aqueduct piers and the farmhouse's L-plan.
   Source stone skirts, temple podium, stair risers, doorway and porch geometry
   remain intact. Models seat at `max(terrainHeight − authoredContactBase) +
   0.015 m`; each support reaches its own authored underside. This removes the
   old 20 cm perimeter extension and reduces the old 10 cm seating clearance.
   Footprint interiors and edges retain the existing ≤2 m sampling, confirmation,
   retained-height, relocation and slope-rejection lifecycle. No model is sunk
   into the terrain and no source mesh is edited at runtime.

2. **Reusable architecture.** `AssetDefinition.grounding` describes contact
   rectangles and an entrance in the centred metre frame used by `prepareAsset`.
   The existing Blender script exports Roman metadata from its horizontal bottom
   faces and substantial step undersides within 8 cm of the base; nested feet
   are removed. Normal authoring exports refresh the metadata too. The existing
   thin baked stone bases were appropriate, so no GLB geometry revision was
   needed. Future kits can author the same contract. `settlementEnvironment.ts`
   applies generic occupancy and traffic rules; `environmentConfig.ts` owns
   clearance, wear, track and plant limits. A missing contact definition uses
   the asset's registered bounds.

   The environment is generated once per load, reused by surface-map generation
   and discarded on unload. The same seed and local data reproduce identical
   wear maps and vegetation. World origin, camera, frame time and historical date
   do not enter generation. Road colour, gravel, irregular alpha edges and
   occasional paired tracks use the existing two mipmapped 512×704 maps.
   Narrow footpaths receive no cart tracks; tracks break at intersections.
   One shared road shader adds restrained roughness variation from its existing
   map. Entrance wear connects authored doors to existing access endpoints;
   the existing terminal terrain ramps and road network are retained.

   Vegetation uses full canopy/tuft radii against rotated building bounds, roads
   and entrance approaches. Traffic thins natural understory deterministically;
   cultivated plants keep their planted distribution. Up to 28 small wall plants
   reuse a species already present in the settlement. This fixture adds fourteen
   grass instances, going from 508 to 522 in the same batches. Existing boundary
   and garden planting remains. Biome placement outside the settlement is untouched.

3. **Files.** Added `lib/assets/romanGrounding.ts`,
   `map/settlements/environmentConfig.ts`,
   `map/settlements/settlementEnvironment.ts`,
   `scripts/check-settlement-environment.mjs`,
   `scripts/capture-settlement-integration.js`, this report, ten screenshot JPEGs
   and `docs/previews/terrain-integration/performance.json`.
   Modified `lib/assets/registry.ts`, `map/settlements/SettlementScene.ts`,
   `romanSettlement.ts`, `surfaceMaterials.ts`, `terrainSurfaces.ts`,
   `scripts/check-settlement.mjs`, `scripts/check-roman-variations.mjs`,
   `scripts/roman-kit/generate.py` and its README. Removed no existing project
   files. No dependency, GLB, source texture, geography, biome or lighting asset
   changed.

4. **Actual browser screenshots.** All pairs use desktop Chrome, the original
   [12.55, 41.85] origin, 1× terrain and a 3456×1674 canvas. Repository JPEGs are
   half-size copies; full PNGs remain in ignored `.biome-data/review/terrain-integration/`.
   No generated imagery or composited ground is used. The final images include
   the doorstep correction found during close inspection.

| View | Zoom / pitch / bearing | Before | After |
| --- | --- | --- | --- |
| Complete settlement | 18.9 / 55° / −25° | [Before](previews/terrain-integration/integration-before-overview.jpg) | [After](previews/terrain-integration/integration-final-overview.jpg) |
| Building contact | 20.5 / 55° / −25° | [Before](previews/terrain-integration/integration-before-contact.jpg) | [After](previews/terrain-integration/integration-final-contact.jpg) |
| Road intersection | 21.2 / 55° / −25° | [Before](previews/terrain-integration/integration-before-intersection.jpg) | [After](previews/terrain-integration/integration-final-intersection.jpg) |
| Door and worn approach | 21.4 / 55° / −80° | [Before](previews/terrain-integration/integration-before-door.jpg) | [After](previews/terrain-integration/integration-final-door.jpg) |
| Native slope / reverse view | 20.5 / 65° / 125° | [Before](previews/terrain-integration/integration-before-slope.jpg) | [After](previews/terrain-integration/integration-final-slope.jpg) |

The intersection centre is [12.55, 41.85004]; the doorway centre is
[12.54991, 41.85006]. Others use the origin. Measured native footprint relief
is roughly 0.06–0.52 m at this location. This slope pair shows local terrain
contact, not a steep-hillside construction system.

5. **Performance.** See the measured comparison below and its raw frame rows in
   [performance.json](previews/terrain-integration/performance.json). Six final
   samples alternate integrated/baseline/integrated/baseline/integrated/baseline.
   Between samples the two original implementation files were restored or
   replaced, then the page reloaded and the same settlement loaded. Baseline
   samples therefore use the actual original slabs, surfaces and 508 placements.
   Samples use a 2.4 s linear bearing rotation −25°→0°, centre [12.55,41.85],
   zoom 18.9, pitch 55°, 1× terrain, a 3456×1674 canvas, warmed tiles and closed
   DevTools. The first exploratory 2224px-wide sample and superseded step-contact
   samples are excluded. These are development-browser render intervals,
   including browser scheduling, not isolated GPU timings or universal targets.

| Metric | Matched baseline | Final |
| --- | ---: | ---: |
| Pooled median interval | 8.4 ms | 8.4 ms |
| Pooled p95 interval | 10.4 ms | 10.1 ms |
| Three.js draw calls | 33 | 33 |
| Rendered triangles | 558666 | 561896 |
| Resident textures | 19 | 19 |
| Resident geometries | 35 | 35 |
| Measured frames | 860 | 863 |
| Run 1: median / p95 | 8.4 / 10.1 ms | 8.4 / 9.7 ms |
| Run 2: median / p95 | 8.4 / 10.5 ms | 8.4 / 10.3 ms |
| Run 3: median / p95 | 8.4 / 10.4 ms | 8.3 / 10.0 ms |


6. **Asset and texture memory.** Active Roman downloads stay **11,058,376 B**
   (11.06 MB); the Roman catalogue stays **13,968,764 B** (13.97 MB). New GLB and
   texture download cost is **0 B**. The small contact metadata ships in the JS
   bundle (26,403 source bytes, 1,867 bytes gzipped in isolation), with no additional HTTP request; it is not a zero-byte code change.
   The renderer retains **35 geometries / 19 resident textures** in both modes.
   The two ground/road maps cost approximately **3.67 MiB** including mipmaps.
   The complete settlement material inventory is two 512×704 maps and sixteen
   512×256 maps, approximately **14.33 MiB** as RGBA8 with mipmaps; adding the
   existing 1024² RGBA shadow texture gives approximately **18.33 MiB** in either
   mode. This is a format-based estimate, excluding depth renderbuffers, driver
   overhead, MapLibre terrain/tile resources and browser image copies. It is not
   an OS-reported total GPU allocation. No extra shadow map or light is added.

7. **Automated validation.** Passed TypeScript, ESLint, production Webpack build,
   Roman asset/cache validation, Roman kit/authoring module validation, seeded
   variant generation (1200 Python definitions), variant batching/lifecycle,
   settlement placement/road union/entrance ramps, environment tests, geography,
   hillshade, biome/ocean ordering, terrain texture precision and `git diff --check`.
   The new environment checks cover byte-identical maps, changed seeds,
   relocation invariance, deliberate canopy/entrance collisions, bounded plant
   additions, retained crop counts, all registered contact bounds, separate
   pier feet, positive doorstep offsets and road-edge/intersection masks.
   Existing uncertain DEM, retained samples, slope rejection, async cancellation,
   retry, material/cache isolation and disposal tests continue passing.

8. **Browser validation.** Inspected actual rendered overview, foundations,
   intersections, front entrances and native slope views. Tested initial load,
   zoom/bearing/pitch navigation, relocation to [12.5515,41.851] and reload there,
   exaggeration 1×→2.5×→1×, terrain arrival and invalidation, complete unload and
   reload, and repeated original-seed loads. All seven buildings and 522 scenery
   placements loaded. Runtime texture/geometry counts stay stable across fresh
   loads. No settlement shader or GLB failure appeared. Existing globe fog
   warnings and occasional remote low-zoom Mapterhorn 404s occurred during travel;
   local settlement terrain subsequently became confirmed.

9. **Limits.** The existing 2 m sampled overlay approximates MapLibre's drawn DEM;
   very close views can still reveal small facets, especially with exaggerated
   terrain. Supports use rigid level architecture and the existing slope guard,
   so unsuitable sites are omitted rather than graded or tilted. Some downhill
   stone remains visible where the roughly half-metre local relief requires it.
   Wear is local to the existing 96×128 m treatment extent and its ≈18 cm texels.
   The network remains orthogonal; alpha blending softens its edges but does not
   curve the street layout. Ground palettes retain the fixture's existing earth
   tones; future biome-specific palettes and irregular contact polygons need art
   review. Desktop Chrome was tested; mobile/GPU profiling remains future work.

10. **Next milestone.** Add deterministic terrain-aware plot suitability and
    entrance orientation to a small procedural settlement-layout prototype,
    retaining these grounding/traffic rules. Review varied slopes and denser
    layouts before adding geographic LOD or streaming.
