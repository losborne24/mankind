# MANKIND physical geography

Source: Natural Earth vector release **v5.1.2**, pinned to commit
[`f1890d9f152c896d250a77557a5751a93d494776`](https://github.com/nvkelso/natural-earth-vector/tree/f1890d9f152c896d250a77557a5751a93d494776/geojson).
All three themes use **1:50,000,000** scale (50m means scale, not metres).
The release tag covers the collection; individual theme versions may differ.

| File | Retained features | Original SHA-256 |
| --- | ---: | --- |
| ne_50m_land.geojson | 1,420 | e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b |
| ne_50m_lakes.geojson | 360 | d350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52 |
| ne_50m_rivers_lake_centerlines.geojson | 359 | f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51 |

Original files are under `geojson/` at that commit with the same filenames.
Coordinates and polygon topology are preserved. Output is compact JSON with
names, label fields and unused attributes removed. Only water `min_zoom`
attributes are retained. Reservoir polygons and lake centerlines are omitted;
natural and alkaline lakes and actual river lines are retained. No cultural,
administrative, boundary or populated-place datasets are included.

## Licence and source credit

Natural Earth data is **public domain**, including modified redistribution and
commercial use. Permission and attribution are not required. MANKIND voluntarily
shows **“Made with Natural Earth (public domain)”**, linked to the project.
Verified against [Natural Earth's Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)
on 2026-10-26. The data is supplied without guarantees of accuracy or fitness.
See also the [physical dataset catalogue](https://www.naturalearthdata.com/downloads/50m-physical-vectors/).

## Rebuild

From the repository root, with Node and network access:

```sh
node scripts/prepare-natural-earth.mjs
node scripts/check-geography.mjs
```

For an offline rebuild, pass a directory containing the three original files:
`node scripts/prepare-natural-earth.mjs /path/to/originals`.
The script verifies original SHA-256 hashes before transforming. Generated
GeoJSON is checked in; running the application or build needs no upstream access.

## Resolution and performance

Total: **2,464,879 bytes** uncompressed, approximately **850 KB gzip**. Actual
transfer compression depends on the hosting server. GeoJSON is fetched once per
map instance, tiled and simplified in MapLibre's existing worker. One 50m source
per theme supplies all zooms: coarse worker simplification for global views,
more retained vertices through zoom 8, then overzoom. This avoids downloading
overlapping 110m/50m copies or adding a tile server/plugin for this small base.
50m improves the former demonstration geography and suits global/regional use;
it is not survey or local navigation detail. Future finer regional data can
replace these sources without changing the UI.

Coastline lines reuse land polygon rings. Ocean is a background colour; no ocean
polygon or separate coastline dataset duplicates geometry. Rivers draw below
lakes; visibility follows Natural Earth's `min_zoom` values. The 30° graticule
is generated independently, fades from zoom 2.5 to 5, and has no labels. Mercator
tiling limits the grid to ±85° latitude.

This is static present-day physical geography, **not reconstructed ancient
shorelines or hydrology**. It deliberately does not respond to timeline changes.
`physical-*` sources can coexist with a future raster DEM source; this step
adds no DEM, elevation, hillshade or terrain.
