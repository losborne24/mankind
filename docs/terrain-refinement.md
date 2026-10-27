# Phase 2, Step 3B — terrain visual refinement

The regional prototype now uses **`pnv-v4`**. Original `pnv-v2` tiles remain available for rollback and comparisons. Neither PNV classification data nor runtime terrain geometry was changed. No global biome pyramid or R2 deployment was performed.

## What changed

- **Narrower transitions:** The baseline Gaussian colour sigma was 1.5 pixels at z7 (~1,834 m in Web Mercator). Final sigma is a configurable **1,100 projected metres**, ~0.90 output pixels at z7, roughly **40% narrower**. Ground distance scales with latitude; this is a projection-space width, not a universal ecological boundary width.
- **Antialiasing before blending:** Reproject IDs with nearest neighbour onto a 2× internal grid, map each ID to RGB, blur those colours, then downsample RGB coverage. IDs are never averaged. This retains narrower transitions without emphasizing the output pixel grid. Runtime tiles remain 256×256.
- **Width experiment:** An 850 m first trial reduced cloudiness but made angular source-cell edges more apparent. The 1,100 m + supersampling version is the selected compromise. Both `pnv-v3` trial and `pnv-v2` baseline remain ignored local artifacts; the app defaults to `pnv-v4`.
- **Surface variation:** Replace repeated sine waves with deterministic smooth value noise on an Earth-centred 3D lattice, sampled at 160, 18 and 5 km scales. It is independent of tile indices, continuous across the dateline, and does not create a repeating texture. Maximum luminance variation drops from 3.5% to 2.5%, with a further 40% reduction in arid classes.
- **Earth tones:** Subtle warm soil tint varies with geographic noise and local topographic position. Steppe moves from `#969570` to dry gold/olive `#b1a27e`, reducing the steppe/desert contrast that made Sahara predictions look mottled. This is a rendering palette choice for class 22 everywhere, not a relabeling of Sahara cells.
- **Rock:** The offline Mapterhorn cache moves from z5 to z6 (512px DEM, matching the z7 colour-pixel spacing). Smooth slope weighting and continuous elevation/local-relief modulation expose muted `#999487` rock. Missing DEM neighbours are excluded from the slope tint. This is a cartographic material heuristic, **not inferred geology**.
- **Ice:** Add a pale `#dbddd5` accent confined to mapped Natural Earth glaciated areas. There is no global altitude snow threshold and no seasonal snow simulation.
- **Hillshade:** Retain the existing MapLibre layer, intensity control (default 0.25), z6 visibility gate and opaque-ocean safety. Lighting changes from the installed default 335°/viewport anchor to **315°/map anchor**. Warm neutral shadows, pale warm highlights and restrained brown-grey accents replace the dark navy tint. Rotation retains a geographic light direction. Terrain remains **1.0×**.

Configuration is in `scripts/biomes/palette.json` and `scripts/biomes/surface.json`. The runtime lighting values are together in `map/hillshade.ts`.

## Ice-source accuracy and rights

Source: **Natural Earth v5.1.2**, pinned revision `f1890d9f152c896d250a77557a5751a93d494776`, [`ne_10m_glaciated_areas.geojson`](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_glaciated_areas.geojson).

SHA256: `04fd2303d5f0ece2cf482af19d06731d745db9690501d7b0a2a4b7fe23a7726f` (5.88 MB original file, ignored locally).

Natural Earth states that the [glaciated-area layer](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-glaciated-areas/) includes glaciers and recently deglaciated areas, derives mostly from decades-old DCW mapping, and aggregates or omits some smaller glaciers. It is **not current glacier extent**, snow persistence or historical ice extent. The treatment is consequently a coarse atlas accent, not evidence of ice in 3000 BCE. A modern snow climatology or glacier inventory would improve a later pass, with source/version/licence review. All Natural Earth vector data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Existing Natural Earth attribution remains; the mask, provenance and processing recipe are copied into the output.

## Matched screenshots

