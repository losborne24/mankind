# Phase 3 Step 10 — integration and historical-world handoff

Subsequent UI update: the bottom area is now reserved for scenario controls. The global historical scrubber/playback controls were removed; Explore freely uses a compact Resume / Exit bar. The historical timeline captures and checks below describe the milestone at review time. See [current timeline behavior](scenario-timeline.md).

Reviewed 29 October 2026 against the actual working tree, including the pre-existing uncommitted v1.1 timeline and faster London-first journey. Those changes were preserved. This is an integration milestone; no AI API, historical database, asset kit or historical reconstruction was added.

## Outcome and changes

The current globe, terrain, Roman fixtures, streaming slot, historical date and guided player share one functioning application. All 15 domain regression scripts, TypeScript, ESLint and a webpack production build pass. Live Chrome review confirms mouse/scroll/keyboard interruption, exploration with independent BCE dates, coherent resume, detailed Roman scenes and resource release. See the acceptance log below for the exact scope; physical touch and production GPU performance remain unvalidated.

Fixes and validation additions made in this milestone:

- Removed the broad manual-camera wrapper around the entire Debug panel. Opening diagnostics no longer pauses a journey.
- Added explicit fixture activation ownership (`data-scenario-exit`): fixture controls stop the scenario before their camera/scene handler executes, clearing progress, overlays, streaming intent and scheduled guidance. Fixture activation releases on click/input rather than pointerdown: resetting the expanded diagnostics on pointerdown could move the target before pointerup and lose its click. Ordinary map input still interrupts immediately at capture phase.
- Centralized external control listener registration/cleanup in `attachScenarioControls`, with regression coverage for inert diagnostics, fixture takeover, timeline input, return cancellation, listener removal and 30 repeated idempotent pause/resume cycles.
- Bounded director JSON traversal to 32 levels / 100,000 values, rejecting cycles explicitly. Scenario execution is limited to 1,000 actions / one hour total, retaining the existing 100–180,000 ms per-command bound. Existing valid demo data needs no changes.
- Added finite, continuous camera entry/terminal checks across every London beat; added terrain-frame reset and complete custom-layer teardown regressions to streaming checks.
- Added bounded development rendering diagnostics under existing Debug tools. They observe existing map frames; they schedule no RAF, timer or repaint. Three draw counts now accumulate all anchored scenes/shadow passes in a frame rather than only the last `renderer.render()` call.
- Added `node scripts/check-phase3.mjs` as the repeatable integration gate. It saves command results and restores legacy timing reports so fresh timings do not overwrite prior benchmark evidence.

## Implementation inventory

Status: **W** = Working and validated within the stated test scope; **I** = Implemented but insufficiently tested for broader/general historical use; **B** = Broken or regressed; **P** = Planned but not implemented. W does not claim every possible device, terrain or dataset is validated.

