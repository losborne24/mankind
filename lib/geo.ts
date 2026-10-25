/**
 * Geographic coordinate utilities for the globe renderer.
 *
 * These helpers encode MapLibre's **globe projection** convention so that
 * Three.js geometry can be anchored to real longitude/latitude positions on the
 * same unit sphere MapLibre projects internally.
 *
 * The convention is taken directly from MapLibre's globe shader
 * (`angularCoordinatesRadiansToVector` / `_projection_globe.vertex.glsl`): a
 * point on the planet surface is a unit vector
 *
 *   v = [ sin(lng)·cos(lat),  sin(lat),  cos(lng)·cos(lat) ]   (lng, lat radians)
 *
 * and MapLibre's custom-layer `mainMatrix` projects that unit sphere to clip
 * space. One sphere-space unit therefore equals one planet radius
 * ({@link GLOBE_RADIUS_METERS}).
 *
 * This module is pure math (no Three.js / MapLibre imports) so it can be reused
 * and reasoned about independently of the renderer.
 */

export type Vec3 = readonly [number, number, number];

/**
 * Planet radius in metres used by MapLibre's globe projection
 * (`#define GLOBE_RADIUS 6371008.8` in its globe vertex shader). Sphere-space
 * coordinates are expressed in units of this radius.
 */
export const GLOBE_RADIUS_METERS = 6371008.8;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert longitude/latitude (degrees) to the normalized position on MapLibre's
 * unit-sphere globe. Matches MapLibre's `angularCoordinatesToSurfaceVector`.
 */
export function lngLatToUnitSphere(lng: number, lat: number): Vec3 {
  const lambda = lng * DEG_TO_RAD;
  const phi = lat * DEG_TO_RAD;
  const cosPhi = Math.cos(phi);
  return [Math.sin(lambda) * cosPhi, Math.sin(phi), Math.cos(lambda) * cosPhi];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * A right-handed, orthonormal local frame on the globe surface at `lng/lat`,
 * with **+Y pointing radially outward** (local "up"). Returned as the three
 * basis column vectors in sphere space, suitable for assembling a model matrix
 * `[ xAxis | up | zAxis ]`.
 *
 * `xAxis` points east; `zAxis = xAxis × up` (geometrically toward the south
 * tangent), chosen so the basis determinant is +1 and surface normals are not
 * mirrored. The base plane (local X/Z) is tangent to the sphere.
 */
export function globeSurfaceFrame(
  lng: number,
  lat: number,
): { position: Vec3; xAxis: Vec3; up: Vec3; zAxis: Vec3 } {
  const lambda = lng * DEG_TO_RAD;
  const position = lngLatToUnitSphere(lng, lat);
  const up = normalize(position);
  // East tangent: d(position)/d(lng) normalized, independent of latitude.
  const xAxis = normalize([Math.cos(lambda), 0, -Math.sin(lambda)]);
  const zAxis = normalize(cross(xAxis, up));
  return { position, xAxis, up, zAxis };
}

/**
 * Metres expressed in sphere-space units (1 unit = one planet radius). Used to
 * scale real-world object dimensions into globe coordinates.
 */
export function metersToGlobeUnits(meters: number): number {
  return meters / GLOBE_RADIUS_METERS;
}

/** Linear interpolation of two column-major 4×4 matrices, component-wise.
 *
 * Because matrix–vector multiplication is linear,
 * `lerp(A, B, t)·p === lerp(A·p, B·p, t)` for every point `p`. MapLibre blends
 * its globe and mercator projections exactly this way (per-vertex in clip
 * space), so interpolating the two full MVP matrices reproduces that blend
 * precisely and is exact at the `t = 0` / `t = 1` endpoints.
 */
export function lerpMat4(
  out: Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  t: number,
): Float32Array {
  for (let i = 0; i < 16; i++) {
    out[i] = a[i] * (1 - t) + b[i] * t;
  }
  return out;
}
