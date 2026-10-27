"""Bounded-memory XYZ renderer: nearest class sampling, RGB-only blur, padded tiles.
Build max zoom first, then alpha-weighted RGB parent pyramid. No ID averaging.

Regional (default) and global runs share one algorithm. Web Mercator x beyond
+-HALF is wrapped by PROJ onto the opposite side of the dateline, so the padded
blur footprint of an edge tile reads real neighbouring data rather than nodata.
"""
import argparse
import hashlib
import json
import math
import multiprocessing as mp
import os
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
# Source nodata fill reach, in native 1 km cells, and the processing chunk it
# is computed in. Both are part of the output definition: changing either moves
# coastal nodata colours, so they stay fixed across regional and global runs.
FILL_HALO, FILL_CHUNK = 64, 512
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

def dem_mosaic(zoom=6, region=None):
    """Assemble cached Mapterhorn Terrarium tiles into one EPSG:3857 GeoTIFF.

    Written block by block: a global z6 mosaic is 32768 x 32768 float32, far
    larger than memory. Missing (ocean) tiles stay nodata, never sea level.
    """
    paths=sorted(SOURCE.glob(f'dem-{zoom}-*.webp'))
    if not paths: raise RuntimeError('Run fetch.py for a Mapterhorn cache, or supply --dem EPSG:3857 GeoTIFF')
    indices={tuple(map(int,p.stem.split('-')[2:])):p for p in paths}
    if region=='global':
        x0,y0,x1,y1=0,0,2**zoom-1,2**zoom-1
        output=SOURCE/f'dem-z{zoom}-global.tif'
    else:
        xs=[x for x,y in indices]; ys=[y for x,y in indices]
        x0,y0,x1,y1=min(xs),min(ys),max(xs),max(ys)
        output=SOURCE/f'dem-z{zoom}.tif'
    if output.exists(): return output
    b0=tile_bounds(zoom,x0,y1); b1=tile_bounds(zoom,x1,y0)
    shape=((y1-y0+1)*512,(x1-x0+1)*512)
    empty=np.full((512,512),-9999,dtype='float32')
    part=output.with_suffix('.part.tif')
    with rio.open(part,'w',driver='GTiff',width=shape[1],height=shape[0],count=1,dtype='float32',crs='EPSG:3857',transform=from_bounds(b0[0],b0[1],b1[2],b1[3],shape[1],shape[0]),nodata=-9999,compress='deflate',tiled=True,blockxsize=512,blockysize=512,BIGTIFF='IF_SAFER') as dst:
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                path=indices.get((x,y))
                if path is None:
                    elevation=empty
                else:
                    a=np.asarray(Image.open(path)).astype('float32')
                    elevation=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
                dst.write(elevation,1,window=Window((x-x0)*512,(y-y0)*512,512,512))
            print(f'DEM mosaic row {y-y0+1}/{y1-y0+1}',flush=True)
    part.replace(output)
    return output

def data_extent(source):
    """Latitude band that actually carries classes, cached beside the source.

    The raster's nominal top is 87.37°N but its northernmost valid row is well
    south of that. Clipping to the nominal extent would let the per-tile nodata
    fill pull vegetation colours onto uncovered Arctic land.
    """
    cache=SOURCE/'pnv-extent.json'
    if cache.exists():
        stored=json.loads(cache.read_text())
        if stored.get('width')==source.width and stored.get('height')==source.height:
            return stored['north'],stored['south']
    rows=[]
    for row in range(0,source.height,512):
        height=min(512,source.height-row)
        block=source.read(1,window=Window(0,row,source.width,height))
        present=((block!=255)&(block!=0)).any(axis=1)
        rows.extend(row+int(i) for i in np.nonzero(present)[0])
    if not rows: raise RuntimeError('Source raster carries no classes')
    top=source.transform.f+rows[0]*source.transform.e
    bottom=source.transform.f+(rows[-1]+1)*source.transform.e
    cache.write_text(json.dumps({'width':source.width,'height':source.height,
                                 'north':top,'south':bottom,'firstRow':rows[0],'lastRow':rows[-1]},indent=2))
    return top,bottom