| System | Actual implementation / dependencies | Status and evidence | Limits / integration risks |
| --- | --- | --- | --- |
| Globe / MapLibre | `components/GlobeView.tsx`, `map/mapStyle.ts`, `lib/geo.ts`, `map/geographicAnchor.ts`; one MapLibre 6.15 map and canvas | **W**: `check-geography`, live globe and journey | Natural Earth generalization, globe/terrain warnings; projection-aware camera adapter uses MapLibre internals |
| DEM / exaggeration | `map/terrain.ts`, `map/terrainTexturePrecision.ts`; Mapterhorn Terrarium DEM and MapLibre displayed-height authority | **W**: geography, settlement, procedural and streaming checks; live village at 1×/2×, authored relocation | Remote coverage may fail; real source replacement / negative sites not exhaustively browser-tested; version-specific drawn-DEM capability |
| Biome / hillshade | `map/biomes.ts`, `map/hillshade.ts`, `components/DebugPanel.tsx`; external raster pyramid, DEM | **W**: biome, hillshade, terrain-texture checks; visible globe/local ground | PNV represents potential vegetation, not dated historical land use; close geography remains sparse; production needs a configured raster URL |
| Three custom renderer | `map/threeTestLayer.ts`; MapLibre's shared WebGL2 context, Three 0.186 | **W**: live local/regional rendering and streaming teardown regression | Compact tangent scenes; whole-object globe blending; not a large-area reconstruction renderer |
| Asset registry / cache / disposal | `lib/assets/{registry,prepareAsset,glbCache}.ts`; GLTFLoader, SkeletonUtils, scene leases | **W**: assets, kit, variations, settlement and streaming checks; live warm return/unload | Registry is compiled data; idle budget is 12 sources / 64 MiB estimate, not a hard total including live leases; retained warm resources are intentional |
| Roman kit / scenery | `scripts/roman-kit/`, `lib/assets/roman*.ts`, `map/settlements/{enhancedVilla,InstancedScenery,settlementEnvironment}.ts` | **W**: Roman asset/kit/variation/environment checks; authored seven-building scene | Reusable Roman development fixture; no universal era support, no London architecture |
| Profiles / navigation | `map/settlements/{proceduralSettlement,romanSettlement,ambientNavigation}.ts` | **W** for fixtures: procedural/density/navigation regressions, seeds 7/42/2026; live 6/22/40 buildings | Procedural morphology and authored graph projection assume existing road conventions; general sourced road networks need an explicit graph adapter |
| Ambient life | `map/settlements/{AmbientLifeSimulation,AmbientLifeView}.ts`; graph, cached Roman villager, terrain road sampling | **W**: ambient-life and streaming regressions; live 2/4/5 inhabitants | Maximum five; no distant population simulation; Roman rig/asset is hardcoded, broader character sets are **P** |
| Settlement LOD | `map/settlements/{settlementStreaming,RegionalSettlement}.ts`, `lib/assets/romanSilhouettes.ts`; physical distance and visibility | **W** for distance gates/hysteresis: streaming checks at latitude/pitch/date line; live regional/local | First visit uses representative clusters before actual layout exists; exact first-visit building-position identity is **I**. Regional ground/roads absent; discrete replacement, no crossfade |
| Geographic streaming | `map/threeTestLayer.ts`, `ProceduralSettlementSession.ts`, `SettlementScene.ts`; descriptors, one scene slot, revision guards, cooperative textures | **W**: all three fixtures, cancellation, switch priority, warm caching, pending teardown and timer cleanup tests; live visits/return/unload | Nearest one settlement gets the proxy/detail slot; fictional descriptors dev-only; `validYears` is reserved, filtering is **P** |
| Historical timeline authority | `state/explorationStore.ts`, `lib/historicalDate.ts`, `components/Explorer.tsx` | **W**: exact date/interval/BCE checks; live BCE edit and resume restoration | Year plus optional exact interval are one atomic store state; scenario intendedTime is a restore target, not a ticking second historical clock |
| ScenarioDefinition | `lib/scenarios/schema.ts`; plain JSON, version 1, references, dates, coordinates and supported commands | **W** for current contract: schema/complexity/reference/date/bounds regressions | Scenes describe requirements without resolving assets; richer location/date/uncertainty binding is **P**, detailed below |
| Scenario state machine | `lib/scenarios/player.ts`; ports into existing map/store/overlays/streaming | **W**: sequencing, multi-action beats, errors, pause/resume/explore, replay/exit/disposal and single scheduler checks; live controls | No arbitrary time seek; preparing is synchronous until first frame; no distinct browser preparing capture |
| Camera commands | `lib/scenarios/camera.ts`; compiled deterministic elapsed-time samplers | **W**: great-circle/date-line, metre-based routes, heading continuity, orbit, command boundaries and stadium endpoint; live journey | Five-beat 33 s London-first revision has no separate Britain beat; wide London descent supplies the geographic approach. No asset-readiness wait or historical architecture claim |
| Manual interaction | `lib/scenarios/interruption.ts`, `components/ScenarioPanel.tsx`; captured pointer/wheel/navigation keys, document controls, store and movestart adapters | **W** mouse/scroll/keyboard: actual Chrome interruption and automated listener cleanup; touch handler **I** | No physical touch device available. Untagged external camera movements pause; explicit fixture activation exits. Future search must participate in this ownership contract |
| Context-aware timeline / controls | `components/{ScenarioContext,Timeline,ScenarioTimeline,ScenarioDiagnostics}.tsx`, `lib/scenarios/progress.ts` | **W**: rendered statuses/buttons and independent-date regressions; live suspend, resume and completion actions | Progress is read-only; beat buttons use supported jump/skip. Responsive screenshots from prior v1.1 are historical evidence, not fresh Step 10 touch validation |
| Routes / markers / narration | `map/scenarioOverlays.ts`, `components/ScenarioPanel.tsx`, `lib/scenarios/london2012.ts`; referenced content and provenance | **W**: source/reference checks, visible route/landmark/narration in Chrome | Illustrative relay, approximate stadium and present geography; no verified torch-route reconstruction. Multi-location events as a reusable historical record are **P** |

