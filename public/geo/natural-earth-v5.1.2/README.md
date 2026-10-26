# MANKIND physical geography

Source: Natural Earth vector release **v5.1.2**, pinned to commit
[`f1890d9f152c896d250a77557a5751a93d494776`](https://github.com/nvkelso/natural-earth-vector/tree/f1890d9f152c896d250a77557a5751a93d494776/geojson).
The global themes use **1:50,000,000** scale; regional land uses
**1:10,000,000** (50m/10m mean scale, not metres).
The release tag covers the collection; individual theme versions may differ.

| File | Retained features | Original SHA-256 |
| --- | ---: | --- |
| ne_50m_land.geojson | 1,420 | e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b |
| ne_50m_lakes.geojson | 360 | d350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52 |
| ne_50m_rivers_lake_centerlines.geojson | 359 | f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51 |
| ne_10m_land.geojson → land-10m/4/{x}/{y}.pbf | 11 upstream features → 256 tiles | 1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416 |

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
node scripts/prepare-regional-coastlines.mjs
node scripts/check-geography.mjs
```

For an offline rebuild, pass a directory containing the three original files:
`node scripts/prepare-natural-earth.mjs /path/to/originals`.
The script verifies original SHA-256 hashes before transforming. Generated
GeoJSON is checked in; running the application or build needs no upstream access.
Regional tiles are also checked in. To rebuild them offline, run
`node scripts/prepare-regional-coastlines.mjs /path/to/ne_10m_land.geojson`.
The script uses the tilers already installed with MapLibre; it adds no packages.

## Resolution and performance

Global base: **2,464,879 bytes** uncompressed, approximately **850 KB gzip**. Actual
transfer compression depends on the hosting server. GeoJSON is fetched once per
map instance, tiled and simplified in MapLibre's existing worker. The 50m base
supplies global/continental views, avoiding an overlapping 110m download.

Regional land starts fetching visible tiles at zoom 4, then blends from 50m to
10m across zooms **4.5–5.5**. The fade waits for visible tiles to be loaded and
uses a 300 ms paint transition, including direct zoom jumps. The coarse base
stays visible while fetching detail. Zooming back out restores 50m.
All 256 regional tiles together total **2,937,114 bytes** (~1.69 MB gzip); a view
downloads only its visible tiles, never the 10 MB upstream global GeoJSON.
For example, the two tiles spanning France and neighbouring coastlines total
98,199 bytes uncompressed. No regional requests are made below zoom 4.

Regional tiles retain every source vertex before quantisation into MapLibre's
native 8,192-unit grid at z4 (~306 m at the equator, ~200 m around France), and
overzoom at higher zooms. A 32-unit buffer keeps joins continuous at tile edges. Each tile
contains land, a complementary ocean mask, and coastlines derived from the
**same 10m land rings**. Outlines are extracted before clipping to avoid drawing
tile boundaries. The ocean mask removes obsolete 50m land while leaving solid
interiors at their original colour during the fade. This is regional cartography,
not settlement-scale surveying; higher-resolution OSM coastlines remain deferred.

Global coastline lines reuse 50m land polygon rings. Ocean is a background colour
with a regional mask derived from land; no separate upstream ocean or coastline
dataset is downloaded. Lakes and rivers remain 50m. Rivers draw below
lakes; visibility follows Natural Earth's `min_zoom` values. The 30° graticule
is generated independently, fades from zoom 2.5 to 5, and has no labels. Mercator
tiling limits the grid to ±85° latitude.

This is static present-day physical geography, **not reconstructed ancient
shorelines or hydrology**. It deliberately does not respond to timeline changes.
`physical-*` sources can coexist with a future raster DEM source; this step
adds no DEM, elevation, hillshade or terrain.
