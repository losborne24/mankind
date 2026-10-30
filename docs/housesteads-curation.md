# Housesteads curation — Phase 4 Step 4

The first site-focused dataset is available through **Debug tools → Historical dataset → Housesteads Roman Fort · phase contexts**. Load it explicitly, then choose **View Housesteads context** to apply the AD 200 preview date and camera. Inspect the fort or granaries to review evidence and availability. AD 200 is a presentation query, not a newly asserted historical event.

The dataset contains five source references, two places, three geometry-free phase contexts, two event dating windows, two unbound asset requirements and three map-only scene requirements. It supplies no roads, routes, building placements, model bindings or characters. The fort is not reconstructed.

## Source review

Reviewed on 29 October 2026. Source-specific access limits are retained in the fixture as well as here.

| Primary source | Use and review status |
| --- | --- |
| [English Heritage history](https://www.english-heritage.org.uk/visit/places/housesteads-roman-fort-hadrians-wall/history/) | Direct page review; site identity, early construction context and granary rebuilding dating window. |
| [English Heritage phased plans](https://www.english-heritage.org.uk/siteassets/home/visit/places-to-visit/housesteads-roman-fort/history/housesteads-roman-fort-phased-plans.pdf) | February 2015 PDF reviewed; page 1 chronological legend only. No drawing, image or traced geometry distributed. |
| [English Heritage description](https://www.english-heritage.org.uk/visit/places/housesteads-roman-fort-hadrians-wall/history/description/) | Direct page review; monument identity and description context. No dimensions or imagery copied. |
| [National Trust fort record MNA111210](https://heritagerecords.nationaltrust.org.uk/HBSMR/MonRecord.aspx?skin=printerfriendly&uid=MNA111210) | Search-index record reviewed; direct fetch timed out. Grid reference supplies a discovery anchor. |
| [National Trust granaries record MNA111089](https://heritagerecords.nationaltrust.org.uk/HBSMR/MonRecord.aspx?skin=printerfriendly&uid=MNA111089) | Search-index record reviewed; broad monument date classification and separate discovery anchor. Direct page review is outstanding. |

The [claim ledger](../lib/history/curation/housesteads-review.json) associates record fields with sources, distinguishes documented claims from inference and lists open geometry, road, architecture and chronology gaps. Citations do not grant asset rights.

## Dates and uncertainty

The plan's early, middle and late bands are represented as AD 122–138 (approximate), AD 170–270 and AD 270–400 (approximate). These labels describe phased fabric; they do not establish three complete, mutually exclusive whole-fort snapshots. Each context has an empty building list. Its extent and foundation values are inactive renderer configuration, not archaeological measurements.

The gap between early and middle bands remains unfilled. Inclusive boundaries yield two candidates at AD 270; selection reports ambiguity instead of choosing one. Approximate bands remain possible matches even within their stored interval. The optional `HistoricalPeriod.approximate` flag preserves qualitative uncertainty without inventing a numerical error margin, and exact scenario-time conversion rejects it. It does not extend the stored interval.

The early construction record uses an editorial AD 122–132 indexing window derived from the history page's decade-level description. The granary rebuilding record uses AD 205–208 as an approximate dating window. Neither record asserts continuous activity throughout those years. The granaries' AD 123–410 classification is also approximate; it does not establish an unchanged structure or continuous occupation. The fort has no invented place lifespan.

## Geographic anchors

National Grid references NY 7897 6879 and NY 7898 6882 identify 10 m grid squares. Their centres are transformed from EPSG:27700 to EPSG:4326 with the existing rasterio 1.4.3 runtime. The resulting fort and granary points are discovery anchors with unquantified accuracy, not surveyed footprints. Six decimal places are storage precision only. Display radii are UI settings.

Reproduce the calculation from the repository root:

```sh
.biome-venv/bin/python scripts/derive-housesteads-anchors.py
```

[Saved derivation](previews/housesteads/anchor-derivation.json) records input grid centres, output coordinates and runtime version. The script's fixture tolerance checks numerical consistency only.

## Integration and validation

The explicit local dataset catalogue now contains London and Housesteads. Changing the chooser clears the old session and inspector; loading, applying a date and navigating remain explicit actions. London's existing controls and preview are preserved. No dataset is loaded automatically in production.

```sh
node scripts/check-housesteads-data.mjs
node scripts/check-phase3.mjs docs/previews/housesteads
```

**22/22 commands passed**, including TypeScript, ESLint and a webpack production build. [Raw regression results](previews/housesteads/regression.json) cover source/claim references, the actual API handler, anchor consistency, qualitative uncertainty, phase gaps and overlaps, unavailable geometry, event locations, inspector metadata and bounded loading. The existing historical, scenario, terrain, asset and streaming regressions also passed. The previously documented default Turbopack CSS-worker limitation was not retried here.

Chrome acceptance used the running app at localhost:

| Capture | Verified behavior |
| --- | --- |
| [AD 200](previews/housesteads/01-middle-phase.jpg) | Middle context, visible sources and explicit missing reconstruction geometry; zero detailed descriptors. |
| [AD 125](previews/housesteads/02-approximate-phase.jpg) | Approximate early context remains possible/ambiguous. |
| [AD 270](previews/housesteads/03-boundary.jpg) | Both middle and late candidates remain visible. |
| [AD 206 event](previews/housesteads/04-dated-event.jpg) | Approximate rebuilding window with fort and granary locations. |
| [London switch](previews/housesteads/05-dataset-switch.jpg) | London records and original preview restored without stale Housesteads inspection. |

This validates metadata and map behavior. No architectural accuracy, detailed 3D site rendering or GPU performance benchmark is claimed.

## Next step

Phase 4 Step 5: acquire and review rights-cleared, georeferenced building footprints for one selected phase, then validate their ingestion before introducing reconstruction models. Resolve the geometry and chronology gaps in the ledger first; generic Roman models do not establish site evidence.
