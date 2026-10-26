# Natural terrain materials — Phase 1

The Earth uses MapLibre terrain, with Three.js scene objects. This migration
retains physical terrain, camera, globe projection, DEM cache, rectangular
quadtree LOD, coastlines, hydrology and the demo scene. HYDE and REVEALS have no
runtime integration here; their existing planning documents are untouched.

## Architecture

- `map/surface/materials.ts`: dataset-independent rock, scree, gravel, sand,
  dry/moist soil, forest floor, grass, snow and ice albedo, roughness and normal
  strength. Linear-light blending; slope-driven rock and ruggedness-driven scree.
- `map/surface/resolve.ts`: provisional modern ecological suitability, shared
  ground and potential canopy/grass inputs. These priors are not measured cover,
  soil surveys, geology or precise stand boundaries.
- `map/surface/terrain.ts`: Terrarium decoding and physical, unexaggerated
  slope, downhill aspect, ruggedness, curvature and east/up/south normals.
  Derivatives use native DEM spacing in metres at the actual latitude.
- `map/surface/provider.ts`: configurable reference/material adapter preserving
  water, source provenance and existing per-class controls.
- `scripts/prepare-natural-surface.mjs`: offline bounded DEM LRU, neighbour
  sampling and halo-aware bilinear albedo/property expansion. Derivatives are
  shared between material classes. Parent coverage uses premultiplied area
  aggregation; packed normal/roughness RGB data is averaged independently.
- `map/surface/groundLayer.ts` and `shader.ts`: a cached PBR shading pass through
  **MapLibre 6.15's experimental `renderToTerrainTile` hook**. It shades the
  existing mesh; there is no duplicate terrain, second canvas, renderer fork,
  private MapLibre API or node_modules patch.

The shader consumes albedo and linear-data east-normal/south-normal/roughness
maps. It uses a nonmetallic GGX/Smith/Schlick BRDF, artistic fixed northwest sun
and diffuse sky. Close-range triplanar value noise supplies albedo, roughness
and normal variation; analytic gradients and footprint filtering suppress
subpixel detail. A uniform footprint gate avoids evaluating micro detail on
distant tiles. Materials remain geographic across tile boundaries and dates.

The shared environment's potential canopy prior supplies a distant aggregate
tint retained at every zoom until visible vegetation geometry can replace it.
Exposed slopes reduce it; zoom alone never clears forests.
Brown forest floor remains the independent underlying ground material; aggregate
cover stays visible until a real vegetation handoff is available. It creates no trees or new vegetation observations. Local vegetation
assets remain Phase 3 work. No snowline, climate, wetness or soil is inferred
from altitude or depressions. Source-omitted tundra/rock/ice remain neutral.

The runtime samples environmental parents independently of the terrain tile's
LOD. Source inputs stop at z4; native terrain shading tiles can reach z16+
without requesting nonexistent environmental levels. Antimeridian X wraps;
polar Y clamps. Mercator's ±85.0511° extent is explicit, not new polar data.

## Lifecycle and fallback

Only visible terrain tiles request material inputs. A manifest coverage index
skips empty ecological tiles (1,304 of the 1,705 class tiles in this baseline).
A 64-pair LRU bounds additional GPU texture allocation to at most 128 MiB before
driver overhead. ImageBitmaps close after upload; eviction and layer removal
abort pending requests and dispose both texture channels. Context loss clears
resources; restoration recompiles and reloads them. WebGL upload state is
restored outside draw callbacks so asynchronous loading cannot corrupt the
shared Three.js/MapLibre context.

Native MapLibre RTT caching owns the final shaded tiles. Camera pitch/bearing
and lighting changes invalidate the BRDF when the camera settles. While moving,
cached view-dependent lighting is an approximation. This is cached terrain
shading, not a new per-frame dynamic lighting/shadow engine. Geographic diffuse
and procedural detail stay fixed. Existing optional hillshade diagnostics still
compose after the material pass. No material textures or shaders rebuild when
the historical date changes on this static baseline.

Matching natural appearance rasters stay beneath the shader while material
inputs load. They use the same ground albedo, normals, roughness, canopy and
shared lighting constants as the shader at its default view. RESOLVE is the
ecological baseline, not a separate palette in the live renderer. Missing or
incompatible property manifests, failed shader initialization or property tiles
leave that fallback visible and report a console warning. With physical terrain disabled, the
native raster surface remains available. Generated tiles must be deployed with
the manifest; there is no runtime scientific archive download.

