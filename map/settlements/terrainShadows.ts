import type { Mesh } from "three";

/**
 * MapLibre reserves a sub-range of depth for 3D layers. Three's shadow mapper
 * inherits that GL range, but compares its texture against full [0,1] light
 * coordinates. Normalize ONLY offscreen shadow draws, then restore map depth.
 * Without this, even a planar roof acquires stripes from self-shadowing.
 */
export function configureTerrainShadowCaster(mesh: Mesh): void {
  let mapDepthRange: Float32Array | undefined;
  mesh.onBeforeShadow = (renderer) => {
    const gl = renderer.getContext();
    mapDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
    gl.depthRange(0, 1);
  };
  mesh.onAfterShadow = (renderer) => {
    if (mapDepthRange) renderer.getContext().depthRange(mapDepthRange[0], mapDepthRange[1]);
  };
}