def read_cells(source,col_off,row_off,width,height,wrap):
    """Read native source cells, wrapping columns when the raster spans 360°."""
    if not wrap:
        return source.read(1,window=Window(col_off,row_off,width,height),boundless=True,fill_value=255)
    out=np.full((height,width),255,dtype='uint8')
    at,column,remaining=0,col_off,width
    while remaining>0:
        start=column%source.width
        take=min(remaining,source.width-start)
        out[:,at:at+take]=source.read(1,window=Window(start,row_off,take,height),boundless=True,fill_value=255)
        at+=take; column+=take; remaining-=take
    return out

def fill_render_path(window):
    """Cache key is the resolved source window, which is what decides the
    contents: two runs whose bounds land on the same cells share the file."""
    key=f'{int(window.col_off)}-{int(window.row_off)}-{int(window.width)}-{int(window.height)}-{FILL_HALO}-{FILL_CHUNK}'
    return SOURCE/('render-filled-'+hashlib.sha256(key.encode()).hexdigest()[:12]+'.tif')

def fill_coverage(bounds, whole_world, source):
    """Window to fill. A global run uses the fixed Web Mercator span so the
    intermediate is reused when the data-extent clip is refined."""
    if not whole_world: return tuple(bounds)
    return (-180.0,max(source.bounds.bottom,-85.0511),180.0,85.0511)

def fill_render_source(source, coverage):
    """Copy nearest classes into coastal nodata on a fixed source grid, once.
    This render-only intermediate is never the preserved classification product.
    64-cell halos cover coastal gaps; distant ocean values remain irrelevant.
    Columns wrap on a 360° source so the dateline is not a fill discontinuity.
    """
    w,s,e,n=coverage
    window=window_bounds(max(-180,w-2),max(source.bounds.bottom,s-2),min(180,e+2),min(source.bounds.top,n+2),source.transform).round_offsets().round_lengths().intersection(Window(0,0,source.width,source.height))
    path=fill_render_path(window)
    if path.exists(): return path
    wrap=abs(source.width*source.transform.a-360)<1e-6
    profile=source.profile.copy()
    profile.update(width=int(window.width),height=int(window.height),transform=source.window_transform(window),tiled=True,blockxsize=FILL_CHUNK,blockysize=FILL_CHUNK,compress='deflate',BIGTIFF='IF_SAFER')
    part=path.with_suffix('.part.tif')
    with rio.open(part,'w',**profile) as dst:
        blocks=[core for _,core in dst.block_windows(1)]
        for done,core in enumerate(blocks,1):
            ids=read_cells(source,window.col_off+core.col_off-FILL_HALO,window.row_off+core.row_off-FILL_HALO,
                           core.width+2*FILL_HALO,core.height+2*FILL_HALO,wrap)
            valid=(ids!=255)&(ids!=0)
            if valid.any():
                nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
                ids=ids[tuple(nearest)]
            dst.write(ids[FILL_HALO:-FILL_HALO,FILL_HALO:-FILL_HALO],1,window=core)
            if done%200==0 or done==len(blocks): print(f'Nodata fill block {done}/{len(blocks)}',flush=True)
    part.replace(path)
    return path

def reproject_world(band,out,padded,n,nodata,resampling):
    """Reproject one already-projected raster into the padded tile grid.

    A 4326 source is wrapped by PROJ, but EPSG:3857 -> EPSG:3857 is a plain
    affine resample with no longitude wrapping, so a padded grid overhanging the
    dateline would read nodata. Fill those cells from a second pass shifted one
    world width across; cells inside the world are already filled and untouched.
    """
    def once(offset,target):
        reproject(band,target,src_nodata=nodata,dst_nodata=nodata,
                  dst_transform=from_bounds(padded[0]+offset,padded[1],padded[2]+offset,padded[3],n,n),
                  dst_crs='EPSG:3857',resampling=resampling)
    once(0.0,out)
    for offset in ([2*HALF] if padded[0]<-HALF else [])+([-2*HALF] if padded[2]>HALF else []):
        extra=np.full_like(out,nodata)
        once(offset,extra)
        hole=out==nodata
        out[hole]=extra[hole]

