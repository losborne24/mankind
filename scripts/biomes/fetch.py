"""Fetch original data only; never invoked by Next.js. Existing inputs verified."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import argparse

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / '.biome-data/source'
DATA.mkdir(parents=True, exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dem-zoom',type=int,choices=[5,6],default=6)
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
# Modest regional DEM cache, optional for global generation (see build --dem).
# z6 matches the z7 colour pixels; physical geometry stays runtime.
def tile(lon, lat, z=5):
    return int((lon+180)/360*2**z), int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
z=args.dem_zoom
x0,y1 = tile(-18,17,z)
x1,y0 = tile(41,56,z)
for x in range(x0,x1+1):
    for y in range(y0,y1+1):
        try:
            fetch(f'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp', f'dem-{z}-{x}-{y}.webp')
        except subprocess.CalledProcessError as exc:
            # Mapterhorn intentionally omits all-ocean tiles. Other failures fail closed.
            code=subprocess.check_output(['curl','-L','-s','-o','/dev/null','-w','%{http_code}',f'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']).decode()
            if code != '404': raise exc
            print(f'No DEM tile {z}/{x}/{y} (ocean); left nodata.')
print('Verified original PNV, class table, Natural Earth and regional Mapterhorn cache.')
