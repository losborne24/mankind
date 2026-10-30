# P-LOD House of Menander source record

The Turtle file preserves the prefixes and the complete `urn:p-lod:id:r1-i10-p4`
subject from [P-LOD property.ttl, revision 0f723ab5fb38bf46c2402811e0f0698267387c9c](https://github.com/p-lod/p-lod-data/blob/0f723ab5fb38bf46c2402811e0f0698267387c9c/property.ttl).
Retrieved 30 October 2026. The manifest records hashes for the complete upstream
file and the retained excerpt. Other properties are not bundled.

Attribution: **Pompeii Linked Open Data, Sebastian Heath and Eric Poehler,
urn:p-lod:id:r1-i10-p4**. The [publisher's declaration](https://p-lod.org/)
licenses RDF data under CC-By and accepts URNs as attribution. It does not state a
licence version; this project does not assert CC BY 4.0. Image terms are separate.
No image, plan scan or traced drawing is included.

Mankind's adaptation retains the GeoJSON XY values exactly and omits source Z.
The source altitude's datum and meaning are not interpreted. No simplification,
reprojection, wall extraction, extrusion or reconstruction is performed.

The upstream ArcGIS service is cited for mapping methodology only. Its copyright
metadata is not treated as the reuse grant; the grant is P-LOD's RDF declaration.

Run `python3 scripts/import-menander-footprint.py` from the repository root to
reproduce the fixture and curation ledger from this pinned excerpt. The importer
refuses a changed excerpt until reviewed. Historical phase interpretation is
separate from geometry extraction; see the [review report](../../../../docs/historical-footprint-ingestion.md).