def projected_shapes(path):
    """Split multipolygons and keep a numpy bbox table for vectorized indexing."""
    geometries,boxes=[],[]
    for f in json.loads(Path(path).read_text())['features']:
        g=f['geometry']
        for coords in g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]:
            projected=transform_geom('EPSG:4326','EPSG:3857',{'type':'Polygon','coordinates':coords})
            geometries.append(projected); boxes.append(geometry_bounds(projected))
    return (geometries,np.array(boxes,dtype='float64').reshape(-1,4))

def coverage_mask(shapes,padded,n):
    """Antialiased 0–255 area coverage of the shapes over the padded tile grid."""
    geometries,boxes=shapes
    if not geometries: return np.zeros((n,n),dtype='float32')
    total=None
    # A padded grid may overhang the dateline; the shapes there are one world across.
    offsets=[0.0]+([2*HALF] if padded[0]<-HALF else [])+([-2*HALF] if padded[2]>HALF else [])
    for offset in offsets:
        box=(padded[0]+offset,padded[1],padded[2]+offset,padded[3])
        keep=np.nonzero((boxes[:,0]<box[2])&(boxes[:,2]>box[0])&(boxes[:,1]<box[3])&(boxes[:,3]>box[1]))[0]
        if not keep.size: continue
        mask=rasterize(((geometries[i],255) for i in keep),out_shape=(n*2,n*2),transform=from_bounds(*box,n*2,n*2),fill=0,dtype='uint8')
        total=mask if total is None else np.maximum(total,mask)
    if total is None: return np.zeros((n,n),dtype='float32')
    return np.asarray(Image.fromarray(total).resize((n,n),Image.Resampling.BOX)).astype('float32')

def land_occupancy(shapes,z):
    """One bit per tile: does any mapped land touch it? Skips ocean-only work."""
    n=2**z
    return rasterize(((g,1) for g in shapes[0]),out_shape=(n,n),transform=from_bounds(-HALF,-HALF,HALF,HALF,n,n),fill=0,dtype='uint8',all_touched=True)

