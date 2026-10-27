# Phase 2, Step 4 — global biome coverage and optimisation

The regional `pnv-v4` prototype is now a worldwide pyramid, `pnv-v4-global`. The
rectangular coverage boundary is gone. Processing settings, palette, materials,
hillshade and terrain are unchanged — the same algorithm, run over the whole
Earth. No cloud resource was created and nothing was uploaded.

Earlier reports stay valid for their scope: [biomes.md](biomes.md) covers the
original `pnv-v2` baseline, rights and hosting architecture;
[terrain-refinement.md](terrain-refinement.md) covers the `pnv-v4` blending and
material pipeline this run reuses verbatim.

## Preserved without redesign

The architecture is untouched: Natural Earth physical geography, Mapterhorn
elevation, OpenLandMap PNV 1 km vegetation, MapLibre globe/raster/terrain/
hillshade, Next.js application. So are all `pnv-v4` processing settings —
1,100 m projected blend width, 2× supersampling, Earth-centred deterministic
surface variation, the existing palette and earth tones, terrain-aware rock,
Natural Earth glacier accents, 315° map-anchored hillshading and 1× default
terrain exaggeration.

That claim is enforced, not asserted. `scripts/biomes/check.py` re-renders
reference tiles with the current code and compares them byte-for-byte with the
stored `pnv-v4` prototype, and compares the global pyramid against the
prototype's interior. Both are verified below.

Four behaviours *had* to change for a global run. Each is a verified global
processing issue found by inspecting the real output, not a redesign:

1. **Dateline wrap.** A tile's 16-pixel padding feeds the colour blur and the
   slope/relief terms. At the ±180° columns that padding leaves the world. PROJ
   wraps longitude when reprojecting the EPSG:4326 PNV source, so classes were
   already correct — but the DEM mosaic is EPSG:3857, and a same-CRS reproject
   is a plain affine resample that does **not** wrap. The padding read nodata,
   which suppressed the rock and soil tint in the outermost pixel column and
   left a hairline discontinuity along the dateline in mountainous terrain.
   `reproject_world()` now fills any out-of-world padding from a second pass
   shifted one world width across. The land and glacier masks get the same
   treatment through offset rasterisation in `coverage_mask()`.

2. **Coverage edge.** The prototype faded out over 1° to mark where its
   rectangle ended. A global run has no such rectangle, so `--edge-fade 0`
   replaces the fade with a hard clip at the real source extent. Nothing is
   faded and nothing is invented beyond the data.

3. **Real data extent.** The raster's nominal extent is 87.37°N–62°S — the
   figure quoted in the earlier reports — but its northernmost and southernmost
   rows actually carrying classes are **83.6283°N** and **55.9800°S**.
   `data_extent()` scans for this once and caches it. Clipping to the nominal
   extent instead would let the per-tile nodata fill pull vegetation colours
   onto uncovered Arctic and sub-Antarctic land.

4. **Ice is keyed on the unfilled archive.** The renderer reads a render-only
   intermediate whose coastal nodata is filled with the nearest class, computed
   on a fixed 512-cell lattice. Deciding "the source has no class here" from
   *that* raster painted the Greenland ice sheet with visible rectangles —
   blocks of pure ice (`#dbddd5`) against blocks of ice blended 88% over
   tundra (`#d0d3c9`), a 12/255 step on the lattice boundaries. The test now
   runs against the unaltered `classes.tif`, so the boundary follows the real
   data edge and mountain glaciers keep the approved partial blend over their
   own classes. This was caught by inspecting the rendered globe, not by a
   unit test; `check.py` now asserts the glaciated tiles exist.

## Global coverage of the pyramid

| Property | Value |
| --- | --- |
| Vegetation data extent (`dataBounds`) | 180°W–180°E, **55.98°S–83.63°N** |
| Published tile extent (`bounds`) | 180°W–180°E, 85.0511°S–85.0511°N |
| Native zoom levels | z0–z7, overzoomed by MapLibre above z7 |
| Tile size and format | 256×256, **lossless WebP** |

`bounds` is deliberately taller than the data extent: mapped polar glacier land
lies outside the vegetation clip (see below). The manifest publishes both, as
`bounds` and `dataBounds`.

### Missing source data is not invented

Where PNV has no class, nothing is substituted. Antarctica, the far Canadian
Arctic, northern Greenland above 83.63°N and sub-Antarctic islands south of
55.98°S receive **no vegetation colour**. They are either transparent — the
existing dark atlas shows through — or carry the ice accent described next.
Desert, grassland and steppe are never used as a stand-in for absent data, and
the categorical IDs are not extended or relabelled anywhere.

