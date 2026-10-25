# Clean biome surface baseline

Physical terrain stays enabled, using the unchanged Terrarium z0–4 source and **1.5×** exaggeration. Camera controls, geographic masks, coastlines and LOD are unchanged. Environmental textures still use MapLibre's native terrain drape.

The old `relief` and `hillshade` layers now start hidden. **DEM Shading** only toggles this optional heavy pair; it never removes a source or calls `setTerrain`. **3D Elevation** independently toggles physical terrain and its faint surface lighting, restoring the same source/exaggeration when re-enabled.

The installed MapLibre terrain shader displaces geometry but has no independent surface-normal lighting control. A separate, very low-contrast `terrain-light` hillshade pass supplies neutral slope illumination in the texture draped onto that same native mesh. It shares the existing shading DEM source, adds no geometry or data, and introduces no elevation-dependent colour ramp. It stays available while the heavy overlays are disabled; disabling elevation hides it too. This is DEM-derived surface illumination, not a new dynamic shadow/lighting engine.

Same-camera browser comparison: [new baseline, shading off](shading-off.png) · [optional heavy shading on](shading-on.png). The browser was left with **DEM Shading OFF / 3D Elevation ON**.

Regression checks exercise the actual debug button callbacks, default visibility, unchanged raster drape order and DEM source, and restoring elevation at 1.5×. Run `pnpm environment:test`, `pnpm typecheck`, `pnpm lint` and `pnpm build --webpack`. No data preparation or dependency changes are needed. Nothing committed.
