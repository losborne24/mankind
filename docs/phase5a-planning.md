# Phase 5A: evidence-driven, reusable spatial scene planning

Phase 5A adds the planning foundation from the [Phase 5 plan](phase5-plan.md): a
structured request becomes a validated scene plan over reusable spatial
blueprints, and then a journey the existing player runs. Nothing here
interprets free text, researches sources or generates models. Every plan says
what is **ready**, **missing** or **deferred**, and why.

```
ScenarioRequest ─► planner ─► ScenePlan ─► Checkpoint A ─► composer ─► ScenarioDefinition ─► existing player and renderers
                     ▲                          │
          SpatialBlueprint store                └─► 2D review · gap report · compact save
   (empire ► region ► city ► neighbourhood ► site)
```

## What existed and what was reused

The existing architecture was inspected before any code was written. Planning
extends it rather than running alongside it:

| Existing piece | How Phase 5A uses it |
| --- | --- |
| `HistoricalPeriod`, `Evidence`, `HistoricalSource`, catalogue pins `{id, version}` | Reused unchanged in every contract |
| `matchHistoricalTime`, `periodBounds`, astronomical years and `formatHistoricalYear` | All chronology checks and labels |
| `resolveHistoricalAsset` and the catalogue's review status | Asset identity and phase checks for rung-1 features |
| Forum Boarium context, reconstruction and world files; Rome AD 100 zoning, landmarks and density | Kept verbatim as blueprint layers (see Golden references) |
| `generateRomeFill` (pure and seeded) | A versioned generator a blueprint references by recipe and output digest |
| `ScenarioDefinition`, `validateScenario`, `ScenarioPlayer`, `HistoricalJourneyScenes` | The composer's output and the only playback path; no new renderer |
| `ZoningPlanView` | Split into a shared `PlanDialog`; the land-use plan is unchanged and the general review uses the same dialog |
| `TopBar`'s disabled search input | Replaced by the structured request bar |

`lib/plan/` did not exist before this phase. The pipeline guide's section 8 sketch
(`Claim`, `PlanFeature`, `ScenePlan`) is realised through the existing `Evidence`
and source records rather than as a parallel claim store.

## Contracts (`lib/plan/contracts.ts`)

All of these are plain JSON with runtime validation. They are validated when a
blueprint is registered and when a plan, request or save is read.

- **`ScenarioRequest`**: place (a registered id, or a title and coordinate for a
  new place), date or period, spatial scope (`auto` or a `SpatialLOD`), intent,
  and an optional target. It has no text field: Phase 5B's interpreter must
  produce this exact shape.
- **`SpatialLOD`**: empire, region, city, neighbourhood, site and architectural.
  This is the spatial scale a blueprint describes, not rendering LOD.
- **`SpatialBlueprint`**: versioned and immutable. It holds the place, its
  bounds (with evidence for the frame itself), applicability dates, traditions,
  parent and child refs, layers, features, generators, provenance, and schema and
  codec versions.
- **`PlanFeature`**: a stable id plus kind, chronology, existence, `Evidence`,
  `EvidenceReference`s, geometry, fallback rung, asset pin or request, and a
  pointer to its native record. Chronology takes one of three values:
  - `dated`: the feature has start and end dates.
  - `from-start`: only a construction date is known, so the feature is not
    assumed to stand later.
  - `timeless`: a landform. Today's geometry is marked as the modern default.
- **`EvidenceReference`**: a provenance link to an existing record: a source, a
  world record, a fixture record, a catalogue version or a map dataset.
- **`AssetRequest`**: feature identity, a proposed or existing catalogue id,
  location, period, asset type, current and target rung, evidence, and what is
  missing.
- **`ContentGap`**: kind (evidence, spatial, asset, chronology, coverage or
  place), scale, subject, what is needed, and whether it blocks the scene.