### Polar ice

Where the source carries no class *and* Natural Earth maps the land as
glaciated, the existing pale `#dbddd5` ice accent is used instead of leaving a
dark hole. That covers Antarctica, the Greenland ice-sheet interior, Arctic
island icecaps and the Patagonian icefields. It is the glacier layer `pnv-v4`
already uses, applied over its own mapped extent — **not** a substituted biome
source, an altitude snow rule or a snow climatology. Glaciated land where PNV
*does* carry a class — Alpine, Andean and Himalayan massifs — keeps the
approved 88% blend over its own vegetation and rock, unchanged.

Antarctic land Natural Earth does not map as glaciated stays transparent.

Two assertions hold this in place: every tile lying entirely south of the
vegetation limit contains only the exact ice colour or transparency, and every
tile Natural Earth maps as glaciated land exists. The second is the regression
test for the 50 missing Greenland-interior tiles found during validation.

Turn the behaviour off with `--no-polar-ice`; the tiles then stop at the data
extent and the ice sheets return to the dark atlas.

### Ocean tiles are skipped

Natural Earth land is rasterised once per zoom onto a one-cell-per-tile
occupancy grid (`all_touched`, so it is a strict superset). Tiles no mapped land
touches are never rendered, and a rendered tile whose alpha channel is entirely
zero is never stored.

A sparse pyramid is safe here because parents are composited from children: a
skipped child's quadrant is transparent in its parent, its grandparent and so
on. A 404 or 204 for a skipped tile therefore cannot reveal a wrong colour from
an overzoomed ancestor — the ancestor is transparent in exactly that area.

### Never cache "this tile is empty"

A sparse pyramid makes the *negative* response part of the contract, and it
must not be cached while the pyramid is being written. The local server sends
`Cache-Control: public, max-age=3600` on tile bodies but **`no-store` on the
204**, because during an 18-minute generation run a tile that is absent now
exists a minute later. Caching the 204 pins a hole in the globe for the whole
max-age: dark rectangles that look exactly like missing data even though the
tile is on disk and serves 200.

That is not hypothetical — it is the cause of the patchiness seen at some zooms
during this work. Tiles requested while the rebuild was still running were
cached as empty, and MapLibre kept a transparent texture for them until the
entry expired. The tiles themselves were always correct.

The same hazard applies to the CDN. A versioned prefix is immutable once fully
uploaded, so negative caching is safe *afterwards* — but do not browse the
domain mid-upload with negative caching enabled, and purge the prefix if you
do. Uploading the manifest last (see below) is the main protection.

## Continuity with the approved prototype

`check.py` compares the global pyramid against the stored `pnv-v4` tiles over
the prototype's interior, inset by a whole tile so the prototype's deliberate 1°
coverage fade is excluded. Over **246 z7 tiles / 12,305,445 visible pixels**:

- Coastline alpha is **byte-identical**.
- Every one of the **8,498,506** visible pixels where the source carries a class
  matches **exactly**.
- **27,935 pixels (0.2270%)** differ, **all of them inside source nodata gaps**,
  by at most 83/255.

That last group is expected and is asserted rather than waved away. The
nearest-class fill for coastal and interior nodata runs on a fixed 512-cell
lattice anchored to the extraction window, and the global window starts on
different cells than the regional one, so a nodata cell can resolve to a
different nearest class. It is a fill-ordering difference in areas the source
does not describe — not a palette, blending or classification change. The
assertion is therefore "no difference wherever there is real data", which is the
property worth guaranteeing.

## Tile format and maximum zoom, as measured

`scripts/biomes/measure.py` renders a 28-tile sample stratified by vegetation
class and terrain, with production settings, and encodes each tile four ways.

| Encoding | Mean | Median | Max | Worst visible RGB error |
| --- | ---: | ---: | ---: | ---: |
| PNG (current) | 28,472 B | 16,626 B | 104,862 B | 0 (lossless) |
| **WebP lossless** | **16,229 B** | **9,936 B** | **62,628 B** | **0 (lossless)** |
| WebP q90 | 2,717 B | 906 B | 14,420 B | 26 / 255 |
| WebP q80 | 1,596 B | 557 B | 8,614 B | 35 / 255 |

**Chosen: lossless WebP** — 43% smaller than PNG on average with bit-exact
colour and alpha. Lossy WebP is roughly six times smaller again, and its alpha
channel survives intact (libwebp codes alpha losslessly), but it shifts RGB by
up to 26–35/255 on mountain terrain. On this flat, muted palette that is a
visible change to an approved look, and it would break the ±1 seam tolerance the
validator relies on. Storage was not the binding constraint, so quality won.

