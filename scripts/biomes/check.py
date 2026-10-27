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
out=b.ROOT/(sys.argv[1] if len(sys.argv)>1 else '.biome-data/tiles/pnv-v2')
m=json.loads((out/'tilejson.json').read_text())
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
with rio.open(render_path) as src, rio.open(b.SOURCE/'dem.tif') as dem:
    for lon,lat in [(-3,41),(9,44),(24,34)]:
        x,y=b.tile_xy(lon,lat,7)
        reference=np.asarray(b.render(src,dem,geometries,7,x,y,palette,m['bounds'],m['variation'],core_size=512)).astype('int16')
        max_delta=0
        for dx in range(2):
            for dy in range(2):
                tile=np.asarray(Image.open(out/'7'/str(x+dx)/f'{y+dy}.png')).astype('int16')
                section=reference[dy*256:(dy+1)*256,dx*256:(dx+1)*256]
                visible=(tile[:,:,3]>250)&(section[:,:,3]>250)
                delta=np.abs(tile[:,:,:3]-section[:,:,:3])[visible]
                max_delta=max(max_delta,int(delta.max()) if delta.size else 0)
        assert max_delta<=1,(lon,lat,max_delta)
        print(f'2x2 versus independent 512px render at {lon},{lat}: max visible RGB delta {max_delta}/255')
for name,lon,lat,is_land in [('Madrid',-3.7,40.4,True),('Paris',2.35,48.85,True),('Rome',12.5,41.9,True),('Sahara',10,25,True),('Alps',9,46.5,True),('Mediterranean',7,38,False),('Biscay',-5,46,False)]:
    n=2**7
    import math
    tx=(lon+180)/360*n;ty=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    im=Image.open(out/'7'/str(int(tx))/f'{int(ty)}.png')
    color=im.getpixel((int(tx%1*256),int(ty%1*256)))
    assert (color[3]>250)==is_land,(name,color)
    print(name,color)
print(f'Validated {len(files)} real PNG tiles, class preservation, seam equivalence and coast samples.')
