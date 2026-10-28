# Mankind Roman authoring kit

Requires Blender with its bundled Python, NumPy, Cycles and built-in glTF exporter.
Tested with Blender 5.2.4 LTS RC. No pip/npm add-ons required.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --only provincial-house --render --save-blend
# After reviewing that house, generate other named archetypes or omit --only for all nine:
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --render --save-blend
# Export the twelve standard authoring parts, not loaded by the game:
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --modules
```

Run from the repo root. On this Mac, Blender needs unsandboxed execution to
initialize; rendering itself is headless CPU Cycles (32 samples, denoised).
GLBs/maps/metrics go to `public/assets/roman-kit/`. Studio PNGs and optional
`.blend` source scenes go to ignored `.biome-data/review/roman-kit/`.
`--only` updates just the named manifest entries and files. Other assets remain
untouched. Run generations sequentially because they update a shared manifest.

`buildings.json` separates dimensions and architectural choices from code.
`modules.json` specifies 1m wall bays, 30cm walls, corner stone, framed door/window
bays, broad workshop opening, roof bays (tiled and simple), Tuscan column, step
and trim. `generate.py` assembles those same component functions into complete
meshes. The `module-*` GLBs are independent reusable parts for future authoring;
complete building GLBs merge components to one material batch for the browser.
This is deliberately a small Roman vocabulary, not a cross-civilisation generator.

Positions in Python use game `(east, up, south)` metres, converted exactly once
to Blender `(east, north, up)` before glTF Y-up export. Front entrances point +Z.
Exports use object origin (0,0,0), floor Y=0, scale 1; the existing loader centres
X/Z from measured bounds, as it does for all assets. Avoid changing plot sizes
without reviewing road endpoints and scenery-clearance checks.

Generated atlas: eight padded 128px cells in one 512×256 base-colour PNG and one
512×256 tangent-normal PNG. Original deterministic NumPy mineral, grain, mortar
and cloth patterns; no external content. Standard Image Texture → Normal Map →
Principled graph exports the actual maps. Mipmapping is handled by Three.js.
No Draco/Meshopt decoder or runtime procedural tile generator is required.

Aqueduct sections repeat every 8m in X. End half-piers combine into full piers;
small projecting plinth/coping overlaps are intentional. Channel is dry, with
a real trough. Studio cameras use fixed front/rear direction, an orthographic
scale derived from the largest bound, fixed neutral ground and fixed lights.

## Phase 1: seeded residential library

```sh
# Preserve the nine original GLBs; generate ONLY the twelve-variant library:
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --variants --render --save-blend
# Fast deterministic re-export (no renders):
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/roman-kit/generate.py -- --variants
python3 scripts/roman-kit/check_variations.py
node scripts/check-roman-variations.mjs
```

`variations.json` owns named profiles, reusable ranges, explicit architectural choices,
per-design seeds, weights and roof cover resolution. `variations.py` resolves and
validates definitions independently of Blender. `--seed INTEGER` overrides all
per-design seeds for an intentional library revision. The global seed, design name,
per-design seed and parameter name feed SHA-256 samples; parameter additions do not
reshuffle existing samples. Material pigments use seeded vertex colours, with lower-wall
staining, and the same atlas. No runtime random materials or meshes are generated.

Output: `residential-variants.glb` (12 named meshes, one material, two embedded PNGs),
`variants.json` (resolved parameters/metrics/hash) and generated
`lib/assets/romanVariants.ts` (registry metadata, no runtime inventory request).
The same pinned Blender version and default seeds reproduce the same GLB bytes.
`--variants` exports the full library; it cannot be combined with `--only`/`--modules`.
Do not run two generators concurrently.

Profiles cover compact cottages, supported porches, modest two-storey dwellings,
lean-to workshops with linen/tiled/no shelter, and the existing validated L-plan
farmhouse with veranda or walled workyard. Farm wing junction coordinates remain
constrained to the supported plan. Aperture surrounds, eave clearance, storeys,
proportions and porch alignment are validated before export. Wall infill supports
stacked apertures without overlapping vertical bands. Roof covers use two curved
segments instead of four in this library; the original assets stay unchanged.

Gameplay uses `createRomanSettlement(seed)` and weighted selection without replacement
within each archetype cycle. The same cache URL serves all variants; the registry's
`nodeName` selects complete prebuilt geometry. Repeated library meshes are instanced,
while the existing plot roots, foundations, terrain sampling and landmarks retain
their lifecycle. All library instances share one settlement shadow override material.

For browser review, paste `scripts/capture-roman-variants.js` into DevTools:
`romanReview.fixture(true)` shows all twelve plus three repeats;
`romanReview.fixture(false)` restores the seven-plot settlement;
`romanReview.fixture('baseline')` restores original assets in those same plots.
Capture/benchmark methods wait five seconds so DevTools can be closed for the full
3456×1786 canvas. See `docs/roman-variations.md` for inventory, evidence and measurements.
