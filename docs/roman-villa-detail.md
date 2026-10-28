# One-house architectural experiment — 28 October 2026

> Historical milestone record. The original Roman Town Pack and its public licence
> have since been removed. Current assets, paths and validation are documented in
> [roman-kit.md](roman-kit.md); the original licence text is preserved only in
> [the historical archive](archive/roman-town-pack-LICENSE.txt).


Use **Debug tools → Roman settlement layout → Comparison house** to switch
Original villa / Enhanced villa. Only `villa-west-2` (offset [-9, -7], heading
π/2, door facing east) changes. Enhanced is the initial choice. Selection survives
unload/reload. No layout, scenery, registry, terrain or lighting changes were made.

## Source inspection and decision

`villa.glb` remains byte-for-byte unchanged: 9,928 bytes, 80 triangles, five
material primitives, no textures, normalized dimensions 6 × 4.4 × 6.6 m.
It is authored Y-up, +Z entrance, scale 1. `prepareAsset` centres X/Z and seats
minimum Y at zero; SettlementScene applies the layout heading and sampled floor.
The GLB cache still owns the source and shares it with all other villa placements
and the Giza test fixture.

The plaster primitive is a closed 6 × 3 × 5 m box. The roof wedge spans only
5.6 m in X, narrower than the walls, with no eave thickness. Door and yellow
emissive windows are thin boxes at Z≈2.52; two square pillars sit in front.
Existing settlement material overrides add subtle surface patterns, but do not
repair the geometry. Overlays could provide trims, doorboards, roof textures and
plinths. Real recesses require replacing wall faces or cutting holes; endlessly
covering the solid box would add bulk and overlapping surfaces.

The experiment therefore substitutes a compact procedural house module *inside*
the same building root, while retaining the whole GLB baseline as a hidden sibling.
It does not edit the GLB or attempt boolean surgery. The roof footprint stays
approximately equal; the narrower wall body leaves working eaves within that
footprint. This is a modest provincial house, not a reconstruction of a named site.

## Implemented architecture

- Overlapping clay tile beds, curved imbrices, segmented rounded ridge caps,
  10 cm roof bed thickness, overhanging eaves and exposed rafter ends.
- Muted fired-clay colours with deterministic piece variation and fine mineral
  bump; no ornamental roof furniture.
- Lime-plaster wall segments with real front/rear apertures, thick reveals,
  dressed stone jambs/lintels/sills, partly closed timber shutters and dark backing.
- Six-board recessed timber entrance, two iron straps, latch and shallow threshold.
- Low stone plinth courses and restrained alternating corner masonry.
- Six merged geometry/material batches, two small generated maps shared across
  the module's materials. No new dependencies, textures to download or shader system.

## Ownership and terrain

`createEnhancedVilla()` returns a reusable Y=0, +Z entrance group and idempotent
`dispose()`. Temporary components merge once by material. The scene owns the six
resulting geometries/materials and two texture maps. No cache-owned GLB geometry,
material or texture is mutated/disposed by the module. Toggling changes child
visibility only, marks shadows dirty and repaints. Both siblings share the exact
same original measured foundation, position, heading, terrain visibility and
access-path landing; toggling never acquires another lease or resamples terrain.
Relocation/exaggeration use the existing placement parent. Unload disposes owned
resources once, releases the GLB lease and clears the comparison references.
Generation checks reject late GLB loads before the module is created.

## Measured asset cost (not an FPS benchmark)

| Metric | Original | Enhanced |
| --- | ---: | ---: |
| GLB network bytes | 9,928 | Same cached baseline; no added GLB |
| Visible triangles for house | 80 | 10,608 |
| Visible material batches | 5 | 6 |
| House dimensions X/Y/Z (m) | 6 / 4.4 / 6.6 | 6.054 / 4.375 / 6.373 |
| Texture maps | 0 | Two 128×128 RGBA8 generated maps |
| Added texture storage, with mipmaps | — | ~171 KiB |
| Added merged vertex attributes | — | 1,400,256 bytes (~1.34 MiB) |

The hidden baseline remains resident for instant comparison. Six enhanced batches
replace five visible baseline batches: approximately **one additional colour draw**
and one additional draw during each shadow-map refresh. Shadow maps remain static
until invalidated. Triangle work rises by 10,528 for this house in both colour and
shadow passes; mipmaps filter fine detail at elevated distance. Geometry has CPU
and GPU copies. No cross-device frame-rate claim is made. For widespread reuse,
share a module's immutable merged resources through leases and simplify distant
roof tiles; this one-house experiment does not introduce that infrastructure.

## External alternative, verified 28 October 2026

