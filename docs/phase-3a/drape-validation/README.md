# Terrain drape diagnosis and verification

The Phase 3A surfaces **already use the existing DEM-displaced terrain**. No missing drape integration was found, so no replacement rendering system, elevation change or biome reclassification was introduced. Changes are an explanatory renderer comment, regression coverage, and this evidence. The temporary camera/diagnostic UI used for capture was removed.

## Why the raster layers conform to terrain

Inspection used the installed MapLibre GL JS **6.15.0** source, rather than assumptions about another version:

1. `components/GlobeView.tsx` enables `map.setTerrain({ source: "dem", exaggeration: 1.5 })`. `map/terrain.ts` keeps the same Terrarium encoding and native z0–4 pyramid.
2. `map/environment/renderer.ts` adds ordinary geographic XYZ **raster** sources/layers. It creates no Three.js plane, mesh, elevation offset, independent depth buffer or screen-space image.
3. `node_modules/maplibre-gl/src/ui/map.ts` installs `RenderToTexture` when terrain is enabled.
4. `src/webgl/render_to_texture.ts` explicitly includes `raster`, `fill`, `color-relief` and `hillshade` in its terrain texture types. The painter routes these layers into per-terrain-tile compositing.
5. `src/webgl/draw/draw_terrain.ts` obtains that composite texture and the existing terrain mesh. `src/shaders/glsl/terrain.vertex.glsl` calls `get_elevation()` and `projectTileFor3D()` while carrying texture coordinates on that mesh. Biome material and relief therefore share vertex displacement, projection, depth and terrain skirts.

The application order is still land → environmental material → relief → hillshade → Natural Earth ocean mask → existing overlays/coastlines. Regional land is inserted below the material; 50m/10m coastline thresholds and handoff are untouched. Three.js continues to handle the existing scene/coastline integration, not these biome surfaces.

The soft appearance at close zoom is consistent with overzooming the coarse z0–4 DEM and z0–4 ecological raster textures. Broad ecoregion boundaries also cross hills and valleys; that is the source classification, not evidence of a flat sheet or a reason to classify vegetation by height. No resolution, opacity, lighting or classification was changed in this diagnosis.

## Visual checks

Chrome, existing local development server, year 3000 BCE, same native terrain/exaggeration and original biome assets. Each preset was allowed to reach the map's `idle` event before capture. Temporary diagnostics read the active render-to-texture layer list and terrain tile set; all eight states reported **six environmental layers in the drape**, `DEM=dem`, exaggeration **1.5**. The displayed mesh count is the existing viewport-dependent terrain tile count, not newly created biome geometry.

| Region | Centre / zoom | Overhead 0° | Oblique 60° | Existing terrain tile count (0° / 60°) |
| --- | --- | --- | --- | --- |
| Alps | 10°E, 46°N / 6.7 | [Capture](alps-overhead.png) | [Capture](alps-oblique.png) | 6 / 18 |
| Greece / Aegean | 24°E, 37.5°N / 6.0 | [Capture](greece-overhead.png) | [Capture](greece-oblique.png) | 14 / 20 |
| Himalayas | 86.5°E, 28.3°N / 6.5 | [Capture](himalayas-overhead.png) | [Capture](himalayas-oblique.png) | 6 / 22 |
| North Africa | 0°E, 30°N / 5.8 | [Capture](north-africa-overhead.png) | [Capture](north-africa-oblique.png) | 10 / 20 |

[Eight-view overview](overview.png) — rows follow the table; left overhead, right oblique. Source screenshots are unmodified; the overview only resizes/assembles them.

Observed: mountain relief and its lighting remain visible under biome material; the Himalayan ridge and Alpine slopes retain their form when tilted. Desert decoration foreshortens with the terrain. Greek islands and coasts remain readable with dark water. No detached texture plane, new coastline wedges/streaks, obvious tile gaps or z-fighting was seen in these eight settled views. Geographic reference features remain aligned between the two angles. Camera movement between presets exercises the native pan/zoom/pitch path, but this is not an exhaustive animated seam or cross-device stress test.

**Projection-switch limitation:** after requesting an explicit globe-to-Mercator switch, subsequent native Chrome inspection timed out, including a recovery attempt. No Mercator screenshot or pass result was obtained. Do not interpret the eight globe-mode captures as verification of runtime projection switching. The installed engine also warns that terrain is not fully supported on vertical-perspective projection; that is an existing engine limitation. This task neither changed projection handling nor upgraded MapLibre. Further isolated projection-switch investigation is warranted if that interaction is required beyond the application's normal globe/zoom behaviour.

## Regression checks

`pnpm environment:test` now composes the real base style with environmental layers and asserts that every surface remains a native raster layer between land and terrain lighting, followed by the Natural Earth ocean mask. It verifies unchanged Terrarium encoding, source definition and native maxzoom 4. Existing independent-visibility and dataset-replacement checks still run; advancing 5,024 years still causes no environmental source mutations. These checks protect the integration contract; they are not a GPU pixel test.

`pnpm typecheck`, `pnpm lint` and the supported webpack production build are used for final verification. No data preparation, asset regeneration, dependency upgrade or commit is part of this change.