- **`ScenePlan`**: the request, status, focus and context chain, initial view,
  components (ready, missing or deferred), gaps, asset requests, deferred
  regions, absent features, a reuse decision, revisions, typology, scenes,
  pinned versions and digests, and the Checkpoint A result.
- **`PlanValidation`**: the issues found, plus the list of checks that ran, so a
  pass says what it covered.

## Hierarchical blueprints (`lib/plan/golden/blueprints.ts`)

| Blueprint | Scale | Content | Evidence status |
| --- | --- | --- | --- |
| `roman-empire` | empire | Viewing frame, modern relief, settlements registered datasets cover (Rome, Housesteads) | Frame illustrative; no province or road data, which the planner reports as gaps |
| `central-italy` | region | Frame, modern relief, Rome and the Pompeii (Menander) record | Same |
| `rome` | city | AD 100 zoning (38 zones, 16 roads and aqueducts, 22 markers, extent), 55 landmark placeholders, density field, `rome-fill` generator | As recorded in ZONING, LANDMARKS and FILL |
| `forum-boarium` | neighbourhood | Context layers, generated neighbourhood (66 objects, 1,620 lots), world records | As recorded in RECONSTRUCTION.md |
| `temple-of-portunus`, `temple-of-hercules-victor` | site | Catalogue-pinned exteriors (rung 1) | Catalogue review |
| `housesteads`, `house-of-menander` | site | Their registered world files | As curated |

Children lie inside their parents, and each level describes only its own
scale. Empire and region frames are labelled illustrative. Their settlements
cite registered records; nothing is added to make coverage look complete.

## Golden references (Test F)

Each existing file is a blueprint layer: its records are kept verbatim, along
with its top-level key order and indentation. `compileLayer` gives the file back.
Features index those records for planning, and their coordinates stay in the
records, stored once.

Test F covers the seven Forum Boarium and Rome AD 100 files plus seven outputs
derived from them. All 14 digests were recorded from v5.21.1 (ff1a51b) before
any Phase 5A change and are checked by `scripts/check-plan-golden.mjs`:

- **Files compiled back from blueprints:** zoning, landmarks, density, context,
  reconstruction, and the Forum Boarium and Portunus world files.
- **Derived outputs:** the Rome fill, landmark pieces, zoning features, the
  zoning plan SVG, the reconstruction, the context ground, and the Portunus
  journey.

All 14 match. **No incompatibility was found.** The app still reads the files. The
blueprints are their contract view, and a byte-identical compile is what makes
them interchangeable. Making blueprints the stored source (and the files their
build output) is a later step and needs no contract change.

The Forum Boarium lots, lanes and courts were laid out offline and are not
reproducible from references, so the blueprint stores them. The Rome fill is
reproducible: it is stored as a recipe (`rome-fill` v1, inputs, parameters) plus
its output digest, and the gate reruns it. A rule change that alters the output
without a version bump fails.

Every Rome landmark placeholder (55) has a traceable `AssetRequest`. Each one
records:
- the feature and a proposed catalogue id;
- the mapped centre, size, height and angle, with the position note;
- the period from construction to AD 100;
- the target: a bespoke exterior (rung 3 → 1);
- its sources;
- what is missing: a reviewed model, plus a sourced position where the
  placement is a best guess, and elevation evidence.

## Reuse and invalidation (`store.ts`, `overrides.ts`, `invalidation.ts`)

| Case | Behaviour |
| --- | --- |
| Same place, same date | The blueprint is used as stored, with its digest pinned; nothing is regenerated |
| Same place, other date | Each feature is revalidated. Dated features covering the new date are reused. Construction-only features, generated layers and catalogue phases are not assumed and become chronology or spatial gaps. Additions and removals are listed. A dated revision is asked for as a derived layer |
| Smaller area inside a blueprint | A coarser scope walks up the chain. A finer scope retrieves the child blueprint. A landmark with no blueprint is planned inside its city, with a site-blueprint gap and the rest of the city deferred |
| Similar place elsewhere | Only the tradition's typology (rules and kits) is reused. No other place's streets, lots or landmark positions are copied, and the place's own layout is a blocking gap |

