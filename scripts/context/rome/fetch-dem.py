"""Samples the app's own terrain (Mapterhorn Terrarium tiles, zoom 12) onto a 60 m grid over the zoning frame, for the floodplain
and slope limits on the suburbium density in build-zoning.mjs. Network is needed only here; the build works offline from the snapshot.

Run with the biome tooling's environment, which has Pillow (WebP) and NumPy:
    .biome-venv/bin/python scripts/context/rome/fetch-dem.py

Around Rome Mapterhorn is built from Copernicus GLO-30 (a 30 m surface model, so modern buildings are in it). The grid is a 3x3 mean
of the samples, which takes off some of that roughness; it is still today's surface, not the ancient ground.
"""
import io, json, math, urllib.request, datetime
import numpy as np
from PIL import Image

LAT = 41.892
KX, KY = math.cos(math.radians(LAT)) * 111320, 110950
HALF = 0.17 * math.cos(math.radians(LAT)) / 2
FRAME = (12.40, 41.896 - HALF, 12.57, 41.896 + HALF)
CELL, ZOOM = 60, 12
AGENT = {'User-Agent': 'mankind-research/0.1 (osborneleith@gmail.com)'}

def tile_xy(lon, lat):
    n = 2 ** ZOOM
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

tiles = {}
def elevation(lon, lat):
    x, y = tile_xy(lon, lat)
    key = (int(x), int(y))
    if key not in tiles:
        req = urllib.request.Request(f'https://tiles.mapterhorn.com/{ZOOM}/{key[0]}/{key[1]}.webp', headers=AGENT)
        rgb = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert('RGB'), dtype=np.float64)
        tiles[key] = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    grid = tiles[key]
    px, py = (x - key[0]) * grid.shape[1] - 0.5, (y - key[1]) * grid.shape[0] - 0.5
    i, j = min(max(int(py), 0), grid.shape[0] - 2), min(max(int(px), 0), grid.shape[1] - 2)
    fy, fx = min(max(py - i, 0), 1), min(max(px - j, 0), 1)
    return (grid[i, j] * (1 - fx) * (1 - fy) + grid[i, j + 1] * fx * (1 - fy) + grid[i + 1, j] * (1 - fx) * fy + grid[i + 1, j + 1] * fx * fy)

cols = int((FRAME[2] - FRAME[0]) * KX // CELL)
rows = int((FRAME[3] - FRAME[1]) * KY // CELL)
raw = np.array([[elevation(FRAME[0] + (c + 0.5) * CELL / KX, FRAME[3] - (r + 0.5) * CELL / KY) for c in range(cols)] for r in range(rows)])
padded = np.pad(raw, 1, mode='edge')
smooth = sum(padded[1 + di:1 + di + rows, 1 + dj:1 + dj + cols] for di in (-1, 0, 1) for dj in (-1, 0, 1)) / 9
out = {
    'accessed': datetime.date.today().isoformat(), 'source': 'Mapterhorn terrain tiles (Terrarium), zoom 12; around Rome from Copernicus GLO-30',
    'licence': 'Copernicus GLO-30: full, free and open licence (DLR, Airbus, provided under COPERNICUS by the EU and ESA), via Mapterhorn',
    'url': 'https://mapterhorn.com/attribution', 'frame': FRAME, 'cell': CELL, 'cols': cols, 'rows': rows,
    'note': 'Row 0 is the north edge. Metres above sea level, 3x3 mean, rounded to 0.1 m. A modern surface model: buildings included.',
    'elevation': [round(float(v), 1) for v in smooth.ravel()],
}
with open('data/history/rome/source/mapterhorn-dem.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print('saved', rows, 'x', cols, 'cells from', len(tiles), 'tiles; elevation', round(float(smooth.min()), 1), 'to', round(float(smooth.max()), 1), 'm')
