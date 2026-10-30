# Historical World Data Schema v1 — Phase 4 Step 1

Step 6 now resolves scene requirements during dataset selection and gates their
3D projections. [Scene resolution contract](historical-scene-resolution.md).

Step 5b adds optional `footprints` with separate geometry/phase evidence, date
uncertainty, representation and attribution. These dated 2D extents do not create
3D settlement descriptors. [Footprint ingestion pilot](historical-footprint-ingestion.md).

Step 5a adds optional `referenceAreas`: cited, attributed single-ring site outlines, separate from dated layouts. These have no phase or building binding and never produce scene descriptors. [Reference geometry contract and validation](housesteads-reference-geometry.md).

Step 2 now implements [explicit dataset loading and date-aware selection](historical-dataset-loading.md). The Step 1 limits below describe the original schema milestone; see Step 2 for the current live opt-in integration.

The first historical-data boundary is implemented as plain JSON records, TypeScript types and a strict runtime validator. It describes places, evidence, dated layouts and events independently of camera direction. No database, AI service, new model kit, automatic world ingestion or historical reconstruction was added.

## Entry points

| File | Responsibility |
| --- | --- |
| `lib/history/schema.ts` | Versioned historical records and explicit units/conventions |
| `lib/history/validate.ts` | Strict unknown-field, reference, provenance, bounds and JSON validation; returns a detached snapshot |
| `lib/history/time.ts` | Date validation, precision-aware periods, conservative matching and scenario date conversion |
| `lib/history/adapters.ts` | Historical content → existing ScenarioDefinition; explicit layouts → existing SettlementDefinition/discovery descriptors |
| `lib/history/fixtures/london2012.json` | Small source-grounded event fixture with separately qualified geography and missing architecture |
| `scripts/check-historical-world.mjs` | Data, adapter, actual player/scene and failure-path regressions |

This is an application data schema, not an implementation of the JSON Schema standard. `validateHistoricalWorld(unknown)` is the runtime ingestion boundary; callers should not cast external JSON directly to `HistoricalWorldData`.

## Conventions

The envelope requires `version: 1`, `coordinateSystem: "WGS84"`, `calendar: "proleptic-gregorian"`, ID/title and all eight collection arrays. Arrays may be empty. IDs are stable, globally unique across top-level collections and restricted to letters, digits, `.`, `_`, `:`, `-` (maximum 128 characters). Building and road IDs are unique within their respective layout/network. A later layout may reuse the stable ID of an existing building.

Geographic tuples are `[longitude, latitude]` in degrees. Local layout/road tuples are `[east, south]` in metres relative to their place's origin, matching the existing renderer. Layout `extentMeters` is the side length of its square declared extent. Heading is in radians in the existing local X/Z frame. Foundations specify a maximum displayed-terrain rise in metres. Geographic routes use WGS84 points; they are not interchangeable with local road points.

Historical dates use astronomical year numbering: 0 = 1 BCE, −1 = 2 BCE. V1 uses the existing supported −2999…2025 range. Dates have year and optional month/day; a day requires a month, and calendar days/leap years are validated. Calendar conversion from source-specific Julian, regnal or other dates must occur in a separate documented adapter; v1 does not silently infer a calendar.

Periods have `start`, optional `end`, optional nonnegative `uncertaintyYears` (up to 1,000) and optional boolean `approximate`. The latter preserves qualitative uncertainty without inventing a numeric margin; overlapping matches remain `possible` and exact scenario-time conversion refuses them. It does not expand the stored interval. Endpoints are inclusive at their stated precision. A year covers that entire year, a month covers that month, and a date covers that day. No end means the bounded period expressed by start, **not an indefinitely surviving place/layout**. Open-ended lifetimes are not represented in v1; use an explicitly evidenced bounded interval or leave an optional place period unknown. Do not encode an unknown event date as a fabricated exact date.