Blueprints are immutable. `revise` registers the next version with the same
feature ids, and earlier versions stay registered, so saves pinned to them
still reopen. Scenario-specific changes are override layers (`hide`, `move`,
`add`) over a pinned base digest. The canonical blueprint is deep-frozen and
never mutated.

`invalidate` reports exactly what a change touches:

| Change | What is invalidated |
| --- | --- |
| Evidence changed | The features citing it |
| Asset available | That feature's representation only. Generated layers that keep clear of the feature stay valid |
| Feature corrected | That feature, plus generators reading its layer: correcting a Forum Boarium object invalidates the Rome fill (which keeps clear of the neighbourhood) but no Rome feature |
| Rule changed | That generator's layers |

Overrides built on changed features are flagged, and everything else is
reported untouched.

## Planner (`planner.ts`)

The planner works in steps:
1. Resolve the place by exact id, title or alias, never by nearest match.
2. Choose the focus and scale.
3. Evaluate every feature's chronology at the request date.
4. Check rung-1 models through the catalogue: phase, place, rights and review.
   Naming the site or a landmark is the explicit interpretation choice Phase 4
   requires.
5. Attach asset requests.
6. Apply a per-scale content table (an empire needs provinces, roads and an
   ancient coast; a city needs an extent, zoning, roads and landmarks). Gaps are
   raised only at the focus scale.
7. Defer children, ancestors and city districts without a blueprint.
8. Pick the nearest renderable 3D scene.

A requested range that contains the focus blueprint's own date, such as a reign or a century, is
planned at that date (`ScenePlan.moment`). The request is kept as asked. The plan, the result panel and the
journey's card all say which moment was shown and why. A range that doesn't contain the date, and any single
date, is planned as asked. This was added in planner `5a.2`; saves made with `5a.1` are refused with a version
message.

Planning is pure and deterministic: the same inputs give the same plan id and
digest, in this process or another.

## Checkpoint A (`checkpointA.ts`)

Checkpoint A runs over data only, with no renderer. It covers:
- schema and versions (schema, codec and generator);
- feature chronology at the request date;
- coordinates inside frames;
- parent and child containment, scale order and two-way links (a parent pinned
  to another version of a child is a warning, so a correction does not cascade);
- landmark placement (none in water);
- provenance (documented needs a source; every cited source must resolve);
- asset identity (a pinned model must be of this place, and usable);
- override consistency;
- missing versus deferred (missing always names a gap, deferred never raises one,
  and nothing deferred is planned);
- stable identifiers.

Seeded faults are caught: a landmark in the Tiber, a feature outside its frame,
a model of another building, a child outside its parent.

## Composer (`composer.ts`)

`composeScenario` turns a validated plan into a `ScenarioDefinition` that
`validateScenario` accepts. Its four beats are:
1. Approach over the parent.
2. Arrive at the planned initial view, requesting the plan's 3D scenes.
3. A card on what is missing, deferred and not standing.
4. Free exploration.

Markers and layers come from ready components and their evidence, and only
public sources are cited. Plans in the Rome chain are composed onto the dataset
that already hosts the AD 100 zoning toggle, 2D plan and zoned fill. No
renderer, geometry system or hand-authored scenario was added. The composed
Portunus journey selects the catalogue-pinned temples through the real player,
session and resolver, then completes (`check-phase5a-planning.mjs`).

In the running app, the composed Portunus journey arrives at the temple and renders both catalogue exteriors with the
neighbourhood. Getting there exposed a fault in the existing player (v5.20.1): after a lead-in flight landed,
it re-sent the action's flight intent, which marked the camera as travelling again. The detail it was waiting
for could then never start, until its 20-second frame budget ran out. It now keeps the parked intent while it
holds (`lib/scenarios/player.ts`). A regression test in `check-phase5a-planning.mjs` fails without the fix.

