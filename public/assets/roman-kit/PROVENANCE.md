# Mankind project-owned Roman kit

All geometry and the mineral/clay/timber/linen atlas textures in this directory
are authored for this project by `scripts/roman-kit/generate.py` using Blender's
Python API. Building specifications are in `scripts/roman-kit/buildings.json`;
standard reusable module recipes are in `scripts/roman-kit/modules.json`.
No source mesh, texture, pixel, trace or material from the Roman Town Pack or
another external asset library is used by the generator. No AI generation API,
paid add-on, subscription or downloaded texture is required. Repository terms
apply; this kit introduces no third-party asset licence or attribution obligation.

Metres, glTF Y-up, floor Y=0, +Z entrance. The generator internally converts
its game coordinates to Blender Z-up, then uses the standard glTF Y-up export.
`manifest.json` records exact bounds, bytes, SHA-256 and triangles per generated
asset. One atlas material per GLB; base colour and tangent normal are standard
glTF PBR texture channels. Repeated geometry is merged at build time, not drawn
as hundreds of roof objects. The twelve `module-*` files are reusable authoring
parts and are not registered or downloaded by the gameplay scene.

These are fictional Roman provincial designs, not archaeological reconstructions.
General visual references: Pompeii Archaeological Park's official excavation guide
(for modest masonry houses, street shops and their relationship to dwelling rooms)
and the Vitruvian/Tuscan vocabulary of simple podium, columns and pediment.
No copyrighted reference imagery is incorporated in the textures or geometry.
See `docs/roman-kit.md` for migration history, validation and remaining limits.

Phase 1 residential library: `residential-variants.glb` contains twelve named,
prebuilt house/shop/farm meshes sharing one atlas pair and one material.
`variants.json` records resolved seeds, parameters, bounds, triangles and the
library hash; `scripts/roman-kit/variations.json` owns profiles/ranges/weights.
Seeded vertex pigments and foundation stains are authored offline. Original nine
GLBs are retained; `original-baseline.json` verifies their unchanged hashes.
