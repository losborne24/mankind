# Historical dataset loading and date selection — Phase 4 Step 2

Step 3 now adds [historical place/event inspection and explicit navigation](historical-place-inspection.md) to loaded datasets.

One explicit dataset can now be loaded into the live development globe and selected against the existing historical-date store. The London example supplies map-only event/place/route context. It supplies no historical building layout or model, and produces zero detailed settlement descriptors. Existing guided playback and Roman development fixtures retain their separate, explicit ownership paths.

## Implementation

| Entry point | Responsibility |
| --- | --- |
| `app/api/historical-world/london2012/route.ts` | Read-only endpoint for the existing reviewed JSON fixture; no external research or source fetching |
| `lib/history/datasets.ts` | Explicit local catalog, streamed UTF-8 JSON download capped at 2 MiB, cancellation and HTTP/parse failures |
| `lib/history/selection.ts` | Pure place/event/route and dated-layout selection; full date precision/interval and uncertainty handling |
| `lib/history/session.ts` | One dataset/request owner, revision guard, validation, date subscription, atomic replacement and disposal |
| `map/historicalWorldOverlays.ts` | Map-only points/labels and dashed route context; no independent camera or asset loading |
| `ThreeTestLayer.setHistoricalSettlements()` | Installs explicit dated definitions through the existing one-slot LOD/streaming system; empty selections remain empty |
| `components/HistoricalDatasetControls.tsx` | Opt-in controls and diagnostics inside existing development Debug tools |

The schema and fixture remain those from [Step 1](historical-world-schema.md). No new historical claims, assets, data service, AI planning or database were added. The global historical timeline remains removed; the new date input is a development diagnostic tool only.

## Selection policy

All date changes read the existing store's `historicalTime` (including end date), falling back to its year. No second historical clock or date store exists. `matchHistoricalTime()` extends the original date matching to entire selected intervals. A coarse or interval selection must fit fully inside a known record period to match `within`; partial overlap or uncertain dates give `possible`.

A place with its own period uses that explicit period. Without a period, matching dated event/route/layout/scene context can make the anchor visible, with `basis: dated-context`. This does not infer the lifespan of London or any other place. Places with no date evidence/context remain `undated` and are omitted from map discovery, rather than appearing throughout history.

Events and routes are omitted outside their periods. Possible context uses qualified marker styling/diagnostics. Dataset route lines are dashed; geometry evidence remains in the original record. Map labels and points are approximate geographic context, not period-specific architecture.

For each visible place, all non-outside layout candidates are considered:

- Exactly one fully matching layout, fully matching place and fully matching roads may resolve through the existing adapter.
- Multiple matching candidates, possible dates or insufficient date precision produce `ambiguous`, with no detailed descriptor. No newest-layout, first-result or Roman fallback is chosen.
- Missing models, unsupported render geometry or nonmatching dated roads produce `unavailable`, retaining a geographic representation and diagnostic explanation.
- No layout produces map-only context. An empty dated result unloads detail; it never reverts automatically to fictional settlements.

The whole selected interval is considered before resolving a layout at its start date. Thus an interval spanning two dated layouts cannot silently choose the first one. Source uncertainty and asset-unavailability diagnostics remain explicit. The existing schema's supported year/calendar and compact-renderer boundaries still apply.

## Ownership and lifecycle

Loading or replacing a dataset immediately clears prior historical overlays and detailed scenes. A single AbortController and revision check reject late responses, even if a transport ignores abort. Validation completes before committing. The date is read again at commit, so a date change during loading cannot install stale content. Date changes recompute selection without refetching or changing the camera/date themselves. The same descriptor set does not churn sources or reload scenes.

Failures expose an error and empty historical content; they do not resurrect the previous dataset or fictional fallback. Unload/dispose abort pending requests and detach the date subscription. There is no animation or polling loop in the loader. Map removal and React cleanup dispose the session/overlays. Ordinary dataset unloading intentionally retains bounded warm asset caches under the existing cache policy.

Scenario date commands, manual edits while paused and resume restoration flow through the sole date store and update the dataset normally. Loading metadata never takes camera control. The development View ceremony context action explicitly requests the existing camera; a manual date edit interrupts guidance through its existing store subscription.

Activating a Roman fixture clears the dataset session before its fixture handler runs. The fixture then controls discovery and scene streaming; later scenario dates cannot silently reactivate the cleared dataset. Dataset mode also suppresses the proximity-triggered Giza Roman debug kit, including when the selected dated descriptor set is empty. Historical descriptors are not labeled fictional in the settlement marker source. Unloading the dataset restores the existing three development descriptors. Direct programmatic fixture consumers should likewise clear their dataset session before changing renderer ownership.

## Live development workflow

1. Open Debug tools → Historical dataset → Load London dataset. Loading leaves the current camera/date alone. At the initial 3000 BCE date the example's records are outside its dated context.
2. Choose View ceremony context to set 27 July 2012 and visit the approximate stadium location. Diagnostics report the matching event, two context places and zero detailed layouts.
3. Apply `2012` to inspect a possible year-only match; apply `2013` to remove the dated context. The input accepts astronomical year, year-month or year-month-day, including year 0 for 1 BCE. Invalid input shows an error without updating the store.
4. Start the existing journey. Its July date yields possible matches; the exact ceremony date yields within matches. Change the diagnostic date during playback to pause it, then Resume to restore its intended date/selection.
5. Select a Roman fixture or Unload dataset to release historical discovery. No global timeline UI is reinstated.

The control is development-only, as part of the existing Debug panel. The reusable loader/session/selection and read-only fixture endpoint are available for later product integration. No dataset is loaded automatically in production or on page startup.

## Validation

```sh
node scripts/check-historical-loading.mjs
node scripts/check-phase3.mjs docs/previews/historical-loading
```

The new regression covers exact/coarse/interval/BCE/uncertain dates, overlapping layouts, missing assets, cancellation and stale responses, latest-date commit, no date-triggered refetch, invalid data/HTTP/JSON/oversize payloads, the real date store and ScenarioPlayer pause/resume flow, teardown and map-only feature/source disposal. Streaming regressions additionally verify replacing active detailed fixtures, idempotent historical updates, empty dated sets, historical marker metadata and restoration of development discovery.

The integration gate runs all domain scripts, TypeScript, ESLint and a webpack production build. The previous default Turbopack CSS-worker port restriction was not re-investigated in this data milestone. **20/20 commands passed** in the final integration run. Raw output is in [regression.json](previews/historical-loading/regression.json).

Actual Chrome acceptance at localhost exercised loading, exact/coarse/outside dates, existing journey dates, manual-date interruption/resume and fixture takeover. Captures: [selected date](previews/historical-loading/01-selected-date.jpg), [coarse date](previews/historical-loading/02-coarse-date.jpg), [outside date](previews/historical-loading/03-outside-date.jpg), [scenario date](previews/historical-loading/04-scenario-date.jpg), [Roman fixture takeover](previews/historical-loading/05-fixture-takeover.jpg). These are functional observations, not performance benchmarks or evidence of architectural accuracy.

## Next step

Phase 4 Step 3 should provide historical place inspection and explicit navigation: select a visible place/event, review its date/evidence/uncertainty and available layouts, then choose a supported visit. Keep ambiguous dates and unavailable models visible to the user. General historical road surfaces/navigation, actual reconstruction assets and a scene-requirement resolver remain separate later work.