**Chosen: maximum native zoom 7.** The source is 1 km; Web Mercator z7 is
1,223 m per pixel at the equator, so z7 is the matching native level. Measuring
a native z8 render against a 2× bilinear overzoom of the stored z7 tile:

| Region | Mean abs. Δ | p99 | Max |
| --- | ---: | ---: | ---: |
| Amazon | 0.02 / 255 | 1 | 1 |
| Central Asia steppe | 0.01 / 255 | 1 | 1 |
| Great Plains | 0.01 / 255 | 1 | 1 |
| Sahara core | 0.18 / 255 | 2 | 4 |
| Alps | 2.98 / 255 | 28 | 72 |
| Tibet | 4.39 / 255 | 36 | 90 |

z8 adds **no** biome detail — a 1 km winning-class product cannot. The only
regions that differ are mountainous, and that difference is the DEM-derived
rock/slope tint sampled more finely, not vegetation. MapLibre's live Mapterhorn
hillshade already supplies relief detail at those zooms from its own native
resolution. A z8 level would roughly quadruple the tile count for a terrain
material refinement that the runtime already provides, so z7 it is and MapLibre
overzooms above it.

## Reproducing the global run

Python 3.9+, pip wheels only; dependencies are unchanged (rasterio, NumPy,
SciPy, Pillow) and no JavaScript dependency was added. From the repo root:

```sh
python3 -m venv .biome-venv
.biome-venv/bin/pip install -r scripts/biomes/requirements.txt

# 1. Original PNV raster, class table, Natural Earth land/glaciers, and every
#    land-touching Mapterhorn z6 tile worldwide. Idempotent and resumable.
.biome-venv/bin/python scripts/biomes/fetch.py --global --dem-zoom 6 --jobs 10

# 2. Global pyramid. 8 worker processes, one max-zoom tile column each.
cd scripts/biomes
../../.biome-venv/bin/python build.py --global --format webp --maxzoom 7 \
    --workers 8 --output ../../.biome-data/tiles/pnv-v4-global
cd ../..

# 3. Validate the real output, then serve it locally for the app.
.biome-venv/bin/python scripts/biomes/check.py .biome-data/tiles/pnv-v4-global
node scripts/check-biomes.mjs
pnpm dev     # starts scripts/biomes/serve.py on 127.0.0.1:8766 too
```

`pnpm dev` and `map/biomes.ts` both default to
`http://localhost:8766/pnv-v4-global` in development. Override both with
`NEXT_PUBLIC_BIOME_TILE_BASE_URL`. Production assumes no URL and falls back to
the dark atlas.

Optional measurement pass, which writes into no pyramid:

```sh
cd scripts/biomes && ../../.biome-venv/bin/python measure.py \
    --dem ../../.biome-data/source/dem-z6-global.tif
```

### Restarting, retrying and batching

- **Downloads** never repeat. A verified file is skipped; a Mapterhorn 404 (an
  ocean-only tile, which upstream intentionally omits) is recorded as a
  `.absent` marker so resuming does not re-probe it. Any non-404 failure stops
  the run rather than silently leaving a hole.
- **Tiles** are written to a `.part` file and atomically renamed, so an
  interrupted run never leaves a truncated tile. `--resume` continues into an
  existing output directory and skips tiles already present. Without
  `--resume`, the builder still refuses to write into an existing directory.
- The parent pyramid is rebuilt from **whatever max-zoom tiles are on disk**,
  so a resumed run produces the same pyramid as an uninterrupted one.
- **Memory** is bounded by construction. No stage holds a worldwide array. The
  nodata fill streams 512-cell blocks with 64-cell halos; each tile renders in
  a 288² (and 576² supersampled) buffer; parents composite four children. The
  global z6 DEM mosaic is 32,768² and is written block by block, never
  materialised — missing ocean tiles stay nodata rather than becoming sea level.
- `--only-columns FIRST LAST` restricts max-zoom work to a tile column range for
  batching across sessions or machines; rerun with `--resume` and no
  `--only-columns` to build the pyramid.
- Progress prints columns completed, tiles kept, elapsed and projected
  remaining time.
- Everything lives under `.biome-data/`, outside the application build.

Both phases are parallel. Max-zoom work is distributed one tile column per
worker; the parent pyramid is distributed per parent tile, level by level. The
pyramid was originally single-threaded and dominated the run — parallelising it
cut the total from **2,754 s to 1,102 s**, a 2.5× speedup, because lossless
WebP at `method=6` is slow to encode and there are 3,234 parent tiles.