`matchHistoricalPeriod(period, selection)` returns `within`, `possible` or `outside`. Coarse selections that only overlap part of a record, and all matches involving date uncertainty, are `possible`. Settlement resolution does not silently select those layouts. `toHistoricalTime()` refuses to turn a year-uncertain period into an exact scenario command. Direction must deliberately supply a presentation date instead.

## Records and evidence

- **Source:** title, publisher, HTTP(S) URL, ISO access date and optional citation. A source URL is a citation, not permission to fetch it or proof that its claims have been verified.
- **Place:** identity/kind, optional parent/period, geographic position, discovery radius and evidence. Position has its own evidence and optional error radius; evidence for a venue's name does not establish surveyed coordinates. Omitted error radius means unquantified accuracy, not zero error.
- **Asset:** logical ID/category, optional compiled registry ID and optional licence citation. Historical evidence and asset licensing are separate. Missing registry bindings are valid records; they are not replaced with Roman models.
- **Dated layout:** place, period, local frame/extent, structural building placements, optional road-network reference and foundation limit. Multiple layouts can describe different dates without changing a place ID. V1 selects a whole dated layout; per-building date changes belong in separate layout variants.
- **Road network:** place/period/frame plus explicit road polylines, widths, optional building entrance links and evidence. The data model accepts non-orthogonal alignments. Rendering support is narrower, below.
- **Event:** period, description and one or more place references with roles. A multi-location event is one record, not several unrelated marker narratives.
- **Route:** geographic polyline, period, optional endpoint/context place references (array may be empty) and evidence. A route's evidence does not derive from the event it accompanies.
- **Scene requirement:** place/period, requested layouts/assets, description, required flag, fallback policy and evidence. This describes what is wanted, not a camera command or an already reconstructed scene.

Every evidence object has `certainty`, `sources` and a nonempty explanatory `note`. `documented` and `inferred` require source references; `illustrative` and `unknown` may have none. Explanations should identify what the cited material supports and which geometry/details remain assumptions. These classifications are author declarations validated structurally; the validator cannot verify historical truth.

Validation rejects duplicate/dangling references, place ancestry cycles, mismatched layout/road/scene places, non-overlapping referenced layout periods, unknown entrance links, invalid asset categories, points outside layout extents, invalid coordinates/dates/units and unknown fields. Sources cannot use executable URL schemes or embedded credentials. JSON is bounded to 100,000 values, depth 32, arrays of 10,000 and text of 16,000 characters; cycles, getters, functions, sparse arrays and non-JSON objects are rejected before cloning. These are data-ingestion limits, not a promise that all valid content is renderable.

## Adapters and ownership

```ts
import data from '@/lib/history/fixtures/london2012.json';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { bindHistoricalScenario } from '@/lib/history/adapters';

const world = validateHistoricalWorld(data);
const { scenario, warnings } = bindHistoricalScenario(world, {
  version: 1,
  id: 'experience:opening-context',
  title: 'London opening ceremony',
  description: 'Geographic context with sourced event information.',
  scope: {
    bounds: [-0.3, 51.4, 0.2, 51.7],
    time: { start: { year: 2012, month: 7, day: 27 } },
  },
  beats: [{
    id: 'venue', title: 'The ceremony venue',
    sceneRequirements: ['scene:ceremony-context'],
    actions: [{
      camera: { type: 'flyTo', center: [-0.0166, 51.5387], zoom: 14, duration: 6000 },
      overlays: ['event:event:london-2012-opening', 'event:event:london-2012-opening:location:0'],
    }],
  }],
});
// The existing controller receives scenario through player.load(scenario).
// Surface warnings to diagnostics; do not treat them as historical evidence.
```

`toScenarioContent()` maps sources, locations, routes, descriptive scenes and event overlays into the existing scenario contract. Overlay IDs are `event:<eventId>` for a card, `event:<eventId>:location:<index>` for event markers and `route:<routeId>` for route lines. The full historical record remains authoritative: the existing scenario projection cannot carry every citation detail, spatial error or reconstruction rationale. It maps inferred evidence conservatively to illustrative and unknown evidence to unverified. Uncertain route dates are not exported as falsely exact timestamps.

