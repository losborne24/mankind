# Phase 2, Step 3 — regional PNV prototype

**Current refinement:** Step 3B now uses `pnv-v4`; see [terrain-refinement.md](terrain-refinement.md) for the updated blending/material pipeline, matched screenshots and measurements. This document records the original `pnv-v2` baseline and hosting architecture.

Implemented and locally validated on 27 October 2026. No cloud resources were created and no global colour pyramid was generated.

## Source, rights and limitations

**Dataset:** Tomislav Hengl, *Global Maps of Potential Natural Vegetation at 1 km resolution*, [doi:10.7910/DVN/QQHCIK](https://doi.org/10.7910/DVN/QQHCIK), Harvard Dataverse. Use the original categorical BIOME6000 raster, not probabilities or confidence:

- `pnv_biome.type_biome00k_c_1km_s0..0cm_2000..2017_v0.1.tif`
- [Exact raster download, file 3137376](https://dataverse.harvard.edu/api/access/datafile/3137376), 23,948,459 bytes; MD5 `f707d9e958a919a8c964814ca59de80d`.
- [Original class definitions, file 3137372](https://dataverse.harvard.edu/api/access/datafile/3137372), MD5 `874f169f966e039935108bc366773f80`.
- [Archive metadata](https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/QQHCIK).
- Raster: EPSG:4326, 43,200 × 17,924 uint8 cells, 1/120 degree spacing; nodata 255. Approximately 1 km at equator; longitudinal spacing decreases towards poles. Coverage reaches about 87.37°N–62°S, **not Antarctica**.

The [publisher's PNVmaps documentation](https://github.com/Envirometrix/PNVmaps#download-maps) explicitly offers this **1 km** product under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Dataverse's `termsOfUse` instead says CC0 with additional/modified terms, with no further text returned. Both original notices are retained in output. This implementation follows the more restrictive publisher ODbL grant: public processing, commercial use and hosting are permitted with attribution, notices, and share-alike/access to derivative databases. Do not transfer a different resolution/product's licence to this raster.

The map attribution names and links OpenLandMap, Hengl et al., the DOI, ODbL and a hosted notice. The output offers the unblended categorical extraction as `classes.tif`, the source metadata and original class table, and the alteration algorithm/palette under the ODbL notice. Publish those files alongside tiles. Rendered images are produced works; the categorical derivative is offered under ODbL. Publicly using a produced work from a derivative database also triggers the derivative-access provisions (ODbL 4.4/4.6).

**Citation:** Hengl T, Walsh MG, Sanderman J, Wheeler I, Harrison SP, Prentice IC. 2018. *Global mapping of potential natural vegetation: an assessment of machine learning algorithms for estimating land potential*. [PeerJ 6:e5457](https://doi.org/10.7717/peerj.5457).

PNV predicts vegetation potential under broadly modern environmental conditions. It is neither observed current land cover nor a verified reconstruction of 3000 BCE. The archive describes 8,057 modern pollen-based BIOME6000 training reconstructions. The publisher calls the maps preliminary and warns about artifacts and geolocation errors. Hard winning classes discard probability/uncertainty information. The Sahara has extensive predicted steppe and scattered desert: this remains visible rather than silently overwriting classes with a hand-drawn desert. Isolated small islands may receive mainland colours where the 1 km raster has no valid cell. Source gaps, sparse training and modern coastlines limit historical interpretation.

## Original classes and palette

`palette.json` is the single colour configuration. Numbers are categorical codes, **not a continuous scale**. Definitions below come from the downloaded CSV, whose gaps in numeric IDs are intentional.

| ID | Original consolidated meaning | MANKIND colour |
| --- | --- | --- |
| 1 | Tropical evergreen broadleaf forest | `#304d39` |
| 2 | Tropical semi-evergreen broadleaf forest | `#486044` |
| 3 | Tropical deciduous broadleaf forest and woodland | `#72764a` |
| 4 | Warm-temperate evergreen and mixed forest | `#4c6347` |
| 7 | Cool-temperate rainforest | `#355546` |
| 8 | Cool evergreen needleleaf forest | `#3d5848` |
| 9 | Cool mixed forest | `#4c634d` |
| 13 | Temperate deciduous broadleaf forest | `#486044` |
| 14 | Cold deciduous forest | `#5b6a53` |
| 15 | Cold evergreen needleleaf forest | `#40594e` |
| 16 | Temperate sclerophyll woodland and shrubland | `#858560` |
| 17 | Temperate evergreen needleleaf open woodland | `#727e5c` |
| 18 | Tropical savanna | `#a3a16a` |
| 19 | No consolidated label; original: temperate deciduous broadleaf savanna | `#909367` |
| 20 | Xerophytic woods/scrub | `#b09c70` |
| 22 | Steppe | `#969570` |
| 27 | Desert | `#c6b18b` |
| 28 | Graminoid and forb tundra | `#929482` |
| 30 | Erect dwarf shrub tundra | `#858d74` |
| 31 | Low and high shrub tundra | `#77866d` |
| 32 | Prostrate dwarf shrub tundra | `#aaa99a` |

Rock uses `#8c8677`. Ice `#dbddd5` is reserved, **not applied**: this dataset has no snow/ice class and no altitude-only snow rule is introduced. A climate-aware ice mask needs separate future validation and rights review. Ocean remains the existing `#0a1622`.

## Reproduce locally

Python 3.9+; pip wheels provide GDAL through rasterio, plus NumPy, SciPy and Pillow. No new JavaScript production dependencies. `curl` downloads inputs. Run from repo root:

```sh
python3 -m venv .biome-venv
.biome-venv/bin/pip install -r scripts/biomes/requirements.txt
.biome-venv/bin/python scripts/biomes/fetch.py
.biome-venv/bin/python scripts/biomes/build.py
.biome-venv/bin/python scripts/biomes/check.py
python3 scripts/biomes/serve.py
```

Then run `pnpm dev` separately and open http://localhost:3000. The tile server binds only 127.0.0.1:8766. Development defaults to `http://localhost:8766/pnv-v2`. Access from another device requires an explicitly reachable tile URL and server binding; this prototype intentionally stays local.

If importing data manually, put the exact original files into `.biome-data/source/` as `pnv-1km.tif` and `classes.csv`; `fetch.py` verifies their MD5 values instead of downloading again. It also fetches the pinned Natural Earth v5.1.2 10m land mask with SHA256 verification, archive metadata and upstream notices. The modest regional z5 Mapterhorn Terrarium WebP cache is decoded to a render-only elevation mosaic. Mapterhorn intentionally omits some ocean tiles; HTTP 404 remains nodata, other download failures stop processing.

`.biome-data/` and `.biome-venv/` are ignored by Git. Nothing goes into `public/`. Neither `dev` nor `build` runs the offline pipeline. Keep generated data outside a production deployment checkout or exclude these directories in deployment packaging; no application import references the files.

Use a **fresh versioned directory** to change colours, variation or zoom:

```sh
.biome-venv/bin/python scripts/biomes/build.py --maxzoom 8 --variation 0.025 --output .biome-data/tiles/pnv-v3
NEXT_PUBLIC_BIOME_TILE_URL=http://localhost:8766/pnv-v3 pnpm dev
```

The builder refuses to overwrite an existing output. Its manifest appears only after all tiles finish. Do not point the browser at a generation in progress.

## Processing and continuity

Prototype bounds: **18°W–41°E, 17°N–56°N**, covering Iberia, France, Italy, the Mediterranean and North Africa. A 1° edge fade marks the transition back to the dark atlas. Its coverage boundary is visible from space and is not a classification artifact.

1. Retain the original downloaded global raster separately. Stream an exact native-grid categorical regional extraction to `classes.tif` (nodata and IDs unchanged).
2. Make a separate render-only raster by copying nearest valid classes into coastal nodata using a fixed source grid and 512-cell processing blocks with 64-cell halos. This avoids tile-dependent nearest-island colours. These filled coastal values never replace the classification archive.
3. At the highest zoom, reproject classes by nearest neighbour onto the global EPSG:3857 XYZ pixel grid with 16-pixel padding. Map IDs through the palette and reject unknown classes.
4. Blur **RGB channels only**, Gaussian sigma 1.5 output pixels, support 6 pixels, less than the padding. At z7 this is about 1.8 km in Mercator coordinates (ground distance depends on latitude). Do not blur numeric class IDs.
5. Apply deterministic longitude/latitude waves, default ±3.5%, with no per-tile seeds. Use decoded Mapterhorn height and ground-adjusted slope for a restrained rock blend above roughly 1,100 m. Missing DEM contributes no rock tint. Runtime terrain geometry remains Mapterhorn at 1×.
6. Rasterize the same pinned 10m Natural Earth land polygons at 2× resolution to antialiased alpha **after colour blending**. Sea alpha is never Gaussian-blurred. Runtime regional ocean/lake masks and coastlines remain above the surface. At global zooms the existing 50m outlines and downsampled 10m alpha can differ by subpixel/generalization amounts.
7. Generate lower zooms from 2×2 children with premultiplied-alpha colour downsampling, preserving ecology and preventing dark ocean fringes. Do not average class IDs. These parents do not require a full-resolution worldwide RGB array.

Output: lossless **RGBA PNG, 256×256, XYZ z0–7**, overzoomed by MapLibre at closer views. PNG was selected for exact alpha and easy inspection; compare lossless WebP before global publication. All tiles intersecting the regional rectangle exist, including transparent ocean tiles, avoiding sparse-pyramid request holes.

## MapLibre and failure handling

`map/biomes.ts` centralizes the URL, attribution, metadata validation, source and raster layer. Fetch one small `tilejson.json`, then configure:

```ts
{
  type: 'raster',
  tiles: [`${base}/{z}/{x}/{y}.png`],
  tileSize: 256,
  minzoom: 0,
  maxzoom: metadata.maxzoom,
  bounds: metadata.bounds
}
```

The visible tile selection and parent reuse are MapLibre's responsibility. No GeoTIFF or large raster is downloaded to the browser. `NEXT_PUBLIC_BIOME_TILE_URL` is a **build-time browser configuration**; set it before `pnpm build`, then raster fetches occur at runtime. Production has no assumed URL and defaults to the dark atlas.

Order: base land → regional land → biome raster → regional hillshade → opaque regional ocean → coastlines → rivers/lakes. The existing hillshade loading/fade gate and z6 minimum remain, preventing underwater relief. The old Phase-1 Three.js test-marker activation was removed; the unused test-layer file is retained. No Three.js terrain or objects are introduced.

Debug Tools includes biome toggle, hillshade toggle/intensity, existing exaggeration controls (default 1×). Colour variation is an offline configurable value; no extra runtime variant is fetched. Switching biomes off removes source/layer and restores original coastline order. Metadata timeout/offline failure reports a debug status and leaves the atlas. Individual missing tiles produce transparent gaps/parent fallback and optional-source errors do not fail the globe. The local server returns CORS, one-hour PNG caching, conditional `Last-Modified`/304 and 204 for absent tile paths. Production object stores may return 404 instead; MapLibre remains usable.

## Cloudflare R2 — proposed deployment only

**No commands below were executed. Obtain approval before creating resources or uploading.**

1. After regional visual approval, choose a versioned prefix and an R2 bucket. Create a narrowly scoped object-write token and configure an AWS CLI profile `mankind-r2` locally. Never put credentials in `NEXT_PUBLIC_*`.
2. Upload the complete output, including notice, classes, palette and alteration algorithm:

```sh
aws --profile mankind-r2 --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" s3 sync .biome-data/tiles/pnv-v2/ s3://<BUCKET>/biomes/pnv-v2/ --cache-control 'public,max-age=31536000,immutable'
```

Use a new prefix whenever data or palette changes; do not overwrite immutable objects. AWS CLI infers `image/png`, `application/json`, etc.; verify content types on the final domain. Keep the licence/access files publicly retrievable too. For a mutable pointer manifest, separately give it `Cache-Control: no-cache`; versioned manifests can remain immutable.

3. Configure bucket CORS in the R2 dashboard (replace origin with the deployed application; include localhost only if needed):

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

4. Attach a custom tile domain through R2 Settings → Public access → Custom Domains. Use a CDN cache rule for the versioned tile prefix and honour object cache headers. `r2.dev` is for development; a custom domain supports Cloudflare caching. Purge any previously cached responses if correcting CORS. See [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
5. Build MANKIND with `NEXT_PUBLIC_BIOME_TILE_URL=https://<TILE_DOMAIN>/biomes/pnv-v2`. Verify a PNG and manifest with an `Origin` request header, content types, caching and notices. Rotate globe and zoom before releasing.

## Validation and measured output

- Corrected prototype: **595 PNG tiles, 10,871,061 bytes (10.37 MiB)**, ~18.3 kB/tile average, generated in **75.94 s** on this machine. `classes.tif` is ~1.26 MB. Original global PNV download is ~23.95 MB and stays offline.
- Native-grid extraction compared byte-for-byte with original source window. Observed class IDs remain `[4,8,9,13,14,15,16,17,18,20,22,27,28,31,255]`.
- Independent 512px renders versus 2×2 generated tiles at Iberia, Alps and Mediterranean: **maximum visible RGB delta 0/255**, including tile boundaries. This caught and fixed the first version's island nodata-fill discrepancy.
- Madrid, Paris, Rome, Sahara and Alps sample alpha 255; Mediterranean and Biscay sea alpha 0. All 595 PNGs decode at 256×256 RGBA.
- Local HTTP samples: z7 Alpine tile **55,134 bytes, 1.80 ms**; z0 tile **4,541 bytes, 1.76 ms**. These are loopback transfer timings, not WAN/CDN latency or FPS benchmarks. Conditional request returned **304**, absent tile **204**, PNG had expected CORS/cache/content-type headers.
- Browser verified raster requests from the independent local server at global and regional zooms, globe projection with physical terrain at **1×**, detailed Alpine hillshade/ridges, precise Mediterranean ocean, biome on/off comparison and timeline forward navigation. No visible internal rectangular tile seams in inspected views. Global bounding rectangle is deliberately visible at the prototype edge.
- Automated checks: `pnpm typecheck`, `pnpm lint`, `pnpm exec next build --webpack`, `node scripts/check-geography.mjs`, `node scripts/check-hillshade.mjs`, `node scripts/check-biomes.mjs`, `.biome-venv/bin/python scripts/biomes/check.py`.
- Application still statically prerenders `/`; the production build never reads PNV or colour tiles. Geographic payload added to the Next build: **zero raster bytes**. No package dependencies added. Native browser memory readings during development varied with camera/DevTools; they are not a controlled regression benchmark. Profile FPS, GPU memory and throttled-network p95 before global release.

## Comparison with approved concept and global follow-up

The approved generated concept was visible in the open “Phase 2 Resources” project conversation and inspected during QA. This prototype reproduces the navy water, muted green land and tan desert direction, but **does not yet match its final appearance**:

- Global view is flatter: existing runtime hillshade only appears at z6+, while the concept has strongly lit mountain chains at continental scale.
- Alps read as grey-green rock, without the concept's bright climate-aware snow/ice cap.
- PNV predicts broad green/olive forest in Europe and mottled steppe/desert in the Sahara; the concept has more varied golden Iberia and a more uniformly sandy Sahara. These are source/model and palette differences, not reasons to relabel IDs silently.
- Regional coverage fades into dark land at its bounds; the concept has complete worldwide natural colour.
- The result is smooth and restrained, with less illustrated fine texture and less dramatic lighting than the concept. Further palette/art-direction review is needed before a global run.

The builder already accepts arbitrary non-wrapping `--bounds`, z1–9 maximum, a matching `--dem` GeoTIFF, streamed categorical extraction, tiled render intermediates and a bounded-memory parent pyramid. A future global invocation would be:

```sh
.biome-venv/bin/python scripts/biomes/build.py --bounds -180 -85 180 85 --maxzoom 8 --dem /path/to/global-mapterhorn-3857.tif --output .biome-data/tiles/pnv-global-v1
```

**Do not run this yet.** Prepare/cache a matching Mapterhorn DEM outside the app; the supplied fetch helper only caches the test region and the builder rejects larger bounds without an explicit DEM. First review colours/lighting. Then validate dateline and source-grid block edges, high latitudes, coastal nodata gaps wider than the 64-cell fill halo, and all ecological classes with global seam fixtures. Resolve Antarctica/polar ice coverage explicitly without silently substituting a biome source. The original raster ends around 62°S; uncovered land currently remains dark. At global extent, remove the prototype coverage-edge fade at the dateline and verify wraparound. Consider skipping fully transparent tiles with an explicit sparse-tile serving policy, compare WebP compression, and add interruption/resume for long jobs. The current regional per-tile average must not be presented as a measured worldwide size; generate stratified ecological samples before budgeting global R2 storage.

## Files added or modified

| File | Purpose |
| --- | --- |
| `scripts/biomes/fetch.py` | Checksum-verified PNV/class/coast download and regional DEM cache |
| `scripts/biomes/build.py` | Offline categorical preservation, colour blending, terrain tint, masking and XYZ pyramid |
| `scripts/biomes/palette.json` | Configurable original-class colours, rock and reserved ice |
| `scripts/biomes/requirements.txt` | Isolated, pinned Python processing dependencies |
| `scripts/biomes/serve.py` | Independent local tile server, CORS and cache headers |
| `scripts/biomes/check.py` | Real-output categorical, seam and coastline validation |
| `scripts/check-biomes.mjs` | Actual manifest, MapLibre ordering and offline fallback checks |
| `map/biomes.ts` | Central optional runtime raster-source configuration |
| `map/hillshade.ts` | Configurable intensity, existing ocean safety gate retained |
| `components/DebugPanel.tsx` | Biome toggle, service warning, hillshade intensity |
| `components/GlobeView.tsx` | Optional biome error handling; Phase-1 marker activation removed |
| `.gitignore` | Exclude all offline data, tiles and Python environment |
| `README.md`, `docs/biomes.md` | Entry point and complete processing/deployment/validation report |

Additional final checks: build traces contained no `.biome-data`, `pnv-1km` or `classes.tif` references. Current complete `.next/static` output is 2.7 MiB (no before/after controlled bundle comparison). Browser fallback was tested with the tile server stopped: the dark atlas remained navigable and Debug Tools reported “Biome tiles unavailable”. Restart/toggle recovery was verified. Local server and app were left running for review.