## Prepare, run and compare

Run preparation before starting the dev server to avoid asset-write refreshes.
Requires Node 24 for native TS stripping, existing `reference-v1` assets and the
bundled complete Terrarium z4 pyramid. No new scientific source is required.
If reference assets are absent, prepare them from the existing cached inputs.

```
pnpm environment:prepare --offline
pnpm surface:prepare
pnpm surface:test
node scripts/test-natural-surface.mjs --assets
pnpm environment:test
pnpm typecheck
pnpm lint
pnpm exec next build --webpack
```

Generated material assets live in the already ignored
`public/geo/environment/natural-v1`. Deploy the whole directory alongside
`reference-v1` under `NEXT_PUBLIC_ENVIRONMENT_ASSET_BASE`, using the existing
asset-hosting process. Builds never prepare or download tiles. The pyramid has
1,705 albedo, 1,705 packed-property and 1,705 matching appearance PNGs; its highest source grid is 8192².
Final full preparation with properties took about 238 seconds locally;
albedo plus property assets occupied about 174 MiB; the matching appearance
drape adds about 12 MiB. The manifest records actual
output counts/bytes, including the appearance drape. Existing albedo/property
assets can gain the matching drape via `node scripts/prepare-surface-appearance.mjs`
without decoding DEM again. Deploy the new `*-appearance` directories too. `--parents-only` rebuilds parents and the coverage index
without recalculating native terrain properties (about 40 seconds locally).

- **PBR Shading ON/OFF**: BRDF lighting / unlit material appearance. This retains
  material variation and distant potential canopy while comparing illumination.
- **RESOLVE 2017** and per-class filters control the single natural surface.
  The duplicate Natural Materials comparison switch has been removed. Live
  `resolve`/`natural` selections share tiles and shader instances, avoiding reload
  flashes; the original reference catalog/data remain available for diagnostics.
- Water, DEM Shading, Terrain Lighting and 3D Elevation remain independently
  controlled. Terrain Lighting also controls the shader's illumination.

In development, `window.__globe.environment.getMaterialStats()` reports texture
loads, evictions, failures, native tile zoom and draw submission time. It is not
a GPU timer or a frame-rate promise. `window.__globe.map` supports inspection.

## Validation and limits

Automated checks cover derivatives, normalized blends, geographic continuity,
coverage masks, linear property channels, independent source LOD, overzoom UVs,
cache invalidation, cancellation/disposal, source replacement, comparison
controls and thousands of historical dates without source mutations.

An actual forest pixel from the native loading drape matched the live GPU shader
exactly at the default view: both returned RGB 65, 80, 51, with no WebGL errors.
Regression checks also verify that live RESOLVE/natural selections retain the
same source and material-layer instances.

The isolated synthetic browser fixture in `gpu-fixture.js` compiles the actual
live shaders into a temporary offscreen WebGL2 context. Paste it into the local
development preview's DevTools Console. Roughness, terrain normal and detail
must each change pixels; WebGL error must be zero. This fixture is test input,
not invented scientific raster data. A Chrome run passed all three comparisons with `glError: 0`.

A warm-cache globe camera-motion smoke test at 1970×1786 recorded 254 render
intervals: median 8.3 ms, p95 9.9 ms. The run loaded 38 material pairs, with zero
failures or evictions. This development-machine result includes native map
rendering; it is not a hardware-wide benchmark or an 8K display test. Independent
native terrain shading LOD through z16 was verified while source textures were
reused at z4. Orbital and close-range appearance were inspected interactively.

The bundled z4 elevation grid remains geographically coarse. Procedural detail
cannot recover metre-scale topography, exact soil/geology or historical forest
edges. Broader local-scene art review and mobile GPU measurements remain useful;
new shadows, detailed terrain elevation and vegetation assets are not claimed.
The experimental MapLibre hook needs regression checks on library upgrades.

Dates retain the existing astronomical convention (3000 BCE = -2999). Beyer,
CHELSA and modern climate are not loaded; every date uses an explicitly labelled
modern ecological fallback. Phase 2 must ingest actual tiled observations with
validated coverage and temporal rules. Phase 3 supplies instanced vegetation
consistent with this shared environment. HYDE and REVEALS remain deferred.
