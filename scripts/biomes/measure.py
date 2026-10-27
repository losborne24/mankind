"""Measure real tile cost before a global run: compression per format, render
time, and whether another native zoom level carries any extra biome detail.

Renders a stratified ecological sample with the production settings and writes
nothing into a tile pyramid. Usage:

    .biome-venv/bin/python scripts/biomes/measure.py --dem .biome-data/source/dem-z6-global.tif
"""
import argparse
import io
import json
import time
from pathlib import Path
import numpy as np
from PIL import Image
import rasterio as rio
import build as b

# Stratified by vegetation class and terrain character, not by convenience.
SAMPLES=[('Iberia',-3.7,40.4),('Alps',7.6,46.0),('Atlas',-5.1,31.2),('Sahara core',10,25),
         ('Sahel',5,14),('Congo',20,0),('Amazon',-60,-3),('Atlantic forest',-45,-22),
         ('Great Plains',-100,42),('Appalachia',-82,36),('Boreal Canada',-105,55),
         ('Greenland margin',-45,70),('Scandinavia',15,63),('Siberia',100,62),
         ('Central Asia steppe',65,45),('Gobi',105,43),('India',78,22),('SE Asia',102,15),
         ('Australia arid',134,-25),('Australia temperate',147,-37),('New Zealand',172,-43),
         ('Andes',-70,-16),('Patagonia',-70,-45),('Kalahari',22,-23),('Ethiopia',39,9),
         ('Chukotka dateline',179,65),('Fiji dateline',-179,-17),('Tibet',86.9,28)]

FORMATS={'png':dict(format='PNG',optimize=True),
         'webp-lossless':dict(format='WEBP',lossless=True,quality=100,method=6),
         'webp-q90':dict(format='WEBP',quality=90,method=6),
         'webp-q80':dict(format='WEBP',quality=80,method=6)}

def encoded(image,options):
    buffer=io.BytesIO(); image.save(buffer,**options); return buffer.getvalue()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dem',type=Path,default=b.SOURCE/'dem-z6-global.tif')
    p.add_argument('--maxzoom',type=int,default=7)
    p.add_argument('--bounds',nargs=4,type=float,default=None)
    args=p.parse_args()
    with rio.open(b.SOURCE/'pnv-1km.tif') as probe: extent=probe.bounds
    bounds=args.bounds or [-180.0,max(extent.bottom,-85.0511),180.0,min(extent.top,85.0511)]
    colors=json.loads(Path(__file__).with_name('palette.json').read_text())
    settings=json.loads(Path(__file__).with_name('surface.json').read_text())
    palette={int(k):tuple(bytes.fromhex(v[1:])) for k,v in colors.items() if k.isdigit()}
    materials={k:tuple(bytes.fromhex(colors[k][1:])) for k in ['rock','soil','ice']}
    land=b.projected_shapes(b.SOURCE/'ne_10m_land.geojson')
    ice=b.projected_shapes(b.SOURCE/'ne_10m_glaciated_areas.geojson')
    with rio.open(b.SOURCE/'pnv-1km.tif') as original:
        render_path=b.fill_render_source(original,tuple(bounds))
    common=dict(palette=palette,coverage=bounds,variation=settings['variation_strength'],settings=settings,
                materials_palette=materials,ice_geometries=ice,edge_fade=0.0,polar_ice=True)
    z=args.maxzoom
    totals={name:[] for name in FORMATS}
    durations=[]
    rows=[]
    with rio.open(render_path) as src, rio.open(args.dem) as dem:
        for name,lon,lat in SAMPLES:
            x,y=b.tile_xy(lon,lat,z)
            started=time.monotonic()
            image=b.render(src,dem,land,z,x,y,**common)
            durations.append(time.monotonic()-started)
            if image is None:
                rows.append((name,f'z{z}/{x}/{y}',None)); continue
            sizes={k:len(encoded(image,o)) for k,o in FORMATS.items()}
            for k,v in sizes.items(): totals[k].append(v)
            # Lossy WebP must not disturb the palette: measure the worst channel
            # error over visible pixels rather than trusting the quality number.
            base=np.asarray(image).astype('int16')
            visible=base[:,:,3]>250
            errors={}
            for k in ('webp-q90','webp-q80'):
                decoded=np.asarray(Image.open(io.BytesIO(encoded(image,FORMATS[k]))).convert('RGBA')).astype('int16')
                errors[k]=(int(np.abs(decoded[:,:,:3]-base[:,:,:3])[visible].max()) if visible.any() else 0,
                           int(np.abs(decoded[:,:,3]-base[:,:,3]).max()))
            rows.append((name,f'z{z}/{x}/{y}',sizes,errors))
    print(f'\n{"Sample":22s} {"tile":12s} {"PNG":>9s} {"WebP-LL":>9s} {"vs PNG":>7s} {"q90":>8s} {"q90 err":>8s} {"q80":>8s} {"q80 err":>8s}')
    for row in rows:
        if row[2] is None: print(f'{row[0]:22s} {row[1]:12s}    (no source coverage)'); continue
        name,tile,sizes,errors=row
        print(f'{name:22s} {tile:12s} {sizes["png"]:9,d} {sizes["webp-lossless"]:9,d} '
              f'{sizes["webp-lossless"]/sizes["png"]-1:+6.1%} {sizes["webp-q90"]:8,d} '
              f'{errors["webp-q90"][0]:3d}/{errors["webp-q90"][1]:<4d} {sizes["webp-q80"]:8,d} '
              f'{errors["webp-q80"][0]:3d}/{errors["webp-q80"][1]:<4d}')
    print()
    for name,values in totals.items():
        if values:
            print(f'{name:14s} mean {int(np.mean(values)):7,d} B  median {int(np.median(values)):7,d} B  '
                  f'max {max(values):7,d} B  total {sum(values):9,d} B')
    print(f'\nRender time per z{z} tile: mean {np.mean(durations)*1000:.0f} ms, '
          f'median {np.median(durations)*1000:.0f} ms, max {max(durations)*1000:.0f} ms')
    print('"err" is max absolute RGB / alpha deviation from the lossless tile over visible pixels.')

    # Does one more native zoom carry real biome detail, or only interpolation?
    print(f'\nExtra-detail test: a native z{z+1} render versus MapLibre-style 2x '
          f'overzoom of the stored z{z} tile.')
    with rio.open(render_path) as src, rio.open(args.dem) as dem:
        for name,lon,lat in [('Alps',7.6,46.0),('Amazon',-60,-3),('Sahara core',10,25),
                             ('Central Asia steppe',65,45),('Tibet',86.9,28),('Great Plains',-100,42)]:
            fine_x,fine_y=b.tile_xy(lon,lat,z+1)
            fine=b.render(src,dem,land,z+1,fine_x,fine_y,**common)
            coarse=b.render(src,dem,land,z,fine_x//2,fine_y//2,**common)
            if fine is None or coarse is None: continue
            quadrant=coarse.crop(((fine_x%2)*128,(fine_y%2)*128,(fine_x%2)*128+128,(fine_y%2)*128+128))
            overzoomed=np.asarray(quadrant.resize((256,256),Image.Resampling.BILINEAR)).astype('int16')
            native=np.asarray(fine).astype('int16')
            visible=(native[:,:,3]>250)&(overzoomed[:,:,3]>250)
            if not visible.any(): continue
            delta=np.abs(native[:,:,:3]-overzoomed[:,:,:3])[visible]
            print(f'  {name:22s} mean |Δ| {delta.mean():5.2f}/255   p99 {np.percentile(delta,99):5.1f}   max {delta.max():3d}')

if __name__=='__main__': main()
