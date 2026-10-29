"""Project-owned Roman kit. Blender --background --factory-startup --python THIS -- --only provincial-house --render.
Geometry authored in game XYZ (Y up, +Z entrance), converted to Blender Z-up once.
No imported mesh, external texture, add-on, paid service or source pack is read.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from variations import CONFIG, resolve, apertures

import bpy
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/roman-kit"
REVIEW = ROOT / ".biome-data/review/roman-kit"
SPEC = json.loads(Path(__file__).with_name("buildings.json").read_text())
PALETTE = SPEC["palette"]
PI = math.pi

def png(path, data):
    h, w, _ = data.shape
    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xffffffff)
    raw = b''.join(b'\0' + row.tobytes() for row in data)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w,h,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(raw,9)) + chunk(b'IEND',b''))

def atlas():
    """Eight 128px material cells with padded edges; original mineral, clay, wood and cloth maps."""
    n = 128
    yy, xx = np.mgrid[0:n,0:n] / n
    rng = np.random.default_rng(271828)
    base = np.zeros((256,512,3), dtype=np.uint8)
    normal = np.zeros_like(base)
    colors = [(201,187,155),(151,143,123),(162,89,57),(104,78,49),(31,29,25),(64,65,59),(192,177,140),(167,112,72)]
    for k, rgb in enumerate(colors):
        noise = rng.random((n,n)) - .5
        cloud = (np.sin(xx*19+np.sin(yy*9)) + np.sin(yy*17+xx*4))*.018
        relief = noise*.035
        variation = noise*.045 + cloud
        if k in (0,7):  # uneven limewash, mineral staining, slight surface pits
            variation += -.10*np.exp(-yy*12)*(0.5+.5*np.sin(xx*24)**2)
            relief += cloud*.3
        elif k == 1:
            course = np.floor(yy*5)
            dx = np.mod(xx*3.1 + np.mod(course,2)*.5,1)
            dy = np.mod(yy*5,1)
            mortar = (dx<.035)|(dy<.06)
            variation += rng.random((n,n))*.04 + np.sin(course*37+np.floor(xx*3.1+np.mod(course,2)*.5)*18)*.035
            variation[mortar] -= .15
            relief += np.where(mortar,-.13,.02)
        elif k == 2:
            variation += np.sin(xx*31+yy*4)*.02 + np.sin(yy*72)*.012
            relief += np.sin(xx*80)*.012
        elif k == 3:
            grain = np.sin(xx*180+np.sin(yy*12)*1.8+np.sin(xx*22)*3)
            variation += grain*.07 + np.cos(xx*36)*.035
            relief += grain*.06
        elif k == 6:
            weave = (np.sin(xx*PI*110)*np.sin(yy*PI*110))
            relief += weave*.025
            variation += weave*.015
        pixels = np.clip(np.array(rgb)[None,None,:]*(1+variation[:,:,None]),0,255)
        gy,gx = np.gradient(relief)
        v = np.stack((-gx*4,gy*4,np.ones_like(gx)),axis=-1)
        v /= np.linalg.norm(v,axis=-1,keepdims=True)
        tile_normal = np.uint8(np.clip((v*.5+.5)*255,0,255))
        # Duplicate 3px borders to protect bilinear filtering and the first mip levels.
        for arr in (pixels,tile_normal):
            arr[:3] = arr[3]; arr[-3:] = arr[-4]
            arr[:,:3] = arr[:,3:4]; arr[:,-3:] = arr[:,-4:-3]
        x,y=(k%4)*n,(k//4)*n
        base[y:y+n,x:x+n] = pixels
        normal[y:y+n,x:x+n] = tile_normal
    png(OUT/'roman-basecolor.png',base)
    png(OUT/'roman-normal.png',normal)
    mat=bpy.data.materials.new('Mankind Roman mineral atlas')
    if mat.node_tree is None: mat.use_nodes=True
    nodes=mat.node_tree.nodes; links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=.88
    bsdf.inputs['Specular IOR Level'].default_value=.25
    tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(OUT/'roman-basecolor.png'))
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    texn=nodes.new('ShaderNodeTexImage'); texn.image=bpy.data.images.load(str(OUT/'roman-normal.png'))
    texn.image.colorspace_settings.name='Non-Color'
    norm=nodes.new('ShaderNodeNormalMap'); norm.inputs['Strength'].default_value=.55
    links.new(texn.outputs['Color'],norm.inputs['Color']); links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
    return mat

class Mesh:
    roof_segments=4
    def __init__(self):
        self.vertices=[]; self.faces=[]; self.uv=[]; self.smooth=[]
    def poly(self, points, material, outward=None, smooth=False, uv=None):
        pts=[Vector(p) for p in points]
        if outward is not None and (pts[1]-pts[0]).cross(pts[2]-pts[0]).dot(Vector(outward))<0:
            pts.reverse()
            if uv: uv=list(reversed(uv))
        start=len(self.vertices)
        self.vertices.extend(tuple(p) for p in pts)
        self.faces.append(tuple(range(start,start+len(pts))))
        self.smooth.append(smooth)
        # Every component has local atlas coordinates, never crosses another material cell.
        k=PALETTE.index(material)
        if uv is None:
            normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]); axis=max(range(3), key=lambda a:abs(normal[a]))
            axes=[a for a in range(3) if a!=axis]
            lo=[min(p[a] for p in pts) for a in axes]; hi=[max(p[a] for p in pts) for a in axes]
            uv=[tuple((p[a]-lo[j])/max(hi[j]-lo[j],1e-5) for j,a in enumerate(axes)) for p in pts]
        self.uv.append([((k%4+(0.035+u*.93))/4, 1-(k//4+(.965-v*.93))/2) for u,v in uv])
    def box(self, center, size, mat, bevel=0, transform=None):
        c=Vector(center); h=[v/2 for v in size]; b=min(bevel,min(h)*.45)
        def face(pts):
            pts=[c+Vector(p) for p in pts]
            mid=sum(pts,Vector())/len(pts)
            outward=mid-c
            if transform:
                pts=[Vector(transform(p)) for p in pts]
                outward=Vector(transform(mid))-Vector(transform(c))
            self.poly(pts,mat,outward)
        for a in range(3):
            others=[i for i in range(3) if i!=a]
            for sign in [-1,1]:
                pts=[]
                for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    p=[0,0,0];p[a]=sign*h[a];p[others[0]]=s*(h[others[0]]-b);p[others[1]]=t*(h[others[1]]-b);pts.append(p)
                face(pts)
        if b:
            for a,bb in [(0,1),(0,2),(1,2)]:
                cc=3-a-bb
                for sa in [-1,1]:
                    for sb in [-1,1]:
                        pts=[]
                        for sc,t in [(-1,0),(-1,1),(1,1),(1,0)]:
                            p=[0,0,0];p[a]=sa*(h[a]-(b if t else 0));p[bb]=sb*(h[bb]-(0 if t else b));p[cc]=sc*(h[cc]-b);pts.append(p)
                        face(pts)
            for sx in [-1,1]:
                for sy in [-1,1]:
                    for sz in [-1,1]:
                        signs=[sx,sy,sz];face([[signs[j]*(h[j]-(0 if j==i else b)) for j in range(3)] for i in range(3)])
    def lathe(self, profile, mat, center=(0,0,0), segments=16, close=True):
        c=Vector(center)
        for j in range(len(profile)-1):
            r0,y0=profile[j];r1,y1=profile[j+1]
            for i in range(segments):
                a,b=i*2*PI/segments,(i+1)*2*PI/segments
                pts=[(r0*math.cos(a),y0,r0*math.sin(a)),(r0*math.cos(b),y0,r0*math.sin(b)),(r1*math.cos(b),y1,r1*math.sin(b)),(r1*math.cos(a),y1,r1*math.sin(a))]
                self.poly([c+Vector(p) for p in pts],mat,(math.cos((a+b)/2),0,math.sin((a+b)/2)),True)
        if close:
            for r,y,sign in [(profile[0][0],profile[0][1],-1),(profile[-1][0],profile[-1][1],1)]:
                self.poly([c+Vector((r*math.cos(i*2*PI/segments),y,r*math.sin(i*2*PI/segments))) for i in range(segments)],mat,(0,sign,0))
    def finish(self,name,mat,spec=None):
        data=bpy.data.meshes.new(name)
        data.from_pydata([(x,-z,y) for x,y,z in self.vertices],[],self.faces);data.update()
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        data.materials.append(mat)
        layer=data.uv_layers.new(name='RomanAtlas')
        for polygon,uv,smooth in zip(data.polygons,self.uv,self.smooth):
            polygon.use_smooth=smooth
            for loop,coord in zip(polygon.loop_indices,uv): layer.data[loop].uv=coord
        if spec:
            colors=data.color_attributes.new(name='RomanWear',type='FLOAT_COLOR',domain='CORNER')
            # Offline vertex pigment/weathering; one atlas/material for the whole library.
            for face_index, polygon in enumerate(data.polygons):
                u,v=self.uv[face_index][0];cell=int(u*4)+int((1-v)*2)*4
                key=f"{spec['seed']}:{cell}".encode()
                sample=int.from_bytes(hashlib.sha256(key).digest()[:4],'big')/0xffffffff
                ranges=CONFIG['pigments'].get(PALETTE[cell],[[1,0]]*3)
                tint=tuple(low+spread*sample for low,spread in ranges)
                for loop in polygon.loop_indices:
                    y=data.vertices[data.loops[loop].vertex_index].co.z
                    wear=CONFIG['foundationStain']
                    stain=1-wear['strength']*max(0,1-y/wear['height']) if cell in (0,1,7) else 1
                    colors.data[loop].color=(*[c*stain for c in tint],1)
        return obj

def masonry(m,center,size,course=.24,block=.48):
    x,y,z=center;w,h,d=size
    # Recessed mortar core closes joints through the wall's depth. The individual
    # stones retain their bevels and relief; no light leaks through structural piers.
    m.box(center,(max(.01,w-.02),max(.01,h-.02),max(.01,d-.04)),'stone')
    rows=max(1,round(h/course))
    for row in range(rows):
        n=max(1,round(w/block));step=w/n
        for col in range(n):
            m.box((x-w/2+(col+.5)*step,y-h/2+(row+.5)*h/rows,z),(step-.012,h/rows-.013,d), 'stone',.015)

def opening(m,x,z,w,bottom,top,front=True,door=False,workshop=False):
    sign=1 if front else -1;face=z+sign*.175
    jamb=.13
    for side in [-1,1]:
        m.box((x+side*(w/2+jamb/2),(bottom+top)/2,face),(jamb,top-bottom+.12,.23),'stone',.012)
    m.box((x,top+.095,face),(w+.36,.19,.3),'stone',.02)
    m.box((x,bottom+.025,face+sign*.03),(w+.30,.10,.36),'stone',.014)
    m.box((x,(bottom+top)/2,z-sign*.12),(w,top-bottom,.045),'recess')
    if door:
        if workshop:
            # Open folding street shutters, a dark workshop bay, side counter inside the opening.
            for side in [-1,1]:
                for i in range(3):
                    m.box((x+side*(w/2-.12), (bottom+top)/2, z+sign*(.12+i*.14)),(.12,top-bottom-.08,.13),'timber',.008)
            m.box((x+w*.22,bottom+.85,z-sign*.08),(w*.42,.12,.38),'timber',.016)
            for y in [bottom+.28,bottom+.57]: m.box((x+w*.22,y,z-sign*.01),(w*.42,.13,.14),'timber')
        else:
            for i in range(7):
                m.box((x-w/2+(i+.5)*w/7,(bottom+top)/2,z-sign*.045),(w/7-.01,top-bottom-.04,.10),'timber',.008)
            for y in [bottom+.4,top-.35]: m.box((x,y,z+sign*.02),(w-.08,.05,.035),'iron')
            m.box((x+w*.29,bottom+.98,z+sign*.05),(.045,.12,.045),'iron',.005)
    else:
        for side in [-1,1]:
            m.box((x+side*w*.39,(bottom+top)/2,z+sign*.035),(w*.20,top-bottom-.08,.08),'timber',.01)
            for y in [bottom+.13,top-.13]: m.box((x+side*w*.39,y,face),(w*.24,.055,.06),'timber')
        m.box((x,(bottom+top)/2,z-sign*.08),(.035,top-bottom,.045),'timber')

def facade(m,width,height,z,openings,front=True,wallmat='plaster',base=.12):
    """1m wall bays + bands around apertures; no fake holes over a solid wall."""
    left=-width/2
    def fill(x0,x1,y0,y1):
        if x1-x0<.001 or y1-y0<.001:return
        count=max(1,math.ceil((x1-x0)/1.1))
        for i in range(count):
            w=(x1-x0)/count
            m.box((x0+(i+.5)*w,(y0+y1)/2,z),(w,y1-y0,.3),wallmat)
    # Partition the facade in X first, then fill the complement of all vertical gaps.
    # This also supports stacked apertures without overlapping wall bands.
    cuts=sorted(set([-width/2,width/2]+[x+sign*w/2 for x,w,_,_,_ in openings for sign in [-1,1]]))
    for x0,x1 in zip(cuts,cuts[1:]):
        middle=(x0+x1)/2
        gaps=sorted((bottom,top) for x,w,bottom,top,_ in openings if abs(middle-x)<w/2+1e-8)
        bottom=base
        for low,high in gaps:
            fill(x0,x1,bottom,low);bottom=max(bottom,high)
        fill(x0,x1,bottom,height)
    for x,w,bottom,top,kind in openings:
        opening(m,x,z,w,bottom,top,front,kind in ('door','workshop'),kind=='workshop')

def gable(m,width,z,eave,rise,mat='plaster'):
    for face,normal in [(z-.15,(0,0,-1)),(z+.15,(0,0,1))]:
        m.poly([(-width/2,eave,face),(width/2,eave,face),(width/2,eave+.12,face),(0,eave+rise+.12,face),(-width/2,eave+.12,face)],mat,normal)

def roof_plane(m,origin,u,v,nx,nz,detailed=True):
    """Shared tiled roof slope. u: down-slope vector, v: across slope."""
    origin=Vector(origin);u=Vector(u);v=Vector(v)
    normal=v.cross(u).normalized()
    if normal.y<0:normal=-normal
    corners=[origin,origin+u,origin+u+v,origin+v]
    m.poly(corners,'terracotta',normal)
    # Solid roof perimeter thickness, no zero-width eaves.
    for i in range(4):
        a,b=corners[i],corners[(i+1)%4]
        m.poly([a,b,b-Vector((0,.11,0)),a-Vector((0,.11,0))],'terracotta')
    if not detailed:return
    along=u.normalized(); across=v.normalized()
    for row in range(nx):
        for col in range(nz):
            a=origin+u*(row/nx)+v*(col/nz)+normal*.018
            b=a+u*(1/nx)+normal*.01
            # Slight row overlap and end shadows, actual clay bed, no individual draw nodes.
            m.poly([a,b,b+v*(.96/nz),a+v*(.96/nz)],'terracotta',normal)
            p=a+v*(.98/nz)+normal*.012
            length=u.length/nx*1.035
            for seg in range(m.roof_segments):
                t0,t1=seg*PI/m.roof_segments,(seg+1)*PI/m.roof_segments
                aa=normal*math.sin(t0)*.045+across*math.cos(t0)*.045
                bb=normal*math.sin(t1)*.045+across*math.cos(t1)*.045
                m.poly([p+aa,p+along*length+aa,p+along*length+bb,p+bb],'terracotta',normal*math.sin((t0+t1)/2)+across*math.cos((t0+t1)/2),True)

def ridge(m,x,y,z,length,axis='z'):
    count=max(1,math.ceil(length/.43))
    for i in range(count):
        a=-length/2+i*length/count;b=a+length/count+.018
        for s in range(6):
            t0,t1=s*PI/6,(s+1)*PI/6
            def p(t,d):return (x+math.cos(t)*.095,y+math.sin(t)*.095,z+d) if axis=='z' else (x+d,y+math.sin(t)*.095,z+math.cos(t)*.095)
            m.poly([p(t0,a),p(t0,b),p(t1,b),p(t1,a)],'terracotta',(math.cos((t0+t1)/2),math.sin((t0+t1)/2),0) if axis=='z' else (0,math.sin((t0+t1)/2),math.cos((t0+t1)/2)),True)

def pitched_roof(m,w,d,eave,rise,overhang=.35,cx=0,cz=0,detailed=True):
    half=w/2+overhang;depth=d+overhang*2
    rows=max(1,round(math.hypot(half,rise)/.44));cols=max(1,round(depth/.30))
    for side in [-1,1]:
        roof_plane(m,(cx,eave+rise,cz-depth/2),(side*half,-rise,0),(0,0,depth),rows,cols,detailed)
        m.box((cx+side*(w/2-.05),eave-.10,cz),(.16,.16,d+.30),'timber')
        for z in np.arange(-d/2,d/2+.1,.52): m.box((cx+side*(w/2+.12),eave-.1,cz+z),(.44,.12,.11),'timber',.008)
    ridge(m,cx,eave+rise+.025,cz,depth)

def side_wall(m,width,depth,height,material='plaster',storeys=1):
    # Side elevations include a recessed window each; generate a facade then rotate 90°.
    for side in [-1,1]:
        sub=Mesh();facade(sub,depth,height,0,[(0,.65,1.4+2.25*i,2.15+2.25*i,'window') for i in range(storeys)],True,material)
        for pts,uv,smooth in zip(sub.faces,sub.uv,sub.smooth):
            points=[]
            for index in pts:
                x,y,z=sub.vertices[index];points.append((side*(width/2+z),y,-side*x))
            # Preserve generated UV directly after copying through a dummy material.
            m.poly(points,'plaster',smooth=smooth);m.uv[-1]=uv

def house(m,s):
    w,d,h=s['width'],s['depth'],s['wallHeight']
    facade(m,w,h,d/2,apertures(s),wallmat=s.get('wallMaterial','plaster'))
    facade(m,w,h,-d/2,apertures(s,True),False,wallmat=s.get('wallMaterial','plaster'))
    side_wall(m,w,d-.3,h,s.get('wallMaterial','plaster'),s.get('storeys',1))
    if s.get('storeys',1)==2:
        for side in [-1,1]:
            m.box((side*w/2,2.7,0),(.34,.16,d),'timber')
    for z in [-d/2,d/2]:gable(m,w,z,h,s['roofRise']*.93)
    for side in [-1,1]:
        masonry(m,(side*(w/2+.015),.30,0),(.22,.48,d+.22),block=.5)
        for z in [-d/2,d/2]:
            for row in range(5):m.box((side*(w/2-.06),.25+row*.27,z),(.28+row%2*.13,.25,.34),'stone',.018)
    for z in [-d/2,d/2]:
        for x in [-w/4,w/4]:masonry(m,(x,.3,z),(w/2-.6,.48,.34))
    m.box((0,.07,0),(w+.18,.14,d+.18),'stone',.025)
    m.box((0,.13,d/2+.31),(1.65,.16,.65),'stone',.025)
    pitched_roof(m,w,d,h+.08,s['roofRise'],s['eave'])
    if s.get('porch'):
        for x in [-.83,.83]:
            m.lathe([(.09,.15),(.09,2.27)],'timber',(x,0,d/2+.58),8)
            m.box((x,.20,d/2+.58),(.23,.25,.23),'stone',.018)
        # A small supported shelter, lower than the main eaves.
        roof_plane(m,(-1.0,2.53,d/2-.05),(0,-.26,.78),(2.,0,0),2,7)
        m.box((0,2.24,d/2+.65),(1.9,.15,.15),'timber',.01)

def copy_module(target,source,offset=(0,0,0)):
    offset=Vector(offset)
    for face,uv,smooth in zip(source.faces,source.uv,source.smooth):
        target.poly([Vector(source.vertices[i])+offset for i in face],'plaster',smooth=smooth)
        target.uv[-1]=uv

def workshop(m,s):
    w,d,h=s['width'],s['depth'],s['wallHeight'];rise=s['roofRise']
    facade(m,w,h,d/2,[(0,s['frontDoor'],.16,2.42,'workshop')],wallmat=s.get('wallMaterial','ochre-plaster'))
    facade(m,w,h+rise,-d/2,[(0,.75,1.65,2.4,'window')],False,wallmat=s.get('wallMaterial','plaster'))
    # Lean-to roof, taller rear wall and sloped side walls. Different structure from a house.
    for side in [-1,1]:
        x=side*w/2
        m.box((x,h/2,0),(.3,h,d-.3),s.get('wallMaterial','ochre-plaster'))
        m.poly([(x-side*.15,h,-d/2),(x-side*.15,h,d/2),(x-side*.15,h+rise,-d/2)],s.get('wallMaterial','plaster'),(-side,0,0))
        m.poly([(x+side*.15,h,-d/2),(x+side*.15,h,d/2),(x+side*.15,h+rise,-d/2)],s.get('wallMaterial','plaster'),(side,0,0))
        for z in [-d/2,0,d/2]:m.box((x,.5*h,z),(.18,h,.16),'timber',.012)
        m.box((x,.45,0),(.33,.45,d),'stone',.015)
    for z in [-d/2,d/2]:
        m.box((0,.12,z),(w+.18,.24,.45),'stone',.025)
        m.box((0,2.56,z),(w+.14,.18,.19),'timber',.012)
    m.box((0,.07,0),(w+.18,.14,d+.18),'stone',.025)
    e=s['eave']
    roof_plane(m,(-w/2-e,h+rise+.09,-d/2-e),(0,-rise-.12,d+2*e),(w+2*e,0,0),14,20)
    ridge(m,0,h+rise+.115,-d/2-.30,w+.6,'x')
    # Supported street shelter, with clearance below the eaves.
    shelter=s.get('shelter','linen')
    if shelter=='none':return
    if shelter=='tile':
        for x in [-1.6,1.6]:m.lathe([(.075,.15),(.075,2.32)],'timber',(x,0,d/2+.57),8)
        roof_plane(m,(-1.78,2.67,d/2-.12),(0,-.25,.87),(3.56,0,0),2,12)
        m.box((0,2.34,d/2+.60),(3.4,.12,.12),'timber')
        return
    for x in [-1.6,1.6]:m.lathe([(.065,.15),(.065,2.32)],'timber',(x,0,d/2+.57),8)
    for i in range(16):
        x=-1.78+i*3.56/16
        for j in range(5):
            def point(u,v):return (u,2.63-.25*v-.055*math.sin(PI*v),d/2-.02+.75*v)
            a,b=j/5,(j+1)/5
            m.poly([point(x,a),point(x+3.56/16,a),point(x+3.56/16,b),point(x,b)],'linen',(0,1,0))
    m.box((0,2.34,d/2+.60),(3.4,.12,.12),'timber')

def farmhouse(m,s):
    main=dict(SPEC['assets']['provincial-house']);main.update(width=s['main']['width'],depth=s['main']['depth'],wallHeight=s['wallHeight'],roofRise=s['roofRise'],porch=False)
    body=Mesh();house(body,main);copy_module(m,body,(s['main']['offset'][0],0,s['main']['offset'][1]))
    # A lower stone service wing forms a real L plan around a roofed work veranda.
    wing=s['serviceWing'];cx=wing['centerX'];w=wing['width'];back=wing['backZ'];front=wing['frontZ'];h=wing['wallHeight']
    part=Mesh();facade(part,w,h,front,[(0,1.4,.15,2.15,'workshop')],wallmat='stone')
    facade(part,w,h,back,[],False,wallmat='stone');copy_module(m,part,(cx,0,0))
    m.box((3.7,h/2,(back+front)/2),(.30,h,front-back),'stone',.015)
    for z,normal in [(back,(0,0,-1)),(front,(0,0,1))]:
        m.poly([(1.5,h,z),(3.7,h,z),(3.7,2.55,z),(1.5,3.18,z)],'stone',normal)
    roof_plane(m,(1.48,3.30,back-.3),(2.58,-.75,0),(0,0,front-back+.63),7,18)
    m.box((cx,.07,(front+back)/2),(2.6,.14,front-back+.3),'stone',.02)
    if not s.get('verandaRoof',True):
        m.box((-1.1,.09,2.67),(5.4,.18,1.58),'stone',.02)
        if s.get('boundary'):
            masonry(m,(-3.6,.47,2.75),(.24,.94,1.5))
            masonry(m,(-2.6,.47,3.4),(2.2,.94,.24))
        return
    for x in s['veranda']['postsX']:
        m.lathe([(.13,.16),(.13,.35),(.085,.39),(.075,2.31)],'timber',(x,0,s['veranda']['frontZ']),10)
        m.box((x,.19,3.13),(.30,.29,.30),'stone',.02)
    roof_plane(m,(-3.7,2.7,1.65),(0,-.34,1.85),(5.,0,0),5,17)
    m.box((-1.2,2.3,3.2),(4.7,.18,.18),'timber',.015)
    m.box((-1.1,.09,2.67),(5.4,.18,1.58),'stone',.02)
    m.box((-1.1,.07,3.56),(2.,.14,.4),'stone',.02)

def column(m,x,z,base,height,radius=.22):
    # Restrained Tuscan profile: plinth, torus, tapered shaft, necking, abacus.
    m.box((x,base+.10,z),(radius*2.8,.20,radius*2.8),'stone',.02)
    m.lathe([(radius*1.25,base+.20),(radius*1.27,base+.27),(radius,base+.34),
             (radius,base+.43),(radius*.96,base+height*.48),(radius*.81,base+height-.27),
             (radius*.88,base+height-.20),(radius*1.2,base+height-.14)],'stone',(x,0,z),16)
    m.box((x,base+height-.075,z),(radius*2.8,.15,radius*2.8),'stone',.015)

def temple(m,s):
    w,d,p=s['width'],s['depth'],s['podium'];ch=s['columnHeight'];roofh=p+ch+.43
    # Podium and broad frontal stair with five physically separate risers.
    m.box((0,p/2,-.72),(w-.25,p,d-1.74),'stone',.035)
    m.box((0,p-.07,-.72),(w,.16,d-1.64),'stone',.025)
    for i in range(5):
        depth=.31;rise=p/5
        m.box((0,(i+1)*rise/2,d/2-.05-i*depth),(3.5,(i+1)*rise,depth+.03),'stone',.018)
    # Cella behind a four-column pronaos.
    sub=Mesh();facade(sub,4.8,ch-.1,.65,[(0,1.35,p,p+2.25,'door')],base=p)
    # facade height is absolute, not a local height.
    sub=Mesh();facade(sub,4.8,p+ch-.1,.65,[(0,1.35,p,p+2.25,'door')],base=p);copy_module(m,sub)
    m.box((-2.25,p+ch/2,-1.15),(.30,ch,3.6),'plaster')
    m.box((2.25,p+ch/2,-1.15),(.30,ch,3.6),'plaster')
    m.box((0,p+ch/2,-2.95),(4.8,ch,.3),'plaster')
    for x in [-2.6,-.87,.87,2.6]:column(m,x,2.25,p,ch,.21)
    for x in [-2.6,2.6]:column(m,x,.45,p,ch,.21)
    for z in [-2.95,.65]:m.box((0,p+.22,z),(4.9,.38,.34),'stone',.015)
    # Architrave, quiet frieze and projecting cornice carry the pediment/roof.
    m.box((0,p+ch+.12,-.15),(w-.1,.24,d-1.0),'stone',.022)
    m.box((0,p+ch+.30,-.15),(w+.12,.16,d-.85),'plaster',.012)
    m.box((0,p+ch+.43,-.15),(w+.36,.16,d-.65),'stone',.02)
    for z in [d/2-.52,-d/2+.22]:
        gable(m,w+.12,z,roofh,s['roofRise']*.85,'plaster')
        # Raking stone cornice follows the two pediment slopes, with no fantasy sculpture.
        for side in [-1,1]:
            a=Vector((0,roofh+s['roofRise']-.14,z+.015));b=Vector((side*(w/2+.15),roofh-.08,z+.015))
            vec=b-a;angle=math.atan2(vec.y,vec.x)
            def rotation(p,origin=(a+b)/2,angle=angle):
                return origin+Vector((p.x*math.cos(angle)-p.y*math.sin(angle),p.x*math.sin(angle)+p.y*math.cos(angle),p.z))
            m.box((0,0,0),(vec.length,.14,.23),'stone',.012,rotation)
    pitched_roof(m,w,d-.7,roofh+.06,s['roofRise'],.28,cz=-.15)

def aqueduct(m,s):
    w,d,h=s['width'],s['depth'],s['height'];r=s['archRadius'];spring=s['springHeight']
    centers=[-2.,2.]
    for x,width in [(-3.75,.5),(0,1.0),(3.75,.5)]:
        masonry(m,(x,spring/2,0),(width,spring,d),course=.45,block=.50)
        m.box((x,.16,0),(width+.13,.32,d+.10),'stone',.025)
        m.box((x,spring-.05,0),(width+.13,.18,d+.12),'stone',.02)
    # Radial voussoirs, true open intrados, masonry spandrels to a level deck.
    outer=r+.42;top=h-.75
    for cx in centers:
        for i in range(15):
            a=i*PI/15+.004;b=(i+1)*PI/15-.004
            def p(rad,t,z):return (cx+rad*math.cos(t),spring+rad*math.sin(t),z)
            for z,normal in [(-d/2,(0,0,-1)),(d/2,(0,0,1))]:m.poly([p(r,a,z),p(outer,a,z),p(outer,b,z),p(r,b,z)],'stone',normal)
            for rad,sign in [(r,-1),(outer,1)]:m.poly([p(rad,a,-d/2),p(rad,b,-d/2),p(rad,b,d/2),p(rad,a,d/2)],'stone',(sign*math.cos((a+b)/2),sign*math.sin((a+b)/2),0))
            for t in [a,b]:m.poly([p(r,t,-d/2),p(r,t,d/2),p(outer,t,d/2),p(outer,t,-d/2)],'stone')
        # Match the exact outer voussoir edges: no coplanar overlapping spandrels.
        for i in range(15):
            a=i*PI/15;b=(i+1)*PI/15
            x0=cx+outer*math.cos(a);x1=cx+outer*math.cos(b)
            y0=spring+outer*math.sin(a);y1=spring+outer*math.sin(b)
            for z,norm in [(-d/2,(0,0,-1)),(d/2,(0,0,1))]:
                m.poly([(x0,y0,z),(x1,y1,z),(x1,top,z),(x0,top,z)],'stone',norm)
    for x,width in [(-3.96,.08),(0,.16),(3.96,.08)]:
        m.box((x,(spring+top)/2,0),(width,top-spring,d),'stone')
    m.box((0,top+.12,0),(w,.24,d+.10),'stone',.02)
    # Open water channel: floor and two parapets, dry preview rather than blue decorative stripe.
    m.box((0,h-.44,0),(w,.20,d),'stone')
    for z in [-d/2+.13,d/2-.13]:
        masonry(m,(0,h-.2,z),(w,.4,.26),course=.20,block=.55)
    m.box((0,h-.36,0),(w,.035,d-.57),'recess')

def barrel(m,s):
    r=s['diameter']/2;h=s['height']
    # Convex staves with narrow joints and raised iron hoops.
    levels=[(r*.81,0),(r*.9,h*.12),(r,h*.45),(r*.99,h*.6),(r*.9,h*.88),(r*.81,h)]
    for i in range(18):
        a=i*2*PI/18+.009;b=(i+1)*2*PI/18-.009
        for (r0,y0),(r1,y1) in zip(levels,levels[1:]):
            m.poly([(r0*math.cos(a),y0,r0*math.sin(a)),(r0*math.cos(b),y0,r0*math.sin(b)),(r1*math.cos(b),y1,r1*math.sin(b)),(r1*math.cos(a),y1,r1*math.sin(a))],'timber',(math.cos((a+b)/2),0,math.sin((a+b)/2)),True)
    for y,rr in [(h*.10,r*.9),(h*.27,r*.97),(h*.74,r*.97),(h*.90,r*.9)]:m.lathe([(rr+.012,y-.023),(rr+.012,y+.023)],'iron',segments=24)
    m.lathe([(r*.79,.015),(r*.79,.04)],'timber',segments=24)
    m.lathe([(r*.79,h-.045),(r*.79,h-.015)],'timber',segments=24)
    for z in [-.18,-.06,.06,.18]:m.box((0,h-.011,z),(.52,.005,.008),'recess')

def awning(m,s):
    w,d,h=s['width'],s['depth'],s['height']
    for x in [-w/2+.08,w/2-.08]:
        for z in [-d/2+.08,d/2-.08]:m.lathe([(.043,0),(.043,h-.15)],'timber',(x,0,z),8)
        m.box((x,h-.16,0),(.09,.10,d),'timber',.005)
    for z in [-d/2+.05,d/2-.05]:m.box((0,h-.2,z),(w,.10,.09),'timber',.005)
    # Sewn linen canopy slopes gently to both sides, cloth geometry supplies sag.
    for i in range(20):
        for j in range(10):
            def p(a,b):return ((a-.5)*w,h-.20*abs(2*a-1)-.065*math.sin(b*PI), (b-.5)*d)
            m.poly([p(i/20,j/10),p((i+1)/20,j/10),p((i+1)/20,(j+1)/10),p(i/20,(j+1)/10)],'linen',(0,1,0),True)
    for z in [-d/2,d/2]:m.box((0,h-.25,z),(w,.12,.018),'linen')

def amphora(m,s):
    h=s['height'];r=s['diameter']/2
    profile=[(.05,0),(.08,.08),(r*.72,.18),(r,.40),(r*.94,.60),(r*.57,.73),(r*.35,.79),(r*.34,.92),(r*.44,.94),(r*.44,.99),(r*.28,1.0),(r*.26,.91)]
    m.lathe([(rr,yy*h) for rr,yy in profile],'terracotta',segments=24,close=False)
    m.lathe([(r*.24,.90*h),(r*.24,.905*h)],'recess',segments=20)
    # Paired strap handles join shoulder and neck; curved swept tubes, no floating rings.
    for side in [-1,1]:
        for i in range(10):
            t0=i*PI/10;t1=(i+1)*PI/10
            def point(t,k):
                x=side*(r*.38+math.sin(t)*r*.73);y=.82*h-(1-math.cos(t))*.14*h
                return (x+math.cos(k)*.026,y,math.sin(k)*.026)
            for j in range(6):
                a,b=j*PI/3,(j+1)*PI/3
                m.poly([point(t0,a),point(t1,a),point(t1,b),point(t0,b)],'terracotta',smooth=True)

def bench(m,s):
    w,d,h=s['width'],s['depth'],s['height']
    m.box((0,h-.075,0),(w,.15,d),'stone',.025)
    for x in [-w*.32,w*.32]:
        m.box((x,(h-.15)/2,0),(.20,h-.15,d*.76),'stone',.02)
        m.box((x,.06,0),(.32,.12,d*.9),'stone',.015)

BUILDERS={'house':house,'workshop':workshop,'farmhouse':farmhouse,'temple':temple,'aqueduct':aqueduct,'barrel':barrel,'awning':awning,'amphora':amphora,'bench':bench}


def module(m,s):
    kind=s['kind'];h=s['height'];w=s.get('width',1)
    if kind=='wall':
        m.box((0,h/2,0),(w,h,.3),s['material'])
    elif kind=='timber-wall':
        m.box((0,h/2,0),(w,h,.3),'plaster')
        for x in [-w/2+.05,w/2-.05]:m.box((x,h/2,.17),(.1,h,.1),'timber',.008)
        for y in [.12,h-.08]:m.box((0,y,.17),(w,.12,.1),'timber',.008)
    elif kind=='corner':
        for row in range(round(h/.28)):
            m.box((0,(row+.5)*.28,0),(.36+row%2*.15,.26,.36+(1-row%2)*.15),'stone',.015)
    elif kind in ('door','window','workshop'):
        isdoor=kind!='window';bottom=.12 if isdoor else 1.35;top=2.25 if isdoor else 2.15
        facade(m,w,h,0,[(0,s['openingWidth'],bottom,top,kind)],base=0)
    elif kind=='roof':pitched_roof(m,w,s['depth'],.15,h-.25,.2,detailed=s['detailed'])
    elif kind=='column':column(m,0,0,0,h,s['radius'])
    else:m.box((0,h/2,0),(w,h,s['depth']),'stone',.018)

def preview(obj,name):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.world.color=(.20,.20,.20)
    scene.view_settings.view_transform='AgX'
    # Warm-neutral studio lighting, fixed azimuth for every model.
    bbox=[obj.matrix_world@Vector(p) for p in obj.bound_box]
    low=Vector([min(p[i] for p in bbox) for i in range(3)]);high=Vector([max(p[i] for p in bbox) for i in range(3)])
    target=(low+high)/2;size=max(high-low)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.015))
    plane=bpy.context.object;plane.name='Preview only ground'
    ground=bpy.data.materials.new('Preview ground');ground.diffuse_color=(.22,.24,.20,1);plane.data.materials.append(ground)
    def light(name,loc,power,size):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
        return ob
    key=light('Preview key',(-8,-10,14),1900,7)
    fill=light('Preview fill',(8,-3,9),800,8)
    sun_data=bpy.data.lights.new('Preview sun','SUN');sun_data.energy=1.7;sun_data.angle=.10
    sun=bpy.data.objects.new('Preview sun',sun_data);scene.collection.objects.link(sun);sun.rotation_euler=(.45,-.35,-.55)
    camera_data=bpy.data.cameras.new('Preview camera');camera=bpy.data.objects.new('Preview camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    camera_data.type='ORTHO';camera_data.ortho_scale=size*1.45
    for label,direction in [('front',(1,-1.6,1.12)),('rear',(-1,1.5,.98))]:
        camera.location=target+Vector(direction).normalized()*size*3
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(REVIEW/f'{name}-{label}.png')
        bpy.ops.render.render(write_still=True)
    for ob in [plane,key,fill,sun,camera]:bpy.data.objects.remove(ob,do_unlink=True)

def generate_variants(args,mat):
    assert not args.modules and args.only is None, '--variants exports the complete shared library'
    Mesh.roof_segments=CONFIG['quality']['tileCoverSegments']
    assert Mesh.roof_segments in (2,3,4), 'Unsupported roof cover resolution'
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    pigment=nodes.new('ShaderNodeVertexColor');pigment.layer_name='RomanWear'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    image=next(node for node in nodes if node.type=='TEX_IMAGE' and node.image.colorspace_settings.name!='Non-Color')
    links.new(image.outputs['Color'],multiply.inputs[1]);links.new(pigment.outputs['Color'],multiply.inputs[2])
    links.new(multiply.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    objects=[];inventory={}
    for name in CONFIG['variants']:
        spec=resolve(name,SPEC['assets'],args.seed)
        mesh=Mesh();BUILDERS[spec['kind']](mesh,spec)
        assert min(v[1] for v in mesh.vertices)>=-1e-8, 'Floating/negative foundation'
        obj=mesh.finish(name,mat,spec);objects.append(obj)
        import bmesh
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(obj.data);bm.free();obj.data.update()
        obj.data.calc_loop_triangles()
        points=[Vector((p[0],p[2],-p[1])) for p in obj.bound_box]
        inventory[name]={'dimensionsMeters':[round(max(p[i] for p in points)-min(p[i] for p in points),6) for i in range(3)],'triangles':len(obj.data.loop_triangles),'parameters':spec}
        if args.render and (not args.render_only or name in args.render_only):
            for other in objects[:-1]:other.hide_render=True
            preview(obj,name)
            for other in objects[:-1]:other.hide_render=False
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    path=OUT/'residential-variants.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO',export_tangents=False,export_vertex_color='NAME',export_vertex_color_name='RomanWear',export_all_vertex_colors=False)
    payload={'schemaVersion':1,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'variants':inventory}
    (OUT/'variants.json').write_text(json.dumps(payload,indent=2)+'\n')
    # Generated TS metadata is consumed by the ordinary registry: no JSON runtime fetch.
    registry=ROOT/'lib/assets/romanVariants.ts'
    registry.write_text('/** Generated by scripts/roman-kit/generate.py -- --variants. */\nexport const romanVariants = '+json.dumps({name:{'dimensionsMeters':v['dimensionsMeters'],'archetype':v['parameters']['kind'],'weight':v['parameters']['weight']} for name,v in inventory.items()},indent=2)+' as const;\n')
    if args.save_blend:bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW/'residential-variants.blend'))
    print('KIT_VARIANTS',json.dumps({k:v for k,v in payload.items() if k!='variants'}),flush=True)

def export_grounding(seed=None):
    """Authoring-side contact metadata, measured before export; never infer roofs at runtime."""
    inventory = {}
    silhouettes = {}
    definitions = dict(SPEC['assets'])
    definitions.update({name: resolve(name, SPEC['assets'], seed) for name in CONFIG['variants']})
    for name, spec in definitions.items():
        if spec['kind'] not in ('house', 'workshop', 'farmhouse', 'temple', 'aqueduct'):
            continue
        mesh = Mesh(); BUILDERS[spec['kind']](mesh, spec)
        floor = min(p[1] for p in mesh.vertices)
        cx = (min(p[0] for p in mesh.vertices) + max(p[0] for p in mesh.vertices))/2
        cz = (min(p[2] for p in mesh.vertices) + max(p[2] for p in mesh.vertices))/2
        contacts = []
        for face in mesh.faces:
            points = [mesh.vertices[i] for i in face]
            if not all(abs(p[1]-points[0][1])<1e-6 for p in points): continue
            if points[0][1]-floor > .08 or (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).y >= 0: continue
            x0,x1 = min(p[0] for p in points),max(p[0] for p in points)
            z0,z1 = min(p[2] for p in points),max(p[2] for p in points)
            if (x1-x0)*(z1-z0)<(.25 if points[0][1]-floor>1e-6 else .001): continue
            contacts.append({'offset':[round((x0+x1)/2-cx,6),round((z0+z1)/2-cz,6)],
                             'width':round(x1-x0,6),'depth':round(z1-z0,6),'base':round(points[0][1]-floor,6)})
        # Keep only maximal rectangles (some timber feet sit inside the stone base).
        def contains(a,b):
            return a['base']<=b['base']+1e-6 and all(abs(a['offset'][i]-b['offset'][i])+b[k]/2 <= a[k]/2+1e-6
                       for i,k in [(0,'width'),(1,'depth')])
        contacts = [b for i,b in enumerate(contacts) if not any(
            j!=i and contains(a,b) and (not contains(b,a) or j<i) for j,a in enumerate(contacts))]
        assert contacts and len(contacts)<32, (name, len(contacts))
        kind = spec['kind']
        entrance = None if kind=='aqueduct' else (
            [-1.1-cx,3.76-cz] if kind=='farmhouse' else
            [0-cx,spec['depth']/2+.12-cz] if kind=='temple' else
            [0-cx,spec['depth']/2+.635-cz] if kind=='house' else
            [0-cx,spec['depth']/2+.225-cz])
        inventory[name]={'contacts':contacts,'entrance':entrance}
        # Whole architectural masses rather than individual wall/pier contacts.
        # Reuses the authoring parameters and exactly the same prepared asset centre.
        def mass(x,z,w,d,h,rise):
            return {'offset':[round(x-cx,6),round(z-cz,6)],'width':round(w,6),
                    'depth':round(d,6),'height':round(h,6),'roofRise':round(rise,6)}
        if kind=='farmhouse':
            main=spec['main'];wing=spec['serviceWing']
            parts=[mass(*main['offset'],main['width'],main['depth'],spec['wallHeight'],spec['roofRise']),
                   mass(wing['centerX'],(wing['backZ']+wing['frontZ'])/2,wing['width'],wing['frontZ']-wing['backZ'],wing['wallHeight'],.65)]
            if spec.get('verandaRoof',True):parts.append(mass(-1.2,2.575,5.,1.85,2.36,.34))
        elif kind=='aqueduct':parts=[mass(0,0,spec['width'],spec['depth'],spec['height'],0)]
        elif kind=='temple':parts=[mass(0,0,spec['width'],spec['depth'],spec['podium']+spec['columnHeight']+.43,spec['roofRise'])]
        else:parts=[mass(0,0,spec['width'],spec['depth'],spec['wallHeight'],spec['roofRise'])]
        silhouettes[name]=parts
    (ROOT/'lib/assets/romanGrounding.ts').write_text(
        '/** Generated by the existing Blender authoring pipeline: --grounding-only. Metres, centred asset frame. */\n'
        'export const romanGrounding = '+json.dumps(inventory,indent=2)+' as const;\n')
    (ROOT/'lib/assets/romanSilhouettes.ts').write_text(
        '/** Generated by scripts/roman-kit/generate.py -- --grounding-only. Prepared asset frame, metres. */\n'
        'export const romanSilhouettes = '+json.dumps(silhouettes,indent=2)+' as const;\n')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='*');parser.add_argument('--render',action='store_true');parser.add_argument('--save-blend',action='store_true');parser.add_argument('--modules',action='store_true');parser.add_argument('--variants',action='store_true');parser.add_argument('--seed',type=int);parser.add_argument('--render-only',nargs='+')
    parser.add_argument('--grounding-only',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    export_grounding(args.seed)
    if args.grounding_only:
        return
    if args.seed is not None and not args.variants:parser.error('--seed requires --variants')
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    mat=atlas();manifest_path=OUT/'manifest.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if args.variants:
        generate_variants(args,mat)
        return
    definitions=SPEC['assets']
    if args.modules:
        definitions=json.loads(Path(__file__).with_name('modules.json').read_text())['modules']
        definitions={f'module-{name}': dict(spec, moduleKind=spec['kind'], kind='module') for name,spec in definitions.items()}
    if args.only is not None and set(args.only)-set(definitions):parser.error(f'Unknown asset names: {set(args.only)-set(definitions)}')
    for name,spec in definitions.items():
        if args.only is not None and name not in args.only:continue
        m=Mesh()
        if spec['kind']=='module':module(m,dict(spec,kind=spec['moduleKind']))
        elif spec['kind'] in BUILDERS:BUILDERS[spec['kind']](m,spec)
        else:raise ValueError(f'Unknown Roman kit kind {spec["kind"]}')
        floor=min(p[1] for p in m.vertices)
        if abs(floor)>1e-8:m.vertices=[(x,y-floor,z) for x,y,z in m.vertices]
        obj=m.finish(name,mat)
        # Remove exact duplicate vertices; keep UV seams and flat/smooth face settings.
        import bmesh
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(obj.data);bm.free();obj.data.update()
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        path=OUT/f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_copyright='Project-authored Mankind Roman kit; repository terms apply',export_image_format='AUTO',export_tangents=False)
        obj.data.calc_loop_triangles()
        points=[Vector((p[0],p[2],-p[1])) for p in obj.bound_box]
        size=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
        manifest[name]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'dimensionsMeters':[round(v,6) for v in size],'triangles':len(obj.data.loop_triangles),'materials':1,'textures':[{'width':512,'height':256,'kind':'baseColor'},{'width':512,'height':256,'kind':'normal'}],'entrance':'+Z','groundY':round(min(p.y for p in points),6)}
        if args.save_blend:
            bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW/f'{name}.blend'))
        if args.render:preview(obj,name)
        bpy.data.objects.remove(obj,do_unlink=True)
        manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
        print('KIT_ASSET',name,json.dumps(manifest[name]),flush=True)

if __name__=='__main__':main()
