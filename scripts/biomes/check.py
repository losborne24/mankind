"""Validate actual output, categorical preservation, coast masks and tile seams."""
import json
import numpy as np
from PIL import Image
import rasterio as rio
from rasterio.features import bounds as gb
from rasterio.warp import transform_geom
from rasterio.windows import from_bounds, Window
import build as b

import sys
out=b.ROOT/(sys.argv[1] if len(sys.argv)>1 else '.biome-data/tiles/pnv-v4')
m=json.loads((out/'tilejson.json').read_text())
z=m['maxzoom']
files=list(out.glob('*/*/*.png'))
assert len(files)==m['tileCount']
for f in files:
    with Image.open(f) as im: assert im.mode=='RGBA' and im.size==(256,256)
with rio.open(b.SOURCE/'pnv-1km.tif') as src, rio.open(out/'classes.tif') as crop:
    window=from_bounds(*crop.bounds,src.transform).round_offsets().round_lengths()
    assert np.array_equal(crop.read(1),src.read(1,window=window)), 'Categorical IDs changed'
    values=np.unique(crop.read(1));print('Preserved original class IDs:',values)
colors=json.loads((out/'palette.json').read_text())
palette={int(k):tuple(bytes.fromhex(v[1:])) for k,v in colors.items() if k.isdigit()}
land=json.loads((b.SOURCE/'ne_10m_land.geojson').read_text())
geometries=[]
for f in land['features']:
    g=f['geometry']
    for coords in g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]:
        projected=transform_geom('EPSG:4326','EPSG:3857',{'type':'Polygon','coordinates':coords})
        geometries.append((projected,gb(projected)))
render_path=b.SOURCE/('render-filled-'+__import__('hashlib').sha256(str(m['bounds']).encode()).hexdigest()[:12]+'.tif')
settings=m['surface']
materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
ice_geometries=b.projected_shapes(b.SOURCE/'ne_10m_glaciated_areas.geojson')
with rio.open(render_path) as src, rio.open(m['demFile']) as dem:
    for lon,lat in [(-3,41),(7,46),(.6,42.7),(-5.1,31.2),(24,34)]:
        x,y=b.tile_xy(lon,lat,z)
        reference=np.asarray(b.render(src,dem,geometries,z,x,y,palette,m['bounds'],m['variation'],core_size=512,settings=settings,materials_palette=materials_palette,ice_geometries=ice_geometries)).astype('int16')
        max_delta=0
        for dx in range(2):
            for dy in range(2):
                tile=np.asarray(Image.open(out/str(z)/str(x+dx)/f'{y+dy}.png')).astype('int16')
                section=reference[dy*256:(dy+1)*256,dx*256:(dx+1)*256]
                visible=(tile[:,:,3]>250)&(section[:,:,3]>250)
                delta=np.abs(tile[:,:,:3]-section[:,:,:3])[visible]
                max_delta=max(max_delta,int(delta.max()) if delta.size else 0)
        assert max_delta<=1,(lon,lat,max_delta)
        print(f'2x2 versus independent 512px render at {lon},{lat}: max visible RGB delta {max_delta}/255')
for name,lon,lat,is_land in [('Madrid',-3.7,40.4,True),('Paris',2.35,48.85,True),('Rome',12.5,41.9,True),('Sahara',10,25,True),('Alps',9,46.5,True),('Mediterranean',7,38,False),('Biscay',-5,46,False)]:
    n=2**z
    import math
    tx=(lon+180)/360*n;ty=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    im=Image.open(out/str(z)/str(int(tx))/f'{int(ty)}.png')
    color=im.getpixel((int(tx%1*256),int(ty%1*256)))
    assert (color[3]>250)==is_land,(name,color)
    print(name,color)
print(f'Validated {len(files)} real PNG tiles, class preservation, seam equivalence and coast samples.')

# Coastline alpha must be identical to the original regional prototype.
baseline=b.ROOT/'.biome-data/tiles/pnv-v2'
if baseline.exists():
    for f in files:
        with Image.open(baseline/f.relative_to(out)) as old, Image.open(f) as new:
            assert np.array_equal(np.asarray(old)[:,:,3],np.asarray(new)[:,:,3]),f
    with rio.open(baseline/'classes.tif') as old, rio.open(out/'classes.tif') as new:
        assert np.array_equal(old.read(1),new.read(1))
    print('All tile alpha masks and original class arrays identical to baseline.')
from materials import geographic_noise
for lat in [0,35,80]:
    assert np.allclose(geographic_noise(np.array([180.]),np.array([lat]),18),geographic_noise(np.array([-180.]),np.array([lat]),18),atol=1e-10)
print('Surface variation is continuous at the dateline.')
