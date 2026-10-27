"""Validate actual output: categorical preservation, coast masks, tile seams,
dateline wrap, polar handling and continuity with the regional pnv-v4 reference.

Usage: check.py [output-dir-relative-to-repo-root]
"""
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image
import rasterio as rio
from rasterio.windows import from_bounds, Window
import build as b
from materials import geographic_noise

out=b.ROOT/(sys.argv[1] if len(sys.argv)>1 else '.biome-data/tiles/pnv-v4')
m=json.loads((out/'tilejson.json').read_text())
z=m['maxzoom']
fmt=m.get('format','png')
# `bounds` is the published tile extent; `dataBounds` is the PNV clip the
# colours honour. They differ only when polar glacier ice is painted.
data_bounds=m.get('dataBounds',m['bounds'])
w,s,e,n=data_bounds
whole_world=(w<=-180 and e>=180)
print(f'Checking {out.name}: {"global" if whole_world else "regional"} z0–{z} {fmt}, published {m["bounds"]}, '
      f'data {data_bounds}, edge fade {m.get("edgeFade",1.0)}, polar ice {m.get("polarIce",False)}')

files=list(out.glob(f'*/*/*.{fmt}'))
assert len(files)==m['tileCount'],(len(files),m['tileCount'])
# WebP drops the alpha plane when a tile is wholly opaque, so a fully-covered
# land tile legitimately decodes as RGB. Both modes composite correctly.
modes={}
for f in files:
    with Image.open(f) as im:
        assert im.size==(256,256),(f,im.size)
        assert im.mode in ('RGB','RGBA'),(f,im.mode)
        modes[im.mode]=modes.get(im.mode,0)+1
print(f'{len(files)} real tiles decode at 256×256: '+', '.join(f'{v} {k}' for k,v in sorted(modes.items())))

