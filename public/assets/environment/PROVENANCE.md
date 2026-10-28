# Settlement environment prototype assets

These nine GLBs are project-authored deterministic geometry, built by
`scripts/build-settlement-environment.mjs` using the installed Three.js exporter.
No downloaded meshes/textures, image-generation services or runtime AI are used.
Repository terms apply; these files do not introduce a separate third-party licence.

Olive tree, Italian cypress, Mediterranean shrub, limestone rock and dry grass
tuft are visual prototypes, not botanical reconstructions or photogrammetry.
They use organic silhouettes, individual double-sided leaves/blades, bark
geometry and muted vertex-colour rough materials. Each is in metres, Y up.
Run the script to reproduce them. `manifest.json` records exact bounds and bytes.
The registry IDs can later point to externally authored replacement GLBs.

The Roman amphora and bench are separate third-party assets; see
`../roman/LICENSE.txt` and the project's Roman asset provenance notes.

The environmental world-building pass adds a low stone boundary module, wooden
crate, generic leafy garden plant and grain clump. Their source is the same
builder, with the same project authorship and repository terms. Crops and
construction details are artistic placeholders, not identified historical
species, growing practices or archaeological measurements.

The barrel and market awning are extracted unchanged from the already-present
`LowPolyRomanTown_v1.0.zip`, `GLB/wine_barrel.glb` (11,160 bytes) and
`GLB/market_awning.glb` (14,284 bytes), into `../roman/props/`. They share the
existing Roman licence and restrictions; they are not project-authored or CC0.
The scene uses owned material copies to tint the awning cloth; source files and
cached materials remain unchanged. No new asset pack was downloaded.