## Validation

### Offline, against the real output

`check.py .biome-data/tiles/pnv-v4-global` passes:

- All **11,186** tiles decode at 256×256 (6,407 RGB, 4,779 RGBA — WebP drops the
  alpha plane on wholly opaque tiles, which is free storage).
- No stored tile is fully transparent.
- `classes.tif` matches the original raster **byte for byte**, compared in row
  bands over the full 43,200 × 17,886 extraction. All 20 original class IDs plus
  nodata survive: `1 2 3 4 7 8 9 13 14 15 16 17 18 20 22 27 28 30 31 32 255`.
- **17 fixtures** spanning Iberia, the Alps, Pyrenees, Atlas, Mediterranean,
  Sahara, Amazon, Central Asia, Himalaya, Australia, Greenland, Congo, Siberia,
  Great Plains, Patagonia, India and Scandinavia: each stored 2×2 tile group
  matches an independent 512 px render with **max visible RGB delta 0/255**,
  including across the tile boundaries.
- **Date line wrap is pixel-exact** on all 13 land rows: tile column 0 and a
  virtual column one past the eastern edge cover the same geography from
  opposite sides and render identically.
- **3,267** tiles entirely south of the 55.98°S vegetation limit contain only
  the exact ice colour or transparency — no invented classes.
- All **4,148** glaciated land tiles exist (the regression test for the missing
  Greenland interior).
- Surface variation is continuous at the date line.

`scripts/check-biomes.mjs`, `check-geography.mjs`, `check-hillshade.mjs`,
`pnpm typecheck`, `pnpm lint` and a production `next build --webpack` all pass.

### In the browser

Sampled from the live WebGL canvas (read inside the render callback — the
drawing buffer is not preserved). Palette entries in brackets:

| Location | Rendered | Expected class |
| --- | --- | --- |
| Amazon | `#36523f` | tropical evergreen (`#304d39`) |
| Congo | `#395443` | tropical evergreen (`#304d39`) |
| Europe | `#4c6247` | warm-temperate (`#4c6347`) |
| India | `#73764c` | tropical deciduous (`#72764a`) |
| Central Asia | `#b1a17d` | steppe (`#b1a27e`) |
| Sahara / Kalahari | `#afa17e` / `#af9c71` | steppe / xerophytic |
| Great Plains | `#b0a07d` | steppe (`#b1a27e`) |
| Greenland interior | `#dbddd5` | mapped glacier ice (`#dbddd5`) |
| Antarctica | `#dbddd5` | mapped glacier ice (`#dbddd5`) |
| Open ocean | `#172431` | dark atlas ocean |

Date line continuity was checked by sampling a pixel row straight across the
180° meridian at 65.6°N over Chukotka: `#7a886f → #7b8870 → #7a876f → #79866e →
#78876d → #78866d`, a step of at most 2/255 with no discontinuity. The one
outlier exactly at 180.0 is the graticule meridian the style draws there, not a
tile seam.

Also confirmed live: the biome toggle removes source and layer and restores the
dark atlas, re-enabling re-attaches below the ocean mask and coastline in the
right order, the timeline steps 3000 → 2900 BCE with the globe unaffected, and
terrain exaggeration stays at 1×.

### Screenshots

Real MapLibre canvas captures of the running application, no retouching or
generated imagery. Stored in ignored `.biome-data/review/step4/`, outside Git
and the Next.js build.

| View | Shows | File |
| --- | --- | --- |
| Africa / Europe / Middle East, z1.6 | Continuous worldwide colour, no prototype rectangle | [jpg](../.biome-data/review/step4/global-africa-europe.jpg) |
| Americas, z1.6 | Amazon, Great Plains, Patagonia, boreal Canada | [jpg](../.biome-data/review/step4/global-americas.jpg) |
| Pacific centred on 180°, z1.6 | Australia, New Zealand, Bering, no date-line seam | [jpg](../.biome-data/review/step4/global-pacific-dateline.jpg) |
| Chukotka, z5.2 | Tundra continuous across the date line | [jpg](../.biome-data/review/step4/dateline-chukotka-z5.jpg) |
| Greenland, z3.2 | Uniform ice sheet, coastal tundra, Iceland icecaps | [jpg](../.biome-data/review/step4/greenland-z3.jpg) |
| Antarctica, z2.2 | Polar ice coverage | [jpg](../.biome-data/review/step4/antarctica-z2.jpg) |
| Himalayas, z7.8 pitch 40° | Forested foothills, glaciated peaks, Tibetan plateau, relief | [jpg](../.biome-data/review/step4/himalayas-z7.8.jpg) |
| Opening view after a cold reload | Default state, no console errors | [jpg](../.biome-data/review/step4/cold-start-globe.jpg) |
| Africa / Asia, z2.4 | Continuous coverage after the negative-caching fix | [jpg](../.biome-data/review/step4/global-africa-asia-z2.4.jpg) |
| Africa / Arabia, z3.41 | The zoom that showed patchiness, now clean | [jpg](../.biome-data/review/step4/patchy-after-fix-z3.41.jpg) |
| Greenland **before** the ice fix | The rectangular banding, kept for reference | [jpg](../.biome-data/review/step4/greenland-banding-before-fix.jpg) |

