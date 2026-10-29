# Settlement density and variety — Phase 3, Step 8.5

Fictional Roman provincial prototype. Building capacities and animated character counts are design settings, not historical population or verified reconstruction data.

## Profiles and compatibility

Use `settlementProfileConfig("village")` and pass the result to the existing `generateSettlement`. The development panel defaults to Village. The optional third argument to `visitProceduralSettlement(seed, origin, {profile})` selects a profile and applies its defaults before overrides. Omitting a profile preserves the original eight-building benchmark, including seeds 7, 42 and 2026. The hand-authored reference, cache, terrain adapter, scene assembler and ambient-life architecture remain in place.

| Profile | Requested range / default | Site extent | Secondary streets | Cultivated patches / natural candidates | Villagers |
| --- | --- | --- | --- | --- | --- |
| Hamlet | 4–8 / 6 | 72 m | 0 | 2 / 110 | 2 |
| Village | 12–25 / 22 | 104 m | 2 lanes | 4 / 160 | 4 |
| Small town, experimental | 30–60 / 40 | 164 m | 2 lanes + 2 streets | 5 / 180 | 5 |

These are requested capacities: bounded search and terrain can produce smaller safe results. All profiles retain full asset dimensions, overhang clearance, conservative building bounding circles with 1.8 m separation, minimum 3 m setbacks, authored entrances, complex support feet and the existing 1.4 m foundation guard. Houses dominate village composition; important main-road frontage favours workshops, while farmhouses use outer frontage. Different asset dimensions, setbacks, entrance-facing heading variation, seeded lane spacing and irregular frontage create residential groups along connected roads. This is still a restrained orthogonal provincial layout, not an organic street planner.

Village/town reserve a 9/12 m shared court beside the main street. Unsuitable court terrain is rejected. Cultivated patches use shared occupancy rules, with fields towards the edges and gardens nearer homes. A few boundary modules, barrels and a bench add detail where clearance permits. Natural vegetation is thinned in the centre and retained on the outskirts. Scenery uses existing instances, deterministic sampling, traffic filtering, slope guards and disposal.

## Roads, navigation and terrain

The principal road retains its two candidate alignments. Village lanes cross it; town streets cross the accepted lanes. A secondary street is retained only when its whole width and length pass the original grade checks. Every building is checked against all retained streets and access paths before a terrain/foundation/ramp check. Entrances project onto their own street centreline and face their access route. No independent disconnected street is admitted.

The navigation builder now splits every straight segment at crossings and shared endpoints, including collinear joins. Junctions are deduplicated within 1 μm, edges are positive-length and duplicate edges are removed. Building entrance IDs survive as ordinary graph nodes. Existing villagers traverse the graph unchanged; character counts stay capped at five. Town streets can form loops. Hidden villagers reseat promptly after a confirmed terrain refinement larger than 8 m, avoiding a long invisible climb from an old coarse height. Smaller changes retain the existing smooth interpolation.

Generation remains transactional on confirmed DEM samples, including valid zero and negative elevations. Missing coverage returns `waiting-terrain` without a committed layout. Accepted layouts survive ordinary camera movement and temporary coverage loss. Source/exaggeration resets, confirmed unsuitable terrain, explicit regeneration and relocation use the existing session/scene invalidation. Terrain is sampled during generation and dirty terrain updates, not by the generator per animation frame.

Candidate searches stop at `min(960, requested × 24)` attempts; the preserved benchmark retains 160. A second budget stops new candidates after 16,000 unique terrain samples (the current candidate finishes). `partial` retains safe plots and reports accepted/requested counts, attempts and capacity/budget explanation; `unsuitable` has no safe building definition. This is not an exhaustive packing or terrain-capacity solver: even flat sites can return partial upper-range results.

Expanded definitions carry an explicit ground size of `extent × 1.45 + 16` metres. The existing ground treatment, receiver and directional shadow bounds expand together, and all surface UVs use the same dimensions. This covers rotated building footprints and surrounding treatment; it does not silently place larger settlements beyond the old 96 × 128 m receiver. The two material textures retain a fixed 512 × 704 resolution and are generated once per scene load. Larger sites consequently have softer surface detail; no application-wide quality setting changes.

## Recorded browser review

Screenshots share Rome `[12.55, 41.85]`, 1× terrain, bearing −25°, 1728 × 837 CSS viewport. Close views use zoom 18.9 / pitch 55°; elevated views use zoom 18.1 / pitch 30°. Close town views deliberately show a portion of the larger site.

| Scene | Close | Elevated |
| --- | --- | --- |
| Eight-building benchmark, seed 7 | [close](previews/settlement-density/benchmark-7-close.jpg) | [elevated](previews/settlement-density/benchmark-7-elevated.jpg) |
| Hamlet, seed 7 | [close](previews/settlement-density/hamlet-7-close.jpg) | [elevated](previews/settlement-density/hamlet-7-elevated.jpg) |
| Village, seed 7 | [close](previews/settlement-density/village-7-close.jpg) | [elevated](previews/settlement-density/village-7-elevated.jpg) |
| Village, seed 42 | [close](previews/settlement-density/village-42-close.jpg) | [elevated](previews/settlement-density/village-42-elevated.jpg) |
| Town, seed 7 | [close](previews/settlement-density/small-town-7-close.jpg) | [elevated](previews/settlement-density/small-town-7-elevated.jpg) |

