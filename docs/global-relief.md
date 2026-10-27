# Global terrain relief visibility

The existing native MapLibre hillshade is sufficient for this pass. Removing
its z6 gate and testing contrast at 0.55 made broad ranges readable without a
precomputed Mapterhorn relief texture or another renderer. Mapterhorn's native
DEM pyramid supplies progressively finer slopes as the camera approaches.
MapLibre documents `hillshade-exaggeration` as shading intensity, independent
of terrain elevation: https://maplibre.org/maplibre-style-spec/layers/#hillshade-exaggeration.

## Runtime changes

- One existing hillshade pass, same Terrarium DEM, 315° map-anchored light and
  warm neutral paint. Global contrast defaults to **0.55 through z4**, with a
  cubic-bezier ease into the existing **0.25 at z6 and above**.
- Debug Tools exposes **Global hillshade strength** (0–1) separately from the
  existing local intensity. Global-state paint updates avoid destroying and
  refetching hillshade sources on every slider change. The Hillshade checkbox
  controls both scales and removes the added mask/source when disabled.
- New coarse ocean masks derive exclusively from existing Natural Earth 50m
  land. They cover shading until the 10m regional ocean is loaded, at full
  opacity, and its 300 ms paint fade has settled. Two partially transparent
  masks are never used as the sole barrier over shading. If neither mask is
  ready, shading hides until coverage is available. During regional loading,
  a loaded coarse mask can safely maintain relief.
- Coastline paint, geometry and LOD fade are unchanged. Both outline layers
  now stay above shading and masking in the base style, including when biome
  colours are disabled. Biome attachment no longer reorders the coastline.
- Default physical terrain remains **1×**. PNV IDs, palette, processing and
  raster tiles are unchanged. No new JavaScript dependency or Three.js code.

## Mask generation and an overzoom regression

Run `node scripts/prepare-global-ocean.mjs` to regenerate the 85 z0–3 static
PBFs under `public/geo/natural-earth-v5.1.2/ocean-50m/`. Source rings match the
existing 50m land; no extra source download is needed. The script uses already
installed MapLibre tiling dependencies and earcut only offline.

The first visual review found a solid sea rectangle over Germany at z5, even
though geographic point-in-polygon checks passed. MapLibre 6's overzoom clipper
can clip both an ocean outer ring and a land hole to identical boundaries;
subsequent renderer ring classification loses the hole. Highest native level
z3 is therefore triangulated **before** overzoom clipping. Simple triangles
retain coverage through clipping. z0–2 retain compact rings. A regression test
runs the installed MapLibre clipper, ring classification and earcut, verifying
rendered land/ocean coverage rather than just polygon parity.

| Level | Tiles | Bytes |
| --- | ---: | ---: |
| z0 | 1 | 124,981 |
| z1 | 4 | 127,561 |
| z2 | 16 | 130,266 |
| z3 | 64 | 702,132 |
| Total | 85 | 1,084,940 |

These are static runtime geography assets, not JavaScript imports. Production
webpack build succeeds and `.next/static` is **2,764 KiB before and after** at
filesystem block resolution (no noticeable bundle increase). There is one
additional vector source and one fill layer; z0 adds a 125 KB mask request.
No global relief raster, second shading pass, or additional DEM pyramid was
introduced. This is bundle/asset accounting, not a mobile GPU performance claim.

## Visual verification

Actual MapLibre canvas captures use 1× terrain, pitch 0°, bearing 0°, global
strength 0.55 and local intensity 0.25. Each range was reviewed at **z1.3
(globe), z3.5, z5, z6 and z8**. The z5 artifact was isolated by disabling the
coarse mask and then corrected; the matrix was repeated with corrected tiles.

| Range | Centre longitude, latitude | Observation |
| --- | --- | --- |
| Alps | 8, 46 | Recognisable arc at continental scale; fine valleys and existing ice material remain at close zoom. |
| Atlas | -5, 31 | Restrained broad relief over sandy PNV colours, with local ridges preserved. |
| Himalayas | 86, 28 | Broad range is readable from globe/continental views; detailed slopes at z6–8. |
| Andes | -70, -30 | Continuous western relief is readable in globe/continental views; close valleys remain detailed. |

Globe-scale Alpine/Atlas features occupy far fewer pixels than the Himalayas
and Andes and are deliberately subtle. The current PNV prototype is still
regional: Himalayas and Andes test hillshade on the dark atlas, **not global
biome coverage**. Existing rectangular biome coverage boundaries and Sahara
classification shapes remain. Mapterhorn returns 404s for some ocean DEM
tiles; the ocean masks keep those areas dark. No claim of complete worldwide
DEM availability is made.

Contact sheet and per-zoom review PNGs are kept locally in ignored
`.biome-data/review/global-relief/`, outside Git and the production build.
For repeatable full-resolution captures, paste `scripts/biomes/capture.js`
into the local app's DevTools and call `captureTerrain(name, camera)` with the
coordinates and zoom levels above. It records the actual hillshade expression,
mask, global debug state and physical terrain alongside the render.

## Checks

- `node scripts/check-hillshade.mjs`: installed style validator; low-zoom
  availability; continuous intensity blend and independent global control;
  mask loading/fade handover and cleanup; all 85 global tiles decode; mountain,
  island, ocean, dateline and polar samples; installed overzoom renderer test.
- `node scripts/check-biomes.mjs` and `node scripts/check-geography.mjs`:
  existing geography, biome attachment/fallback, coastline and layer ordering.
- `pnpm typecheck`, `pnpm lint`, `pnpm exec next build --webpack`.
- Browser: global slider increments/decrements and restoration to 0.55;
  hillshade checkbox removes/restores shading; ocean stays dark and fine
  terrain stays visible at regional/local zooms.
