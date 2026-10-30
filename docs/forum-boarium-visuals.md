# Forum Boarium · visual quality (v5.6.0)

Pass A of the "looks like a living place in AD 100" work. It invents no history: it changes how the
existing scene is lit, grounded and finished.

## What changed

| Area | Change | Where |
| --- | --- | --- |
| Lighting | One low, warm sun (WSW, ~25° up), 2048² soft-filtered shadow map, sky/ground hemisphere fill, ACES filmic tone mapping on the local scene only, baked contact shadow beside walls | `map/settlements/lighting.ts`, `SettlementScene.ts`, `ContextGround.ts` |
| Ground | A lit, textured mesh draped on MapLibre's terrain: packed earth, worn paving inside the Forum Boarium site outline, scrub elsewhere. Procedural textures, no third-party images. Feathered to transparent at 700 m; the flat 2D ground and river fills hand over to it through MapLibre global state `local-ground` | `ContextGround.ts`, `groundMask.ts`, `groundTextures.ts`, `lib/history/localContext.ts`, `scenarioOverlays.ts` |
| Tiber | River-surface shader at local LOD: flowing swell, sky reflection, sun glint, darker depth, soft shoreline and foam. Uses today's channel, so it carries the same "not the ancient course" caveat | `ContextGround.ts` |
| Atmosphere | Screen-space bloom (always, local scene), plus distance haze and a mild tilt-shift depth of field only while a guided beat is playing; both are off when paused, exploring or idle | `PostEffects.ts`, `ScenarioPanel.tsx` |

Distance for haze and depth of field is the distance to the ground plane along each pixel's ray; no depth buffer is read.
Labels are drawn by MapLibre after the post pass, so text stays sharp. Tall objects are treated as if at their base distance.

The ground and Tiber stay at the dated "today's geometry" level of evidence: the paving is the modern site outline,
the river is today's channel. The textures are generic stone, earth and scrub, not a record of any surface.

## Frame time (Chrome on this Mac, 3456 × 1786 canvas, temples at z18.3 / pitch 58, continuous repaint, 5 s)

| | frame interval median | p95 | layer CPU median |
| --- | --- | --- | --- |
| Before | 8.3 ms | 9.0 ms | 0.3 ms |
| After (lit ground, river, shadows, bloom) | 11.6 ms | 12.6 ms | 0.4 ms |
| After, plus haze and depth of field | 11.5 ms | 12.7 ms | 0.4 ms |

About 86 frames per second at full Retina resolution; the extra cost is GPU, not CPU. Loading the ground adds a one-off ~270 ms
of CPU when the scene first builds (mask rasterisation). Intervals are rAF-to-rAF and
include MapLibre's own work; GPU time was not measured separately.

# Pass B · best-guess neighbourhood (v5.7.0)

Research, licences and rules: `scripts/context/forum-boarium/RECONSTRUCTION.md`. Data: `lib/scenarios/fixtures/forum-boarium-reconstruction.json`
(177 objects: 2 documented, 3 evidence-based, 172 best guess; seed 100). Check: `node scripts/check-reconstruction.mjs`.

| Piece | Where |
| --- | --- |
| Generator (deterministic) | `scripts/context/forum-boarium/build-reconstruction.mjs` |
| 3D: attached shops, flats and warehouses (two instanced draws with a procedural facade), bridge, quays, stages, barges, altar, pens, stalls | `map/settlements/UrbanScene.ts` |
| Ground: cobbled streets, widened square, packed yards (second mask, switchable) | `groundMask.ts`, `ContextGround.ts`, `groundTextures.ts` |
| Inspection: ray pick for raised objects, map outlines for flush ones; certainty chip, note, sources and licences | `ThreeTestLayer.pickReconstruction`, `map/reconstructionOverlay.ts`, `components/ReconstructionControls.tsx` |
| Legend line (best-guess share of the mapped area in view), best-guess switch, colour-by-certainty | `ReconstructionControls` |

Three decisions worth knowing:

* The Roman kit and the Phase 3 procedural settlement generator make detached single-storey buildings with their own foundations. They cannot express attached multi-storey frontage, a bridge or barges, and would bypass the best-guess switch, so the neighbourhood reuses their approach (seeded layout, terrain-conforming bases, instancing, plaster and tile palette) in a new renderer instead of their code.
* The Severan Marble Plan fragments (Stanford: research and personal use only) and *Mapping Augustan Rome* (copyrighted book) were not used for geometry. Lanciani is public domain but no covering sheet was available as a usable open scan. All positions come from the already-licensed OpenStreetMap/Pleiades/Wikidata snapshots plus the generator's rules.
* Heights are re-checked as the terrain refines (a 15 cm change rebuilds the meshes); buildings built from the first, coarse DEM samples floated 40 m above ground.

## Frame time with the neighbourhood (same Mac, Chrome, 3456 × 1786 canvas, 5 s continuous repaint)

| View | frame interval median | p95 | layer CPU median |
| --- | --- | --- | --- |
| Temples, z18.3 pitch 58 | 12.0 ms | 28.7 ms | 0.5 ms |
| Market, z17.2 pitch 58 | 12.5 ms | 30.7 ms | 0.5 ms |
| Market with haze and depth of field | 12.5 ms | 30.0 ms | 0.4 ms |

About 80 frames per second typical; one frame in twenty takes about two display intervals. One-off cost on scene build: ~400 ms of CPU for the two ground masks and
textures, ~160 ms for the first terrain placement. Draw calls in the local scene: 24.