def render(source,dem,geometries,z,x,y,palette,coverage,variation,core_size=SIZE,settings=None,materials_palette=None,ice_geometries=(),edge_fade=1.0,polar_ice=False,original=None):
    settings=settings or json.loads(Path(__file__).with_name('surface.json').read_text())
    if materials_palette is None:
        colors=json.loads(Path(__file__).with_name('palette.json').read_text())
        materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
    b=tile_bounds(z,x,y); pixel=(b[2]-b[0])/SIZE
    b=(b[0],b[3]-core_size*pixel,b[0]+core_size*pixel,b[3])
    padded=(b[0]-PAD*pixel,b[1]-PAD*pixel,b[2]+PAD*pixel,b[3]+PAD*pixel)
    n=core_size+2*PAD
    transform=from_bounds(*padded,n,n)
    west,south,east,north=coverage
    gx=x*SIZE+np.arange(-PAD,core_size+PAD)+.5
    gy=y*SIZE+np.arange(-PAD,core_size+PAD)+.5
    lon=np.broadcast_to(gx[None,:]/(SIZE*2**z)*360-180,(n,n))
    lat=np.broadcast_to(np.degrees(np.arctan(np.sinh(math.pi*(1-2*gy[:,None]/(SIZE*2**z))))),(n,n))
    # Coverage is tested against true geographic longitude, so a padded grid
    # overhanging the dateline is clipped by where it really is, not by ±180.
    clip_lon=np.where(np.abs(lon)<=180,lon,(lon+180)%360-180)
    # Regional prototypes fade out over edge_fade degrees. A global run uses a
    # hard clip at the real source extent: no fade band, and no vegetation
    # colour invented south of the PNV data limit.
    if edge_fade>0:
        inside=np.clip(np.minimum.reduce([(clip_lon-west)/edge_fade,(east-clip_lon)/edge_fade,(lat-south)/edge_fade,(north-lat)/edge_fade]),0,1)
    else:
        inside=((clip_lon>=west)&(clip_lon<=east)&(lat>=south)&(lat<=north)).astype('float32')
    ice_cover=coverage_mask(ice_geometries,padded,n)/255
    alpha=coverage_mask(geometries,padded,n)
    ids=np.full((n,n),255,dtype='uint8')
    reproject(rio.band(source,1),ids,src_nodata=255,dst_nodata=255,dst_transform=transform,dst_crs='EPSG:3857',resampling=Resampling.nearest)
    valid=(ids!=255)&(ids!=0)
    unknown=set(np.unique(ids[valid]))-set(palette)
    if unknown: raise ValueError(f'Unmapped classes {unknown}')
    # Mapped glacier land the source gives no class for — the Greenland ice
    # sheet interior, Antarctica, Arctic and Patagonian icefields — keeps the
    # pale ice accent rather than becoming a hole or taking a vegetation colour
    # dragged in from elsewhere. Natural Earth glacier extent only: never a
    # substituted vegetation class, never an altitude snow rule.
    #
    # This tests the UNFILLED archive, not `valid`. `source` is the render-only
    # intermediate whose coastal nodata fill is computed on a fixed 512-cell
    # lattice; keying the ice off that lattice painted the Greenland ice sheet
    # with visible rectangles of pure ice against ice-blended-over-tundra.
    # Against the real archive the boundary follows the actual data edge, and
    # mountain glaciers keep the approved partial blend over their own classes.
    if polar_ice:
        uncovered=1-inside
        if original is not None:
            archive=np.full((n,n),255,dtype='uint8')
            reproject(rio.band(original,1),archive,src_nodata=255,dst_nodata=255,
                      dst_transform=transform,dst_crs='EPSG:3857',resampling=Resampling.nearest)
            uncovered=np.maximum(uncovered,((archive==255)|(archive==0)).astype('float32'))
        polar=alpha/255*ice_cover*uncovered
    else:
        polar=np.zeros((n,n),dtype='float32')
    if not valid.any():
        if not polar.any(): return None
        rgba=np.dstack([np.broadcast_to(np.array(materials_palette['ice'],dtype='uint8'),(n,n,3)),
                        np.clip(polar*255,0,255).astype('uint8')])
        return Image.fromarray(np.ascontiguousarray(rgba[PAD:-PAD,PAD:-PAD]))
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
    h=np.full((n,n),-9999,dtype='float32')
    reproject_world(rio.band(dem,1),h,padded,n,-9999,Resampling.bilinear)
    rgb=surface(rgb,filled,h,pixel,lon,lat,materials_palette,settings,variation)
    # Mapped glaciated areas, including recently deglaciated land: a restrained
    # cartographic ice cue, never a universal altitude-based snow threshold.
    ice=ice_cover*settings['ice_strength']
    rgb=rgb*(1-ice[:,:,None])+np.array(materials_palette['ice'])*ice[:,:,None]
    # 2x coverage antialiasing; alpha never blurred into sea.
    alpha=alpha*inside
    if polar.any():
        rgb=np.where((polar>0)[:,:,None],np.array(materials_palette['ice'],dtype='float32'),rgb)
        alpha=np.maximum(alpha,polar*255)
    rgba=np.dstack([np.clip(rgb,0,255).astype('uint8'),alpha.astype('uint8')])
    return Image.fromarray(np.ascontiguousarray(rgba[PAD:-PAD,PAD:-PAD]))

def parent(children):
    canvas=Image.new('RGBA',(SIZE*2,SIZE*2))
    for (dx,dy),im in children: canvas.paste(im,(dx*SIZE,dy*SIZE))
    # Pillow's RGBA resize uses premultiplied alpha, avoiding dark ocean fringes.
    return canvas.resize((SIZE,SIZE),Image.Resampling.BOX)

SAVE={'png':dict(format='PNG',optimize=True),'webp':dict(format='WEBP',lossless=True,quality=100,method=6)}

def save(image,path,fmt):
    part=path.with_suffix(path.suffix+'.part')
    image.save(part,**SAVE[fmt])
    part.replace(path)

JOB=None

