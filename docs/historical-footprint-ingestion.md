# Dated footprint ingestion — Phase 4 Step 5b pilot

The dataset chooser now includes **House of Menander · AD 79 property extent**.
Load it, choose **View Menander footprint**, and Inspect the house. A dashed amber
polygon shows its documented property extent with an inferred final-phase date.
The inspector separates geometry evidence, phase interpretation and reuse credit.

This completes a bounded, dated 2D footprint-ingestion pilot at **property-extent
scale**. It does not supply individual wall footprints or a reconstructed building.
Housesteads building geometry remains unresolved; its existing dataset is preserved.

## Why this example

The [National Trust granary record](https://heritagerecords.nationaltrust.org.uk/HBSMR/MonRecord.aspx?skin=printerfriendly&uid=MNA111089)
flags discrepancies between older plans and consolidated remains. Its search-index
text was reviewed; direct fetching remained unavailable. Neither its broad dating
nor the existing fort outline establishes a phase-specific granary footprint.

For the general pipeline, P-LOD offers a reproducible property polygon with a
separate reuse declaration. It identifies I.10.4 as the House of Menander. The
excavation study provides a defensible final AD 79 context. Combining the identity
and context is marked **inferred**, rather than asserting that P-LOD itself dates
the polygon or that every boundary remained unchanged.

## Source review — 30 October 2026

| Source | Review and use |
| --- | --- |
| [P-LOD RDF record](https://github.com/p-lod/p-lod-data/blob/0f723ab5fb38bf46c2402811e0f0698267387c9c/property.ttl) | Direct download of pinned revision; subject `urn:p-lod:id:r1-i10-p4`, identifier `BLD_000011`; one polygon, one ring, 40 vertices. |
| [P-LOD licensing declaration](https://p-lod.org/) | Direct page review; RDF CC-By grant, URN attribution, no stated version. No image licensing assumed. |
| [PBMP geometry methodology](https://services.arcgis.com/2gdL2gxYNFY2TOUb/arcgis/rest/services/PBMP_NavMap2_BLD/FeatureServer) | Direct metadata review; digitized mapping lineage and potential rectification/projection discrepancies. Not the geometry download or reuse grant. |
| [Roger Ling, 1983](https://doi.org/10.1017/S0003581500014347) | Original PDF downloaded; p. 36, PDF page 3, reviewed for final-phase context. No figures or plan geometry copied. |

[Source excerpt, attribution and reproduction instructions](../data/history/menander/source/README.md)
and the [claim ledger](../lib/history/curation/menander-review.json) retain the
acquisition and interpretation boundary. The importer preserves every source XY
vertex, discards Z without treating it as height, and derives a display anchor
from the polygon's bounding-box centre. Coordinate precision is not survey accuracy.

## Contract and behavior

The optional `HistoricalWorldData.footprints` array contains place identity,
representation, polygon, phase title, date interval, separate geometry/phase
evidence and licence attribution. `property-extent` and `wall-footprint` are distinct
representations; this example uses only the former. A property may include courts,
gardens and dependencies. It cannot become a solid building by extrusion.

Footprints use the existing compact single-ring polygon checks, vertex/extent
limits and strict JSON validation. Both evidence groups require source references
and documented/inferred status. An inferred phase must carry qualitative or
numeric date uncertainty. IDs, place references, place-period compatibility,
licence fields and geometry are validated independently. Unknown height/model
fields are rejected. Populated metadata fields do not replace source review.

The AD 79 record is a bounded final-phase presentation context, not the building's
whole lifespan, an exact eruption day or a geometry-validity assertion for the
entire calendar year. It remains a **possible** match at any selected AD 79 date.
No phase is extrapolated to AD 78, AD 80 or earlier construction periods.

Date selection may use footprint evidence to establish possible place context,
but never promotes an extent into a ready settlement layout. Detailed scene
descriptors remain zero. The line overlay clears on date mismatch, dataset switch
and unload. The inspector retains outside-date metadata and disables Visit. An
eligible explicit visit uses zoom 18; inspection itself does not move the camera.

No external research service is called by the app. The registered local API serves
the checked-in fixture. No model assets, roads, navigation graph, images or terrain
modifications are introduced.

## Validation

```sh
python3 scripts/import-menander-footprint.py
node scripts/check-historical-footprints.mjs
node scripts/check-phase3.mjs docs/previews/menander-footprint
```

The importer reproduces the fixture and ledger exactly. **24/24 integration
commands passed**, including TypeScript, ESLint and the webpack production build.
[Raw results](previews/menander-footprint/regression.json) include source identity,
exact XY preservation, phase/date uncertainty, property-versus-wall semantics,
malformed provenance/geometry, detached validation, API/catalogue loading,
inspector markup, session updates and overlay teardown. Existing historical,
scenario, Roman, terrain and streaming checks also pass.

Chrome acceptance used the local app:

| Capture | Verified behavior |
| --- | --- |
| [AD 79](previews/menander-footprint/01-ad79.jpg) | Property outline, possible phase match, source attribution and no reconstruction. |
| [AD 80](previews/menander-footprint/02-outside-phase.jpg) | Outline removed; inspector retains metadata and disables Visit. |
| [Housesteads switch](previews/menander-footprint/03-housesteads-switch.jpg) | Original blue reference outline restored; Menander inspection/outline released. |

A development hot refresh retained an old dataset loader instance; reloading the
page applied the new catalogue registration. Fresh-page loading succeeded. No
architectural accuracy, source survey certification or new performance benchmark
is claimed.

## Next step

Step 6 now implements the [scene-resolution and assembly gate](historical-scene-resolution.md). The fixture adds an optional reconstruction request and unbound logical model reference; it still supplies no reconstructed architecture.

Step 6 should resolve historical scene requirements against available, evidenced
geometry and assets, preserving map-only results when architecture is missing.
For Menander, individual walls, openings, heights and appearance still need review
before any 3D reconstruction. Do not use the property polygon as a roof or insert
a generic Roman villa as though it were documented architecture.
