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

The environmental world-building pass adds a low stone boundary module, wooden
crate, generic leafy garden plant and grain clump. Their source is the same
builder, with the same project authorship and repository terms. Crops and
construction details are artistic placeholders, not identified historical
species, growing practices or archaeological measurements.

All nine environment GLBs remain unchanged during the project-owned Roman kit
migration. The four Roman props are now generated independently by Blender in
`../roman-kit/`; see its PROVENANCE.md. The previously used third-party Roman
props were removed after validation. Historical source/terms are preserved in
`docs/roman-assets.md` and `docs/archive/roman-town-pack-LICENSE.txt`; they do not
apply to these project-authored environment or Roman kit assets.
