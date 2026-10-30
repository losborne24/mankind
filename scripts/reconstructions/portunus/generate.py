"""Specific Portunus exterior interpretation after Fletcher (1921), p.105.
Blender --background --factory-startup --python THIS. All mesh/material work is
project authored. No imported mesh or image texture. Printed dimensions and
diagram-derived approximations are recorded in parameters.json.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/assets/reconstructions/portunus'
REVIEW = ROOT / 'docs/previews/portunus'
OUT.mkdir(parents=True, exist_ok=True); REVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials = {}
for name, color in [('travertine',(.66,.59,.45,1)),('stucco',(.83,.78,.65,1)),('moulding',(.89,.84,.72,1)),('roof',(.48,.19,.09,1)),('timber',(.12,.075,.035,1)),('recess',(.19,.17,.135,1))]:
    m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=color; bs.inputs['Roughness'].default_value=.88
    materials[name]=m
objects=[]
def xyz(p): return (p[0],-p[2],p[1])
def finish(obj,name,mat):
    obj.name=name; obj.data.materials.append(materials[mat]); objects.append(obj); return obj
def box(name,c,s,mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(c)); o=bpy.context.object; o.dimensions=(s[0],s[2],s[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat)
def mesh(name,verts,faces,mat):
    m=bpy.data.meshes.new(name); m.from_pydata([xyz(p) for p in verts],[],faces); m.update(); o=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(o); return finish(o,name,mat)
def torus(name,x,y,z,major,minor,rotation=(0,0,0),mat='moulding'):
    bpy.ops.mesh.primitive_torus_add(major_segments=20,minor_segments=6,location=xyz((x,y,z)),major_radius=major,minor_radius=minor,rotation=rotation)
    return finish(bpy.context.object,name,mat)
PODIUM=3.0226; COLUMN=8.2296; EAVE=13.2842; ROOF=2.6162
WIDTH=10.6; DEPTH=21.336
# Podium body and continuous approach steps. Dimensions of this breakdown are inferred.
box('podium-mass',(0,PODIUM/2,-1.284),(WIDTH,PODIUM,18.768),'travertine')
for y,w,d,h in [(.12,10.9,19.05,.24),(.36,10.7,18.9,.16),(PODIUM-.18,10.85,19.0,.24),(PODIUM-.02,11.0,19.1,.12)]: box('podium-moulding',(0,y,-1.284),(w,h,d),'moulding')
for i in range(14):
    h=PODIUM*(i+1)/14; back=8.1; front=10.668-i*(2.568/14)
    box('approach-step',(0,h/2,(back+front)/2),(6.6,h,front-back),'travertine')
# Cella outer width is the printed 30 ft 4 in; depth/door proportions read from plan/elevation.
CW=(30+4/12)*.3048; FRONT=1.6; BACK=-9.8; H=COLUMN
for x in [-1,1]: box('cella-side',(x*(CW/2-.28),PODIUM+H/2,(FRONT+BACK)/2),(.56,H,FRONT-BACK),'stucco')
box('cella-back',(0,PODIUM+H/2,BACK+.28),(CW,H,.56),'stucco')
door=2.8; doorh=6.45
for side in [-1,1]: box('cella-front-pier',(side*(door/2+(CW-door)/4),PODIUM+H/2,FRONT-.28),((CW-door)/2,H,.56),'stucco')
box('cella-lintel',(0,PODIUM+doorh+(H-doorh)/2,FRONT-.28),(door,H-doorh,.56),'stucco')
box('cella-floor',(0,PODIUM+.05,(FRONT+BACK)/2),(CW-.9,.1,FRONT-BACK-.5),'travertine')
box('door-dark-recess',(0,PODIUM+doorh/2,FRONT-.58),(door,doorh,.08),'recess')
for x in [-1,1]: box('door-surround',(x*(door/2+.12),PODIUM+doorh/2,FRONT+.035),(.24,doorh+.2,.18),'moulding')
box('door-cornice',(0,PODIUM+doorh+.17,FRONT+.1),(door+.65,.25,.35),'moulding')
# Low-relief ashlar joints, an interpretive finish rather than documented individual masonry.
for j in range(1,17):
    y=PODIUM+j*H/17
    for side in [-1,1]: box('side-course',(side*(CW/2+.006),y,(FRONT+BACK)/2),(.013,.016,FRONT-BACK),'travertine')
    box('back-course',(0,y,BACK-.008),(CW,.016,.014),'travertine')
    for side in [-1,1]: box('front-course',(side*(door/2+(CW-door)/4),y,FRONT+.008),((CW-door)/2,.016,.014),'travertine') if y>PODIUM+doorh else None
def column(x,z,label):
    # Shaft radius tapers with a slight entasis; 24 flutes, 96 radial segments.
    for y,r in [(PODIUM+.08,.59),(PODIUM+.20,.53),(PODIUM+.32,.49)]: torus(label+'-base',x,y,z,r,.07)
    box(label+'-plinth',(x,PODIUM+.07,z),(1.22,.14,1.22),'travertine')
    base=PODIUM+.43; top=PODIUM+COLUMN-.49; verts=[]; faces=[]; segments=96; levels=8
    for j in range(levels+1):
        t=j/levels; radius=.47*(1-.12*t)+.022*math.sin(math.pi*t)
        for i in range(segments):
            a=2*math.pi*i/segments; r=radius-.023*(.5+.5*math.cos(a*24))
            verts.append((x+r*math.cos(a),base+(top-base)*t,z+r*math.sin(a)))
    for j in range(levels):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments; faces.append((a,a+segments,b+segments,b))
    o=mesh(label+'-fluted-shaft',verts,faces,'stucco')
    for p in o.data.polygons: p.use_smooth=True
    torus(label+'-neck',x,top-.02,z,.43,.055)
    box(label+'-capital-cushion',(x,top+.12,z),(1.15,.2,.81),'moulding')
    box(label+'-abacus',(x,PODIUM+COLUMN-.06,z),(1.27,.12,1.04),'moulding')
    # Simplified Ionic volutes: paired raised spiral bands on front and back faces.
    for front in [-1,1]:
        for side in [-1,1]:
            bpy.ops.object.select_all(action='DESELECT')
            curve=bpy.data.curves.new('volute','CURVE'); curve.dimensions='3D'; curve.bevel_depth=.026; curve.bevel_resolution=1
            spline=curve.splines.new('POLY'); spline.points.add(31)
            for i,p in enumerate(spline.points):
                a=i/31*math.pi*3.5; r=.19*(1-i/40)
                q=xyz((x+side*.46+r*math.cos(a),top+.19+r*math.sin(a),z+front*.445)); p.co=(*q,1)
            ob=bpy.data.objects.new('ionic-volute',curve); bpy.context.collection.objects.link(ob); bpy.context.view_layer.objects.active=ob; ob.select_set(True)
            bpy.ops.object.convert(target='MESH'); finish(bpy.context.object,label+'-volute','moulding'); ob.select_set(False)
xs=[-4.4,-4.4/3,4.4/3,4.4]
for x in xs: column(x,6.95,'front-column')
for x in [-4.4,4.4]: column(x,4.05,'pronaos-column')
for x in [-CW/2,CW/2]:
    for z in [1.15,-1.475,-4.1,-6.725,-9.35]: column(x,z,'engaged-side-column')
for x in xs[1:3]: column(x,BACK,'engaged-rear-column')
# Entablature bands, simplified festoon frieze and dentils inferred from the old elevation.
top=PODIUM+COLUMN
for center,height,width,depth in [(top+.16,.32,10.55,18.9),(top+.43,.2,10.7,19.05),(top+.85,.64,10.45,18.8),(top+1.25,.18,10.65,19.0),(top+1.55,.42,11.15,19.45),(EAVE-.08,.16,11.35,19.65)]:
    box('entablature-band',(0,center,-.875),(width,height,depth),'moulding' if height<.5 else 'stucco')
for side in [-1,1]:
    for j in range(41): box('side-dentil',(side*5.37,top+1.31,-10.25+j*.47),(.28,.22,.18),'moulding')
    for j in range(23): box('end-dentil',(-5.12+j*.465,top+1.31,-.875+side*9.48),(.18,.22,.3),'moulding')
# Pitched roof and triangular pediments. Plain tympana avoid inventing sculpture.
half=5.68; front=8.96; back=-10.71
mesh('roof-slopes',[(-half,EAVE,front),(0,EAVE+ROOF,front),(half,EAVE,front),(-half,EAVE,back),(0,EAVE+ROOF,back),(half,EAVE,back)],[(1,4,3,0),(2,5,4,1)],'roof')
for z in [front,back]:
    mesh('plain-pediment',[(-half,EAVE,z),(half,EAVE,z),(0,EAVE+ROOF-.15,z)],[(0,1,2),(2,1,0)],'stucco')
    for side in [-1,1]:
        for band in [0,.12]:
            pts=[(0,EAVE+ROOF+band,z), (side*half,EAVE+band,z)]
            mid=[(pts[0][i]+pts[1][i])/2 for i in range(3)]; length=math.hypot(half,ROOF)
            o=box('raking-cornice',mid,(length,.16,.35),'moulding'); o.rotation_euler[1]=side*math.atan2(ROOF,half)
# Individual raised tile courses provide readable relief without copied textures.
for side in [-1,1]:
    for i in range(16):
        x=side*(i+.5)*half/16; y=EAVE+ROOF*(1-abs(x)/half)+.035
        for j in range(24):
            o=box('roof-tile',(x,y,back+(j+.5)*(front-back)/24),(.37,.055,.79),'roof'); o.rotation_euler[1]=side*math.atan2(ROOF,half)
# Join by material: low draw count while preserving authored surface materials.
bpy.ops.object.select_all(action='DESELECT')
meshes=[]
for material in materials.values():
    group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==material]
    if not group: continue
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]; bpy.ops.object.join(); joined=bpy.context.object; joined.name='portunus-'+material.name; meshes.append(joined); joined.select_set(False)
for o in meshes: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'portunus-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_copyright='Mankind project-authored interpretation after Fletcher 1921 public-domain historic drawing; see PROVENANCE.md')
params=dict(source='Fletcher 1921 p.105, PSU WB2007-0510',printedFeet=dict(planLength=70,cellaWidth=30+4/12,columnHeight=27,podiumHeight=9+11/12,eaveHeight=43+7/12,roofRise=8+7/12),metres=dict(podiumWidth=WIDTH,overallDepth=DEPTH,podiumHeight=PODIUM,columnHeight=COLUMN,eaveHeight=EAVE,roofRise=ROOF),inferred=['Podium width and wall thickness','Spacing/depth breakdown read from diagram','Door size, stair count, fluting, capital detail, roof tiles and neutral finishes','Geographic orientation and terrain placement'],omitted=['Interior fittings','Sculpture','Original painted decoration'])
Path(__file__).with_name('parameters.json').write_text(json.dumps(params,indent=2)+'\n')
# Standalone QA render, independent of browser terrain/lighting.
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.color=(.4,.4,.4)
bpy.ops.mesh.primitive_plane_add(size=150); plane=bpy.context.object; plane.data.materials.append(materials['travertine'])
bpy.ops.object.light_add(type='AREA',location=(15,-20,28)); bpy.context.object.data.energy=2300; bpy.context.object.data.shape='DISK';bpy.context.object.data.size=15
bpy.ops.object.light_add(type='SUN',location=(0,0,25));bpy.context.object.data.energy=2.0;bpy.context.object.rotation_euler=(.4,-.5,-.3)
bpy.ops.object.camera_add(location=(28,-36,25)); camera=bpy.context.object; target=Vector((0,0,7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=37;scene.camera=camera
scene.view_settings.view_transform='AgX'; scene.render.filepath=str(REVIEW/'01-model-render.png');bpy.ops.render.render(write_still=True)
print('Portunus specific exterior exported:',OUT/'portunus-v1.glb')
