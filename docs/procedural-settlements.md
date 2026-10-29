# Procedural settlement layout v1

The preserved eight-building benchmark is documented below. For current profiles, multi-street navigation, validation and measured village/town review, see [Settlement density — Step 8.5](settlement-density.md).

This is a fictional Roman roadside village debug fixture, independent of the historical timeline. The hand-authored `ROMAN_SETTLEMENT` remains unchanged and available through **Return to hand-authored reference**. Only one settlement occupies the existing Three.js settlement slot.

## Interface and separation

`generateSettlement(config, sample)` in `map/settlements/proceduralSettlement.ts` returns a `GenerationResult`: `ready`, `partial`, `waiting-terrain`, or `unsuitable`, counts/reasons, an ordinary `SettlementDefinition`, and a mesh-independent `NavigationGraph`. Invalid configuration throws a descriptive error; the debug integration displays it. The sampler accepts geographic `[longitude, latitude]` and returns the existing `TerrainSample` with displayed metres and readiness.

Configuration includes origin, safe-integer seed, Roman roadside archetype, 5–12 requested buildings, house/workshop/farmhouse weights, 36–80 m extent, road heading/variation/width/setback, road/plot grade limits and foundation rise. Defaults request eight buildings over 72 m, with a 4 m road, 3 m minimum setback, ±0.22 rad alignment variation, 16% maximum road grade, conservative 20% plot relief ratio and 1.4 m maximum foundation rise. Local X is east, Z south; headings use the existing Three.js Y-rotation convention.

The generator performs no GLB loading, creates no Three.js geometry, and owns no renderer/cache. `ProceduralSettlementSession` handles layout transaction invalidation/cancellation. `ThreeTestLayer` commits definitions to the existing `SettlementScene`, which continues to own geographic anchoring, retained heights, foundations, entrance ramps, GLB leases, scenery instancing, material maps, shadows and cleanup.

## Generation rules

1. A seeded integer PRNG chooses a small principal-road rotation. Two perpendicular alignments are tried in a fixed order. Both margins and the centre are sampled at intervals of at most 1 m; excessive longitudinal or cross grade rejects an alignment. Roads are connected from the start.
2. Up to 160 candidates are considered, stopping when the requested count is reached. Weighted archetype choice reuses `selectRomanVariants` and the existing registry/library. Both sides of the road receive irregular along-road positions, setbacks, building sizes and small entrance-facing heading variation (±0.09 rad). Candidate bounding circles must fit the configured road-frame extent.
3. Conservative bounding circles keep buildings apart by at least 1.8 m. Registry dimensions guard the complete rotated footprint, including roof overhang. Roads and other entrance approaches are checked against oriented footprint distances, at 0.25 m intervals with clearance.
4. Every authored ground-contact rectangle is sampled on exactly the foundation lattice used by the scene assembler, including asymmetrical farmhouses and separate support feet. The highest terrain minus authored contact base determines the level floor. The existing 0.015 m seating clearance is included in the foundation guard. No terrain flattening or architectural deformation occurs.
5. Each accepted entrance receives a short perpendicular access road from the principal road centreline to its authored entrance. Terrain grade and the assembler's smooth floor-height ramp are checked before acceptance. Access to a building may reach its own entrance/steps beneath its eaves; other building footprints and approaches remain clear.
6. The existing orthogonal road union and its surface maps accept an optional shared road frame heading. Union tessellation and alpha-distance masks rotate into that frame and back; junction union, feathering, gravel, track wear and world-space UVs still use the original rendering code. Authored scenes omit the heading and retain their previous behavior.
7. `populateSettlementEnvironment` extends the existing environment module with bounded layout candidates. It uses the shared seed sampler, footprint/road/entrance clearance and traffic rules. Up to three small gardens/fields and existing trees, shrubs, rocks and grass fill safe spaces; the existing environment pass filters traffic and adds bounded wall plants. No new species, asset pipeline or independent scenery system is introduced.

The navigation graph splits the main-road centreline at every accepted access junction. Entrance nodes carry building IDs; undirected edges carry road IDs and horizontal metre lengths. Shared junctions are deduplicated; no zero-length edges are emitted. This v1 generator intentionally produces a simple connected tree: one main road with short access branches. It does not implement route search, villagers, physics or a general street-network algorithm.

## Terrain and lifecycle

Generation is transactional: every terrain-dependent decision it reaches must have confirmed, finite DEM samples. Confirmed zero and negative heights are valid. Any missing/provisional sample returns `waiting-terrain` with no definition or navigation graph, even if earlier candidates could fit. Coverage/source and move-end events retry waiting work.

Once committed, normal camera movement and DEM refinement validate accepted plots, roads and ramps without rerolling a suitable layout. Temporary loss of coverage retains the valid layout; the existing assembler retains coherent known surface heights. If confirmed terrain makes placement unsuitable, generation adapts or reports an explicit partial/unsuitable result. Successful layouts that required terrain-driven rejection or an alternate road alignment explicitly report adaptation in their message. An explicit terrain/exaggeration/source reset clears the layout and old displayed heights, then waits for confirmed data again. Regeneration and relocation create a new layout transaction; old scenes unload and their existing asynchronous generation guards release obsolete GLB leases.

`partial` means one or more safe plots fit but the bounded search could not meet the requested count. `unsuitable` means no safe principal road or no safe building plots. Messages appear in the procedural debug fieldset. Missing terrain is never reported as unsuitable terrain.

## Validation and captures

Run:

