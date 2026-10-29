# Ambient life v1 — Phase 3, Step 8

The active Roman settlement owns three inhabitants by default, with a Debug tools limit of five. They walk its connected roads and entrances, pause at destinations, and resume. No historical population or economic simulation is implied.

## Try it

Run `pnpm dev`. In **Debug tools → Procedural Roman village**, visit seed 7, 42 or 2026. Enable **Ambient life**, adjust **Villagers (0–5)**, or enable **Show walking graph**. The same controls work with **Visit settlement** for the authored reference. Counts report visible active, walking and idle villagers; paused/offscreen actors report zero active. Normal metre-scale people are easiest to inspect at zoom 19–20; they are intentionally small at the default settlement overview.

Regenerate or relocate while people are moving, switch to the reference scene, unload/reload, and change terrain exaggeration. Zoom below 17, move the settlement outside the view/350 m centre radius, or hide the document to pause. Paused time is not caught up on return. Disabling ambient life hides people, stops simulation/animation and stops its repaint requests. One explicit settings-change repaint is expected.

## Character ownership and animation

`scripts/ambient-life/generate.py` generates `public/assets/characters/roman-villager.glb` using Blender Python. Run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/ambient-life/generate.py
```

The adult is 1.783 m tall, wears a muted linen tunic, belt and sandals, and has a level hem and simple face/hair silhouette. Geometry is authored directly in GLTF Y-up metre coordinates (+Z forward), with soles at zero; `export_yup=False` deliberately avoids converting already-Y-up data. No imported content, paid assets, AI service or texture dependency is used. Provenance is beside the GLB and recorded in the existing asset registry.

This implementation deliberately uses the permitted articulated fallback: rigid `leftLeg`, `rightLeg`, `leftArm`, `rightArm` and `body` transforms, without skinning, fingers, IK or cloth. Walking swing is driven by travelled distance (1.35 m stride), with opposing arms/legs, restrained sole clearance, smoothed facing and walk/idle blending. Idle has subtle phase-offset breathing. There are no exported clips, so AnimationMixer is unnecessary. The source has five mesh primitives, 1,772 triangles and one matte vertex-color material; its GLB is 182,604 bytes. A scene takes one lease from the existing `glbCache`, then clones transforms for its actors. All five source geometries and the material are shared across villagers. Characters do not cast dynamic shadows, avoiding a new shadow pass every frame.

## Simulation and navigation

`AmbientLifeSimulation.ts` has no Three.js dependency. Villagers carry seeded unique IDs, current node/edge, destination, route, edge progress, speed, remaining idle time, state, facing, horizontal position, distance and their own RNG state. Speeds range from 0.85–1.30 m/s; initial pauses are 0.4–2.9 s and destination pauses 1.5–7.5 s. Choosing an intersection as a destination creates a short communal roadside pause; entrances are also eligible. Each inhabitant has its own RNG, so changing the count does not perturb existing actors' decisions.

The simulation advances at 30 fixed steps/second. Equal elapsed simulation inputs produce identical decisions at different rendering rates. The view clamps a stalled frame to 250 ms; hidden time is deliberately excluded. Large stalls therefore slow simulation rather than produce catch-up jumps. Terrain readiness is an explicit placement predicate, not a mesh reference inside the simulation. Different readiness histories are different simulation inputs.

Procedural settlements use their existing `navigationGraph` directly. Dijkstra paths and reachable destination sets are precomputed for this small immutable graph. Movement interpolates only a connected graph edge and never shortcuts between destinations. Disconnected nodes cannot become destinations from another component. The authored reference derives a compatible graph from its straight main road and building access polylines, projecting joins across the main road width and retaining approach bends. Garden/scenery paths are excluded. This fallback intentionally supports the current straight-main-road authored fixture; future complex authored roads should provide an explicit graph.

The building-clearance tests use the existing authored ground contact footprints, which correctly distinguish steps/verandas and entrance thresholds from an oversized whole-asset bounding rectangle.

## Terrain and lifecycle

`AmbientLifeView.ts` raycasts the existing rendered `road-network` mesh in settlement-local metres. This is a surface query, not another DEM sampler or terrain engine. It inherits the same `SettlementScene.updateTerrain` samples, displayed/exaggerated elevations, retained confirmed heights, terrain triangulation and smoothed entrance ramps as the roads. There are **zero extra DEM requests per animation frame**. A 3 cm sole tolerance handles Float32 edge-cap rounding at navigation endpoints.

Until the road has confirmed placement, actors remain hidden and simulation does not advance. Valid zero metres is usable. Provisional or absent samples cannot initialize a road. Existing coherent road heights can be retained while DEM refines. Height adjustment is bounded to 0.8 m/s; displacement beyond 12 cm hides/blocks an actor while the view settles. Ordinary slopes remain continuous. Relocation/exaggeration resets discard actor height history and hide old placements instead of interpolating between geographic frames. A character without valid placement cannot walk into unresolved space.

`SettlementScene` owns the simulation/view, uses its existing cache injection, and exposes `configureAmbientLife` / `updateAmbientLife`. The existing `ThreeTestLayer` remains the only renderer/MapLibre custom layer. It asks for another repaint only while useful visible animation is active. Terrain updates still short-circuit on the scene's dirty flag. Visibility changes reset animation time and request one wake-up frame. View counts publish only when their values change.

Unload invalidates pending GLB work, removes actors and releases the character lease; reload restarts deterministic initial state. Scene replacement additionally disposes the walking-graph geometry/material. Stale asset completions release their leases without attaching anything. The cache remains the sole owner of source GPU resources. Debug count changes reuse the same asset and shared geometry/materials. Fixed-step updates reuse paths and destination arrays; road queries reuse the raycaster and hit-array container. Three.js creates bounded intersection records for successful raycasts, so this is not a claim of a completely allocation-free renderer.

## Validation and measurements

Automated checks:

```sh
pnpm typecheck
pnpm lint
pnpm exec next build --webpack
node scripts/check-ambient-life.mjs
node scripts/check-procedural-settlement.mjs
node scripts/check-settlement.mjs
node scripts/check-roman-assets.mjs
node scripts/check-roman-kit.mjs
node scripts/check-roman-variations.mjs
node scripts/check-settlement-environment.mjs
node scripts/check-terrain-textures.mjs
node scripts/check-geography.mjs
node scripts/check-hillshade.mjs
node scripts/check-biomes.mjs
```

TypeScript, ESLint, the webpack production build and the listed Node suites pass. The default `pnpm build` (Turbopack) was also attempted, including an escalated retry, but this environment blocks the local build-worker port (`Operation not permitted`); this is not a source compilation error. The webpack build completes successfully.

The ambient suite exercises two minutes of movement per seed (7/42/2026), graph-edge membership, reachable destinations, footprint clearance, disconnected components, count-independent RNG, 30/60 Hz determinism, blocked placement, authored bends, the real GLB/cache/road mesh, confirmed zero, missing/provisional/retained DEM, bounded changing heights, displayed exaggeration, relocation, visibility/disabled/zero-count pause, pending replacement, shared ownership and unload/reload. Existing cache request assertions now include the one extra shared character asset.

`capture-ambient-life.js` is a local DevTools QA helper, following the existing capture-script convention. It measures seeds 7/42/2026/7 with the existing camera and renderer, waits for DEM refinement, checks movement, and counts settled disabled frames. It also records a 12-second, 30 fps WebM directly from the existing map canvas. Open DevTools, paste the file, run `ambientQA.run()` or `ambientQA.record()`, then close DevTools within five seconds.

Measured in Chrome, local development build, 3456 × 1674 drawing buffer, on 2026-10-29:

| Seed | Median frame | p95 frame | Life median/p95 CPU | Draws active / disabled | Geometry / textures |
| --- | --- | --- | --- | --- | --- |
| 7 | 8.3 ms | 9.3 ms | 0.1 / 0.2 ms | 41 / 26 | 33 / 7 |
| 42 | 8.3 ms | 9.3 ms | 0.1 / 0.2 ms | 39 / 24 | 31 / 7 |
| 2026 | 8.3 ms | 9.2 ms | 0.1 / 0.2 ms | 40 / 25 | 32 / 7 |
| 7 repeat | 8.3 ms | 9.2 ms | 0.1 / 0.2 ms | 41 / 26 | 33 / 7 |

Three villagers add 15 draws and 5,316 triangles. The first and repeated seed 7 have identical resource counts. Each disabled scene produced **zero frames in a settled 1.5-second sample**. Unloading returned to 2 geometries / 1 texture (the existing beacon baseline). These are local measurements, not a cross-device guarantee. The earlier Step 7 matched-orbit baseline was approximately 8.3 ms median; the new measurements preserve that refresh rate. Node's 600-frame real-road view check averaged about 0.13 ms/update; browser numbers are more relevant.

Raw metrics are in `docs/previews/ambient-life-browser-performance.json` and `ambient-life-node-performance.json`. Screenshots cover all three seeds, the authored scene and Debug tools; `ambient-life-seed-7.webm` captures walking and pauses. Container inspection confirms VP9, 3456 × 1674, 353 frames and a last timestamp of 11.903 seconds (`ambient-life-recording-metadata.json`). Browser local-file URL policy prevented playback inspection; the live animation was visually checked in the app. An initial performance pass sampled a scene replaced by arriving DEM, so the stored pass waits for terrain settlement and records `sceneReplaced:false` throughout.

## Extending appearances

Future cultures/eras can register their own project-owned GLB in `lib/assets/registry.ts` and preserve the metre/Y-up/ground-zero/+Z-forward contract. A compatible articulated asset can expose the five joint names above and reuse this view. At present the Roman asset ID is selected in `AmbientLifeView.load`; a future culture resolver can supply that ID as an appearance option without changing graph generation, RNG or simulation state. Different proportions may also supply stride/swing parameters. Rigged replacements can expose Idle/Walk clips and use AnimationMixer in the view (with the existing cache/SkeletonUtils ownership), while keeping all route decisions in the simulation. Do not infer culture from terrain or add alternate appearance libraries in this milestone.

## Limits

This is a small settlement activity prototype, capped at five. It has no crowd avoidance, collision physics, doors, interaction/economy, persistent global population, foot IK or slope-specific gait. People can briefly overlap each other. Entrance visits stop at graph thresholds; villagers do not enter buildings. Roadside intersections provide communal pauses rather than a new plaza-placement system. The graph overlay shows the complete eligible walking network, not individual destination traces. At extreme close-up, rigid limbs and centimetre-scale foot slip are visible. Offscreen detection is geographic bounds/distance/zoom/document visibility, not per-character occlusion testing. The first DEM placement is intentionally hidden until usable; scene regeneration may restart the small population.