The Himalaya capture closes the explicit gap in Step 3B, where that location
had terrain but no biome colour at all.

## Measured output

Generated on this machine, 8 worker processes, from the commands above.

| | |
| --- | ---: |
| Tiles, z0–z7 | **11,186** |
| Total tile bytes | **89,881,110 B — 85.7 MiB** |
| Mean / median / max tile | 8,035 B / **1,534 B** / 82,500 B |
| Land-touching z7 candidates | 8,017 |
| z7 tiles stored | 7,952 (65 skipped as fully transparent) |
| Ocean-only tiles never rendered | 8,367 of 16,384 in the published extent |
| Wall time | **1,102 s — 18.4 min** |

| Zoom | Tiles | Bytes | Mean | Median | Max |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1 | 34,456 | 34,456 | 34,456 | 34,456 |
| 1 | 4 | 99,888 | 24,972 | 36,512 | 41,566 |
| 2 | 16 | 286,660 | 17,916 | 15,604 | 52,530 |
| 3 | 60 | 839,088 | 13,984 | 6,506 | 46,080 |
| 4 | 206 | 2,484,406 | 12,060 | 4,312 | 56,998 |
| 5 | 677 | 7,249,902 | 10,708 | 2,758 | 75,010 |
| 6 | 2,270 | 20,739,238 | 9,136 | 1,672 | 81,312 |
| 7 | 7,952 | 58,147,472 | 7,312 | 1,056 | 82,500 |
| **all** | **11,186** | **89,881,110** | **8,035** | **1,534** | **82,500** |

The median tile is only 1.5 kB because most stored tiles are coastal or polar
and largely transparent or flat. The 28-tile stratified sample used for the
format decision averaged 16.2 kB — it deliberately sampled interesting land, so
it is not representative of the whole pyramid. **Do not budget from the sample
mean; budget from the 85.7 MiB total.**

Over the **520 tiles the global pyramid and the regional PNG prototype share**,
storage falls from 13,180,261 B to 8,150,814 B — **−38.2%**.

The output directory also carries 19.1 MB of licence, provenance and ODbL
derivative-access files — `classes.tif` (13.1 MB, the unaltered categorical
archive) and the 5.9 MB glacier source among them — for **104.0 MiB** total.
The browser never fetches those; they exist to satisfy ODbL and must be
uploaded alongside the tiles.

### Offline input cost (cached, one-off)

| Step | Cost |
| --- | ---: |
| Original PNV raster | 23.9 MB |
| Natural Earth land + glaciers | 16.0 MB |
| Global Mapterhorn z6 cache | 1,586 tiles, 146 MB (408 ocean 404s) |
| z6 DEM mosaic, 32,768² float32 | 295 MB, 82 s |
| Nodata-fill intermediate, 43,200 × 17,886 | 9.2 MB, ~15 min |

All of it lives in `.biome-data/` and is reused by later runs.

## Runtime measurements

Measured in the running application with `scripts/biomes/validate-global.js`,
against the local tile server, at a 1568×760 viewport with terrain at 1× and
hillshade intensity 0.25. Cold loads use a fresh query token so neither
MapLibre's tile cache nor the HTTP cache can hide a request.