## Persistence (`persistence.ts`)

A `SavedScenario` holds:
- the normalised request;
- blueprint refs with digests;
- generator recipes with output digests;
- overrides, whose added features carry inline geometry;
- catalogue pins, asset request ids and evidence refs;
- the viewpoint;
- plan and journey digests.

Reopening re-plans and re-composes, then checks every digest. A changed
blueprint, version or override is refused with its reason, never silently
replaced. The request bar keeps saves in the browser's local storage.

## Structured request bar

The `TopBar` search is now **Plan a journey**. It offers:
- a place (the gazetteer by scale, landmarks without a blueprint, or another
  place by coordinates and tradition);
- a year and era;
- a spatial scope;
- an optional focus landmark.

It shows the plan's status, counts, reuse and leading gaps before anything
plays. From there you can play it, review it in 2D or save it. Saved journeys
reopen from the same panel.

## Results

`node scripts/check-plan-golden.mjs` and `node scripts/check-phase5a-planning.mjs docs/previews/phase5a`
are in the gate. The measured plans are in
[planning-report.json](previews/phase5a/planning-report.json).

| Test | Result |
| --- | --- |
| A: Portunus, AD 100 | Site scale, ready. Rome is context, Forum Boarium is local detail (84 features). Temple model usable through the catalogue. 1 interior request. Rome deferred. Arch of Janus and Santa Maria in Cosmedin reported absent |
| B: Rome, AD 100 | City scale, ready. 130 ready (zoning, roads, markers, extent, 55 landmarks at rung 3, fill). 55 asset requests. Forum Boarium and the 14 regiones deferred at neighbourhood scale, plus the region and empire context |
| C: Roman Empire, AD 100 | Empire scale. Rome as a marker and modern relief. 4 empire-scale gaps (provinces, roads, coast, settlement coverage). 0 asset requests. Housesteads absent (from c. AD 122) |
| D: Rome, AD 150 | Same blueprint and digest. Stable geography reused. 3 zones added, 5 removed. 55 landmarks and the fill unconfirmed (missing, with gaps). No models requested. The Portunus AD 100 phase is refused at AD 150 |
| E: Save and reopen Rome | Same placements, layout digest, blueprint and evidence refs, viewpoint and journey. 23,255 bytes, against 4.53 MB for the fill alone if it were stored |
| F: Golden regression | 7 files byte-identical, 14 digests unchanged |

Save sizes, excluding shared assets:

| Saved scenario | Size |
| --- | --- |
| Rome (city) | 23,255 B |
| Rome with an override | 23,617 B |
| Rome, AD 150 | 20,719 B |
| Portunus | 12,382 B |
| Empire | 1,047 B |

All are far under the 5 MB city benchmark.

## Remaining unsupported

- No natural-language interpretation, research, source discovery, ingestion or
  model generation (Phase 5B and 5C).
- **Empire and region coverage.** There is no province, frontier, road or
  ancient-coast data, and only registered settlements are shown. These are
  reported as gaps.
- **No AD 150 content.** A dated revision of Rome (zoning, fill, landmark
  survival) needs evidence. The planner identifies the work but does not do it.
- **Blueprints are not the stored source yet.** The fixtures remain the stored
  form, and blueprints compile back to them byte for byte.
- **Deferred regions are not streamed.** They are planned and listed, and
  progressive loading reuses the existing single detail slot.
- **One renderable scene.** Only the Forum Boarium temples are registered as a
  renderable 3D scene. Plans elsewhere compose map journeys.
## Recommended next phase

Phase 5B, step 7 (provider decision and server boundary), then step 8: free text
to `ScenarioRequest`, measured on an eval set. The contracts, planner and
request bar need no change for it. In parallel, author a dated Rome revision as a
derived layer, to exercise the other-date path with real evidence.
