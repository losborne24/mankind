# Historical scene requirements — Phase 4 Step 6

Historical dataset selection now resolves scene requirements before passing their
layouts to the existing settlement streamer. The inspector shows the result and
the reasons for missing content. Menander's sourced 2D extent remains available;
its reconstruction request falls back to map context because the date is inferred,
building layout is absent and no model is assigned.

This implements the **scene-resolution and assembly gate**, not a new historical
building kit. Real Menander, Housesteads and London datasets still supply no ready
3D reconstruction. A clearly synthetic regression fixture exercises successful
assembly with an explicitly assigned existing Roman model.

## Entry points and ownership

- `resolveHistoricalScenes(value, time)` in `lib/history/selection.ts` validates
  unknown input and returns a detached plan without applying it.
- `resolveSceneRequirements()` in `lib/history/sceneRequirements.ts` consumes
  validated records and the authoritative place/layout/date projections.
- `selectHistoricalWorld()` includes plans in `selection.scenes` and gates the
  descriptors already produced by the settlement adapter.
- The existing dataset session sends accepted descriptors to
  `setHistoricalSettlements()`. The existing streamer, model cache and renderer
  retain loading, cancellation, terrain and disposal ownership.

Planning does not fetch assets, generate geometry, extrude footprints, move a
camera, change the historical date or start animation. Inspection reads the plan
without reapplying scenes. Source evidence and model interpretation remain
available alongside the result.

## Outcomes

| Status | Meaning |
| --- | --- |
| `ready` | One dated supported layout and all necessary model placements resolve. This is static projection readiness, not proof that model bytes loaded or that a reconstruction is historically accurate. |
| `map-only` | An optional request explicitly permits geographic fallback; reasons and available dated footprint IDs are retained. |
| `unavailable` | A required request cannot be fulfilled, or geographic fallback is not permitted. |
| `outside-period` | The request does not overlap the selected date and does not affect active geometry. |

A scene can resolve only with an unambiguous `within` date match, a supported
location, a ready referenced layout and explicit matching registry bindings.
Unknown location/layout/placement/model interpretation prevents automatic 3D
resolution. Illustrative interpretation is allowed when explicitly declared; it
does not become documented historical evidence.

The resolver includes both requested assets and assets used by the selected
layout. A registered model must have the correct category and a placement.
Unregistered, unplaced, mismatched, unknown-interpretation and unsupported asset
categories produce distinct diagnostics. Props, vegetation and characters are not
silently omitted from requests: their historical placement path remains unsupported.
No generic Roman asset is selected for a missing logical model.

## Assembly rules

An active requirement naming a layout governs whether that layout's descriptor
can stream. Failed required requests block 3D descriptors at their place and
cannot be bypassed by another optional request there. Multiple ready references
reuse the one existing descriptor. Existing date/layout ambiguity is preserved;
listing an alternative does not silently choose it.

Standalone exploration layouts and layouts not named by optional requests retain
their existing behavior. Inactive requests do not block another date. The
inspector downgrades a blocked layout's availability and still allows an explicit
geographic visit when its place is eligible. A failed reconstruction requirement
does not lock ordinary map exploration.

The Menander fixture now has one optional scene request and one unbound logical
architecture reference. These are presentation requirements, not new historical
claims or downloaded assets. The footprint importer reproduces these additions
along with the existing geometry and ledger. No historical source geometry or
phase interpretation was changed.

## Validation

```sh
node scripts/check-historical-scenes.mjs
node scripts/check-phase3.mjs docs/previews/historical-scenes
```

**25/25 commands passed**, including TypeScript, ESLint and a webpack production
build. [Raw results](previews/historical-scenes/regression.json) retain all existing
historical, scenario, renderer and lifecycle regressions.

The new checks cover real map fallbacks, a synthetic ready structural projection,
explicit registry selection, missing/incorrect/unplaced/unsupported models,
unknown interpretation, uncertain/overlapping dates, absent geometry, renderer
limits, mandatory failure and inactive requirements, independent layouts,
detached public input, no fetching, inspector markup and session date/unload
behavior. Existing rendering checks exercise model loading and cleanup through the
same settlement adapter/streamer boundary; no new GPU benchmark is claimed.

Chrome acceptance at localhost verified:

| Capture | Observation |
| --- | --- |
| [Menander](previews/historical-scenes/01-menander-fallback.jpg) | 2D extent with explicit map-only fallback and missing-content reasons; zero 3D descriptors. |
| [Outside date](previews/historical-scenes/02-outside-date.jpg) | Scene request becomes outside-period, extent disappears and Visit is disabled. |
| [Housesteads](previews/historical-scenes/03-housesteads.jpg) | Existing middle-phase request resolves to map context with absent geometry/models identified. |

The ready 3D path is tested with a synthetic record; it is not claimed as a
browser-visible reconstruction of any of these historical sites.

## Remaining work and revised sequence

The [revised Phase 4 plan](phase4-plan.md) places a persistent catalogue and one
visible reconstruction before the guided journey. [Step 7 catalogue](asset-catalogue.md)
is now implemented; Step 8 is the first building. Menander's request pins a draft
catalogue version and remains map-only.

The current Scenario Player still treats historical scene declarations as
descriptive. It does not apply dataset scene plans or use them as a preparation
barrier. That integration now belongs to Step 9: author one evidence-grounded journey,
bind its scene requirements to this resolver, permit declared map fallbacks and
reject unmet mandatory requirements before playback. Keep the existing
interrupt/explore/resume contract.

Wall plans, heights, appearance and suitable reconstruction assets remain content
gaps for the sourced examples. General non-orthogonal road rendering/navigation
and historical placement of nonstructural assets also remain separate extensions.
