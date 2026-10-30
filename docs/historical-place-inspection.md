# Historical place inspection and navigation — Phase 4 Step 3

Historical places and events can now be inspected before choosing a visit. A loaded dataset supplies the content; its record list is keyboard accessible, and visible place markers are clickable. Inspection displays selected/record dates, evidence, sources, coordinate uncertainty and layout availability. An explicit Visit action uses the existing MapLibre camera. The full historical timeline remains removed.

## Entry points

| File | Responsibility |
| --- | --- |
| `lib/history/inspection.ts` | Pure, detached inspection view and supported visit targets derived from validated data/current selection |
| `lib/history/session.ts` | Selection ownership, date refresh, close/replacement/unload lifecycle and current-target checks |
| `map/historicalWorldOverlays.ts` | Visible-marker click activation, current-ID checks and listener cleanup |
| `components/HistoricalInspector.tsx` | Nonmodal record panel, dates, multi-location actions, evidence, source links and keyboard focus handling |
| `components/HistoricalDatasetControls.tsx` | Accessible place/event list, portal mount and explicit camera handoff |
| `scripts/check-historical-inspection.mjs` | New inspection/visit/lifecycle/rendering regressions |

The data schema, dataset endpoint, renderer and scenario definition remain the existing ones. No historical source research, new historical claims, period architecture, automatic asset substitutes or independent camera/date store were added.

## Behavior

Load the London example through Debug tools → Historical dataset, then select its ceremony date. Choose an Inspect button or click a visible place marker. Native Enter activates list buttons, focus moves to the inspector heading, and Close returns focus to the original control when it remains mounted. The panel is nonmodal and scrollable; map and scenario transport controls remain available. Source links show publisher, access date and the stored citation, including the fixture's direct-fetch limitation. Links are not automatically followed or treated as verified evidence by the application.

A place panel distinguishes its documented identity from its separately qualified position. Where a place has no lifespan, it explicitly says it is shown through dated context rather than inventing a date range. An event panel preserves each location's role and offers separate geographic visits and Inspect place actions. Event evidence does not promote approximate marker coordinates to surveyed positions. An omitted positional error is shown as “accuracy unquantified,” never zero error.

Availability follows the Step 2 selection:

- `ready`: a dated layout can be visited at local scale through existing streaming.
- `none`: geographic context remains available, with no detailed layout claim.
- `ambiguous`: all candidate titles/periods remain visible; inspection does not choose one or load a substitute. An explicit geographic visit remains possible.
- `unavailable`: a geographic visit can still locate the place, with a readable missing-model/unsupported-layout explanation.
- `outside` / `undated`: metadata stays inspectable, but Visit is disabled with a reason.

Possible date matches are clearly labeled. They may be visited geographically while detailed selection remains conservative. Unsupported polar coordinates do not create a navigation target. Geographic visits use overview/local-context zoom; only a ready layout gets settlement-scale detail. No date is inferred or changed by a visit.

## Ownership, freshness and cleanup

`HistoricalDatasetSession.inspect()` publishes UI metadata without calling the world-application port. Opening from the list, changing inspected records and closing do not rebuild scenes, request models, write the historical date or move the camera. Native map input continues to use the existing raw-input scenario interruption policy; opening a marker therefore counts as map interaction, while opening a list record does not interrupt playback.

Visit activation rechecks `session.getVisitTarget()` against the latest snapshot. It pauses the shared ScenarioPlayer, records the selected geographic point in the existing store and calls the existing map's `flyTo`. The prior command/return is cancelled by the ordinary player pause path before the new camera motion starts. Resume retains the scenario's original pose, progress and intended date.

Date changes rebuild the open inspector against the same record key. A record can become outside/undated, disabling an old visit button instead of navigating from stale React props. Resume can make it eligible again through the authoritative date store. Dataset replacement, load failure, unload, fixture takeover and disposal close stale inspection. Marker activation accepts only IDs in the current visible historical source; unrelated and removed IDs are ignored. Map-layer listeners are detached on disposal.

The view is plain JSON data with callbacks, and can be integrated into later product entry points. Today the dataset is still loaded explicitly through development controls; no production dataset chooser, search engine or automatic global discovery was added.

## Validation

```sh
node scripts/check-historical-inspection.mjs
node scripts/check-phase3.mjs docs/previews/historical-inspection
```

The new checks cover documented-event/approximate-position separation, sources, multi-location roles, possible/outside dates, missing models, ambiguous layout candidates, unsupported coordinates, detached snapshots/targets, no inspection-induced scene updates, current-date activation guards, replacement/close/disposal, current-marker IDs and listener cleanup. Rendered controls are checked for date/availability labels, disabled visits, source details and escaped text.

The full integration gate includes the existing historical loading/schema, scenario, terrain, Roman, ambient-life, LOD/streaming and cache regressions, plus TypeScript, ESLint and a webpack production build. **21/21 commands passed** in the final run. Raw command results are in [regression.json](previews/historical-inspection/regression.json). The previously documented default Turbopack CSS-worker limitation was not re-investigated for this UI milestone.

Chrome acceptance used actual keyboard and pointer input at localhost:

| Capture | Observation |
| --- | --- |
| [Place](previews/historical-inspection/01-place.jpg) | Selected-date match, unknown place lifespan, approximate coordinates, unavailable detailed layout and source evidence |
| [Event](previews/historical-inspection/02-event.jpg) | Keyboard selection and separate ceremony-venue/host-city roles/actions |
| [Explicit visit](previews/historical-inspection/03-explicit-visit.jpg) | Visit pauses guided playback and begins geographic navigation |
| [Outside date](previews/historical-inspection/04-outside-date.jpg) | Date change retains metadata and disables stale Visit |
| [Resume](previews/historical-inspection/05-resumed.jpg) | Intended scenario date and record eligibility restored |
| [Marker](previews/historical-inspection/06-marker.jpg) | Actual native click on the stadium marker opens its record |

Dataset unload also removed the open inspector and restored fixture discovery. The sample remains map-only: detailed/ambiguous/missing-model variants are exercised by explicitly synthetic regression records, not claimed as browser-visible London architecture. No production performance benchmark or physical touch-device acceptance is claimed.

## Recommended next step

Phase 4 Step 4 is now implemented: [Housesteads curation and validation](housesteads-curation.md). It provides sourced phase contexts with explicit geometry gaps. See that report for the next geometry-ingestion milestone.

The next milestone is reviewed geometry ingestion for one phase. General non-orthogonal road surfaces/navigation and a historical scene-requirement resolver remain separately scoped rendering work.
