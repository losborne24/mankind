# Scenario-only bottom bar

The bottom area now contains only scenario controls. With no active scenario it is empty. Guided, paused and completed journeys use `ScenarioTimeline`; Explore freely shows a compact scenario title with Resume / Exit (Replay / Exit after completion). The global year scrubber, year-step buttons, historical playback and speed controls have been removed from the UI. The historical date store remains authoritative for scenario dates and future dated world data.

The v1.1 notes below document the earlier historical-timeline presentation and its validation; they are retained as milestone history, not the current Explore UI.

# Context-aware timeline · v1.1

`components/Timeline.tsx` chooses the bottom presentation from the existing player snapshot. `ScenarioContext` shares only the mounted controller reference; it stores no copy of playback progress or historical time. The controller is still created and disposed alongside the existing MapLibre integration in `ScenarioPanel`.

| Player state | Suspended for exploration | Bottom presentation |
| --- | --- | --- |
| No controller / idle | false | Existing historical timeline |
| Preparing / playing / paused | false | Journey timeline |
| Paused | true | Historical timeline + Resume scenario / Exit |
| Completed | false | Completed journey + Replay / Continue exploring / Exit |
| Completed | true | Historical timeline + Replay / Exit |
| Error | false | Journey error + Retry / Exit |

Map input calls the existing `pause()` without setting the presentation flag. `exploreFreely()` pauses and sets `snapshot.suspendedForExploration`; it never writes a camera pose or historical date. Resume clears that flag and uses the existing interruptible 1.8-second camera return, restoring `intendedTime` to the sole date authority, `useExplorationStore`. Replay, beat seeking and exit clear the flag. Completion leaves it false and preserves the final camera/date. Continue exploring deliberately sets it true.

`totalElapsed`, action `elapsed` and `progress` remain on the existing single ScenarioPlayer RAF chain. Historical playback remains on Explorer's existing loop and is stopped by the existing atomic `setHistoricalTime` action when guidance takes control. No year-to-progress conversion is used. Progress does not advance during pause, exploration or camera return.

`scenarioMarkers()` sums every camera action duration in each beat, then divides cumulative beat starts by total duration. The London demo now flies directly to London, with the Britain arrival removed. Its `zoomPanZoom` camera transitions zoom out at the origin for 25% of the duration, pan at a fixed overview scale for 35%, then zoom and tilt into the destination for 40%. The overview scale adapts to the distance between viewpoints. Its remaining actions run at twice the original speed: beat starts are 0, 5, 16, 22 and 31 seconds out of 33. Multi-action beats are supported. Beat elapsed is `snapshot.totalElapsed - marker.start`, exposed in development diagnostics. Marker titles and accessible names come from the definition; labels use hover information to avoid overlapping text. All markers are keyboard buttons. The continuous progress indicator is read-only; it has no drag affordance. Previous/next and markers call the existing `jump()` / `skip()` path, rebuilding the historical context and compiling camera travel from the current viewpoint.

The upper-right panel retains narration, sources and scenario context. Playback and progress appear in the bottom bar. Scenario diagnostics, demo loading, restart and beat selection now live in the existing Debug tools panel alongside the unchanged settlement, terrain and LOD controls. Mobile secondary actions live in Journey options. Focus outlines and native button/summary keyboard controls are provided.

## Validation

- `pnpm typecheck` and `pnpm lint` pass.
- All 15 `scripts/check-*.mjs` checks pass, including geography, map terrain, assets, settlements, LOD/streaming and scenario regressions. Generated timing-only reports were restored after the run.
- `check-scenarios.mjs` now exercises presentation transitions, unequal beat durations, independent BCE date edits while suspended, restoration on resume, repeated interruption, beat temporal context, completion, replay, exit, one scheduled RAF and rendered timeline controls/statuses.
- `pnpm exec next build --webpack` passes. Default `pnpm build` was attempted in and outside the sandbox; both fail in Turbopack's CSS worker while binding a port (`Operation not permitted`), matching the existing environment limitation.

## Browser acceptance

The captures below record the original v1.1 timing and six-beat route, before the faster London-first revision.

Actual Chrome input at localhost exercised start, route progress, map drag and wheel interruption, explicit pause, free exploration, a keyboard historical-date change from July 2012 to 3000 BCE, date restoration on resume, stadium beat selection, completion, Continue exploring, replay, previous/next with Enter, the mobile options menu and exit. The viewport was tested at 390 × 844 and restored afterwards. Screenshots are observations of these interactions, not substitutes for them.

| Capture | Checkpoint |
| --- | --- |
| [01](previews/scenario-timeline/01-explore.jpg) | Ordinary historical timeline before starting |
| [03](previews/scenario-timeline/03-playing.jpg) | Guided arrival during travel |
| [04](previews/scenario-timeline/04-torch-progress.jpg) | Torch journey progress |
| [05](previews/scenario-timeline/05-gesture-paused.jpg) | Drag pauses; journey presentation remains |
| [06](previews/scenario-timeline/06-explicit-paused.jpg) | Explicit pause at the ceremony beat |
| [07](previews/scenario-timeline/07-explore-freely.jpg) | Deliberate exploration with Resume action |
| [07b](previews/scenario-timeline/07b-independent-date.jpg) | Manual 3000 BCE date while suspended |
| [08](previews/scenario-timeline/08-resume.jpg) | Return transition restores July 2012 |
| [09](previews/scenario-timeline/09-stadium-travel.jpg) | Ceremony beat and exact date |
| [10](previews/scenario-timeline/10-completed.jpg) | Completion at stadium, final date and actions |
| [10b](previews/scenario-timeline/10b-continue-exploring.jpg) | Continue exploring retains final date/location |
| [10c](previews/scenario-timeline/10c-replay.jpg) | Replay resets progress |
| [11](previews/scenario-timeline/11-exited.jpg) | Exit restores historical controls |
| [12](previews/scenario-timeline/12-mobile-playing.jpg) | Mobile transport |
| [13](previews/scenario-timeline/13-mobile-options.jpg) | Mobile secondary actions |
| [14](previews/scenario-timeline/14-wheel-paused.jpg) | Zoom interrupts the camera-return transition |

Preparation is synchronous and lasts until the first player frame; its state and rendered status are covered by automated checks, but a distinct preparation screenshot was not captured. Physical touch hardware was unavailable; pointer interruption and listener cleanup are tested, with mouse and keyboard exercised in Chrome. No new London assets or geographic engine changes were made.