Actual MapLibre canvas captures, **1970×1786 pixels**, taken after tiles loaded and the existing 300 ms coast gate plus paint/raster fades settled. These show the rendered terrain without UI overlays; no generated or retouched imagery is used. All pairs use **1× terrain, hillshade intensity 0.25**, identical camera and viewport. Raw PNGs stay in ignored `.biome-data/review/step3b/`, outside Git and Next.js. Camera metadata and frame timings are stored there too.

| View | Centre longitude, latitude | Zoom / pitch / bearing | Before | After |
| --- | --- | --- | --- | --- |
| Atlas / green-to-desert transition | -5.1, 31.2 | 8 / 35° / 0° | [PNG](../.biome-data/review/step3b/before-atlas.png) | [PNG](../.biome-data/review/step3b/after-atlas.png) |
| Alps / Mont Blanc–Valais | 7.6, 46 | 7.8 / 40° / 0° | [PNG](../.biome-data/review/step3b/before-alps.png) | [PNG](../.biome-data/review/step3b/after-alps.png) |
| Pyrenees | 0.6, 42.7 | 7.8 / 40° / 0° | [PNG](../.biome-data/review/step3b/before-pyrenees.png) | [PNG](../.biome-data/review/step3b/after-pyrenees.png) |
| Continental Mediterranean / Sahara | 8, 37 | 4.3 / 15° / 0° | [PNG](../.biome-data/review/step3b/before-continental.png) | [PNG](../.biome-data/review/step3b/after-continental.png) |
| Himalayas — hillshade only | 86.9, 28 | 7.8 / 40° / 0° | [PNG](../.biome-data/review/step3b/before-himalayas.png) | [PNG](../.biome-data/review/step3b/after-himalayas.png) |

**Himalaya limitation:** This location is outside the unchanged regional colour bounds (18°W–41°E, 17°N–56°N). Its pair tests runtime Mapterhorn geometry and lighting over the dark atlas only. It does not validate Himalayan biome/rock/ice colour tiles. Coverage was not expanded to conceal this limitation.

Observed differences: Atlas colour transitions have a tighter edge and less green/gold contrast, with subtler soil shifts. Alpine mapped ice now identifies major glaciated massifs; slope materials and warmer highlights separate mountain terrain from green lowlands. Pyrenean ridges and valleys remain readable without increasing height. Dark sea and lakes remain free of hillshade.

For repeated captures, paste `scripts/biomes/capture.js` into the **local app's** DevTools console after load, keep browser size/docking unchanged, and call e.g.:

```js
await captureTerrain('atlas', {center: [-5.1, 31.2], zoom: 8, pitch: 35, bearing: 0})
```

The helper exports an actual render frame and logs camera, source URL, terrain, lighting and pixel dimensions. For baseline comparisons, use the retained v2 tile source and baseline paint values in `cameras.json`; restore the final source/paint afterwards. This QA helper is not imported by the application.

## Rebuild and rollback

Existing Python dependencies are unchanged: rasterio, NumPy, SciPy, Pillow. No new JavaScript dependencies.

```sh
.biome-venv/bin/python scripts/biomes/fetch.py --dem-zoom 6
.biome-venv/bin/python scripts/biomes/build.py
.biome-venv/bin/python scripts/biomes/check.py
node scripts/check-biomes.mjs
python3 scripts/biomes/serve.py
pnpm dev
```

The builder defaults to `.biome-data/tiles/pnv-v4` and refuses overwrites. On this workspace v4 already exists; for another experiment use a fresh directory and point the existing environment variable at it:

```sh
.biome-venv/bin/python scripts/biomes/build.py --output .biome-data/tiles/pnv-v5
NEXT_PUBLIC_BIOME_TILE_URL=http://localhost:8766/pnv-v5 pnpm dev
```

Visual rollback: set `NEXT_PUBLIC_BIOME_TILE_URL=http://localhost:8766/pnv-v2` and restore the previous hillshade paint (shadow `#0a1622`, highlight `#587083`, accent `#122330`, direction 335°, viewport anchor). Old data is untouched. No infrastructure migration is required.

## Storage, build and runtime observations

