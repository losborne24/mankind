"""Reproduce one reference outline from the pinned, CC BY 4.0 WallGIS archive.

This deliberately reads only this archive's DBF/Polygon records. It is not a
general shapefile importer. No source dates become Roman layout dates.
"""
import hashlib
import json
import struct
import zipfile
from pathlib import Path
import rasterio
from rasterio.warp import transform

source = Path('data/history/housesteads/source/WallGIS_Fort_polygon.zip')
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == '4bc1cc1144a46c9107cfa31966294baaf7f0d3c786199356fb74acc4e0ac99f6', 'Source archive changed; review before importing.'
with zipfile.ZipFile(source) as archive:
    dbf = archive.read('WallGIS_Fort_polygon.dbf')
    shp = archive.read('WallGIS_Fort_polygon.shp')
    prj = archive.read('WallGIS_Fort_polygon.prj').decode()
    assert 'British_National_Grid' in prj and 'Airy_1830' in prj
    count, header, width = struct.unpack_from('<IHH', dbf, 4)
    fields = [(dbf[p:p+11].split(b'\0')[0].decode(), dbf[p+16]) for p in range(32, header-1, 32)]
    records = []
    for index in range(count):
        row = dbf[header+index*width:header+(index+1)*width]
        assert len(row) == width and row[0:1] == b' '
        offset = 1
        record = {}
        for name, size in fields:
            record[name] = row[offset:offset+size].decode('utf-8').strip()
            offset += size
        records.append(record)
    matches = [i for i, row in enumerate(records) if row['ModernName'] == 'Housesteads' and row['CUID'] == '499']
    assert len(matches) == 1
    position = 100
    for index in range(count):
        number, words = struct.unpack_from('>ii', shp, position)
        body = shp[position+8:position+8+words*2]
        position += 8+words*2
        assert number == index+1 and len(body) == words*2
        if index != matches[0]:
            continue
        kind = struct.unpack_from('<i', body)[0]
        parts, vertices = struct.unpack_from('<ii', body, 36)
        assert kind == 5 and parts == 1 and vertices == 48
        assert struct.unpack_from('<i', body, 44)[0] == 0
        points = [struct.unpack_from('<dd', body, 48+j*16) for j in range(vertices)]
        assert points[0] == points[-1]
        lng, lat = transform('EPSG:27700', 'EPSG:4326', *zip(*points))
        ring = [[round(x, 8), round(y, 8)] for x, y in zip(lng, lat)]

attribution = 'Murphy, K., Turner, A. and Collins, R. (2024), WallGIS, Archaeology Data Service, doi:10.5284/1100071. Data © Newcastle University, Prof Rob Collins. Housesteads outline extracted and transformed to WGS84 by Mankind.'
area = dict(id='reference:housesteads-fort-outline', title='WallGIS fort outline · phase unspecified',
    placeId='place:housesteads-fort', kind='site-outline', geometry=dict(type='Polygon', coordinates=[ring]),
    licence=dict(title='CC BY 4.0', url='https://creativecommons.org/licenses/by/4.0/', attribution=attribution),
    evidence=dict(certainty='documented', sources=['source:wallgis'], note='Published fort polygon CUID 499, transformed from British National Grid. Reference outline only: no phase attribution, building footprint or survey accuracy asserted.'))
world_path = Path('lib/history/fixtures/housesteads.json')
world = json.loads(world_path.read_text())
world['sources'] = [s for s in world['sources'] if s['id'] != 'source:wallgis'] + [dict(id='source:wallgis',
    title='WallGIS — Hadrian’s Wall GIS, fort polygon CUID 499', url='https://doi.org/10.5284/1100071',
    publisher='Archaeology Data Service', accessed='2026-10-30',
    citation='Murphy, Turner and Collins (2024). Fort shapefile reviewed directly; archive metadata declares CC BY 4.0. Source polygon retained without simplification; coordinates transformed. Roman phase unspecified.')]
world['referenceAreas'] = [area]
world_path.write_text(json.dumps(world, ensure_ascii=False, indent=2)+'\n')
manifest = dict(sourceURL='https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-4975-1/dissemination/Shapefiles/WallGIS_Fort_polygon.zip',
    metadataURL='https://archaeologydataservice.ac.uk/archives/collections/view/1004975/metadata.cfm',
    retrieved='2026-10-30', sha256=digest, record=dict(CUID='499', ModernName='Housesteads'),
    sourceCRS='EPSG:27700', targetCRS='EPSG:4326', rasterioVersion=rasterio.__version__,
    vertices=48, method='Source vertices retained, transformed and rounded to 8 decimal places; accuracy unquantified.',
    phaseStatus='unspecified', geometryRole='site-outline', licence=area['licence'])
Path('data/history/housesteads/source/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(manifest, ensure_ascii=False, indent=2))
