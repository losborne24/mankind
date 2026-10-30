# Housesteads reference geometry — Phase 4 Step 5a

The app now displays an attributed, georeferenced fort outline when the Housesteads place is visible. Load Housesteads, choose **View Housesteads context**, then Inspect the fort. A dashed blue line shows the outline; its legend and inspector identify its unspecified phase.

This completes reference-geometry acquisition, import, validation and display. **The original Step 5 objective of dated building-footprint ingestion remains outstanding.** The acquired geometry is a fort boundary, not an individual building or a Roman-phase reconstruction. Detailed layouts remain unavailable and no models are requested.

## Acquisition and interpretation

The [WallGIS GIS catalogue](https://archaeologydataservice.ac.uk/archives/collections/view/1004975/downloads.cfm?archive=GIS) provides fort polygons and a georeferenced historic Housesteads survey, but does not list phase-specific building-footprint vectors. The fort archive was downloaded and inspected directly. Its Housesteads record is CUID 499 and contains one 48-vertex closed ring. Broad start/end fields were not promoted into dates for the polygon. The [project overview](https://archaeologydataservice.ac.uk/archives/collections/view/1004975/overview.cfm) warns that GIS accuracy may contain errors.

The [archive metadata](https://archaeologydataservice.ac.uk/archives/collections/view/1004975/metadata.cfm) declares CC BY 4.0. Source credit, copyright, licence link and adaptation notice appear in the inspector and expandable legend. The original ZIP is retained with [attribution and reproduction instructions](../data/history/housesteads/source/README.md). The source manifest records its SHA-256; the importer refuses an altered archive pending review.

The importer reads only this pinned archive's DBF and Polygon records, selects Housesteads by both name and CUID, transforms British National Grid vertices to WGS84 using the existing rasterio runtime and rounds to eight decimal places. It does not simplify the ring or infer dimensions, accuracy, walls, heights, entrances or building positions. No new dependencies were installed.

## Data and display contract

`HistoricalWorldData.referenceAreas` is optional and backward compatible. Each record has a place reference, `site-outline` kind, Polygon, cited evidence and licence attribution. It deliberately accepts no period, layout binding or building kind. This keeps a reusable reference outline separate from the three empty phase layouts. The curation ledger adds a separately documented geometry claim.

Validation rejects unsupported geometries, holes, unclosed rings, nonfinite/out-of-range coordinates, zero-length edges, self-intersections, adjacent edge reversals, negligible area, missing evidence/licence information and unresolved/duplicate IDs. Reference rings are limited to 512 vertices, 100 areas and points within 2 km of their place anchor. These are display/import limits, not archaeological assertions. Source declarations still require human provenance review; a populated licence field alone does not verify reuse rights.

Selection exposes the outline only while the associated place matches existing dated context. It cannot establish place presence, bridge a phase gap or resolve ambiguous layouts. The dashed map layer uses existing GeoJSON ownership and releases with the dataset. There is no extrusion, camera command or scene descriptor generated from the polygon. Source geometry is inspectable as metadata even when the selected date is outside the record.

## Verification

```sh
.biome-venv/bin/python scripts/import-housesteads-outline.py
node scripts/check-reference-geometry.mjs
node scripts/check-phase3.mjs docs/previews/housesteads-geometry
```

**23/23 integration commands passed**, including TypeScript, ESLint and the webpack production build. [Raw results](previews/housesteads-geometry/regression.json) include the new geometry check and all existing historical, scenario, rendering and lifecycle regressions. The source import also reproduces the fixture and manifest without a diff. No new performance benchmark is claimed.

Chrome acceptance at localhost verified the [outline with attribution at AD 200](previews/housesteads-geometry/01-reference-outline.jpg) and [its removal at AD 500](previews/housesteads-geometry/02-outside-date.jpg), while the inspector retained the source metadata and disabled Visit. Automated checks additionally cover phase-gap visibility, ambiguous dates, detached validation, map-layer teardown and zero scene descriptors.

## Remaining geometry work

Step 5b requires rights-cleared individual building footprints with a justified phase attribution. The reviewed WallGIS outline cannot supply these. The linked English Heritage phase plan remains reference-only under its published reproduction restriction. Obtain an appropriate geometry source or express reuse permission before tracing it; then review CRS, georeferencing accuracy, building identity and phase interpretation before adding a dated footprint contract or reconstruction assets. No permission request or message has been sent to a source owner.
