"""Temple of Hercules Victor exterior interpretation (peripteral tholos, AD 100 display).
Blender --background --factory-startup --python THIS. All mesh/material work is
project authored; no imported mesh or image texture. Figures and their sources
are recorded in parameters.json and SOURCES.md. Coordinates below are glTF
axes (x east, y up, z towards the door).
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/assets/reconstructions/hercules-victor'
REVIEW = ROOT / 'docs/previews/hercules-victor'
OUT.mkdir(parents=True, exist_ok=True); REVIEW.mkdir(parents=True, exist_ok=True)
P = json.loads(Path(__file__).with_name('parameters.json').read_text())['metres']
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials = {}
for name, color in [('marble', (.86, .83, .76, 1)), ('marble-shade', (.78, .74, .66, 1)), ('tufa', (.50, .44, .35, 1)), ('roof', (.48, .19, .09, 1)), ('recess', (.16, .14, .11, 1))]:
    m = bpy.data.materials.new(name); m.diffuse_color = color; m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value = color; bs.inputs['Roughness'].default_value = .88
    materials[name] = m
def xyz(p): return (p[0], -p[2], p[1])
def finish(obj, name, mat):
    obj.name = name; obj.data.materials.append(materials[mat]); return obj
def mesh(name, verts, faces, mat, smooth=False):
    m = bpy.data.meshes.new(name); m.from_pydata([xyz(p) for p in verts], [], faces); m.update()
    o = bpy.data.objects.new(name, m); bpy.context.collection.objects.link(o)
    if smooth:
        for f in m.polygons: f.use_smooth = True
    return finish(o, name, mat)
def box(name, c, s, mat, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(c)); o = bpy.context.object
    o.dimensions = (s[0], s[2], s[1]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler[2] = -rot
    return finish(o, name, mat)
def ring(name, y0, y1, r0, r1, mat, seg=96, smooth=True, closed_top=True):
    """Frustum shell, outer face only plus flat caps (inside is never visible)."""
    verts = [(r0 * math.cos(2 * math.pi * i / seg), y0, r0 * math.sin(2 * math.pi * i / seg)) for i in range(seg)] + [(r1 * math.cos(2 * math.pi * i / seg), y1, r1 * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    faces = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
    if closed_top: verts.append((0, y1, 0)); faces += [(seg + i, seg + (i + 1) % seg, 2 * seg) for i in range(seg)]
    return mesh(name, verts, faces, mat, smooth)

D = P['colonnadeDiameter']; R = D / 2; COL = P['columnHeight']; CD = P['columnBaseDiameter']
CR = P['columnCentreRadius']; CELLA_R = P['cellaOuterDiameter'] / 2; WALL = P['cellaWallThickness']
STEPS = P['stepCount']; RISE = P['stepRise']; TREAD = P['stepTread']; ENT = P['entablatureHeight']
STY = STEPS * RISE                      # stylobate top
TOP = STY + COL                         # column top
# Stepped tufa base, five steps all round (WHE). Rise/tread are inferred.
for i in range(STEPS):
    r = R + (STEPS - i) * TREAD
    ring('base-step', i * RISE, (i + 1) * RISE, r, r, 'tufa', closed_top=True)
ring('stylobate', STY - .02, STY, R, R, 'marble')
# Cella: full-height marble cylinder with a door opening cut as a dark recess.
CELLA_TOP = TOP + ENT * .55
ring('cella-wall', STY, CELLA_TOP, CELLA_R, CELLA_R, 'marble', closed_top=False)
dw, dh = P['doorWidth'], P['doorHeight']
box('door-recess', (0, STY + dh / 2, CELLA_R + .02), (dw, dh, .12), 'recess')
for s in (-1, 1): box('door-jamb', (s * (dw / 2 + .14), STY + dh / 2 + .1, CELLA_R + .06), (.28, dh + .2, .2), 'marble-shade')
box('door-lintel', (0, STY + dh + .25, CELLA_R + .08), (dw + .8, .4, .3), 'marble-shade')
# Wall base and crown mouldings.
ring('cella-plinth', STY, STY + .35, CELLA_R + .08, CELLA_R + .08, 'marble-shade', closed_top=False)
ring('cella-crown', CELLA_TOP - .3, CELLA_TOP, CELLA_R + .15, CELLA_R + .15, 'marble-shade', closed_top=False)

def column(angle, idx):
    cx, cz = CR * math.cos(angle), CR * math.sin(angle)
    before = set(bpy.data.objects)
    seg, levels, flutes = 48, 6, 20
    base = STY + .38; top = TOP - .62
    # Attic-style base: two rings over a thin plinth.
    ring('col-base', STY, STY + .16, CD * .62, CD * .58, 'marble-shade', seg=24)
    ring('col-torus', STY + .16, STY + .38, CD * .56, CD * .5, 'marble-shade', seg=24)
    verts, faces = [], []
    for j in range(levels + 1):
        t = j / levels; r0 = CD / 2 * (1 - .14 * t) + .012 * math.sin(math.pi * t)
        for i in range(seg):
            a = 2 * math.pi * i / seg; r = r0 - .018 * (.5 + .5 * math.cos(a * flutes))
            verts.append((r * math.cos(a), base + (top - base) * t, r * math.sin(a)))
    for j in range(levels):
        for i in range(seg):
            a = j * seg + i; b = j * seg + (i + 1) % seg; faces.append((a, b, b + seg, a + seg))
    mesh('col-shaft', verts, faces, 'marble', True)
    # Corinthian capital, simplified: bell, two leaf tiers, abacus. All inferred detail.
    ring('cap-bell', top, TOP - .12, CD * .40, CD * .56, 'marble-shade', seg=24, closed_top=False)
    for tier, (ty, tr, th, n) in enumerate([(top + .02, CD * .47, .26, 16), (top + .24, CD * .5, .24, 8)]):
        for k in range(n):
            a = 2 * math.pi * (k + .5 * tier) / n
            o = box('cap-leaf', (tr * math.cos(a), ty + th / 2, tr * math.sin(a)), (.17, th, .09), 'marble-shade', rot=-a + math.pi / 2)
    ring('cap-abacus', TOP - .12, TOP, CD * .64, CD * .64, 'marble', seg=24)
    for o in set(bpy.data.objects) - before: o.location += Vector((cx, -cz, 0))

for k in range(20):
    column(2 * math.pi * (k + .5) / 20 + math.pi / 2, k)   # door axis (+z) falls between two columns
# Entablature: plain architrave, frieze and cornice. The original is lost; proportions inferred.
ring('architrave', TOP, TOP + .72, CR + .52, CR + .52, 'marble-shade', closed_top=False)
ring('frieze', TOP + .72, TOP + 1.32, CR + .56, CR + .56, 'marble', closed_top=False)
ring('cornice-lower', TOP + 1.32, TOP + 1.62, CR + .6, CR + 1.0, 'marble-shade', closed_top=False)
ring('cornice-upper', TOP + 1.62, TOP + ENT, CR + 1.0, CR + 1.0, 'marble-shade', closed_top=False)
# Low conical tiled roof (inferred): today's roof is later, Palladio's dome is mistaken.
EAVE_R = CR + 1.0
ring('roof-cone', TOP + ENT, TOP + ENT + P['roofRise'], EAVE_R, .12, 'roof', seg=96, smooth=False)
# Stepped tile courses give readable relief without copied textures.
for c in range(10):
    t0, t1 = c / 10, (c + 1) / 10
    r0 = EAVE_R * (1 - t0) + .12 * t0 + .05; r1 = EAVE_R * (1 - t1) + .12 * t1 + .05
    ring('roof-course', TOP + ENT + P['roofRise'] * t0, TOP + ENT + P['roofRise'] * t1 + .01, r0, r1, 'roof', seg=96, smooth=False, closed_top=False)
# Join by material.
bpy.ops.object.select_all(action='DESELECT')
meshes = []
for material in materials.values():
    group = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.materials and o.data.materials[0] == material]
    if not group: continue
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]; bpy.ops.object.join(); joined = bpy.context.object
    joined.name = 'hercules-' + material.name; meshes.append(joined); joined.select_set(False)
for o in meshes: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'hercules-victor-v1.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=True, export_copyright='Mankind project-authored interpretation; see PROVENANCE.md')
# Standalone QA render.
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.render.resolution_x = 1100; scene.render.resolution_y = 900
scene.world.color = (.4, .4, .4)
bpy.ops.mesh.primitive_plane_add(size=120); bpy.context.object.data.materials.append(materials['tufa'])
bpy.ops.object.light_add(type='AREA', location=(15, -20, 28)); bpy.context.object.data.energy = 2300; bpy.context.object.data.shape = 'DISK'; bpy.context.object.data.size = 15
bpy.ops.object.light_add(type='SUN', location=(0, 0, 25)); bpy.context.object.data.energy = 2.0; bpy.context.object.rotation_euler = (.4, -.5, -.3)
bpy.ops.object.camera_add(location=(24, -30, 20)); camera = bpy.context.object; target = Vector((0, 0, 6))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 30; scene.camera = camera
scene.view_settings.view_transform = 'AgX'; scene.render.filepath = str(REVIEW / '01-model-render.png'); bpy.ops.render.render(write_still=True)
print('Hercules Victor exterior exported:', OUT / 'hercules-victor-v1.glb')
