# WallGIS source archive

`WallGIS_Fort_polygon.zip` is the published fort polygon shapefile archive from
[WallGIS](https://doi.org/10.5284/1100071), downloaded on 30 October 2026.
[Archive metadata and rights](https://archaeologydataservice.ac.uk/archives/collections/view/1004975/metadata.cfm)
declare Creative Commons Attribution 4.0 International.

Murphy, K., Turner, A. and Collins, R. (2024), *WallGIS: The GIS Data from the
Hadrian's Wall Community Archive Project, WallCAP, 2019–2022*. York: Archaeology
Data Service. DOI: 10.5284/1100071. Data copyright © Newcastle University,
Prof Rob Collins unless otherwise stated. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The ZIP is retained unchanged. Only Housesteads, CUID 499, is extracted into the
application. The import transforms its vertices from British National Grid to
WGS84 and rounds coordinates to eight decimal places without simplification.
This adaptation is by Mankind. No phase or building footprint is inferred.
`manifest.json` records the download URL, SHA-256, transformation and attribution.

Reproduce with `.biome-venv/bin/python scripts/import-housesteads-outline.py` from
the repository root. This importer intentionally accepts only the pinned archive.