| View | Zoom | Tile requests | Transferred | Largest tile |
| --- | ---: | ---: | ---: | ---: |
| Global | 1.3 | 13 | 272 KB | 51.3 KB |
| Europe | 4.3 | 48 | 873 KB | 55.7 KB |
| Mediterranean | 4.3 | 51 | 942 KB | 55.7 KB |
| Sahara | 4.5 | 71 | 1,216 KB | 46.0 KB |
| Amazon | 4.5 | 71 | 1,033 KB | 51.5 KB |
| Central Asia | 4.2 | 51 | 1,532 KB | 73.3 KB |
| Himalayas | 7.8 | 10 | 429 KB | 60.8 KB |
| Alps | 7.8 | 11 | 272 KB | 49.1 KB |
| Australia | 4.0 | 75 | 462 KB | 34.8 KB |
| Greenland | 3.6 | 63 | 767 KB | 33.5 KB |
| Antarctica | 2.6 | 72 | 168 KB | 27.5 KB |
| Pacific date line | 3.0 | 53 | 793 KB | 50.4 KB |
| Bering date line | 6.0 | 43 | 444 KB | 27.6 KB |
| Fiji date line | 6.0 | 40 | 30 KB | 8.8 KB |

Across all 14 cold views: **672 requests, 9.0 MB, mean 13.7 kB per tile**, never
more than **75 requests for one viewport**. The opening global view costs
**13 tiles / 272 KB**.

- **Revisiting a warm view costs 0 requests** — MapLibre's tile cache serves it
  outright. Measured both directions of a Europe ↔ Sahara round trip.
- A 60° rotation at a warm continental view costs **38 requests**; zooming
  4.5 → 8 costs **136 requests / 904 KB**.
- **Zero empty responses** across all cold views: MapLibre's `bounds` plus the
  land-occupancy skipping meant no viewport requested a tile that does not
  exist. Skipped tiles do answer correctly when asked — 204 locally, 404 from an
  object store — but in practice they are rarely requested.
- Slowest single tile over loopback: 42.6 ms. These are local transfers, not
  WAN or CDN latency.

### Rendering and memory

Frame intervals over 120 `requestAnimationFrame` samples, terrain and biome
layers both enabled:

| View | Median | p95 | Mean |
| --- | ---: | ---: | ---: |
| Global z1.3 | 8.4 ms | 9.0 ms | 8.33 ms |
| Sahara z4.5 | 8.4 ms | 9.5 ms | 8.38 ms |
| Alps z7.8 | 8.3 ms | 9.3 ms | 8.32 ms |
| Himalayas z7.8 | 8.3 ms | 9.3 ms | 8.40 ms |
| Atlas z8, rotating ±2° | 8.3 ms | 9.4 ms | 8.40 ms |

The Atlas row repeats the Step 3B comparison conditions, which recorded median
8.0 ms / p95 14.0 ms for the regional prototype. Nothing regressed; the p95 is
tighter here. This is a small local sample on one machine and includes browser
scheduling, so it is **not** a claim of a speed improvement and does not replace
production, mobile or throttled-network profiling.

JavaScript heap: **64 MB** at the opening global view, rising to **238 MB**
after visiting all fourteen views in one session, against a 4,192 MB limit.
That is MapLibre's tile cache filling as intended, not a leak — but it is a JS
heap figure only, not GPU memory, and was not measured under memory pressure.

## Cloudflare R2 hosting

**Nothing here has been executed. No bucket, token, domain or object exists.**
`scripts/biomes/upload-r2.sh` is a dry run by default and refuses to write
without `--confirm`. Get approval before provisioning or uploading.

### 1. Bucket and credentials

Create an R2 bucket, then a **scoped object-write API token** for it. Configure
it as an AWS CLI profile (default name `mankind-r2`); R2 is S3-compatible.
Credentials must never appear in a `NEXT_PUBLIC_*` variable — those are inlined
into the browser bundle.

```sh
aws configure --profile mankind-r2    # access key / secret from the R2 token
```

### 2. Upload

```sh
export R2_ACCOUNT_ID=<account-id> R2_BUCKET=<bucket>
scripts/biomes/upload-r2.sh .biome-data/tiles/pnv-v4-global biomes/pnv-v4            # dry run
scripts/biomes/upload-r2.sh .biome-data/tiles/pnv-v4-global biomes/pnv-v4 --confirm  # upload
```

The script is incremental and safe to retry: `aws s3 sync --size-only` skips
objects already present at the same size, so an interrupted upload resumes
without re-sending the pyramid. It uploads in three passes so a partial upload
is never advertised:

1. Tiles, with the measured content type and
   `Cache-Control: public,max-age=31536000,immutable`.
2. Licence, provenance and ODbL derivative-access files, cached for a day.
3. `tilejson.json` **last**, cached for five minutes.

A versioned prefix such as `biomes/pnv-v4/` is immutable by contract. Any
palette, surface or processing change means a **new prefix** — never overwrite
published objects.

### 3. CORS