No remaining reproducible core regression was observed in the tested paths. Search/place navigation is **P**, not a completed milestone: `components/TopBar.tsx` contains a disabled search placeholder. Automatic historical filtering, scene requirement resolution, historical road import and an AI director are also **P**. Default Turbopack production compilation is **B** in this execution environment (details below).

## Camera, date and lifecycle contract

`GlobeView` constructs and removes the only MapLibre map. Three's Camera is a projection helper for drawing into that map, not an independently navigable geographic camera. The store view is a one-way mirror from `moveend`; LOD and streaming only observe it/the real map.

The player has one cancellable RAF chain. Its writes use `map.jumpTo(pose, {scenario:true})`; programmatic moves therefore do not self-interrupt through the external `movestart` listener. Actual raw input interrupts before MapLibre handlers. Pause retains narrative elapsed time, intended historical date and scenario pose; camera navigation stays enabled. Resume restores the date atomically and returns over 1.8 s, without advancing narrative progress. Another interruption cancels that return and retains the original intended pose. Stop releases camera/streaming/overlay control without resetting the map or historical date. Completion preserves the stadium location/date.

`useExplorationStore.setHistoricalTime()` atomically stops historical playback. Explorer's historical RAF also checks live `isPlaying` before writing, preventing a stale scheduled tick from competing with scenario guidance. Manual year changes clear the optional exact date. Explore freely exposes the historical timeline while retaining suspended narrative progress.

Fixture controls exit guidance before their handlers navigate or change the scene. Merely inspecting diagnostics does not alter ownership. Future search/place controls should use an explicit manual-navigation activation before requesting the same map camera. Map removal disposes the player, and React cleanup detaches raw/document/store/map listeners. Custom-layer removal cancels the streaming settle timer, revision-guards late completions, disposes ambient instances and scene-owned resources, then clears retained GLB/pixel caches. It does not destroy MapLibre's shared GL context itself.

## Regression evidence

Run from the repository root:

```sh
node scripts/check-phase3.mjs
node scripts/profile-settlement-loading.mjs phase3-final
```

The gate ran every existing `scripts/check-*.mjs` domain check (15 scripts): ambient life, biomes, geography, hillshade, procedural generation, Roman assets, Roman kit, Roman variations, scenarios, density, environment, streaming, settlement and terrain textures/materials; then `pnpm typecheck`, `pnpm lint`, `pnpm exec next build --webpack`. **18/18 commands passed.** It excludes itself to avoid recursion. Individual stdout/stderr and durations are in [regression.json](previews/phase3-final/regression.json).

`pnpm build` was also attempted normally and with escalation. Both failed in Turbopack's MapLibre CSS processing worker: `creating new process → binding to a port → Operation not permitted (os error 1)`. This is the same environment limitation recorded in prior milestones. The webpack production build succeeds, including static page generation; no bundler setting was changed to mask this failure. Webpack's result is not a successful default Turbopack build.