`bindHistoricalScenario()` accepts experience direction separately, calls the ordinary scenario validator, checks referenced event/route/scene periods against action dates, and returns scenario plus warnings. Unsupported commands, durations and references still fail before playback. A requested scene with `fallback: "unavailable"` fails binding because no scene resolver exists; explicit `map-only` fallback is supported with a warning. The player, sole map camera and sole historical-date store need no new clock or producer-specific logic. World records themselves contain no camera commands.

`resolveHistoricalSettlement(world, layoutId, date)` returns `ready`, `outside-period`, `uncertain-period` or `unavailable`, with diagnostics. Ready results contain an ordinary `SettlementDefinition` and a `SettlementDescriptor` with an explicit definition. Such descriptors no longer require a procedural Roman profile/seed. Registry IDs must resolve to matching structural categories; missing assets fail the whole geometry projection. Resolution never invents an alternative building, layout or road network.

Imported definitions set `ambientLife: false`. The assembler now honors this before requesting character assets and prevents debug character controls from enabling Roman inhabitants on those definitions. Existing Roman fixture defaults are unchanged. Source road geometry is not fed to the procedural generator or assumed to be a valid walking graph.

## Deliberate limits

The data validator accepts WGS84 latitude ±90; the current scenario/local renderer adapters support ±85 and reject the unsupported projection explicitly. A local render projection is limited to 1,000 m extent, 100 buildings and 256 road segments. The existing terrain road assembler requires orthogonal local segments; arbitrary historical alignments remain valid data but return `unavailable` for this assembler. They are never straightened or replaced. The existing renderer's materials, regional proxies, terrain surfaces and architecture registry are still prototype systems, not a historically universal visual vocabulary.

`validYears` on a descriptor remains reserved metadata. This step does **not** subscribe historical records to the date store, dynamically discover historical places, choose between several matching dated layouts, or install new scenes in the live application. The caller must explicitly select a layout/date and supply its resolved descriptor through the existing world integration. Automatic historical selection/streaming is subsequent work. This prevents the existing fictional development fixtures from becoming purported historical content.

No historical scene resolver, sourced pedestrian graph, physical survey ingestion, persistence, AI planning or live UI has been added. The existing London demo remains unchanged; this separate fixture establishes a reviewable data contract and tests the adapter into the real player without changing that experience.

## Source-grounded fixture

[World Athletics, 28 July 2012](https://worldathletics.org/news/news/london-olympics-open-in-spectacular-fashion) reports the ceremony at the Olympic Stadium on 27 July and identifies Danny Boyle as director. The search-index excerpt was reviewed on 29 October 2026; direct fetching returned HTTP 403, recorded in the source citation. The fixture uses only those small factual claims. Its overview/stadium coordinates are approximate developer anchors, its route is explicitly illustrative, and the stadium asset has no registry binding. No London layout, street reconstruction or period-specific model is fabricated. The Roman building used in the automated geometry test exists only in a clearly synthetic test record, not in the sourced London fixture.

## Validation and next step

```sh
node scripts/check-historical-world.mjs
node scripts/check-phase3.mjs docs/previews/historical-world
```

The historical check covers detached JSON round-tripping; malformed records/references; BCE, leap dates, precision and uncertainty; source/coordinate distinction; multi-location events; temporal scenario binding; real player completion with one scheduler; profile-free regional descriptors; exact road preservation; unsupported road rejection; missing assets; and actual scene loading without default Roman character requests. The integration gate also exercises the existing Roman/terrain/streaming tests and runs TypeScript, ESLint and the webpack production build. **19/19 commands passed** in the final integration run. Raw results are saved separately from the Phase 3 report in `docs/previews/historical-world/regression.json`.

Recommended Phase 4 Step 2: add explicit historical dataset loading and date-aware place/layout selection, preserving diagnostics for ambiguous dates and unavailable render projections. Start with a small reviewed dataset and map-only representations; keep historical scene/asset resolution separate from scenario direction. General road surfaces/navigation should be an explicit later rendering extension, not a silent alteration of source geometry.