Configure on the bucket (R2 dashboard → Settings → CORS policy). Include
`http://localhost:3000` only while developing against the live bucket.

```json
[
  {
    "AllowedOrigins": ["https://<APP_DOMAIN>"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "If-Modified-Since", "If-None-Match"],
    "ExposeHeaders": ["ETag", "Cache-Control", "Content-Length", "Last-Modified"],
    "MaxAgeSeconds": 86400
  }
]
```

### 4. Custom domain and caching

Attach a custom tile domain under R2 → Settings → Public access → Custom
Domains. `r2.dev` is development-only and is not CDN-cached; a custom domain is
required for Cloudflare caching. Add a cache rule for the versioned tile prefix
that honours origin cache headers — the `immutable` year-long TTL on tiles does
the work. Purge previously cached responses if you correct CORS, since a cached
response without the right headers will keep failing. See
[R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
and [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).

Missing tiles will return **404** from an object store rather than the local
server's 204. MapLibre treats both as an empty tile, and the sparse-pyramid
property above means neither can produce a wrong colour.

If you want real-user tile timings from the browser, the tile host must also
send `Timing-Allow-Origin`. Without it a cross-origin tile reports
`transferSize: 0` and byte measurements are silently meaningless — the local
server sends it for exactly this reason.

### 5. Point the app at it

```sh
NEXT_PUBLIC_BIOME_TILE_BASE_URL=https://<TILE_DOMAIN>/biomes/pnv-v4 pnpm build
```

Verify before releasing, with an `Origin` header, that `tilejson.json` and a
sample tile return the expected content type, CORS and cache headers, that the
notice files are publicly retrievable, and that the globe rotates and zooms
cleanly.

## Attribution and licensing

Unchanged from `pnv-v4`, and reproduced in the output's `NOTICE.txt` and the
map's attribution control.

- **Vegetation:** Hengl T, Walsh MG, Sanderman J, Wheeler I, Harrison SP,
  Prentice IC. 2018. *Global mapping of potential natural vegetation: an
  assessment of machine learning algorithms for estimating land potential*.
  [PeerJ 6:e5457](https://doi.org/10.7717/peerj.5457). Raster
  [doi:10.7910/DVN/QQHCIK](https://doi.org/10.7910/DVN/QQHCIK), Harvard
  Dataverse, MD5 `f707d9e958a919a8c964814ca59de80d`.
  The [publisher](https://github.com/Envirometrix/PNVmaps#download-maps) offers
  this 1 km product under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/);
  Dataverse's `termsOfUse` instead says CC0 with modified terms. Both notices
  are retained and the more restrictive publisher grant is followed: attribution,
  notices and share-alike/derivative-database access.
- **ODbL obligations.** Rendered tiles are produced works; the categorical
  derivative is offered under ODbL. Publicly using a produced work from a
  derivative database also triggers ODbL 4.4/4.6 derivative-access, so the
  output ships `classes.tif` (the unaltered categorical extraction),
  `classes.csv`, the upstream README, archive metadata, `palette.json`,
  `surface.json` and the processing code. Upload pass 2 keeps all of it
  publicly retrievable alongside the tiles. Do not publish tiles without them.
- **Geography and glaciers:** [Natural Earth](https://www.naturalearthdata.com/)
  v5.1.2, pinned revision `f1890d9f152c896d250a77557a5751a93d494776`,
  [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- **Elevation:** © Mapterhorn, <https://mapterhorn.com/attribution>. Used
  offline for the render-only rock tint and at runtime for terrain geometry.
- PNV is **not** a reconstruction of 3000 BCE. This notice travels with the
  data.

## Known limitations

Source and model limits, carried over and now global in scope:

- PNV predicts vegetation potential under broadly modern conditions. It is
  neither observed land cover nor a verified reconstruction of 3000 BCE. The
  publisher calls the maps preliminary and warns of artifacts and geolocation
  errors. Hard winning classes discard the probability and uncertainty
  information.
- Large straight and triangular predicted class shapes remain visible in parts
  of the Sahara and Central Asia at continental scale. These are source model
  features, not tile seams. Their contrast is reduced by the `pnv-v4` palette;
  warping or relabelling them was avoided.
- No vegetation data exists for Antarctica, the far Canadian Arctic, northern
  Greenland above 83.63°N, or land south of 55.98°S. Those areas are
  transparent or carry the mapped-glacier ice accent only.
- The glacier layer includes recently deglaciated areas, derives largely from
  decades-old DCW mapping, and aggregates or omits smaller glaciers. It is a
  coarse atlas accent, not current glacier extent, snow persistence or
  historical ice.
- Small islands can take mainland colours where the 1 km raster has no valid
  cell, and the nodata fill reach is a fixed 64 source cells (~0.53°).
- Very close overzoom views cannot acquire sub-kilometre ecological detail. z7
  is the native limit for good reason.
- Web Mercator ends at ±85.0511°, so the pyramid cannot represent land beyond
  it regardless of source coverage.
- The rock tint is a cartographic material heuristic from slope, elevation and
  local relief. It is not inferred geology.
- Continental views still rely mostly on colour and material cues: the existing
  runtime hillshade remains gated to z6+ after the opaque ocean mask loads.
  Europe reads more uniformly green than the approved concept. These are
  unchanged `pnv-v4` characteristics, not global-run regressions.

Process and measurement limits:

- Inside source nodata gaps the global pyramid can differ from the regional
  prototype (0.2468% of compared visible pixels, max 113/255), because the
  nearest-class fill runs on a lattice anchored to the extraction window. Every
  pixel where the source carries a class is identical. Making the two agree
  exactly would mean changing the approved prototype's own output.
- Runtime figures are from one machine, one viewport, over loopback, with a
  warm browser. They are not WAN, CDN, mobile or throttled-network numbers, and
  the heap readings are JavaScript heap only — GPU memory was not measured.
- The glaciated-tile and polar-ice assertions cover existence and colour. The
  absence of *visible* artefacts was established by inspecting the rendered
  globe, which is how the Greenland banding was found in the first place; it is
  not fully covered by an automated check.

## Files added or modified

| File | Change |
| --- | --- |
| `scripts/biomes/build.py` | Global bounds, date-line-safe DEM reprojection, real data extent scan, polar ice from the unaltered archive, land-occupancy ocean skipping, WebP output, resume, column batching, parallel max-zoom and parent phases, progress reporting |
| `scripts/biomes/fetch.py` | `--global` land-aware worldwide z6 Mapterhorn cache, parallel downloads, remembered 404s for cheap resume |
| `scripts/biomes/check.py` | Global fixtures, exact date-line wrap proof, polar and glaciated-tile assertions, continuity with the `pnv-v4` interior, memory-bounded archive comparison |
| `scripts/biomes/measure.py` | **New.** Stratified format and zoom measurement; produced the WebP and maxzoom-7 decisions |
| `scripts/biomes/validate-global.js` | **New.** Browser QA: cold tile-request/byte measurement, frame cadence, canvas colour sampling |
| `scripts/biomes/upload-r2.sh` | **New.** Dry-run-by-default incremental R2 upload, three ordered passes |
| `scripts/biomes/serve.py` | WebP content type and caching, **`no-store` on the 204 so an absent tile is never cached as empty**, `Timing-Allow-Origin`, quiet mode |
| `map/biomes.ts` | Tile format read from the manifest, global dev default |
| `scripts/dev.mjs` | Tile base URL derived from the environment, matching `map/biomes.ts` |
| `scripts/check-biomes.mjs` | Prefers the global pyramid, asserts format, extents and ocean skipping |
| `.gitignore` | Scoped defence-in-depth rules against committing pyramids or rasters |
| `README.md`, `docs/global-biomes.md` | Entry point and this report |

Unchanged: `scripts/biomes/palette.json`, `surface.json`, `materials.py`,
`requirements.txt`, `map/hillshade.ts`, `map/mapStyle.ts`, `map/terrain.ts`,
`components/*`, and every application dependency.

## Geographic data stays out of the Next.js build

Verified after a production `next build --webpack`:

- `.next/static` is **2.7 MiB**, unchanged.
- The build output contains **no** reference to `.biome-data`, `pnv-1km`,
  `classes.tif`, `dem-z6` or `pnv-v4-global`.
- No `.webp` or `.tif` tile is traced into the build.
- `NEXT_PUBLIC_BIOME_TILE_BASE_URL` is unset in production, so no tile URL is
  inlined and the application falls back to the dark atlas. Geographic payload
  added to the production bundle: **zero bytes**.
- `.gitignore` covers `.biome-data/`, with additional scoped rules so a pyramid
  written elsewhere still cannot be committed or served from `public/`.

## Scope

No Three.js scenery or objects were introduced, no historical land-use change,
no HYDE or Beyer integration, no change to the biome classification, no
interface redesign, no cloud infrastructure, and no Phase 3 work. The globe
projection and atmosphere, terrain exaggeration controls, timeline and
historical date selection, playback, navigation, search, colours and the
React/Next.js structure are untouched.
