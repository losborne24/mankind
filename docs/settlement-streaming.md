# Settlement LOD and streaming — Phase 3 Step 9

The existing MapLibre custom layer still owns the only Three renderer, GL context and render loop. Settlements use one detailed scene slot. Three fictional development descriptors exercise discovery, regional silhouettes, local loading and reliable switching. No historical database, new renderer, dependency or worker framework was introduced.

## Discovery and view metric

`map/settlements/settlementStreaming.ts` contains asset-free descriptors: ID, origin, approximate radius, profile, seed, optional definition/configuration, representative colours/label and an optional future year interval. The year interval is a schema extension only; fictional fixtures are intentionally independent of the timeline. Default fixtures exist only in development:

| ID | Profile / seed | Origin |
| --- | --- | --- |
| fictional-hamlet | Hamlet / 7 | 12.55, 41.85 |
| fictional-village | Village / 42 | 12.57, 41.85 |
| fictional-town | Small town / 2026 | 12.59, 41.85 |

The controller measures metres from the camera to each geographic extent: wrapped haversine surface distance combined with camera altitude above the map's target elevation, minus the descriptor radius. MapLibre's projection-aware camera supplies its real geographic position and altitude, so latitude and pitch enter the calculation directly. A padded viewport rejects offscreen descriptors. Initial thresholds:

| Transition | Enter | Leave |
| --- | --- | --- |
| Local | ≤550 m from extent | >850 m |
| Regional | ≤8 km | >12 km |

These are physical distances, not zoom gates. The MapLibre 6.15 adapter uses `map._camera.transform` in one place, matching the installed API; review it on a MapLibre upgrade. Site altitude is approximated by the camera target elevation; very mountainous sites may need an explicit descriptor elevation later. No DEM sampling is required for global discovery.

Global uses a GeoJSON circle layer. Regional uses two instanced draws with shared boxes and gabled roofs, no textures, lights, GLBs, fine roof tiles, props or villagers. Before first local generation it shows representative clusters; after generation it uses the source-generated building masses, heights and local footprint offsets, including separate farmhouse wings and covered verandas. The shared box/gable meshes consume `lib/assets/romanSilhouettes.ts`, generated reproducibly by the existing Blender script with `--grounding-only`. That command uses the same authoring parameters and asset centring as the full models. Original GLBs, their material atlases and grounding contacts remain unchanged. The nearest relevant settlement supplies the regional proxy; the other descriptors retain map markers.

Local retains the established full architecture, roads, terrain treatment, foundations, scenery and inhabitants. The proxy stays visible while loading and is replaced when textured, terrain-attached detail is ready. Small scenery (≤2.5 m) is hidden outside 250 m from the extent; larger vegetation stays visible throughout local detail. Close-up geometry, material shading and instancing remain intact. Hysteresis reduces boundary popping; proxy/detail replacement is a discrete transition, not a crossfade.

## Ownership, cancellation and latency

The controller selects the nearest relevant descriptor. A local incumbent is retained until another candidate is at least 20% nearer. New detail waits for 200 ms of eligibility and a stationary camera; a single timer requests the final settling frame. Leaving local immediately disposes the scene. Existing session and scene revision guards reject stale generation, building, scenery and character completions. Texture generation checks cancellation between row batches. Unload or relocation cannot resurrect an old scene.

`GlbCache` still shares one request per URL and owns source GPU resources. The application singleton now retains an LRU of at most 12 idle sources / 64 MiB estimated source buffers and texture storage; live leases are never evicted. Library requests can clone only the selected node. `new GlbCache()` keeps its previous immediate-disposal default for isolated callers/tests. Teardown clears idle entries and invalidates warm retention for pending requests that complete later. Geometry/texture accounting estimates source storage, not total driver or JS heap memory.

Raw ground/road pixel arrays have a separate 9 MiB LRU (three current layouts, 8.25 MiB). Each scene creates/disposes its own GPU textures over those immutable arrays. No foundations, terrain heights, character state, instance buffers, material overrides or shadow maps are retained between scenes. Local layouts retained for proxy footprints are metadata only and bounded by the configured descriptor set; explicit debug regeneration clears them.

## Profile before changing the critical path

Fresh Node measurements used actual GLBs and the real assembler, with synthetic confirmed flat DEM. They isolate CPU work from download/terrain availability and GPU work. One run per profile, so these are observations rather than statistical benchmarks. Both runs use seed 7 and identical profile capacities.

| Stage | Hamlet, before → after | Village, before → after | Town, before → after |
| --- | --- | --- | --- |
| Layout CPU | 6.1 → 6.1 ms | 11.7 → 12.4 ms | 34.4 → 38.9 ms |
| Asset wall incl. assembly | 26.1 → 21.8 ms | 36.7 → 26.0 ms | 33.0 → 25.2 ms |
| Ground/road texture CPU | 2067 → 386 ms | 5629 → 593 ms | 10000 → 612 ms |
| Terrain/contact placement | 16.2 → 12.8 ms | 49.0 → 18.5 ms | 245.6 → 45.5 ms |
| Scene load + first placement | 2119 → 481 ms | 5727 → 709 ms | 10295 → 762 ms |

The main cost was synchronous per-pixel spatial work, not network traffic. Spatial influence bins prune footprints and entrance wear; road/track segment math is reused; arrays and nested junction scans are avoided where possible. All ground and road RGBA bytes match the pre-change outputs for the three seed-7 profiles. Tests store their hashes in `scripts/fixtures/settlement-surface-hashes.json`; a direct comparison against the pre-change implementation was also run before recording those hashes.

Texture generation yields every 16 rows, allowing navigation and cancellation between batches. `textureWall` includes those yields; `cpuTextures` sums computation only. Repeated visits reuse finished pixel arrays. Precomputed entrance/model references remove per-vertex scene-tree searches when placing the town's access paths. These measured gains made a worker unnecessary for this milestone.