| Measurement | Baseline v2 | Refined v4 |
| --- | ---: | ---: |
| PNG tile count, z0–7 | 595 | 595 |
| Total colour tile bytes | 10,871,061 | 13,536,206 |
| Average bytes per tile | 18,271 | 22,750 |
| z0 tile | 4,541 B | 4,355 B |
| z3 four-tile total | 107,235 B | 98,843 B |
| z7 tile total (418 tiles) | 7,126,731 B | 9,353,915 B |
| Alpine sample `7/67/45.png` | 55,134 B | 90,514 B |
| Offline generation wall time | 75.94 s | 112.15 s |

Colour storage increased **24.52% (+2.67 MB)**. The output directory additionally retains the 5.88 MB glacier source and recipe for provenance/access; the browser does not fetch them. Runtime tile dimensions, decoded memory per tile, zoom levels, DEM URL, source/layer counts and request selection architecture are unchanged. More surface detail does increase regional transfer bytes; unchanged bandwidth is **not** claimed.

Final loopback HTTP samples: Alpine tile 9.74 ms, z0 3.15 ms. These are individual local transfers, not comparable WAN/CDN benchmarks. The production build still statically prerenders `/`, `.next/static` remains about **2.7 MiB**, and no PNV/DEM/glacier source or generated colour tile is imported or traced into the build.

A warmed development-browser camera-rotation check at the fixed Atlas view sampled 120 requestAnimationFrame intervals each, rotating ±2° after tile loading and settling:

| Frame interval | Baseline | Refined |
| --- | ---: | ---: |
| Median | 8.3 ms | 8.0 ms |
| p95 | 15.1 ms | 14.0 ms |
| Mean | 8.23 ms | 7.82 ms |

No regression appeared in this small local comparison. It does not establish a speed improvement or replace production/mobile profiling; the values include browser scheduling and are not isolated GPU timings.

## Verification

- All 595 PNGs decode at 256×256 RGBA.
- `classes.tif` matches the original PNV source window exactly, and its categorical array also matches v2.
- **Every tile's alpha channel matches v2 byte-for-byte**, including parent levels. Natural Earth land/ocean coverage was preserved.
- Five independent 512px renders versus 2×2 generated tiles (Iberia, Alps, Pyrenees, Atlas, Mediterranean) have **maximum visible RGB difference 0/255**. These test the actual multi-scale variation, narrower colour blur, slope material and ice mask across tile boundaries.
- Geographic noise passes a dateline continuity check. This is not a claim that all global source/mask edge cases are validated.
- Existing geography and hillshade mask/loading/fade checks pass. The intensity control and 1× terrain remain active.
- `pnpm typecheck`, `pnpm lint`, production webpack build, `scripts/check-biomes.mjs`, `scripts/check-hillshade.mjs` and the offline real-output checker pass.
- Browser inspected both continental and close views, correct final v4 source and hillshade paint, navigation/rotation, dark-ocean masking and Himalayan DEM-only coverage.

## Remaining differences from the approved concept

The close-up reference's soft clouds are reduced, but this remains a 1 km winning-class product, not detailed vegetation texture. Large straight/triangular predicted class shapes remain visible in parts of the Sahara at continental scale. Their colour contrast is reduced; they are source features, not XYZ seams. Arbitrarily warping or relabeling them was avoided.

The concept has stronger continental relief/lighting and richer illustrated ground texture. Existing safe runtime hillshade remains restricted to z6+ after the opaque regional ocean mask loads; continental views therefore rely mostly on colour/material cues. The new glacier accents are coarse, sometimes aggregated, and neither a snow climatology nor historical reconstruction. Europe remains more uniformly green than the concept's golden/green terrain. Very close overzoom views cannot acquire sub-kilometre ecological detail from the original PNV source.

The regional coverage fade/boundary remains, and Himalayan colour coverage is absent. A global run still needs the existing documented DEM coverage, polar/dateline/source-block checks and visual review of other biome classes. No global colour generation, cloud provisioning or deployment was performed.

## Files

Modified: `scripts/biomes/build.py`, `fetch.py`, `palette.json`, `check.py`; `map/hillshade.ts`; `map/biomes.ts` (development version URL only); `scripts/check-biomes.mjs`; documentation.

Added: `scripts/biomes/materials.py`, `surface.json`, `capture.js`, and this report. Generated tiles, original inputs, intermediate DEM and all comparison PNGs remain ignored under `.biome-data/`.
