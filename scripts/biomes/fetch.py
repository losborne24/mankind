"""Fetch original data only; never invoked by Next.js. Existing inputs verified.

Downloads are idempotent: an existing verified file is never re-fetched, so an
interrupted global DEM cache can simply be restarted.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / '.biome-data/source'
DATA.mkdir(parents=True, exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dem-zoom',type=int,choices=[5,6],default=6)
parser.add_argument('--global',dest='whole_world',action='store_true',
                    help='Cache every land-touching DEM tile worldwide instead of the prototype region')
parser.add_argument('--jobs',type=int,default=8,help='Parallel DEM downloads')
args=parser.parse_args()

def fetch(url, name, md5=None, sha256=None):
    path = DATA / name
    if not path.exists():
        subprocess.run(['curl', '-L', '--fail', '--retry', '3', url, '-o', str(path)+'.part'], check=True)
        Path(str(path)+'.part').replace(path)
    if md5:
        assert hashlib.md5(path.read_bytes()).hexdigest() == md5, name
    if sha256:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == sha256, name
    return path

fetch('https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/QQHCIK', 'metadata.json')
fetch('https://dataverse.harvard.edu/api/access/datafile/3137376', 'pnv-1km.tif', 'f707d9e958a919a8c964814ca59de80d')
fetch('https://dataverse.harvard.edu/api/access/datafile/3137372', 'classes.csv', '874f169f966e039935108bc366773f80')
fetch('https://raw.githubusercontent.com/Envirometrix/PNVmaps/master/README.md', 'README-upstream.md')
fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_land.geojson', 'ne_10m_land.geojson', sha256='1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416')
fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_glaciated_areas.geojson', 'ne_10m_glaciated_areas.geojson', sha256='04fd2303d5f0ece2cf482af19d06731d745db9690501d7b0a2a4b7fe23a7726f')

# Offline DEM cache for the render-only rock tint. z6 matches the z7 colour
# pixel spacing; physical runtime geometry stays the live Mapterhorn source.
z=args.dem_zoom

def tile(lon, lat, zoom):
    return int((lon+180)/360*2**zoom), int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**zoom)

if args.whole_world:
    # Only land-touching tiles are worth requesting, dilated by one tile so the
    # padded blur/slope footprint of a coastal colour tile still finds elevation.
    import numpy as np
    import rasterio as rio
    from build import projected_shapes, land_occupancy
    with rio.open(DATA/'pnv-1km.tif') as probe: extent=probe.bounds
    occupancy=land_occupancy(projected_shapes(DATA/'ne_10m_land.geojson'),z)
    reach=occupancy.copy()
    for shift in (1,-1):
        reach|=np.roll(occupancy,shift,0); reach|=np.roll(occupancy,shift,1)
    _,top=tile(0,min(extent.top,85.0511),z)
    _,bottom=tile(0,max(extent.bottom,-85.0511),z)
    reach[:top]=0; reach[bottom+1:]=0
    wanted=[(int(x),int(y)) for y,x in zip(*np.nonzero(reach))]
else:
    x0,y1 = tile(-18,17,z)
    x1,y0 = tile(41,56,z)
    wanted=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]

def cached(x,y):
    # A recorded 404 is remembered, so resuming never re-probes ocean tiles.
    return (DATA/f'dem-{z}-{x}-{y}.webp').exists() or (DATA/f'dem-{z}-{x}-{y}.absent').exists()

missing=[(x,y) for x,y in wanted if not cached(x,y)]
print(f'DEM z{z}: {len(wanted)} tiles wanted, {len(wanted)-len(missing)} already resolved, {len(missing)} to fetch.',flush=True)

def dem_tile(index):
    x,y=index
    try:
        fetch(f'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp', f'dem-{z}-{x}-{y}.webp')
        return None
    except subprocess.CalledProcessError as exc:
        # Mapterhorn intentionally omits all-ocean tiles. Other failures fail closed.
        code=subprocess.check_output(['curl','-L','-s','-o','/dev/null','-w','%{http_code}',f'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']).decode()
        if code != '404': raise exc
        (DATA/f'dem-{z}-{x}-{y}.absent').write_text('404\n')
        return (x,y)

absent=0
with ThreadPoolExecutor(max_workers=max(1,args.jobs)) as pool:
    for done,result in enumerate(pool.map(dem_tile,missing),1):
        absent+=result is not None
        if done%100==0 or done==len(missing): print(f'  {done}/{len(missing)} resolved, {absent} absent (ocean)',flush=True)

elevation=len(list(DATA.glob(f'dem-{z}-*.webp')))
print(f'Verified original PNV, class table, Natural Earth and {"global" if args.whole_world else "regional"} '
      f'Mapterhorn z{z} cache ({elevation} elevation tiles cached; ocean gaps left nodata).')
