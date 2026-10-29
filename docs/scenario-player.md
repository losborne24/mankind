# Scenario Player v1

Run `pnpm dev`, then choose **Start London journey** in the card at the top right. The manually authored tour lasts approximately 78 seconds of active playback. Drag, wheel, touch, keyboard map navigation, timeline input and existing debug navigation interrupt the guide. Resume returns to the saved viewpoint over 1.8 seconds, restores the intended historical time and continues the interrupted action. Repeated interruption of that return preserves the original saved pose. Exit releases control and removes scenario geography; completion keeps the final location and highlights. Replay starts from the current viewpoint, with a smooth flight back towards Britain.

No AI, research service, paid map service, new model pack or extra runtime dependency is used.

## Existing integration points

- `components/GlobeView.tsx` owns the only MapLibre instance, adds the existing Three custom layer on `load`, mirrors camera poses to Zustand on `moveend`, and removes the map on unmount. ScenarioPanel attaches to this instance after load. No renderer or map was duplicated.
- `state/explorationStore.ts` is the timeline authority. `historicalTime` refines its astronomical `year` with an exact date or interval. Scenario writes set both atomically and pause normal timeline playback. Manual year changes clear the refinement. `Explorer` retains its existing timeline RAF, with an immediate store check to prevent a queued playback frame from overwriting a newly selected scenario date. Geometry remains independent of selected dates.
- MapLibre gestures can carry `originalEvent`; engine camera events alone are insufficient evidence of input. Capture listeners stop direction before gesture handlers run. Scenario `jumpTo` samples carry `{scenario:true}` event metadata. Untagged external camera commands also interrupt, covering existing debug `flyTo` calls. Timeline capture and a store subscription cover both DOM controls and external changes.
- `ThreeTestLayer` owns the existing Three renderer, terrain updates, repaint requests, assets, LOD selection, debounce, one detailed slot and cache limits. Step 9 is present. `setScenarioTravel` extends its travel debounce to frame-by-frame directed movement, because individual `jumpTo` calls report stationary between frames. Holds allow ordinary detail preparation. Pausing, completion and disposal release this flag.
- Streaming intent is an optional player port carrying focus, destination, route, arrival delay, importance and detail. The current adapter consumes the travel flag and exposes intent through the development handle. It deliberately performs no speculative GLB loading: there are no London settlement descriptors or assets to prefetch. Existing descriptor discovery, cache budgets and cancellation remain authoritative. Future prefetch can consume the same port without a second streaming subsystem.

## Format and execution

`lib/scenarios/schema.ts` defines and validates version 1. Input must be plain JSON, with finite bounded numbers, valid dates, distinct IDs, valid source URLs and resolvable references. Unknown command and overlay discriminants are rejected. Validation clones accepted input. Coordinates are longitude/latitude; latitude is bounded to ±85°, zoom to 0–20, pitch to 0–65°, duration to 100–180000 ms, orbit sweep to ±720°. Duration specifies travel speed deterministically. No runtime engine references or functions belong in definitions.

`content` holds locations, routes, provenance, certainty, overlays and optional scene descriptions. `beats` holds direction: ordered actions containing one camera command, optional time instruction and the set of overlays to show. Multiple actions provide timed sequential changes within a beat. An action's time/overlay instructions apply at its start; its camera duration controls its length. Optional dated routes and time intervals are supported. Scene requirements currently degrade to geographic context with a warning, including required scenes; they never wait indefinitely or fabricate a replacement scene.

The small command union is `flyTo`, `orbit`, `followRoute`, `hold`. Fly commands interpolate along great circles with shortest bearing rotation. An explicit `transition: "cinematic"` adds a zoom-out arc for large changes. Orbit first eases onto a fixed focal point, then changes bearing with constant zoom/pitch. Route entry takes 15% of command duration; the remainder follows cumulative great-circle segment distances, with eased start/end speed, spatial heading look-ahead and unwrapped bearing interpolation. Repeated/zero-length segments are safe. This is camera choreography, not a claim about a participant's historical speed or travel path.

`lib/scenarios/player.ts` is independent of React and MapLibre. Camera, timeline, overlays, streaming and scheduling are injected ports. A single finite RAF chain exists only while playing or returning. Time steps are capped at 100 ms after stalls, preventing a background tab from jumping past narration. Elapsed progress is saved explicitly, independently of engine animation state. New actions compile from the preceding camera pose; skip and development beat selection rebuild temporal context from preceding actions and ease from the current viewpoint. Stop/disposal cancel scheduling; disposal is idempotent. Completion releases ownership without changing viewpoint. Definitions do not have an autonomous control loop.