Raw measurements: [baseline CPU](previews/streaming/baseline-cpu.json), [optimized synchronous CPU](previews/streaming/optimized-cpu.json), [final cooperative CPU](previews/streaming/final-cpu.json), [archived Step 8 browser baseline](previews/streaming/baseline-browser.json). The archived browser baseline has different seeds/sites and no streaming dwell; do not treat it as a controlled speedup comparison.

`SettlementTiming` records layout, DEM query CPU, DEM wait wall time, initial surface/shadow setup, asset wall time, building/batch assembly, texture CPU/wall time, terrain placement, ambient update and rendering with/without shadow updates. GLB cache diagnostics separate request/decode wall time from clone CPU. Renderer timings are CPU submission time, not isolated GPU shadow/render timings; those require a GPU profiler. Counters aggregate rather than retaining an unbounded frame history.

## Terrain, materials and shadows

MapLibre remains the geographic terrain authority. Regional proxies wait for confirmed displayed DEM samples. Detailed surfaces retain the existing known-height fallback and reset it on relocation/exaggeration. The 512 × 704 mipmapped ground/road textures are unchanged and pixel-identical; each scene uses about 3.67 MiB for their GPU RGBA mip chains, plus the existing shadow map. A larger town has coarser texels than a hamlet. The existing extent-scaled shadow frustum and 1024² shadow map remain; the density regression checks accepted roofs stay covered.

The measured bottlenecks did not justify terrain partitions or new shadow assets. The experimental town retains some soft ground treatment and wider shadow texels; this remains a visual limit, not a claim of city-scale terrain support.

## Debugging and verification

The development panel shows current LOD, selected/active ID, detailed scene count, descriptors considered, distance, loading stage, cache entries/leases/hits/estimated bytes and scene timing. It offers three fixture visits and an auto/global/regional/local override. Existing authored, baseline-variant, procedural profile/seed, relocation, exaggeration, unload and Giza controls remain available. Explicit visits configure the same controller rather than bypassing distance gating. `getStreamingStatus()` exposes additional layout, surface-cache and renderer timings to local tooling.

Run:

```sh
node scripts/check-settlement-streaming.mjs
node scripts/check-streaming-materials.mjs
node scripts/check-settlement-density.mjs
node scripts/profile-settlement-loading.mjs current
```

Streaming tests exercise global/regional/local in both directions, hysteresis, latitude/pitch/date-line distances, nearest priority and switch margin, rapid navigation, no global/regional GLB requests, travel debounce, all three profiles, repeated visits, warm caches, cancellation during GLB loading and during texture rows, teardown with pending requests, bounded cache ownership, source silhouette masses for seeds 7/42/2026, animation pause/resume with no pause repaints and final disposal.

The existing authored/procedural/density/ambient/environment/Roman asset/kit/variant/geography/biome/hillshade/terrain-texture checks were also run, with TypeScript, ESLint and a webpack production build. Browser QA uses `scripts/capture-settlement-streaming.js` in local DevTools. A 500 ms camera settle and 100 ms readiness poll make its load figures coarse; close DevTools before the capture starts. No distant inhabitant simulation exists. Continuous repaint is requested only while visible local inhabitants animate; global idle frames are checked explicitly.

## Fresh browser review

A fresh page load confirmed zero cache entries and zero GLB requests at global and regional LOD. The three sites reached 6/22/40 accepted buildings. The following visible Chrome observations use a 3456 × 1674 device canvas, zoom 18.4, pitch 55°, and a short bearing orbit; the first hamlet starts with a cold application cache. Layout seeds/sites differ from the archived Step 8 browser baseline.

| Visit | Load observation | Median / p95 frame interval | Draws / triangles | Animated inhabitants |
| --- | --- | --- | --- | --- |
| hamlet | 0.90 s | 8.3 / 9.2 ms | 32 / 208,930 | 2 |
| village | 0.97 s | 8.3 / 9.1 ms | 65 / 429,792 | 4 |
| town | 1.20 s | 8.4 / 9.5 ms | 90 / 620,610 | 5 |
| hamlet-return | 0.60 s | 8.3 / 8.9 ms | 32 / 208,930 | 2 |

Every departure recorded zero detailed scenes and zero live GLB leases. Returning reused GLBs without additional requests and reused finished ground/road pixels (zero texture CPU). Rapid jumps across all three fixtures followed by global travel left no stale scene. Global idle produced zero frames during a 1.2-second observation. After the four fixture visits, the warm source cache held 11 entries / about 13.1 MiB estimated source storage, plus 8.25 MiB cached CPU pixels. This retained cache is intentional and bounded; unloading no longer means emptying all source resources.

The initial regional cluster uses two draws without any GLBs. The final source-generated town proxy also uses two draws, with at most three boxes/gables per building rather than individual foundation contacts. These masses remove fine roof geometry, windows, doors, props and villagers while preserving whole roof outlines and farmhouse wings.

[Raw browser measurements](previews/streaming/browser-performance.json). The local and forced regional comparison captures use the same camera: [local town](previews/streaming/local-town.webp), [regional footprint proxy](previews/streaming/regional-town.webp). Ground/roof contact and shadows were visually reviewed in the live browser.

The final forced regional town comparison recorded 792 triangles / 2 draws and zero detailed scenes. Regenerate its metadata with `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --grounding-only`; this regenerates the unchanged grounding metadata alongside the new silhouette file. The reference tour loaded all seven authored buildings, retained terrain attachment at 2× exaggeration, relocated the authored scene, loaded the original Giza fixture, and verified that leaving Giza released its live leases. Those records are included in the raw browser measurements.