Candidate: [Low Poly Ancient Roman Villa by AlexFerrart3D](https://sketchfab.com/3d-models/low-poly-ancient-roman-villa-475fbafbed4843fa8bd003c65ef2cccc).
The [public model API](https://api.sketchfab.com/v3/models/475fbafbed4843fa8bd003c65ef2cccc)
returns `license.slug: by`, licence URL **CC BY 4.0**, `isDownloadable: true`,
30,304 faces, 15,935 vertices, five materials, ten textures and no animations.
Attribution and commercial-use requirements are explicit. Metadata snapshot is
saved beside the local screenshots. The page fetch returned 403, but the public
metadata and official preview image were accessible. The download endpoint
returned **HTTP 401** without authentication. No model archive was obtained or used.

The official preview shows a much larger elongated courtyard/atrium house with
stone surfaces, columns and visibly textured tiled roof planes. Its open courts
and textured masonry provide more architectural depth than the baseline. It is
less suitable as a direct replacement for a modest 6 m house: shrinking a larger
domus to that footprint would compromise proportions. It would need its own
measured footprint, entrance alignment and plot review.

Its listed face count is about 2.9× the enhanced module's triangle count (the
API's face metric is not a verified downloaded triangle count). Five materials
suggest a similar order of draw calls, but the actual mesh/node splits are unknown.
**Texture dimensions, compressed/uncompressed bytes, GLB size, PBR map contents and
actual GPU cost remain unverified** because archive access requires authentication.
Ten textures may dominate memory more than geometry. Its source description credits
3dtextures.me. If evaluated later, preserve author/model/CC BY 4.0 attribution,
inspect included texture terms, measure bounds and maps, then register the licensed
GLB with existing orientation/scale/provenance fields and cache. No replacement
was made and no unrelated asset was substituted.

## Visual evidence and assessment

Actual shared MapLibre/Three canvas captures; no image edits or generated artwork:

- `.biome-data/review/phase3-villa/original.png`
- `.biome-data/review/phase3-villa/enhanced.png`
- `.biome-data/review/phase3-villa/settlement.png`

Matched close-ups: centre [12.5498915, 41.85006295], zoom 21, pitch 55°, bearing
−60°, viewport 3456 × 1786. Both use original origin [12.55, 41.85], terrain 1×,
and unchanged hemisphere/sun/shadow settings. Elevated view: centre [12.55,41.85],
zoom 18.9, pitch 55°, bearing −25°, same viewport/lighting. The modified house is
on the west side of the street, between the two other west-side houses.
`scripts/capture-villa.js` reproduces the views through the dev-only map handle.

Close-up: the roof now has readable volume, ridge/eave edges and tile channels;
the dark windows, door recess and stone trim create actual depth. At normal
settlement distance, the roof rhythm and restrained masonry contrast still
separate it from the flat orange baseline houses. Small ironwork/grain is naturally
lost at that scale. This meaningfully approaches the requested strategy-game
architecture, but does not yet match a mature Civilization art asset.

Remaining limitations: regular box/gable composition, blank side elevations,
very restrained rather than authored plaster weathering, no baked ambient
occlusion or full interior, coarse existing shadow/contact and terrain slab,
and overly continuous-looking cover-tile lines at some distances. The original
GLB cannot deliver deep architectural improvements through materials alone.
Use this result as a modular proportion/roof/opening reference; **do not blindly
wrap all buildings in more overlays**. A small authored modular Roman kit with
atlas textures, richer wall/roof shapes and distance LODs is the recommended next
art step. Reuse the successful components selectively after art review, rather
than applying this complete house to all five villas or detailing temple/aqueduct
with residential parts.

## Validation

Passed: `pnpm typecheck`, `pnpm lint`, `pnpm exec next build --webpack`,
`node scripts/check-settlement.mjs` (also runs real Roman assets/cache checks),
`node scripts/check-geography.mjs`, `node scripts/check-hillshade.mjs`,
`node scripts/check-biomes.mjs`, `git diff --check`.

New regression assertions cover one enhanced house only, six batches, local bounds,
shared placement/heading, toggles without requests, exact-once disposal of all six
geometries/materials and two shared maps, and comparison preference after reload.
Existing checks exercise seven anchors, pending cancellation, relocation, terrain
retention/exaggerated samples, slope rejection and asset-failure retry.

Live Chrome: original/enhanced selector, close/elevated cameras, relocation to
[12.5515,41.851] and back, exaggeration 1×→2.5×→1×, unload to 0/7 and repeat load
to 7/7 ready with 508/508 scenery. No visible detachment of architectural pieces.
One pre-existing low-zoom DEM request returned 404 during globe navigation; the
settlement terrain loaded and reached ready. Browser review is desktop-only.

## Files in this pass

Created `map/settlements/enhancedVilla.ts`, `scripts/capture-villa.js` and this
report. Changed `SettlementScene.ts`, `threeTestLayer.ts`, `DebugPanel.tsx`,
`GlobeView.tsx` and `scripts/check-settlement.mjs`. Review PNGs and the metadata
snapshot are local ignored artifacts under `.biome-data/review/phase3-villa/`.
The pre-existing staged environmental work was preserved.