`map/scenarioOverlays.ts` uses one GeoJSON source for world-anchored points, labels and routes. Cards and captions are data-driven in ScenarioPanel. Diagnostics, restart, demo loading and beat selection appear only in development. The normal card sits opposite the existing debug panel and scrolls on short screens.

## London authorship and evidence

`lib/scenarios/london2012.ts` is the single demonstration definition. The sequence is Britain → London overview → central London illustrative route → Stratford → stadium orbit on 27 July → free exploration. The official London 2012 guide supports the UK flame journey context. World Athletics' report of 28 July 2012 supports the ceremony's date, venue and director. References are included in the definition and linked next to the relevant captions.

Coordinates locate Westminster, Tower Bridge and the stadium approximately. They are geographic anchors, not surveyed reconstruction boundaries. The central London line was authored for camera testing and is prominently labelled **illustrative**, never as the actual relay. The existing biome/terrain map has no London street network, modern buildings, stadium model, ceremony reconstruction or historical geometry changes. Recognizability at city scale therefore comes from landmark labels, the route and contextual cards; this milestone does not provide visual city fabric. Selecting 2012 does not certify the map or Roman fixtures as historical for that date.

## Validation

- `node scripts/check-scenarios.mjs`: JSON validation, versions, invalid commands/references/dates/numeric bounds, distance-based route progress, dateline interpolation, cinematic zoom, fixed orbit focus, bearing interpolation, beat/action sequencing, pause/manual exploration, repeated interruption during resume, skip/restart/stop, map-port errors, disposal, one scheduled frame, no writes after stop, input listeners and cleanup, exact dates/intervals/BCE through the actual timeline store.
- `node scripts/check-settlement-streaming.mjs`: existing LOD/cache/concurrency/stale-load checks plus scenario-directed travel debounce when MapLibre reports stationary.
- All 14 existing check scripts passed: geography, biomes, hillshade, terrain textures, Roman kit/assets/variations, settlement rendering, procedural generation, density, environment, ambient life, streaming and streaming materials.
- TypeScript and ESLint passed. `pnpm exec next build --webpack` passed. Default `pnpm build` was attempted in and outside the sandbox, but Turbopack's CSS worker could not bind its local port (`Operation not permitted`). No production code workaround or build configuration change was added for that environment restriction.

## Browser review and limits

Actual Chrome review at localhost exercised start, continuous globe approach, London labels, route following, eastward travel, stadium focus, completion, mouse drag, wheel, keyboard map input, timeline changes while paused and while returning, repeated return interruption, and date restoration from 1912 to July 2012. Scenario-generated camera movement did not pause the player. Captures are in `docs/previews/scenarios/`; several checkpoints were revisited with development beat selection to capture them clearly. These are geographic player screenshots, not historical reconstruction images.

The original hand-authored Roman reference reached 7/7 buildings with 522 scenery instances and three walking villagers in Chrome. The procedural village reached 22/22 buildings and four walking villagers; regeneration completed while the scenario remained paused. Screenshots 11 and 12 record those visits.

Touch/pinch interruption is covered by pointer input tests, but physical multi-touch hardware was not available for browser review. There is no automated GPU performance benchmark or visual reconstruction claim. Existing resource/concurrency regression checks provide the loading safeguards. Browser fog warnings on globe projection predate this player. The 100 ms frame cap means wall-clock tour length can grow on a heavily throttled tab. Source links and optional external terrain retain their existing network availability limits.

## Browser capture index

| Checkpoint | Capture |
| --- | --- |
| Launch on the existing globe | [01-start](previews/scenarios/01-start.jpg) |
| Approach to Britain | [02-britain](previews/scenarios/02-britain.jpg) |
| London landmarks (revisited checkpoint) | [03-overview](previews/scenarios/03-overview.jpg) |
| Illustrative route following | [04-route](previews/scenarios/04-route.jpg) |
| Stadium orbit and exact date | [05-stadium](previews/scenarios/05-stadium.jpg) |
| Drag interrupts travel | [06-interrupted](previews/scenarios/06-interrupted.jpg) |
| Free exploration and manual time | [07-free-exploration](previews/scenarios/07-free-exploration.jpg) |
| Returning and restoring July 2012 | [08-resuming](previews/scenarios/08-resuming.jpg) |
| Completion; map dragged freely | [09-completed](previews/scenarios/09-completed.jpg) |
| Return interrupted a second time | [10-return-interruption](previews/scenarios/10-return-interruption.jpg) |
| Original Roman reference | [11-roman-regression](previews/scenarios/11-roman-regression.jpg) |
| Original procedural village | [12-procedural-regression](previews/scenarios/12-procedural-regression.jpg) |
