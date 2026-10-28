"""Blender-independent variation resolution and architectural guards."""
import copy
import hashlib
import json
import math
from pathlib import Path

CONFIG = json.loads(Path(__file__).with_name('variations.json').read_text())

def resolve(name, archetypes, seed=None):
    entry = CONFIG['variants'][name]
    profile = CONFIG['profiles'][entry['profile']]
    seed = entry['seed'] if seed is None else seed
    spec = copy.deepcopy(archetypes[profile['base']])
    # Named hash samples: adding a new parameter never reshuffles existing choices.
    for key, (low, high) in profile['ranges'].items():
        digest = hashlib.sha256(f"{CONFIG['seed']}:{name}:{seed}:{key}".encode()).digest()
        sample = int.from_bytes(digest[:4], 'big') / 0xffffffff
        spec[key] = round(low + (high-low)*sample, 2)
    spec.update(profile['options']); spec.update(entry['options'])
    spec.update(seed=seed, variantName=name, weight=entry['weight'])
    validate(spec)
    return spec

def apertures(spec, rear=False):
    w=spec['width']; dx=spec.get('doorX',0)
    if rear: result=[(-w*.24,.65,1.45,2.15,'window'),(w*.24,.65,1.45,2.15,'window')]
    else: result=[(x,.65,1.35,2.15,'window') for x in spec.get('frontWindows',[-1.6,1.6])]+[(dx,spec['frontDoor'],.16,2.23,'door')]
    if spec.get('storeys',1)==2:
        result += [(x,.65,3.65,4.4,'window') for x in [-w*.27,w*.27]]
    return result

def validate(s):
    w,d,h=s['width'],s['depth'],s['wallHeight']
    assert all(math.isfinite(v) for v in [w,d,h,s['roofRise'],s['eave']])
    assert 4<=w<=8 and 4<=d<=7 and .65<=w/d<=1.5, 'Extreme footprint'
    assert .2<=s['eave']<=.4 and .6<=s['roofRise']<=1.6, 'Unsupported roof'
    assert s.get('storeys',1) in (1,2) and 2.6<=h<=5.3
    assert s.get('shelter','linen') in ('linen','tile','none')
    if s['kind']=='house':
        assert (s.get('storeys',1)==2)==(h>4), 'Storey alignment'
        for rear in [False,True]:
            openings=apertures(s,rear)
            for i,(x,width,bottom,top,_) in enumerate(openings):
                assert abs(x)+width/2+.2<w/2, 'Opening intersects corner'
                assert .12<=bottom<top and top+.22<h, 'Opening intersects eave'
                for xx,ww,bb,tt,_ in openings[:i]:
                    assert abs(x-xx)>(width+ww)/2+.28 or bottom>tt+.28 or bb>top+.28, 'Overlapping aperture surrounds'
        assert not s.get('porch') or abs(s.get('doorX',0))<.2, 'Porch/door alignment'
    elif s['kind']=='workshop':
        assert s['frontDoor']+.5<w and h>2.65, 'Unsupported workshop lintel'
    elif s['kind']=='farmhouse':
        assert s['serviceWing']['wallHeight']<h-.4, 'Wing penetrates main roof'
        junction=h+.08+s['roofRise']*(1-2.58/(s['main']['width']/2+.35))
        assert junction>3.4, 'Wing cover tiles intersect main roof at junction'
        assert s['main']['offset']==[-1.1,-.65] and s['width']==7.4 and s['depth']==6.5, 'Unsupported L-plan junction'
    else: raise ValueError('Unsupported residential archetype')
