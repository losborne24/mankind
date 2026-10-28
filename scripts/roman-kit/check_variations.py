"""Check parameter ranges/invalid definitions without starting Blender."""
import copy
import json
from pathlib import Path
from variations import CONFIG, resolve, validate
assets=json.loads(Path(__file__).with_name('buildings.json').read_text())['assets']
for name in CONFIG['variants']:
    assert resolve(name,assets)==resolve(name,assets)
    for seed in range(100): resolve(name,assets,seed)
base=resolve('upper-weavers',assets)
for patch in [{'roofRise':4},{'eave':1},{'width':1},{'wallHeight':4.5},{'frontWindows':[0]}, {'storeys':3},{'doorX':2}]:
    invalid=copy.deepcopy(base);invalid.update(patch)
    try: validate(invalid)
    except (AssertionError,ValueError): pass
    else: raise AssertionError(f'Invalid definition accepted: {patch}')
for name in ['taberna-tiled','farm-veranda']:
    bad=resolve(name,assets)
    if name.startswith('taberna'): bad['frontDoor']=10
    else:bad['serviceWing']['wallHeight']=4
    try:validate(bad)
    except AssertionError:pass
    else:raise AssertionError('Unsupported structure accepted')
print('Roman parameters: 1200 seeded definitions, reproducibility and invalid opening/roof/storey/wing guards pass.')