# No tile may be stored fully transparent: that is wasted storage and a request.
for f in files[::max(1,len(files)//400)]:
    with Image.open(f) as im:
        assert np.asarray(im.convert('RGBA'))[:,:,3].any(),f
print('Sampled stored tiles all carry visible pixels (ocean-only tiles were skipped).')

# Unmodified categorical archive, compared in row bands to bound memory.
with rio.open(b.SOURCE/'pnv-1km.tif') as src, rio.open(out/'classes.tif') as crop:
    window=from_bounds(*crop.bounds,src.transform).round_offsets().round_lengths()
    assert (crop.width,crop.height)==(int(window.width),int(window.height))
    seen=set()
    for row in range(0,crop.height,2048):
        height=min(2048,crop.height-row)
        a=crop.read(1,window=Window(0,row,crop.width,height))
        o=src.read(1,window=Window(window.col_off,window.row_off+row,crop.width,height))
        assert np.array_equal(a,o),f'Categorical IDs changed at row {row}'
        seen.update(np.unique(a).tolist())
    print('Preserved original class IDs:',sorted(seen))
    assert 255 in seen or not whole_world, 'Global crop should retain nodata'

colors=json.loads((out/'palette.json').read_text())
palette={int(k):tuple(bytes.fromhex(v[1:])) for k,v in colors.items() if k.isdigit()}
materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
settings=m['surface']
land=b.projected_shapes(b.SOURCE/'ne_10m_land.geojson')
ice=b.projected_shapes(b.SOURCE/'ne_10m_glaciated_areas.geojson')
# The builder records which render-only intermediate it used.
render_path=Path(m['renderSource']) if 'renderSource' in m else b.SOURCE/(
    'render-filled-'+__import__('hashlib').sha256(str(tuple(data_bounds)).encode()).hexdigest()[:12]+'.tif')
assert render_path.exists(),f'Missing render intermediate {render_path}; rerun build.py'
# The renderer decides glacier ice against the unaltered archive, so the
# independent re-render must read the same file the builder did.
archive=rio.open(out/'classes.tif') if m.get('polarIce') else None
common=dict(palette=palette,coverage=data_bounds,variation=m['variation'],settings=settings,
            materials_palette=materials_palette,ice_geometries=ice,
            edge_fade=m.get('edgeFade',1.0),polar_ice=m.get('polarIce',False),original=archive)

REGIONAL=[('Iberia',-3,41),('Alps',7,46),('Pyrenees',.6,42.7),('Atlas',-5.1,31.2),('Mediterranean',24,34)]
GLOBAL=[('Sahara',10,25),('Amazon',-60,-3),('Central Asia',65,45),('Himalaya',86.9,28),
        ('Australia',134,-25),('Greenland',-45,70),('Congo',20,0),('Siberia',100,62),
        ('Great Plains',-100,42),('Patagonia',-70,-45),('India',78,22),('Scandinavia',15,63)]
fixtures=REGIONAL+(GLOBAL if whole_world else [])

with rio.open(render_path) as src, rio.open(m['demFile']) as dem:
    for name,lon,lat in fixtures:
        x,y=b.tile_xy(lon,lat,z)
        reference=b.render(src,dem,land,z,x,y,core_size=512,**common)
        if reference is None: print(f'  {name}: no source coverage, skipped'); continue
        reference=np.asarray(reference).astype('int16')
        max_delta,compared=0,0
        for dx in range(2):
            for dy in range(2):
                path=out/str(z)/str(x+dx)/f'{y+dy}.{fmt}'
                if not path.exists(): continue
                compared+=1
                with Image.open(path) as im: tile=np.asarray(im.convert('RGBA')).astype('int16')
                section=reference[dy*256:(dy+1)*256,dx*256:(dx+1)*256]
                visible=(tile[:,:,3]>250)&(section[:,:,3]>250)
                delta=np.abs(tile[:,:,:3]-section[:,:,:3])[visible]
                max_delta=max(max_delta,int(delta.max()) if delta.size else 0)
        assert max_delta<=1,(name,max_delta)
        print(f'  {name} z{z}/{x}/{y}: {compared}/4 stored tiles match an independent 512px render, '
              f'max visible RGB delta {max_delta}/255')

    if whole_world:
        # A virtual column one past the eastern edge has identical geography to
        # column 0, but its padded blur/slope/mask footprint crosses the dateline
        # from the opposite side. Exact equality proves the wrap, not just absence
        # of a visible seam.
        count=2**z
        occupancy=b.land_occupancy(land,z)
        rows=[int(y) for y in np.nonzero(occupancy[:,0]&occupancy[:,count-1])[0]]
        assert rows,'Expected land touching both dateline tile columns'
        for y in rows:
            west=b.render(src,dem,land,z,0,y,**common)
            wrapped=b.render(src,dem,land,z,count,y,**common)
            assert (west is None)==(wrapped is None),y
            if west is None: continue
            assert np.array_equal(np.asarray(west),np.asarray(wrapped)),f'Dateline wrap differs at z{z}/0/{y}'
        band=[round(b.tile_bounds(z,0,y)[3],0) for y in rows]
        print(f'Dateline wrap is pixel-exact for {len(rows)} land rows at z{z} (mercator y {min(band):.0f}…{max(band):.0f}).')

        # Nothing south of the PNV limit may receive a vegetation colour.
        ice_rgb=np.array(materials_palette['ice'],dtype='int16')
        limit=b.tile_xy(0,s,z)[1]
        checked=0
        for path in (out/str(z)).glob(f'*/*.{fmt}'):
            y=int(path.stem)
            if y<=limit: continue
            with Image.open(path) as im: tile=np.asarray(im.convert('RGBA')).astype('int16')
            visible=tile[:,:,3]>0
            if not visible.any(): continue
            # Pixels wholly below the data limit are either transparent or the
            # mapped-glacier ice accent; never an invented biome class.
            top=b.tile_bounds(z,int(path.parent.name),y)[3]
            if top>  b.HALF*math.asinh(math.tan(math.radians(s)))/math.pi: continue
            assert np.abs(tile[:,:,:3][visible]-ice_rgb).max()==0,path
            checked+=1
        print(f'{checked} tiles entirely south of the {s:.2f}° PNV limit contain only mapped-glacier ice or transparency.')

if whole_world:
    # Every tile Natural Earth maps as glaciated land must exist: the source has
    # no vegetation class over ice sheets, and a missing tile would read as a
    # dark hole in the middle of Greenland or Antarctica.
    ice_occupancy=b.land_occupancy(ice,z)&b.land_occupancy(land,z)
    holes=[(int(x),int(y)) for y,x in zip(*np.nonzero(ice_occupancy))
           if not (out/str(z)/str(int(x))/f'{int(y)}.{fmt}').exists()]
    assert not holes,f'{len(holes)} glaciated land tiles missing, e.g. {holes[:5]}'
    print(f'All {int(ice_occupancy.sum())} glaciated land tiles at z{z} exist.')

for name,lon,lat,is_land in [('Madrid',-3.7,40.4,True),('Paris',2.35,48.85,True),('Rome',12.5,41.9,True),
                             ('Sahara',10,25,True),('Alps',9,46.5,True),('Mediterranean',7,38,False),('Biscay',-5,46,False)]+(
                            [('Amazon',-60,-3,True),('Outback',134,-25,True),('Lhasa',91,29.6,True),
                             ('Greenland interior',-42,72,True),('Greenland margin',-45,70,True),
                             ('Antarctica',0,-72,True),('Iceland',-19,64.7,True),
                             ('Pacific',-150,0,False),('South Atlantic',-20,-40,False)] if whole_world else []):
    count=2**z
    tx=(lon+180)/360*count; ty=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*count
    path=out/str(z)/str(int(tx))/f'{int(ty)}.{fmt}'
    if not path.exists():
        assert not is_land,(name,'expected a tile')
        print(f'  {name}: no tile generated (ocean)'); continue
    with Image.open(path) as im: color=im.convert('RGBA').getpixel((int(tx%1*256),int(ty%1*256)))
    assert (color[3]>250)==is_land,(name,color)
    print(f'  {name} {color}')

# Continuity with the approved regional prototype, well inside its bounds so the
# comparison excludes pnv-v4's deliberate 1° coverage fade.
baseline=b.ROOT/'.biome-data/tiles/pnv-v4'
if whole_world and baseline.exists() and (baseline/'tilejson.json').exists():
    bm=json.loads((baseline/'tilejson.json').read_text())
    bw,bs,be,bn=bm['bounds']
    # Shrink by a whole tile on every side: a tile touching the prototype's 1°
    # fade band carries that fade in its alpha and is not comparable.
    x0,y1=b.tile_xy(bw+2,bs+2,z); x1,y0=b.tile_xy(be-2,bn-2,z)
    x0,y0,x1,y1=x0+1,y0+1,x1-1,y1-1
    # Colours must be identical wherever the source carries a class. They may
    # differ inside large source nodata gaps: the nearest-class fill is computed
    # on a fixed 512-cell lattice anchored to the extraction window, and the
    # global window starts on different cells than the regional one. That is a
    # fill-order difference, not a palette or blending change, so the assertion
    # is "no difference on real data" rather than "no difference at all".
    worst,compared,differing,visible_total,in_data=0,0,0,0,0
    with rio.open(b.SOURCE/'pnv-1km.tif') as source:
        from rasterio.transform import from_bounds as transform_from
        from rasterio.warp import reproject, Resampling
        for x in range(x0,x1+1):
            for y in range(y0,y1+1):
                old=baseline/str(z)/str(x)/f'{y}.png'; new=out/str(z)/str(x)/f'{y}.{fmt}'
                if not (old.exists() and new.exists()): continue
                with Image.open(old) as a, Image.open(new) as c:
                    a=np.asarray(a.convert('RGBA')).astype('int16'); c=np.asarray(c.convert('RGBA')).astype('int16')
                assert np.array_equal(a[:,:,3],c[:,:,3]),f'Coastline alpha changed at {new}'
                vis=(a[:,:,3]>250)&(c[:,:,3]>250)
                delta=np.abs(a[:,:,:3]-c[:,:,:3]).max(axis=2)
                ids=np.full((256,256),255,dtype='uint8')
                reproject(rio.band(source,1),ids,src_nodata=255,dst_nodata=255,
                          dst_transform=transform_from(*b.tile_bounds(z,x,y),256,256),
                          dst_crs='EPSG:3857',resampling=Resampling.nearest)
                has_class=(ids!=255)&(ids!=0)
                mismatch=(delta>0)&vis
                assert not (mismatch&has_class).any(),(
                    f'{int((mismatch&has_class).sum())} pixels differ from pnv-v4 where the source '
                    f'carries a class, at {new}')
                visible_total+=int(vis.sum()); differing+=int(mismatch.sum())
                in_data+=int((vis&has_class).sum())
                if vis.any(): worst=max(worst,int(delta[vis].max()))
                compared+=1
    print(f'Compared {compared} z{z} tiles with the approved pnv-v4 prototype interior: alpha identical; '
          f'{in_data:,} of {visible_total:,} visible pixels carry a source class and match exactly; '
          f'{differing:,} ({differing/max(1,visible_total):.4%}) differ, all inside source nodata gaps, '
          f'max {worst}/255.')

for lat in [0,35,80]:
    assert np.allclose(geographic_noise(np.array([180.]),np.array([lat]),18),
                       geographic_noise(np.array([-180.]),np.array([lat]),18),atol=1e-10)
print('Surface variation is continuous at the dateline.')
print(f'Validated {len(files)} tiles, {m["tileBytes"]:,} bytes, median {m.get("medianTileBytes",0):,} B, '
      f'max {m.get("maxTileBytes",0):,} B.')