The [final live UI review](previews/settlement-density/village-final-review.jpg) uses the default visit zoom of 18.4, with 22 ready buildings and four active walkers.

The village has visibly more continuous occupied frontage and two connected lanes rather than the benchmark's single row. Seeds 7 and 42 have different headings, frontage, archetype mixes and gardens; both keep a clear court and ground contact. Real terrain produced 22/22 for seed 7 and an honest 21/22 partial for seed 42. All four village characters were observed walking; the town retained five. Terrain, architecture, roads and clear surroundings use the same visual system as the original scene. Conservative separation still leaves open yards: contiguous party-wall urban blocks are outside this milestone.

The helper `scripts/capture-settlement-density.js` extends the existing matched-camera orbit methodology. Run it in local DevTools with `densityQA.run()`, then close DevTools during the five-second lead-in. Full raw frame rows, loading times and resources are in [browser-performance.json](previews/settlement-density/browser-performance.json). These are local development-browser observations, not isolated GPU timings or device guarantees.

| Scene | Buildings / scenery | Load to ready | Median / p95 interval | Draws / triangles | Geometries / textures |
| --- | --- | --- | --- | --- | --- |
| Hand-authored reference | 7 / 522 | 4.80 s | 9.6 / 12.0 ms | 33 / 561,896 | 40 / 19 |
| Eight-building benchmark | 8 / 210 | 2.06 s | 8.3 / 10.4 ms | 41 / 207,290 | 33 / 7 |
| Hamlet 7 | 6 / 147 | 1.60 s | 8.3 / 9.7 ms | 32 / 208,930 | 29 / 9 |
| Village 7 | 22 / 236 | 5.38 s | 8.6 / 11.7 ms | 65 / 413,064 | 52 / 11 |
| Village 42, partial | 21 / 241 | 4.59 s | 8.5 / 11.7 ms | 64 / 430,466 | 51 / 11 |
| Experimental town 7 | 40 / 287 | 8.46 s | 10.0 / 13.1 ms | 87 / 610,998 | 70 / 11 |
| Village 7 repeated | 22 / 236 | 5.95 s | 8.4 / 13.0 ms | 65 / 413,064 | 52 / 11 |

All measured frames were visible, with a 3456 × 1674 device canvas. Repeating village 7 restored identical renderer resource counts after the town. Unload returned to 2 geometries / 1 texture. Character counts differ across profiles; the authored reference had no active characters during its recorded orbit, so these are scene costs rather than equal-content comparisons. Loading includes DEM readiness, GLB work, foundation/receiver construction and synchronous CPU texture generation. There was a development refresh during the town/repeat sequence; treat timings as indicative. Small town stays experimental because load latency, surface softness and wider shadows need future LOD/partitioning review. Sixty buildings pass synthetic generation tests, but only forty were reviewed and measured in-browser.

## Validation and future integration

`node scripts/check-settlement-density.mjs` covers 27 combinations of profiles, seeds 7/42/2026 and lower/default/upper requests; deterministic negative-elevation terrain; distinct seeds; waiting/unsuitable/partial results; bounded searches; building/road/court geometry; entrance connections; graph deduplication/connectivity; actual villager traversal; environmental clearance; real-GLB profile replacement during loading; terrain reset/retention; relocation; texture UV and roof shadow coverage; reload; lease balance and owned-resource disposal. [CPU generation measurements](previews/settlement-density/generation-performance.json) exclude GPU and material-map work. Flat terrain reaches 4–8 hamlet buildings, the 22-building village defaults, and all 30/40/60 town requests tested; upper village requests sometimes safely stop at 23–24.

The [browser validation record](previews/settlement-density/browser-validation.json) includes profile changes, retained camera layouts, unload counts, cold-start villagers and 2×/restored terrain exaggeration. Development-refresh texture warnings did not recur in a clean profile-switch run.

The original procedural, authored settlement, Roman assets/kit/variants, ambient-life, environment, geography, biome, hillshade and terrain texture checks pass. TypeScript, ESLint and the webpack production build pass. The original Giza fixture remains covered by the asset/integration checks. The existing v1 documentation and screenshots remain a baseline in [procedural-settlements.md](procedural-settlements.md).

Limitations remain the view-dependent confirmed DEM adapter, conservative circles rather than an exhaustive plot solver, fixed orthogonal networks, no hydrological/archaeological evidence, and no large-town LOD or geographic streaming. Future evidence integration can supply profile constraints, documented road alignments, provenance-bearing plots or a complete `SettlementDefinition`; no renderer or ambient-life replacement is required. Historical source data and population inference remain deferred.
