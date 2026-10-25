/**
 * Procedural graticule (meridians + parallels).
 *
 * The globe needs faint reference lines, but Natural Earth's graticule GeoJSON
 * is ~1.1 MB — far more than a few evenly spaced lines are worth. We generate
 * the grid here instead: zero download, a handful of lines, and full control of
 * spacing.
 *
 * Each line is densified into short segments so it renders as a smooth curve
 * under MapLibre's globe projection (a parallel is a small circle, a meridian a
 * great-circle arc; both need interpolated vertices to avoid looking faceted).
 */

// Minimal GeoJSON shapes. We avoid importing `@types/geojson` (a non-hoisted
// transitive dependency that TS cannot auto-resolve from this module); these
// literals are structurally compatible with MapLibre's GeoJSON source `data`.
interface LineFeature {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
}
interface GraticuleCollection {
  type: "FeatureCollection";
  features: LineFeature[];
}

/** Vertices every this many degrees along a line, for smooth curvature. */
const STEP_DEG = 5;

function line(coordinates: [number, number][]): LineFeature {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
}

/**
 * Build a graticule as GeoJSON.
 *
 * @param spacingDeg spacing between grid lines in degrees (default 30°).
 */
export function createGraticule(spacingDeg = 30): GraticuleCollection {
  const features: LineFeature[] = [];

  // Meridians: constant longitude, latitude −80 → 80 (avoid the poles, where
  // all meridians converge and overlap).
  for (let lng = -180; lng < 180; lng += spacingDeg) {
    const coords: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += STEP_DEG) coords.push([lng, lat]);
    features.push(line(coords));
  }

  // Parallels: constant latitude, full longitude sweep.
  for (let lat = -60; lat <= 60; lat += spacingDeg) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += STEP_DEG) coords.push([lng, lat]);
    features.push(line(coords));
  }

  return { type: "FeatureCollection", features };
}