def worker_init(job):
    global JOB
    os.environ.setdefault('GDAL_CACHEMAX','256')
    JOB=dict(job)
    JOB['render_src']=rio.open(job['render_path'])
    JOB['dem']=rio.open(job['dem_path'])
    # Tiled copy of the unaltered archive, for "did the source really have a
    # class here?" without random-reading the striped original raster.
    JOB['original']=rio.open(job['classes_path']) if job.get('classes_path') else None
    JOB['land']=projected_shapes(SOURCE/'ne_10m_land.geojson')
    JOB['ice']=projected_shapes(SOURCE/'ne_10m_glaciated_areas.geojson')

def build_parent(task):
    """One parent tile from whichever of its four children exist."""
    level,x,y=task
    out=Path(JOB['out']); fmt=JOB['format']
    children=[]
    for dx in range(2):
        for dy in range(2):
            path=out/str(level+1)/str(x*2+dx)/f'{y*2+dy}.{fmt}'
            if path.exists():
                with Image.open(path) as im: children.append(((dx,dy),im.convert('RGBA')))
    path=out/str(level)/str(x)/f'{y}.{fmt}'
    path.parent.mkdir(parents=True,exist_ok=True)
    save(parent(children),path,fmt)
    return 1

def render_column(task):
    """One max-zoom tile column. Returns the rows actually written."""
    x,rows=task
    j=JOB; out=Path(j['out']); z=j['maxzoom']; fmt=j['format']
    written=[]
    for y in rows:
        path=out/str(z)/str(x)/f'{y}.{fmt}'
        if path.exists():
            written.append(y); continue
        image=render(j['render_src'],j['dem'],j['land'],z,x,y,j['palette'],j['bounds'],j['variation'],
                     settings=j['settings'],materials_palette=j['materials'],ice_geometries=j['ice'],
                     edge_fade=j['edge_fade'],polar_ice=j['polar_ice'],original=j['original'])
        # Fully transparent results are not stored. Every ancestor is transparent
        # in the same area, so a 404 can never reveal a wrong parent colour.
        # Tested on alpha alone: ocean pixels can carry an invisible fill colour.
        if image is None or not np.asarray(image)[:,:,3].any(): continue
        path.parent.mkdir(parents=True,exist_ok=True)
        save(image,path,fmt)
        written.append(y)
    return x,written

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bounds',nargs=4,type=float,default=[-18,17,41,56],metavar=('W','S','E','N'))
    p.add_argument('--global',dest='whole_world',action='store_true',help='Cover the full PNV source extent clipped to Web Mercator')
    p.add_argument('--maxzoom',type=int,default=7)
    p.add_argument('--format',choices=['png','webp'],default='png')
    p.add_argument('--output',type=Path,default=ROOT/'.biome-data/tiles/pnv-v4')
    p.add_argument('--dem',type=Path)
    p.add_argument('--dem-zoom',type=int,default=6)
    p.add_argument('--variation',type=float,default=None)
    p.add_argument('--edge-fade',type=float,default=None,metavar='DEGREES',help='Regional coverage fade; 0 clips hard at the source extent')
    p.add_argument('--polar-ice',dest='polar_ice',action='store_true',default=None,help='Paint mapped glacier land beyond the PNV extent with the ice accent')
    p.add_argument('--no-polar-ice',dest='polar_ice',action='store_false')
    p.add_argument('--workers',type=int,default=1)
    p.add_argument('--resume',action='store_true',help='Continue an interrupted run in an existing output directory')
    p.add_argument('--only-columns',nargs=2,type=int,metavar=('FIRST','LAST'),help='Restrict max-zoom work to a tile column range')
    p.add_argument('--skip-classes',action='store_true',help='Do not re-copy the categorical archive')
    args=p.parse_args()
    if args.whole_world:
        # Clip to the latitudes that really carry classes, intersected with the
        # Web Mercator limit. Land outside that band has no source data and
        # deliberately stays transparent (or mapped glacier ice).
        with rio.open(SOURCE/'pnv-1km.tif') as probe: north,south=data_extent(probe)
        args.bounds=[-180.0,max(south,-85.0511),180.0,min(north,85.0511)]
        print(f'PNV classes span {south:.4f}°–{north:.4f}°; using bounds {args.bounds}')
        if args.edge_fade is None: args.edge_fade=0.0
        if args.polar_ice is None: args.polar_ice=True
    if args.edge_fade is None: args.edge_fade=1.0
    if args.polar_ice is None: args.polar_ice=False
    w,s,e,n=args.bounds
    if not (-180<=w<e<=180 and -85.0511<=s<n<=85.0511): p.error('Use non-wrapping Web Mercator bounds')
    if not 1<=args.maxzoom<=9: p.error('maxzoom must be 1–9 for this 1 km product')
    regional=(w,s,e,n)==(-18,17,41,56)
    if args.dem is None and not regional and not args.whole_world:
        p.error('Coverage beyond the prototype or the full globe requires --dem with matching EPSG:3857 Mapterhorn coverage')
    out=args.output
    if out.exists() and not args.resume:
        raise RuntimeError(f'{out} exists. Use a fresh versioned output directory, or --resume to continue it.')
    out.mkdir(parents=True,exist_ok=True)
    start=time.monotonic()
    fmt=args.format
    colors=json.loads((Path(__file__).with_name('palette.json')).read_text())
    settings=json.loads(Path(__file__).with_name('surface.json').read_text())
    variation=args.variation if args.variation is not None else settings['variation_strength']
    materials_palette={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
    palette={int(k):tuple(bytes.fromhex(v[1:])) for k,v in colors.items() if k.isdigit()}
    # Same pinned 10m coastline as app; split global multipolygons for cheap bbox indexing.
    land_shapes=projected_shapes(SOURCE/'ne_10m_land.geojson')
    with rio.open(SOURCE/'pnv-1km.tif') as original:
        render_path=fill_render_source(original,fill_coverage(args.bounds,args.whole_world,original))
    dem_path=args.dem or dem_mosaic(args.dem_zoom,'global' if args.whole_world else None)
    z=args.maxzoom
    # `bounds` clips the vegetation data. Mapped polar glacier land lies south of
    # it, so the published/iterated tile extent can be taller than the data.
    published=[w,-85.0511 if args.polar_ice else s,e,85.0511 if args.polar_ice else n]
    x0,y1=tile_xy(published[0],published[1],z); x1,y0=tile_xy(published[2],published[3],z)
    occupancy=land_occupancy(land_shapes,z)
    columns=[]
    for x in range(x0,x1+1):
        if args.only_columns and not args.only_columns[0]<=x<=args.only_columns[1]: continue
        rows=[y for y in range(y0,y1+1) if occupancy[y,x]]
        if rows: columns.append((x,rows))
    candidates=sum(len(r) for _,r in columns)
    print(f'{len(columns)} columns, {candidates} land-touching candidate tiles at z{z} '
          f'(of {(x1-x0+1)*(y1-y0+1)} in bounds); ocean-only tiles are skipped.',flush=True)
    if not args.skip_classes:
        with rio.open(SOURCE/'pnv-1km.tif') as src:
            # Separate unmodified categorical crop; streamed row bands, no colour blending.
            win=window_bounds(w,s,e,n,src.transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height))
            profile=src.profile.copy(); profile.update(width=int(win.width),height=int(win.height),transform=src.window_transform(win),tiled=True,blockxsize=256,blockysize=256,compress='deflate',BIGTIFF='IF_SAFER')
            part=(out/'classes.tif').with_suffix('.part.tif')
            with rio.open(part,'w',**profile) as dst:
                for row in range(0,int(win.height),512):
                    height=min(512,int(win.height)-row)
                    dst.write(src.read(1,window=Window(win.col_off,win.row_off+row,int(win.width),height)),1,
                              window=Window(0,row,int(win.width),height))
            part.replace(out/'classes.tif')
        print('Categorical archive written.',flush=True)
    classes_path=out/'classes.tif'
    if args.polar_ice and not classes_path.exists():
        p.error('Polar ice needs the categorical archive; rerun without --skip-classes')
    job={'out':str(out),'maxzoom':z,'format':fmt,'render_path':str(render_path),'dem_path':str(dem_path),
         'classes_path':str(classes_path) if args.polar_ice else None,
         'palette':palette,'bounds':list(args.bounds),'variation':variation,'settings':settings,
         'materials':materials_palette,'edge_fade':args.edge_fade,'polar_ice':args.polar_ice}
    tiles=set()
    done=0
    report=max(1,len(columns)//100)
    def account(result):
        nonlocal done
        x,rows=result
        tiles.update((x,y) for y in rows)
        done+=1
        if done%report==0 or done==len(columns):
            elapsed=time.monotonic()-start
            print(f'z{z}: {done}/{len(columns)} columns, {len(tiles)} tiles kept, '
                  f'{elapsed:.0f}s elapsed, ~{elapsed/done*(len(columns)-done):.0f}s left',flush=True)
    def pyramid(mapper):
        if args.only_columns:
            print(f'Column range complete: {len(tiles)} tiles. Rerun with --resume and no --only-columns to build the pyramid.')
            return None
        # Existing max-zoom tiles on disk are the authority, so an interrupted
        # and resumed run produces the same pyramid as an uninterrupted one.
        level_tiles={(int(path.parent.name),int(path.stem)) for path in (out/str(z)).glob(f'*/*.{fmt}')}
        total=len(level_tiles)
        for level in range(z-1,-1,-1):
            parents=sorted({(x//2,y//2) for x,y in level_tiles})
            for _ in mapper(build_parent,[(level,x,y) for x,y in parents]): pass
            level_tiles=set(parents);total+=len(parents)
            print(f'z{level}: {len(parents)} parent tiles, {time.monotonic()-start:.0f}s elapsed',flush=True)
        return total
    if args.workers>1:
        context=mp.get_context('spawn')
        with context.Pool(args.workers,initializer=worker_init,initargs=(job,)) as pool:
            mapper=lambda fn,items: pool.imap_unordered(fn,items,chunksize=8)
            for result in pool.imap_unordered(render_column,columns,chunksize=1): account(result)
            count=pyramid(mapper)
    else:
        worker_init(job)
        for column in columns: account(render_column(column))
        count=pyramid(lambda fn,items: map(fn,items))
    if count is None: return
    for name in ['classes.csv','metadata.json','README-upstream.md']:
        shutil.copy(SOURCE/name,out/name)
    shutil.copy(__file__,out/'build.py')
    for name in ['materials.py','surface.json','requirements.txt']:
        shutil.copy(Path(__file__).with_name(name),out/name)
    shutil.copy(SOURCE/'ne_10m_glaciated_areas.geojson',out/'ne_10m_glaciated_areas.geojson')
    shutil.copy(Path(__file__).with_name('palette.json'),out/'palette.json')
    (out/'NOTICE.txt').write_text(ATTRIBUTION+'\nDerivative categorical data is offered under ODbL 1.0.\n')
    sizes=sorted(path.stat().st_size for path in out.glob(f'*/*/*.{fmt}'))
    manifest={'tilejson':'3.0.0','name':'MANKIND OpenLandMap PNV '+('global' if args.whole_world else 'regional prototype'),
        'scheme':'xyz','format':fmt,'tileSize':256,'minzoom':0,'maxzoom':z,
        # `bounds` is what MapLibre may request. `dataBounds` is the PNV source
        # extent that colours are clipped to; they differ when polar ice is on.
        'bounds':published,'dataBounds':args.bounds,
        'tiles':['{z}/{x}/{y}.'+fmt],'attribution':ATTRIBUTION,'tileCount':count,
        'tileBytes':sum(sizes),'maxTileBytes':sizes[-1] if sizes else 0,
        'medianTileBytes':sizes[len(sizes)//2] if sizes else 0,
        'candidateTiles':candidates,'oceanTilesSkipped':candidates-len(list((out/str(z)).glob(f'*/*.{fmt}'))),
        'seconds':round(time.monotonic()-start,2),'edgeFade':args.edge_fade,'polarIce':bool(args.polar_ice),
        'sourceMD5':hashlib.md5((SOURCE/'pnv-1km.tif').read_bytes()).hexdigest(),'variation':variation,
        'palette':colors,'surface':settings,'demFile':str(dem_path),'renderSource':str(render_path),
        'iceSource':'Natural Earth v5.1.2 glaciated areas (public domain), includes recently deglaciated land'}
    (out/'tilejson.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({k:v for k,v in manifest.items() if k not in ('palette','surface')},indent=2))

if __name__=='__main__': main()
