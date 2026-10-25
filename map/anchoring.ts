/**
 * Geographic anchoring for Three.js geometry inside MapLibre's custom-layer
 * pipeline.
 *
 * This is the single, well-defined bridge between a geographic coordinate and
 * the matrices that place local metre-space geometry onto MapLibre's globe —
 * extracted from the Phase-1 proof so every scene object anchors through exactly
 * one code path.
 *
 * ── The approach (unchanged from Phase 1, now reusable) ─────────────────────
 * MapLibre hands custom layers two matrices + a blend factor each frame:
 *   • `mainMatrix`     — globe: projects a **unit sphere** to clip space.
 *   • `fallbackMatrix` — the **mercator** [0..1] world matrix.
 *   • `projectionTransition` ∈ [0,1] (1 = globe, 0 = mercator), used to
 *     cross-fade the two as you zoom in.
 *
 * For each anchor we precompute TWO model matrices — one placing local
 * metre-space (+X east, +Y up, +Z south; base at the origin) onto the unit
 * sphere, one placing it at the mercator coordinate. Per frame we form the two
 * full MVP matrices and linearly interpolate them by the transition. Because
 * matrix·vector is linear, `lerp(A,B,t)·p ≡ lerp(A·p, B·p, t)`, so the result
 * reproduces MapLibre's per-vertex globe↔mercator blend and is exact at both
 * endpoints.
 *
 * Grouping note: all parts of one anchored object (a settlement's buildings,
 * trees and lanes) share a single anchor and are authored in that anchor's
 * local metre-space, so one blended MVP correctly places the whole group. This
 * keeps the per-object (not per-vertex) blend imperceptible, since each group is
 * geographically compact. See {@link ../lib/geo.localOffsetMeters}.
 */

import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomRenderMethodInput } from "maplibre-gl";
import {
  dot,
  globeSurfaceFrame,
  lerpMat4,
  lngLatToUnitSphere,
  metersToGlobeUnits,
  type Vec3,
} from "@/lib/geo";

/**
 * Precomputed placement for one geographic anchor. Depends only on the anchor
 * coordinate, never on the camera, so it is computed once per object.
 */
export class Anchor {
  readonly modelGlobe = new THREE.Matrix4();
  readonly modelMercator = new THREE.Matrix4();
  /** Unit-sphere position of the anchor, for globe horizon culling. */
  anchorSphere: Vec3 = [0, 0, 0];

  constructor(lng: number, lat: number) {
    // Globe: anchor on the unit sphere, local +Y along the surface normal.
    const frame = globeSurfaceFrame(lng, lat);
    this.anchorSphere = lngLatToUnitSphere(lng, lat);
    const sGlobe = metersToGlobeUnits(1); // metres → sphere units
    this.modelGlobe
      .makeTranslation(frame.position[0], frame.position[1], frame.position[2])
      .multiply(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(frame.xAxis[0], frame.xAxis[1], frame.xAxis[2]),
          new THREE.Vector3(frame.up[0], frame.up[1], frame.up[2]),
          new THREE.Vector3(frame.zAxis[0], frame.zAxis[1], frame.zAxis[2]),
        ),
      )
      .multiply(new THREE.Matrix4().makeScale(sGlobe, sGlobe, sGlobe));

    // Mercator: local +Y (up) → mercator +Z (elevation), local +X (east) →
    // mercator +X, local +Z (south) → mercator +Y (mercator Y grows southward).
    const mc = MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    const sMerc = mc.meterInMercatorCoordinateUnits();
    this.modelMercator
      .makeTranslation(mc.x, mc.y, mc.z)
      .multiply(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 1, 0),
        ),
      )
      .multiply(new THREE.Matrix4().makeScale(sMerc, sMerc, sMerc));
  }
}

/** Reusable scratch state for {@link resolveProjection}, to avoid per-frame GC. */
export class ProjectionScratch {
  readonly a = new THREE.Matrix4();
  readonly b = new THREE.Matrix4();
  readonly out = new Float32Array(16);
}

/**
 * Compute the model-view-projection matrix that places an anchored group this
 * frame, writing it into `target`'s `projectionMatrix` (the group's own world
 * matrix stays identity; geometry is authored in local metre-space).
 *
 * Returns `false` when the anchor is beyond the globe's horizon (far side) and
 * the group should be skipped; `true` otherwise.
 */
export function resolveProjection(
  anchor: Anchor,
  isGlobe: boolean,
  args: CustomRenderMethodInput,
  scratch: ProjectionScratch,
  target: THREE.Camera,
): boolean {
  const data = args.defaultProjectionData;

  if (isGlobe) {
    // Cull when the anchor is on the far side of the globe. Derived from
    // MapLibre's globe clipping: hidden when dot(p, plane.xyz) + plane.w < 0.
    const p = data.clippingPlane;
    const side =
      dot(anchor.anchorSphere, [p[0], p[1], p[2]]) + p[3];
    if (side < 0) return false;

    const a = scratch.a.fromArray(data.mainMatrix).multiply(anchor.modelGlobe);
    const b = scratch.b
      .fromArray(data.fallbackMatrix)
      .multiply(anchor.modelMercator);
    lerpMat4(scratch.out, b.elements, a.elements, data.projectionTransition);
    target.projectionMatrix.fromArray(scratch.out);
  } else {
    // Pure mercator: mainMatrix maps mercator [0..1] → clip.
    target.projectionMatrix
      .fromArray(scratch.a.fromArray(data.mainMatrix).elements)
      .multiply(anchor.modelMercator);
  }
  target.projectionMatrixInverse.copy(target.projectionMatrix).invert();
  return true;
}
