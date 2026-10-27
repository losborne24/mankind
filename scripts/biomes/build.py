"""Bounded-memory XYZ renderer: nearest class sampling, RGB-only blur, padded tiles.
Build max zoom first, then alpha-weighted RGB parent pyramid. No ID averaging.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import time
import numpy as np
from PIL import Image
import rasterio as rio
from rasterio.features import rasterize, bounds as geometry_bounds
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform_geom, Resampling
from rasterio.windows import from_bounds as window_bounds, Window
from scipy.ndimage import gaussian_filter, distance_transform_edt
from materials import surface

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.biome-data/source'
HALF = 20037508.342789244
SIZE, PAD = 256, 16
ATTRIBUTION = ('Contains information from OpenLandMap / Hengl et al. (2018), '
               'doi:10.7910/DVN/QQHCIK, available under ODbL 1.0 '
               '(https://opendatacommons.org/licenses/odbl/1-0/). '
               'Natural Earth: public domain. Elevation: © Mapterhorn, '
               'https://mapterhorn.com/attribution. PNV is not a reconstruction of 3000 BCE.')

def tile_bounds(z,x,y):
    step=2*HALF/2**z
    return (-HALF+x*step, HALF-(y+1)*step, -HALF+(x+1)*step, HALF-y*step)

def tile_xy(lon,lat,z):
    n=2**z
    return (min(n-1,max(0,int((lon+180)/360*n))),
            min(n-1,max(0,int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n))))

def dem_mosaic(zoom=6):
    paths=list(SOURCE.glob(f'dem-{zoom}-*.webp'))
    if not paths: raise RuntimeError('Run fetch.py for regional Mapterhorn cache, or supply --dem EPSG:3857 GeoTIFF')
    indices=[tuple(map(int,p.stem.split('-')[2:])) for p in paths]
    x0,y0=min(x for x,y in indices),min(y for x,y in indices)
    x1,y1=max(x for x,y in indices),max(y for x,y in indices)
    output=SOURCE/f'dem-z{zoom}.tif'
    b0=tile_bounds(zoom,x0,y1); b1=tile_bounds(zoom,x1,y0)
    shape=((y1-y0+1)*512,(x1-x0+1)*512)
    with rio.open(output,'w',driver='GTiff',width=shape[1],height=shape[0],count=1,dtype='float32',crs='EPSG:3857',transform=from_bounds(b0[0],b0[1],b1[2],b1[3],shape[1],shape[0]),nodata=-9999,compress='deflate',tiled=True) as dst:
        dst.write(np.full(shape,-9999,dtype='float32'),1)
        for p,(x,y) in zip(paths,indices):
            a=np.asarray(Image.open(p)).astype('float32')
            elevation=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
            dst.write(elevation,1,window=Window((x-x0)*512,(y-y0)*512,512,512))
    return output

def fill_render_source(source, coverage):
    """Copy nearest classes into coastal nodata on a fixed source grid, once.
    This render-only intermediate is never the preserved classification product.
    64-cell halos cover coastal gaps; distant ocean values remain irrelevant.
    """
    w,s,e,n=coverage
    window=window_bounds(max(-180,w-2),max(source.bounds.bottom,s-2),min(180,e+2),min(source.bounds.top,n+2),source.transform).round_offsets().round_lengths().intersection(Window(0,0,source.width,source.height))
    path=SOURCE/('render-filled-'+hashlib.sha256(str(coverage).encode()).hexdigest()[:12]+'.tif')
    profile=source.profile.copy()
    profile.update(width=int(window.width),height=int(window.height),transform=source.window_transform(window),tiled=True,blockxsize=512,blockysize=512)
    with rio.open(path,'w',**profile) as dst:
        for _,core in dst.block_windows(1):
            read=Window(window.col_off+core.col_off-64,window.row_off+core.row_off-64,core.width+128,core.height+128)
            ids=source.read(1,window=read,boundless=True,fill_value=255)
            valid=(ids!=255)&(ids!=0)
            if valid.any():
                nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
                ids=ids[tuple(nearest)]
            dst.write(ids[64:-64,64:-64],1,window=core)
    return path

def projected_shapes(path):
    geometries=[]
    for f in json.loads(Path(path).read_text())['features']:
        g=f['geometry']
        for coords in g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]:
            projected=transform_geom('EPSG:4326','EPSG:3857',{'type':'Polygon','coordinates':coords})
            geometries.append((projected,geometry_bounds(projected)))
    return geometries

def coverage_mask(geometries,padded,n):
    candidates=[g for g,gb in geometries if gb[0]<padded[2] and gb[2]>padded[0] and gb[1]<padded[3] and gb[3]>padded[1]]
    if not candidates: return np.zeros((n,n),dtype='float32')
    mask=rasterize(((g,255) for g in candidates),out_shape=(n*2,n*2),transform=from_bounds(*padded,n*2,n*2),fill=0,dtype='uint8')
    return np.asarray(Image.fromarray(mask).resize((n,n),Image.Resampling.BOX)).astype('float32')

def render(source,dem,geometries,z,x,y,palette,coverage,variation,core_size=SIZE,settings=None,materials_palette=None,ice_geometries=()):
    settings=settings or json.loads(Path(__file__).with_name('surface.json').read_text())
    if materials_palette is None:
        colors=json.loads(Path(__file__).with_name('palette.json').read_text())
        materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
    b=tile_bounds(z,x,y); pixel=(b[2]-b[0])/SIZE
    b=(b[0],b[3]-core_size*pixel,b[0]+core_size*pixel,b[3])
    padded=(b[0]-PAD*pixel,b[1]-PAD*pixel,b[2]+PAD*pixel,b[3]+PAD*pixel)
    n=core_size+2*PAD
    transform=from_bounds(*padded,n,n)
    ids=np.full((n,n),255,dtype='uint8')
    reproject(rio.band(source,1),ids,src_nodata=255,dst_nodata=255,dst_transform=transform,dst_crs='EPSG:3857',resampling=Resampling.nearest)
    valid=(ids!=255)&(ids!=0)
    unknown=set(np.unique(ids[valid]))-set(palette)
    if unknown: raise ValueError(f'Unmapped classes {unknown}')
    if not valid.any(): return Image.new('RGBA',(core_size,core_size))
    # Fill ocean/nodata only in render buffer, before RGB smoothing. Never alter IDs.
    nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
    filled=ids[tuple(nearest)]
    # Supersample categorical coverage before mapping colours. Subpixel cells
    # contribute RGB area, never averaged numeric IDs. This avoids stair steps
    # when a narrower blend is overzoomed, without another runtime tile level.
    fine_ids=np.full((n*2,n*2),255,dtype='uint8')
    reproject(rio.band(source,1),fine_ids,src_nodata=255,dst_nodata=255,
              dst_transform=from_bounds(*padded,n*2,n*2),dst_crs='EPSG:3857',resampling=Resampling.nearest)
    fine_valid=(fine_ids!=255)&(fine_ids!=0)
    if fine_valid.any():
        nearest=distance_transform_edt(~fine_valid,return_distances=False,return_indices=True)
        fine_ids=fine_ids[tuple(nearest)]
    unknown=set(np.unique(fine_ids))-set(palette)
    if unknown: raise ValueError(f'Unmapped supersampled classes {unknown}')
    rgb=np.zeros((n*2,n*2,3),dtype='float32')
    for k,color in palette.items(): rgb[fine_ids==k]=color
    # Fixed world distance, not an increasing blur footprint at lower tile zooms.
    sigma=settings['blend_metres_mercator']/pixel
    if math.ceil(sigma*4)>PAD: raise ValueError('Blend support exceeds tile padding')
    rgb=gaussian_filter(rgb,(sigma*2,sigma*2,0),mode='nearest',truncate=4)
    rgb=rgb.reshape(n,2,n,2,3).mean(axis=(1,3))
    gx=x*SIZE+np.arange(-PAD,core_size+PAD)+.5
    gy=y*SIZE+np.arange(-PAD,core_size+PAD)+.5
    lon=np.broadcast_to(gx[None,:]/(SIZE*2**z)*360-180,(n,n))
    lat=np.broadcast_to(np.degrees(np.arctan(np.sinh(math.pi*(1-2*gy[:,None]/(SIZE*2**z))))),(n,n))
    h=np.full((n,n),-9999,dtype='float32')
    reproject(rio.band(dem,1),h,dst_transform=transform,dst_crs='EPSG:3857',src_nodata=-9999,dst_nodata=-9999,resampling=Resampling.bilinear)
    rgb=surface(rgb,filled,h,pixel,lon,lat,materials_palette,settings,variation)
    # Mapped glaciated areas, including recently deglaciated land: a restrained
    # cartographic ice cue, never a universal altitude-based snow threshold.
    ice=coverage_mask(ice_geometries,padded,n)/255*settings['ice_strength']
    rgb=rgb*(1-ice[:,:,None])+np.array(materials_palette['ice'])*ice[:,:,None]
    # 2x coverage antialiasing; alpha never blurred into sea.
    alpha=coverage_mask(geometries,padded,n)
    west,south,east,north=coverage
    fade=np.clip(np.minimum.reduce([lon-west,east-lon,lat-south,north-lat]),0,1)
    alpha*=fade
    rgba=np.dstack([np.clip(rgb,0,255).astype('uint8'),alpha.astype('uint8')])
    return Image.fromarray(rgba[PAD:-PAD,PAD:-PAD])

def parent(children):
    canvas=Image.new('RGBA',(SIZE*2,SIZE*2))
    for (dx,dy),im in children: canvas.paste(im,(dx*SIZE,dy*SIZE))
    # Pillow's RGBA resize uses premultiplied alpha, avoiding dark ocean fringes.
    return canvas.resize((SIZE,SIZE),Image.Resampling.BOX)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--bounds',nargs=4,type=float,default=[-18,17,41,56],metavar=('W','S','E','N'))
    p.add_argument('--maxzoom',type=int,default=7)
    p.add_argument('--output',type=Path,default=ROOT/'.biome-data/tiles/pnv-v4')
    p.add_argument('--dem',type=Path)
    p.add_argument('--variation',type=float,default=None)
    args=p.parse_args()
    w,s,e,n=args.bounds
    if not (-180<=w<e<=180 and -85.051<=s<n<=85.051): p.error('Use non-wrapping Web Mercator bounds')
    if not 1<=args.maxzoom<=9: p.error('maxzoom must be 1–9 for this 1 km product')
    if args.dem is None and (w < -18 or s < 17 or e > 41 or n > 56):
        p.error("Coverage beyond prototype requires --dem with matching EPSG:3857 Mapterhorn coverage")
    out=args.output
    if out.exists(): raise RuntimeError('Use a fresh versioned output directory; never overwrite cached tiles')
    out.mkdir(parents=True)
    start=time.monotonic()
    colors=json.loads((Path(__file__).with_name('palette.json')).read_text())
    settings=json.loads(Path(__file__).with_name('surface.json').read_text())
    variation=args.variation if args.variation is not None else settings['variation_strength']
    materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
    palette={int(k):tuple(bytes.fromhex(v[1:])) for k,v in colors.items() if k.isdigit()}
    # Same pinned 10m coastline as app; split global multipolygons for cheap bbox indexing.
    geometries=projected_shapes(SOURCE/'ne_10m_land.geojson')
    ice_geometries=projected_shapes(SOURCE/'ne_10m_glaciated_areas.geojson')
    with rio.open(SOURCE/'pnv-1km.tif') as original:
        render_path=fill_render_source(original,args.bounds)
    with rio.open(SOURCE/'pnv-1km.tif') as src, rio.open(render_path) as filled_src, rio.open(args.dem or dem_mosaic()) as dem:
        # Separate unmodified categorical crop; streamed blocks, no colour blending.
        win=window_bounds(w,s,e,n,src.transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height))
        profile=src.profile.copy(); profile.update(width=int(win.width),height=int(win.height),transform=src.window_transform(win),tiled=True,blockxsize=256,blockysize=256)
        with rio.open(out/'classes.tif','w',**profile) as dst:
            for _,block in dst.block_windows(1):
                dst.write(src.read(1,window=Window(win.col_off+block.col_off,win.row_off+block.row_off,block.width,block.height)),1,window=block)
        z=args.maxzoom
        x0,y1=tile_xy(w,s,z); x1,y0=tile_xy(e,n,z)
        tiles=set()
        for x in range(x0,x1+1):
            for y in range(y0,y1+1):
                im=render(filled_src,dem,geometries,z,x,y,palette,args.bounds,variation,settings=settings,materials_palette=materials_palette,ice_geometries=ice_geometries)
                path=out/str(z)/str(x)/f'{y}.png'; path.parent.mkdir(parents=True,exist_ok=True)
                im.save(path,optimize=True); tiles.add((x,y))
            print(f'z{z}: column {x-x0+1}/{x1-x0+1}',flush=True)
        count=len(tiles)
        for z in range(args.maxzoom-1,-1,-1):
            parents={(x//2,y//2) for x,y in tiles}
            for x,y in parents:
                children=[]
                for dx in range(2):
                    for dy in range(2):
                        path=out/str(z+1)/str(x*2+dx)/f'{y*2+dy}.png'
                        if path.exists():
                            with Image.open(path) as im: children.append(((dx,dy),im.copy()))
                path=out/str(z)/str(x)/f'{y}.png';path.parent.mkdir(parents=True,exist_ok=True)
                parent(children).save(path,optimize=True)
            tiles=parents;count+=len(tiles)
    for name in ['classes.csv','metadata.json','README-upstream.md']:
        shutil.copy(SOURCE/name,out/name)
    shutil.copy(__file__,out/'build.py')
    for name in ['materials.py','surface.json','requirements.txt']:
        shutil.copy(Path(__file__).with_name(name),out/name)
    shutil.copy(SOURCE/'ne_10m_glaciated_areas.geojson',out/'ne_10m_glaciated_areas.geojson')
    shutil.copy(Path(__file__).with_name('palette.json'),out/'palette.json')
    (out/'NOTICE.txt').write_text(ATTRIBUTION+'\nDerivative categorical data is offered under ODbL 1.0.\n')
    manifest={'tilejson':'3.0.0','name':'MANKIND OpenLandMap PNV regional prototype','scheme':'xyz','format':'png','tileSize':256,'minzoom':0,'maxzoom':args.maxzoom,'bounds':args.bounds,'tiles':['{z}/{x}/{y}.png'],'attribution':ATTRIBUTION,'tileCount':count,'tileBytes':sum(p.stat().st_size for p in out.glob('*/*/*.png')),'seconds':round(time.monotonic()-start,2),'sourceMD5':hashlib.md5((SOURCE/'pnv-1km.tif').read_bytes()).hexdigest(),'variation':variation,'palette':colors,'surface':settings,'demFile':str(args.dem or SOURCE/'dem-z6.tif'),'iceSource':'Natural Earth v5.1.2 glaciated areas (public domain), includes recently deglaciated land'}
    (out/'tilejson.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps(manifest,indent=2))

if __name__=='__main__': main()