Terrain regressions distinguish confirmed zero, unavailable/uncertain samples and valid negative elevation; retain only previously confirmed heights during temporary loss; reset them on relocation/source/exaggeration; verify road unions, entrance access, foundation slope limits and character placement. Streaming adds a full displayed-terrain-frame rebuild and double custom-layer removal. Synthetic DEM checks are not claims of survey accuracy or exhaustive live DEM coverage.

## Browser acceptance and captures

Actual Chrome at `http://localhost:3000/`, initially 1728 × 893 CSS pixels / 3456 × 1786 device canvas. The browser was subsequently resized externally to a 3456 × 1674 device canvas for completion/replay/exit observations; each raw row records its canvas. No browser viewport override or physical touch emulation was used. Tests used real native mouse drag/scroll and keyboard input plus visible UI controls, not calls that synthesize player state. Raw rendered diagnostics were read after actions and saved in [browser-observations.json](previews/phase3-final/browser-observations.json). A few rows intentionally record in-flight/unsuccessful activation attempts; readiness is determined by each row's actual `lod`, `stage` and `detailedScenes`, not its label.

| Capture | State / actual check |
| --- | --- |
| [01 global](previews/phase3-final/01-global.jpg) | Ordinary Explore timeline, global globe, zero cached GLBs |
| [02 regional](previews/phase3-final/02-regional.jpg) | Regional hamlet at the same local camera, two draws, zero detailed scenes/leases |
| [03 village](previews/phase3-final/03-village.jpg) | 22 buildings, roads, scenery and four active villagers |
| [03a hamlet](previews/phase3-final/03a-hamlet.jpg) | Six accepted buildings, two active villagers |
| [03b authored](previews/phase3-final/03b-authored.jpg) | Seven authored buildings; subsequent relocation also reached ready |
| [04 town](previews/phase3-final/04-town.jpg) | Experimental 40-building town, five active villagers |
| [05 start](previews/phase3-final/05-start.jpg) | London approach, scenario timeline/date, no Roman scene |
| [06 route](previews/phase3-final/06-route.jpg) | Full uninterrupted run during illustrative route-following; geographic route, landmark and narration visible |
| [07 interruption](previews/phase3-final/07-drag-paused.jpg) | Mouse drag during flyTo stops guidance and preserves progress |
| [08 paused](previews/phase3-final/08-route-paused.jpg) | Wheel during followRoute; scenario progress presentation remains |
| [09 freely explore](previews/phase3-final/09-explore-freely.jpg) | Historical timeline with suspended journey; Home subsequently selected 3000 BCE without changing progress |
| [10 resume](previews/phase3-final/10-resume.jpg) | Interruptible return; separate BCE test restored July 2012 immediately |
| [11 completed](previews/phase3-final/11-completed.jpg) | Full uninterrupted run ends at stadium, 27 July 2012; Replay / Continue exploring |
| [12 unload](previews/phase3-final/12-unloaded.jpg) | Reference disabled, zero live leases, inhabitants disposed; warm sources intentionally retained |
| [13 exploration](previews/phase3-final/13-exploration.jpg) | Exited journey, ordinary historical controls and final map position retained |

Also exercised: explicit pause during Stratford flyTo; keyboard ArrowLeft during orbit; wheel during return; diagnostics expansion during playback; fixture selection during return; authored relocation; village terrain 1×→2×→1×; warm hamlet revisit; rapid destination changes; three rapid UI pause/resume cycles; exit during an active return; completion/replay/Continue exploring/exit. See saved observations for exact states. Touch pan/pinch needs physical-device acceptance. Preparation, error paths, 30 rapid pause/resume cycles, full disposal and all profile/seed combinations are automated rather than claimed as exhaustive browser interactions.

## Performance and resources

