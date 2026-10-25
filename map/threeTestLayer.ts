/**
 * Three.js ⇄ MapLibre integration (Phase 1 proof).
 *
 * A single MapLibre **custom layer** that draws Three.js geometry into
 * MapLibre's own WebGL2 context — no second canvas, no independent render loop.
 * It anchors one procedural 3D marker to a fixed longitude/latitude and keeps
 * it aligned with the map as the globe rotates, zooms, and (at high zoom)
 * transitions from globe to mercator projection.
 *
 * ── How the projection is handled ──────────────────────────────────────────
 * MapLibre hands custom layers two matrices each frame:
 *   • `mainMatrix`     — globe: projects a **unit sphere** to clip space.
 *   • `fallbackMatrix` — the **mercator** [0..1] world matrix.
 * and `projectionTransition` ∈ [0,1] (1 = full globe, 0 = full mercator), which
 * MapLibre uses to cross-fade the two as you zoom in. See its globe vertex
 * shader (`_projection_globe.vertex.glsl`).
 *
 * We mirror that exactly. We precompute a model matrix for each projection
 * (placing the marker on the unit sphere, and at its mercator coordinate), form
 * the two full MVP matrices, and linearly interpolate them by the transition.
 * Because matrix·vector is linear, `lerp(A,B,t)·p === lerp(A·p, B·p, t)`, so the
 * interpolated matrix reproduces MapLibre's per-vertex blend and is exact at
 * both endpoints — not an approximation glued on top.
 *
 * Known limitation (documented, not hidden): the blend is applied at the whole
 * object rather than per-vertex, so for a *large* object spanning the globe→
 * mercator seam the mid-transition shape could differ slightly from MapLibre's
 * per-vertex result. For a compact, localized marker this is imperceptible. A
 * fully per-vertex-correct integration would instead render through MapLibre's
 * injected `projectTile` shader prelude (raw GLSL) rather than Three.js's own
 * materials/camera.
 */

import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import {
  dot,
  globeSurfaceFrame,
  lerpMat4,
  lngLatToUnitSphere,
  metersToGlobeUnits,
  type Vec3,
} from "@/lib/geo";

/**
 * Marker dimensions, in metres. These are **deliberately exaggerated** (a
 * ~150 km spire) so the test object reads as a clear beacon from orbital zoom
 * levels while verifying geographic anchoring. Real settlement geometry in
 * later phases will use realistic, zoom-dependent scales.
 */
const MARKER = {
  towerHeightMeters: 150_000,
  towerBaseRadiusMeters: 26_000,
  beaconRadiusMeters: 34_000,
} as const;

export interface ThreeTestLayerOptions {
  id?: string;
  /** [longitude, latitude] in degrees to anchor the marker. */
  lngLat: readonly [number, number];
}

