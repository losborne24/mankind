"""Render-only surface treatment. Heuristics are not geological classifications."""
import numpy as np
from scipy.ndimage import gaussian_filter


def smoothstep(lo,hi,x):
    t=np.clip((x-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)


def geographic_noise(lon,lat,scale_km):
    """Smooth value noise on an Earth-centred 3D lattice, continuous at dateline.
    No tile seed or tile-local normalization. No longitude stripes or repeated waves.
    """
    lon,lat=np.radians(lon),np.radians(lat)
    coords=[6371*np.cos(lat)*np.cos(lon)/scale_km,
            6371*np.cos(lat)*np.sin(lon)/scale_km,
            6371*np.sin(lat)/scale_km]
    base=[np.floor(c).astype('int64') for c in coords]
    t=[c-b for c,b in zip(coords,base)]
    t=[v*v*(3-2*v) for v in t]
    result=np.zeros_like(lon)
    for a in range(2):
        for b in range(2):
            for c in range(2):
                h=((base[0]+a).astype('uint32')*np.uint32(374761393) ^
                   (base[1]+b).astype('uint32')*np.uint32(668265263) ^
                   (base[2]+c).astype('uint32')*np.uint32(2246822519))
                h=(h^(h>>13))*np.uint32(1274126177)
                h=h^(h>>16)
                weight=(t[0] if a else 1-t[0])*(t[1] if b else 1-t[1])*(t[2] if c else 1-t[2])
                result+=weight*(h.astype('float64')/4294967295*2-1)
    return result


def surface(rgb,ids,h,pixel,lon,lat,palette,settings,variation):
    valid=h!=-9999
    # Prevent nodata/ocean cliffs from producing false steep-rock colours.
    safe=np.where(valid,h,0)
    dy,dx=np.gradient(safe,pixel)
    slope=np.hypot(dx,dy)/np.maximum(.1,np.cos(np.radians(lat)))
    slope[~valid]=0
    coarse=geographic_noise(lon,lat,160)
    fine=geographic_noise(lon,lat,18)
    detail=geographic_noise(lon,lat,5)
    noise=.55*coarse+.3*fine+.15*detail
    arid=np.isin(ids,[20,22,27])
    arid=gaussian_filter(arid.astype('float32'),.8,truncate=4)
    # Less luminance variation in arid terrain; small warm/cool earth differences.
    rgb*=1+(variation*(1-.4*arid)*noise)[:,:,None]
    relief=safe-gaussian_filter(safe,2,truncate=4)
    soil=(.45+.35*fine+.2*coarse)*settings['soil_strength']
    soil*=.5+.5*arid
    soil+=smoothstep(0,160,-relief)*.025*valid
    soil=np.clip(soil,0,.12)
    rgb=rgb*(1-soil[:,:,None])+np.array(palette['soil'])*soil[:,:,None]
    # Steepness and local topographic position expose a limited rock tint.
    # Elevation changes the strength continuously, not a universal material cutoff.
    rock=smoothstep(.09,.42,slope)*(.35+.65*smoothstep(450,2600,safe))
    rock*=settings['rock_strength']*(.9+.1*fine)
    rock*=1+.12*smoothstep(0,120,relief)
    # One-cell guard excludes the gradients touching missing DEM cells.
    from scipy.ndimage import minimum_filter
    rock*=minimum_filter(valid.astype('uint8'),size=3)
    rock=np.clip(rock,0,.72)
    rgb=rgb*(1-rock[:,:,None])+np.array(palette['rock'])*rock[:,:,None]
    return rgb