Fresh development observations below use stationary local zoom 18.4, pitch 55°, bearing −25°, normal terrain. The diagnostics retain the last 240 active map-frame intervals, exclude idle gaps ≥250 ms and count Three submission draws/triangles, including shadow passes when present. All gaps ≥250 ms are excluded, including any long stall; these p95 figures do not characterize hitch frequency. They exclude MapLibre's own draw/geometry/texture counts. Cached source bytes and Three counts are different measurements and should not be added as a GPU-memory total. GPU timings, JS heap snapshots and precise first-visible latency were not exposed by this browser workflow. Scene `readyWall` starts at scene construction; it excludes preceding camera travel, streaming dwell and procedural generation. No end-to-end first-pixel latency is claimed.

| State | Scene ready wall | Median / p95 active interval | Three draws / triangles | Resident geometry / texture objects |
| --- | --- | --- | --- | --- |
| Global, cold | n/a | no steady animation | 2 / 104 (debug beacon) | 2 / 1 |
| Regional hamlet, warm | n/a | stationary; no steady animation | 2 / 108 | 22 / 5 (warm resources included) |
| Local hamlet, seed 7 | 579 ms | 8.3 / 9.2 ms | 32 / 208,930 | 31 / 9 |
| Local village, seed 42 | 725 ms | 8.3 / 9.1 ms | 65 / 429,792 | 54 / 11 |
| Local town, seed 2026 | 878 ms | 8.3 / 9.3 ms | 90 / 620,610 | 75 / 11 |
| Hamlet return, warm | 31 ms | 8.3 / 9.1 ms | 32 / 208,930 | 41 / 11 (broader warm cache) |
| Authored reference | 689 ms | 8.3 / 9.2 ms | 43 / 565,440 | 49 / 19 |
| Continuous London route | no scene | 8.3 / 8.7 ms | 0 / 0 | 2 / 1 |
| All Roman scenes disabled after reference tour | no scene | stationary; no steady animation | 0 / 0 | 31 / 13 (bounded warm sources) |

After the procedural tour: 11 cached sources, approximately 13.1 MiB estimated storage, three surface arrays / 8.25 MiB. Hamlet return issued no extra source request (11 before and after), and texture CPU was zero. Regional departure and complete disable recorded zero detailed scenes and zero live leases. After the additional authored tour, disable trimmed to 12 idle entries / approximately 18.1 MiB. A live authored scene can have more than 12 total entries: the budget applies to idle sources, never evicts live leases, and is not a global active-scene memory cap. Full teardown is regression-tested to clear the warm cache; ordinary unload intentionally does not.

[Fresh Node CPU report](previews/streaming/phase3-final-cpu.json): actual GLBs and assembler, confirmed synthetic flat DEM, seed 7, one run per profile. Scene load/first placement was 455 / 586 / 830 ms for hamlet/village/town, plus 5 / 14 / 38 ms layout. Prior Step 9 cooperative figures were approximately 481 / 709 / 762 ms. This single-run variation does not establish a speedup or regression. Step 8.5/9 browser canvas was 3456 × 1674; this run is 3456 × 1786 and includes the open diagnostics. The town/village seeds and camera/content conditions must match before drawing performance conclusions. These are development CPU/frame observations, not production GPU benchmarks.

Visual limits remain: generalized close-scale geography; soft ground/shadow detail on the experimental town; regional roof/box silhouettes over uniform biome terrain with no roads/ground treatment; initial regional clusters do not yet know the source layout; discrete LOD replacement; no real historical London buildings. No major regional/terrain renderer was rebuilt.

## Phase 4 data integration contract

The reusable boundary is plain data, not MapLibre/Three calls. The following existing inputs are available now; enrichment still requires a typed adapter and validation before ingestion.

