"""Import the pinned P-LOD I.10.4 property extent; never reconstruct walls/roofs."""
import hashlib
import json
import re
from pathlib import Path

source = Path('data/history/menander/source/property-r1-i10-p4.ttl')
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'e11696679b169621cf78421c3f757aabfedb245e56acd7b68c47441c9368a924', 'Review changed source before importing'
text = source.read_text()
assert 'p-lod:r1-i10-p4 a p-lod:property' in text and '"BLD_000011"' in text
feature = json.loads(json.loads(re.search(r'p-lod:geojson ("(?:[^"\\]|\\.)*")', text).group(1)))
assert feature['id'] == 'urn:p-lod:id:r1-i10-p4'
geometry = feature['geometry']
assert geometry['type'] == 'Polygon' and len(geometry['coordinates']) == 1
ring = geometry['coordinates'][0]
assert len(ring) == 40 and all(len(point) == 3 for point in ring) and ring[0] == ring[-1]
xy = [[point[0], point[1]] for point in ring]
anchor = [(min(p[k] for p in xy)+max(p[k] for p in xy))/2 for k in range(2)]
evidence = lambda certainty, sources, note: dict(certainty=certainty, sources=sources, note=note)
geometry_evidence = evidence('documented', ['source:plod-menander', 'source:pbmp-method'], 'Published P-LOD property I.10.4 polygon. XY vertices retained exactly; Z discarded without interpreting its datum or height. Includes open spaces and dependencies, not individual walls, a roof or a surveyed reconstruction. Position accuracy remains unquantified.')
phase_evidence = evidence('inferred', ['source:ling-menander', 'source:plod-menander'], 'Final AD 79 context inferred by matching P-LOD property identity to Ling’s discussion of the exposed final-phase structures (p. 36). The source polygon has no date. This association does not establish every boundary as unchanged or certify an exact wall plan. Earlier phases are not extrapolated.')
licence = dict(title='CC BY · publisher declaration', url='https://p-lod.org/', attribution='Pompeii Linked Open Data (Sebastian Heath and Eric Poehler), urn:p-lod:id:r1-i10-p4. Geometry derived from the PBMP tradition. Mankind excerpted one RDF record and omitted source Z values. Publisher declares CC-By for RDF; version unspecified.')
world = dict(version=1, id='world:menander-footprint-v1', title='House of Menander · final-phase property extent', coordinateSystem='WGS84', calendar='proleptic-gregorian',
    sources=[
        dict(id='source:plod-menander', title='P-LOD property I.10.4 — House of Menander', url='https://github.com/p-lod/p-lod-data/blob/0f723ab5fb38bf46c2402811e0f0698267387c9c/property.ttl', publisher='Pompeii Linked Open Data', accessed='2026-10-30', citation='Pinned RDF revision 0f723ab5fb38bf46c2402811e0f0698267387c9c; subject urn:p-lod:id:r1-i10-p4; ArcGIS ID BLD_000011. Source record inspected directly.'),
        dict(id='source:plod-licence', title='P-LOD data licensing declaration', url='https://p-lod.org/', publisher='Pompeii Linked Open Data', accessed='2026-10-30', citation='About section declares CC-By for all RDF data and URNs as attribution. No licence version stated. Image licensing is separate; no images imported.'),
        dict(id='source:pbmp-method', title='PBMP Buildings — geometry lineage and limitations', url='https://services.arcgis.com/2gdL2gxYNFY2TOUb/arcgis/rest/services/PBMP_NavMap2_BLD/FeatureServer', publisher='Pompeii Bibliography and Mapping Project', accessed='2026-10-30', citation='Description reviewed directly: GIS lineage from digitized RICA mapping; rectification and projection discrepancies possible. Used as methodological context, not as the reuse grant or geometry download.'),
        dict(id='source:ling-menander', title='The Insula of the Menander at Pompeii: Interim Report', url='https://doi.org/10.1017/S0003581500014347', publisher='Roger Ling · The Antiquaries Journal', accessed='2026-10-30', citation='1983, volume 63(1), pp. 34–57; p. 36 (PDF page 3) directly reviewed for final AD 79 context. Textual interpretation only; no figure, plan or image copied.'),
    ],
    places=[dict(id='place:house-of-menander', title='House of Menander · I.10.4', kind='landmark', radiusMeters=50,
        position=dict(coordinate=anchor, evidence=evidence('inferred', ['source:plod-menander'], 'Display anchor is the WGS84 bounding-box centre of the source property polygon; not an entrance or survey control point. Accuracy unquantified.')),
        evidence=evidence('documented', ['source:plod-menander', 'source:ling-menander'], 'Identified property I.10.4 at Pompeii. No full building lifespan, ownership attribution or reconstructed architectural appearance asserted. Display radius is a UI setting.'))],
    footprints=[dict(id='footprint:menander-property-ad79', title='Menander property extent', placeId='place:house-of-menander', representation='property-extent',
        period=dict(start=dict(year=79), approximate=True), phaseTitle='Final AD 79 context', phaseEvidence=phase_evidence,
        geometry=dict(type='Polygon', coordinates=[xy]), licence=licence, evidence=geometry_evidence)],
    assets=[dict(id='asset:menander-architecture', category='building', catalogueRef=dict(id='catalogue:menander-reconstruction', version=1), evidence=evidence('unknown', [], 'No source-grounded Menander reconstruction model has an approved registry binding. The property extent does not supply a building model.'))],
    roadNetworks=[], layouts=[], events=[], routes=[],
    scenes=[dict(id='scene:menander-final-context', title='Menander final-phase scene requirements', description='Show the sourced property extent and evidence. Reconstructed walls, heights and architecture are unavailable.',
        placeId='place:house-of-menander', period=dict(start=dict(year=79), approximate=True), layoutIds=[], assetIds=['asset:menander-architecture'], required=False, fallback='map-only',
        evidence=evidence('illustrative', [], 'Presentation requirement only. The documented extent and inferred phase remain separate evidence; no reconstructed scene is claimed.'))])
Path('lib/history/fixtures/menander.json').write_text(json.dumps(world, ensure_ascii=False, indent=2)+'\n')
ledger = dict(datasetId=world['id'], reviewed='2026-10-30',
    claims=[dict(recordId='footprint:menander-property-ad79', field='geometry', status='documented', sourceIds=['source:plod-menander']),
        dict(recordId='footprint:menander-property-ad79', field='period', status='inferred', sourceIds=['source:ling-menander', 'source:plod-menander']),
        dict(recordId='place:house-of-menander', field='position.coordinate', status='inferred', sourceIds=['source:plod-menander'])],
    limits=['Property extent includes open spaces; cannot be extruded as a solid building.', 'No wall footprints, floor levels, heights, roofs, materials or doors approved.', 'AD 79 phase association is inferred and remains a possible match.', 'RDF CC-By declaration is the reuse basis; separate ArcGIS service does not supply the grant.', 'No protected plan traced. No images included. Housesteads phase geometry remains unresolved.'])
Path('lib/history/curation/menander-review.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(anchor=anchor, vertices=len(xy), representation='property-extent', phase='inferred AD 79'), indent=2))