```sh
node scripts/check-procedural-settlement.mjs
node scripts/check-settlement.mjs
node scripts/check-roman-assets.mjs
node scripts/check-roman-kit.mjs
node scripts/check-roman-variations.mjs
node scripts/check-settlement-environment.mjs
node scripts/check-geography.mjs
node scripts/check-biomes.mjs
node scripts/check-hillshade.mjs
node scripts/check-terrain-textures.mjs
pnpm typecheck
pnpm lint
pnpm exec next build --webpack
```

The new regression checks eight seeds, exact deterministic output, meaningful variation, local-layout preservation on suitable relocation, building and road clearance, authored entrance orientation, complex contact sampling, rotated union area, connected positive-length graph edges, repeated scenery, zero/provisional/missing DEM, strict foundation rejection, partial site capacity, confirmed terrain changes and cancellation. Real GLBs exercise replacement during asynchronous shared loads, retained heights, terrain reset, unload/reload, lease balance and owned-resource disposal. Existing asset, geography, biome, hillshade, terrain-texture and hand-authored settlement checks pass, as do TypeScript, ESLint and the optimized webpack production build.

Screenshots use the same Rome origin, zoom 18.4, pitch 55°, bearing −25°, 1× terrain, and browser viewport:

- [Seed 7](previews/procedural-settlements/seed-7.jpg)
- [Seed 42](previews/procedural-settlements/seed-42.jpg)
- [Seed 2026](previews/procedural-settlements/seed-2026.jpg)

Live browser checks covered seeds 7, 42 and 2026 at `[12.55, 41.85]`, relocation to `[12.5515, 41.851]`, 2× terrain exaggeration followed by restoration, unloading/reloading, invalid seed input, and returning to the ready seven-building / 522-instance reference. The three generated scenes each reached eight rendered buildings and an 18-node / 17-edge graph. Camera orbits and repeated generation preserved layout/resource counts. The screenshots are 1728 × 837 CSS pixels. [Browser validation notes](previews/procedural-settlements/browser-validation.json) record these checks.

Live location coverage is limited to those two Rome-area sites; steep-site and local-obstacle rejection are tested with confirmed synthetic terrain. The optional `proceduralQA.sites()` console helper provides additional hillside/Alpine candidate checks for future manual runs; those additional sites were not part of the recorded browser run. Coarse Mapterhorn tile 404s were observed during globe-to-local travel; confirmed local terrain and all settlement assets still loaded.

### Performance

`capture-procedural-settlements.js` follows the existing matched-camera method: close DevTools, keep the tab visible, zoom 18.9/pitch 55°, then orbit bearing −25° to 0° over 2.4 s. The reference is followed by two rounds of seeds 7/42/2026. Raw frame rows, viewport, loading time and renderer resource counts are in [performance.json](previews/procedural-settlements/performance.json).

Observed in local development Chrome at a 3456 × 1674 device-pixel canvas (all frames visible):

| Scene | Buildings / scenery | Load to terrain-ready | Median / p95 frame interval | Draw calls | Triangles | Geometries / textures |
| --- | --- | --- | --- | --- | --- | --- |
| Authored reference | 7 / 522 | 4.51 s | 8.3 / 9.7 ms | 33 | 561,896 | 35 / 19 |
| Seed 7 | 8 / 210 | 2.03–2.44 s | 8.3 / 9.1–9.4 ms | 26 | 203,226 | 28 / 7 |
| Seed 42 | 8 / 209 | 1.98–2.04 s | 8.3–8.4 / 9.2–9.5 ms | 24 | 174,938 | 26 / 7 |
| Seed 2026 | 8 / 211 | 1.94–2.00 s | 8.3–8.4 / 9.2–9.5 ms | 25 | 179,128 | 27 / 7 |

Repeated seeds return to the same resource counts; unloading returns to 2 geometries / 1 texture in the shared renderer. Loading includes layout, GLB decode, CPU material maps and initial terrain placement, sampled at 100 ms intervals, with browser HTTP cache already warm. These are observed frame intervals on this machine, not isolated GPU timings or a production-device guarantee. The procedural scenes contain fewer scenery instances than the reference, so the lower draw/triangle counts are not a like-for-like rendering optimization claim.

## Limits and Phase 4 integration points

This is a bounded local search, not a complete site-capacity solver. It can conservatively reject a site that a more sophisticated layout could use. Plot grade is a conservative footprint relief ratio; it is not a terrain survey. Sampling uses the existing view-dependent MapLibre DEM adapter, including loaded parent coverage and its documented fallback behavior; it cannot detect water, substrate, archaeology or terrain features smaller than the available DEM. No claim of historical or hydrological suitability is made.

Roads remain orthogonal within one shared frame. There are no curved streets, long branches, large public precincts or aqueduct generation. Ordinary residential/workshop/farm variants are weighted; complex contact metadata remains generic and tested. The 96 × 128 m material footprint and existing shadow bounds limit site extent. Navigation lengths are horizontal; Step 8 must query terrain/floor heights through the established terrain lifecycle and react to scene availability before moving inhabitants.

Phase 4 can supply documented road alignment, asset/archetype weights or known building plots to a generation adapter, or replace the entire `SettlementDefinition` with evidence-defined data. The renderer does not need to know whether placements were authored, procedural or historically sourced. The navigation builder currently assumes this roadside topology; a future evidence adapter should supply its corresponding mesh-independent graph rather than pass arbitrary networks to this specialized builder. Historical constraints/provenance and dated records are intentionally deferred.