| Historical data | Current entry point | Required Phase 4 extension |
| --- | --- | --- |
| Dated place / settlement | `SettlementDescriptor` in `settlementStreaming.ts`: ID, WGS84 origin, radius, optional definition/config and reserved validYears | Stable historical place ID, dated layout references, actual time filtering, provenance and uncertainty; avoid requiring a procedural Roman profile for sourced places |
| Building / asset / landmark | `SettlementDefinition.buildings`: stable ID, registry assetId, metre offsets and orientation; `AssetDefinition` in registry | Validated era/culture-neutral asset catalog, dated placement, sourced coordinate/elevation, reconstruction alternatives and missing-asset fallback |
| Roads / layout / navigation | `SettlementDefinition.roads`: ordered local metre points/width/access target, ground areas; `ambientNavigation()`/`navigationGraph()` | Import adapter for documented arbitrary road alignments and explicit navigation graph; current authored first-road projection and procedural ID dispatch are fixture assumptions |
| Terrain placement | `queryTerrainSample`, `offsetCoordinate`, `SettlementScene` terrain sampler | Preserve confirmed/uncertain distinction, physical versus displayed metres, local coordinate frame and source revision; larger areas need another spatial partition strategy |
| Historical selection | `useExplorationStore.setHistoricalTime`, astronomical year and optional month/day/interval | Shared date schema and policies for precision, calendars, intervals and uncertain dates; no second timeline store |
| Event / multiple locations | Scenario `content.locations`, point overlays and beats | Reusable dated Event record referencing multiple place IDs, with roles and evidence; overlays remain presentation references |
| Dated route | Scenario `content.routes`: geographic coordinate array, certainty, source refs, optional time | Stable route/entity ID, endpoint/place refs, segment evidence, date precision and uncertainty; local settlement roads stay metre-based |
| Sources / uncertainty | Scenario source records (id/title/HTTP URL), location/route/scene source refs and established/illustrative/unverified certainty; asset licence provenance | Citation detail, access/retrieval metadata, claim-level evidence, spatial/temporal uncertainty and reconstruction rationale; asset licence does not establish historical accuracy |
| Scene requirements | Scenario `content.scenes`: ID, description, certainty, source refs, required flag; beat sceneRequirements refs | Geographic/date scope, requested assets/entities, fidelity/availability policy and resolver adapter. Current player warns and continues with geography; it does not assemble described scenes |

Current `ScenarioDefinition` v1 is serializable, versioned, validated, geographic/date aware and independent of its producer. Content holds sources, locations, routes, overlays and scene descriptions; beats/actions direct the experience using supported commands. A valid stored or future AI-produced JSON record uses the same `player.load()` path as the developer demo. The AI director must never receive direct renderer/map mutation authority. Source URLs are referenced, not automatically researched or verified by the player.

No rendering architecture rewrite is required to begin defining historical data. General asset resolution, road navigation, dated layout selection and source-rich scene binding are real adapter/schema work remaining for Phase 4, not already implemented historical capabilities.

## Recommended Phase 4 Step 1 — Historical World Data Schema v1

1. Define and validate a JSON-only versioned envelope with stable IDs for Source, Place, DatedLayout, AssetReference, BuildingPlacement, RoadNetwork, Event, Route and SceneRequirement. Reuse the existing coordinate/date conventions; specify units and astronomical BCE numbering.
2. Make spatial/temporal precision, validity intervals, evidence references and reconstruction uncertainty explicit. Keep historical claims, asset licence provenance and visual fidelity separate.
3. Model dated variants and missing-content fallback without assuming Roman culture, a procedural profile or a universal building kit. Let events reference multiple places and routes carry their own dates/evidence.
4. Write small adapters to existing descriptors/definitions, the sole date store and ScenarioDefinition. Resolve scene requirements through data/services outside the player; preserve its camera and lifecycle ports.
5. Validate one small evidence-grounded fixture end to end, with invalid-reference/units/date/uncertainty tests and a documented provenance record. Do not begin global content ingestion or AI research in that schema step.

The outline above records the Phase 3 handoff. Phase 4 Step 1 has since been implemented in the [Historical World Data Schema v1](historical-world-schema.md); its explicit limits and current validation are documented there.
