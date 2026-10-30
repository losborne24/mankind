"""Reproduce discovery anchors, not surveyed footprints. Uses the existing biome GIS runtime."""
import json
from pathlib import Path
import rasterio
from rasterio.warp import transform

# NT records list NY 7897 6879 (fort) and NY 7898 6882 (granaries).
# NY has BNG origin E300000/N500000. Four digits per axis identify a 10 m square.
anchors = [
    ('place:housesteads-fort', 'NY 7897 6879', 378975, 568795),
    ('place:housesteads-granaries', 'NY 7898 6882', 378985, 568825),
]
world = json.loads(Path('lib/history/fixtures/housesteads.json').read_text()) if Path('lib/history/fixtures/housesteads.json').exists() else None
rows = []
for record_id, grid_reference, easting, northing in anchors:
    lng, lat = transform('EPSG:27700', 'EPSG:4326', [easting], [northing])
    coordinate = [round(lng[0], 6), round(lat[0], 6)]
    rows.append(dict(recordId=record_id, gridReference=grid_reference, easting=easting, northing=northing, coordinate=coordinate))
    if world:
        stored = next(p['position']['coordinate'] for p in world['places'] if p['id'] == record_id)
        assert all(abs(a - b) < .00001 for a, b in zip(stored, coordinate)), 'Anchor differs from stored transform; review runtime/datum operation before updating.'
print(json.dumps(dict(rasterioVersion=rasterio.__version__, sourceCRS='EPSG:27700', targetCRS='EPSG:4326', method='10 m grid-square centre; coordinate accuracy remains unquantified', rows=rows), indent=2))
