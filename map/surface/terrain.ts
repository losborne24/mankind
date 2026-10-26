import type { TerrainProperties } from './materials';

export const MERCATOR_LATITUDE_LIMIT = 85.0511287798066;
const EARTH_RADIUS = 6378137;
/** XYZ Mercator normalized coordinates, NOT historical raster longitude/latitude indices. */
export function mercatorToGeographic(x: number, y: number): [number, number] {
  return [((x % 1 + 1) % 1) * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(1, y))))) * 180 / Math.PI];
}
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** 3×3 halo samples: NW,N,NE,W,C,E,SW,S,SE. Caller wraps X and clamps polar Y.
 * Derivatives use DEM source spacing, never the finer output raster spacing.
 */
export function deriveTerrain(h: readonly number[], spacing: number): TerrainProperties {
  if (h.length !== 9 || !h.every(Number.isFinite) || !Number.isFinite(spacing) || spacing <= 0)
    throw new RangeError('Terrain derivatives require nine valid heights and positive metre spacing');
  const east = (h[5] - h[3]) / (2 * spacing);
  const south = (h[7] - h[1]) / (2 * spacing);
  const length = Math.hypot(east, 1, south);
  return {
    elevation: h[4], slope: Math.atan(Math.hypot(east, south)),
    aspect: east === 0 && south === 0 ? 0 : (Math.atan2(-east, south) + Math.PI * 2) % (Math.PI * 2),
    ruggedness: Math.sqrt(h.reduce((s, v) => s + (v - h[4]) ** 2, 0) / 8),
    curvature: (h[1] + h[3] + h[5] + h[7] - 4 * h[4]) / (spacing * spacing),
    normal: [-east / length, 1 / length, -south / length],
  };
}
export function mercatorPixelMetres(lat: number, zoom: number, size: number): number {
  return 2 * Math.PI * EARTH_RADIUS * Math.cos(lat * Math.PI / 180) / (size * 2 ** zoom);
}