export class ThreeTestLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private readonly lngLat: readonly [number, number];

  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  /** Disposables tracked for leak-free teardown. */
  private readonly disposables: Array<{ dispose(): void }> = [];

  /** Constant model matrices (depend only on the anchor, not the camera). */
  private readonly modelGlobe = new THREE.Matrix4();
  private readonly modelMercator = new THREE.Matrix4();
  /** Unit-sphere position of the anchor, for horizon culling. */
  private anchorSphere: Vec3 = [0, 0, 0];

  /** Scratch objects reused every frame to avoid per-frame allocation. */
  private readonly scratchA = new THREE.Matrix4();
  private readonly scratchB = new THREE.Matrix4();
  private readonly scratchArray = new Float32Array(16);

  constructor(options: ThreeTestLayerOptions) {
    this.id = options.id ?? "three-test-marker";
    this.lngLat = options.lngLat;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;

    // Share MapLibre's canvas + GL context — this is the whole point: one
    // context, one render loop, no overlay canvas.
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    this.buildLights(this.scene);
    this.buildMarker(this.scene);

    this.computeModelMatrices();
  }

  onRemove(): void {
    // Dispose every geometry/material/texture we created, then the renderer.
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    // Dispose Three's own resources without destroying MapLibre's shared
    // context (we never call forceContextLoss, which would kill the map).
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.map = null;
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const { renderer, scene, camera, map } = this;
    if (!renderer || !scene || !camera || !map) return;

    const isGlobe = map.getProjection().type === "globe";
    const data = args.defaultProjectionData;

    if (isGlobe) {
      // Cull when the anchor is beyond the globe's horizon (on the far side).
      // Derived from MapLibre's globe clipping: a surface point is hidden when
      // dot(point, clippingPlane.xyz) + clippingPlane.w < 0.
      const p = data.clippingPlane;
      const side = dot(this.anchorSphere, [p[0], p[1], p[2]]) + p[3];
      if (side < 0) return;

      const a = this.scratchA.fromArray(data.mainMatrix).multiply(this.modelGlobe);
      const b = this.scratchB
        .fromArray(data.fallbackMatrix)
        .multiply(this.modelMercator);
      lerpMat4(this.scratchArray, b.elements, a.elements, data.projectionTransition);
      camera.projectionMatrix.fromArray(this.scratchArray);
    } else {
      // Pure mercator projection: mainMatrix maps mercator [0..1] → clip.
      camera.projectionMatrix
        .fromArray(this.scratchA.fromArray(data.mainMatrix).elements)
        .multiply(this.modelMercator);
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    // Hand GL state back and forth cleanly: reset Three's cached state (MapLibre
    // mutated it), clear only the depth buffer so the marker self-occludes
    // correctly while still drawing over the map, then render once.
    renderer.resetState();
    renderer.clearDepth();
    renderer.render(scene, camera);

    // No triggerRepaint(): the marker is static, so we rely on MapLibre to
    // re-invoke render() on map movement. This avoids a perpetual render loop.
    // Ambient animation in a later phase would call map.triggerRepaint() here.
  }

  // ── construction helpers ───────────────────────────────────────────────

  private buildLights(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xbfd4e6, 1.1));
    const key = new THREE.DirectionalLight(0xfff2d8, 2.0);
    key.position.set(0.5, 1, 0.75);
    scene.add(key);
  }

  /**
   * A procedural beacon authored in metres with **+Y up** and its base at
   * `y = 0`, matching the local frame produced by {@link computeModelMatrices}.
   */
  private buildMarker(scene: THREE.Scene): void {
    const group = new THREE.Group();
    const h = MARKER.towerHeightMeters;

    const towerGeo = new THREE.CylinderGeometry(
      MARKER.towerBaseRadiusMeters * 0.35,
      MARKER.towerBaseRadiusMeters,
      h,
      6,
    );
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0xcdb891,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true,
    });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = h / 2; // base sits on the surface
    group.add(tower);

    const beaconGeo = new THREE.IcosahedronGeometry(MARKER.beaconRadiusMeters, 1);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xffcf6b,
      emissive: 0xff9d2a,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = h + MARKER.beaconRadiusMeters * 0.5;
    group.add(beacon);

    scene.add(group);
    this.disposables.push(towerGeo, towerMat, beaconGeo, beaconMat);
  }

  /**
   * Precompute the two model matrices that place the marker. Both map the
   * marker's local metre-space (+Y up, base at origin) into a projection's
   * world space; they change only if the anchor changes, not per frame.
   */
  private computeModelMatrices(): void {
    const [lng, lat] = this.lngLat;

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

    // Mercator: anchor at the mercator coordinate; local +Y (up) → mercator +Z
    // (elevation), local +X (east) → mercator +X. Right-handed, so local +Z →
    // mercator −Y (the marker is radially symmetric, so azimuth is irrelevant).
    const mc = MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    const sMerc = mc.meterInMercatorCoordinateUnits();
    this.modelMercator
      .makeTranslation(mc.x, mc.y, mc.z)
      .multiply(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, -1, 0),
        ),
      )
      .multiply(new THREE.Matrix4().makeScale(sMerc, sMerc, sMerc));
  }
}
