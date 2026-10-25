# Terrain lighting comparison

The existing `terrain-light` hillshade pass now uses geographic northwest light
(315°, map anchored), Igor slope strength 0.38, neutral black shadows at 0.32
alpha, and restrained white highlights at 0.045 alpha. Flat areas remain
transparent. This adds no layer, source, mesh, asset or post-processing pass.
Igor does not use illumination altitude or accent colour in the installed
MapLibre shader; those ineffective controls were removed from this pass.

Terrarium z0–4, physical exaggeration 1.5×, historical biome textures and colours,
the ocean masks, and the disabled legacy DEM Shading overlays are unchanged.

Use **Layers (debug) → Terrain Lighting** to compare ON/OFF at the same camera.
Leave **DEM Shading OFF** and **3D Elevation ON**. Lighting and elevation are
independent, including when switching elevation off and back on.

## Visual checks

Native Chrome, local development server, year 3000 BCE. Temporary camera buttons
used `jumpTo`; each comparison changed only lighting visibility after the camera
settled. The temporary buttons were removed. Screenshots were inspected during
the session; no screenshot files are bundled with this change.

| Region | Centre | Zoom / pitch / bearing | Comparison |
| --- | --- | --- | --- |
| Alps | 10°E, 46°N | 6.5 / 60° / 0° | ON/OFF |
| Himalayas | 86.5°E, 28.3°N | 6.5 / 60° / 0° | ON/OFF |
| Andes | 70°W, 32°S | 6.5 / 60° / 0° | ON/OFF |
| Andes overhead | same | 6.5 / 0° / 0° | ON/OFF |
| Andes close, rotated | same | 8 / 70° / 90° | ON/OFF |
| Andes globe scale | same | 2.5 / 0° / 0° | ON/OFF |

Observed: modest slope separation, clearest along the Andean range; no cloudy
white elevation wash or blanket darkening of the biome material. The effect is
restrained at globe scale and stays subtle at steep pitch. Close views still
show the broad, soft forms of the native z4 data; lighting does not add missing
terrain detail. These are settled-view checks on one browser, not a performance
benchmark or an exhaustive animated/cross-device test. MapLibre still reports its
existing globe terrain/fog support warnings.

`pnpm typecheck`, `pnpm lint`, `pnpm environment:test`, and
`pnpm build --webpack` validate the final change. The existing control regression
now checks that lighting changes neither terrain nor legacy DEM shading, and
that its state survives elevation toggles.
