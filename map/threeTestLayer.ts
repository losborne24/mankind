/**
 * Three.js ⇄ MapLibre integration (Phase 1 proof).
 *
 * A single MapLibre **custom layer** that draws Three.js geometry into
 * MapLibre's own WebGL2 context — no second canvas, no independent render loop.
 * It anchors the original beacon and lazily loaded Roman GLBs at geographic
 * locations, following displayed terrain through globe/mercator projection.
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
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap, MapSourceDataEvent } from "maplibre-gl";
import { dot, lerpMat4 } from "@/lib/geo";
import { geographicAnchor } from "@/map/geographicAnchor";
import { queryTerrainHeights, queryTerrainSample } from "@/map/terrain";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset, ROMAN_TEST_CENTER, ROMAN_TEST_PLACEMENTS, type AssetPlacement } from "@/map/romanTestScene";

import { SettlementScene, type SettlementStatus } from "@/map/settlements/SettlementScene";
import { ROMAN_SETTLEMENT, ROMAN_VARIATION_PREVIEW, ROMAN_SETTLEMENT_BASELINE, type Coordinate } from "@/map/settlements/romanSettlement";

type AnchoredScene = {
  scene: THREE.Scene;
  lngLat: readonly [number, number];
  altitude: number;
  anchor: ReturnType<typeof geographicAnchor>;
  lease?: ModelLease;
};
export interface RomanTestStatus {
  state: "disabled" | "waiting" | "loading" | "ready" | "error";
  loaded: number;
  errors: string[];
}

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
  onRomanStatus?: (status: RomanTestStatus) => void;
  onSettlementStatus?: (status: SettlementStatus) => void;
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

  private settlement: SettlementScene | null = null;
  private settlementAnchor: AnchoredScene | null = null;
  private settlementEnabled = false;
  private readonly onSettlementStatus?: (status: SettlementStatus) => void;
  private readonly onSettlementMove = () => {
    this.settlement?.invalidateTerrain();
    this.map?.triggerRepaint();
  };
  private readonly onSettlementTerrain = () => {
    // Exaggeration/source changes invalidate heights in the old displayed frame.
    this.settlement?.invalidateTerrain(true);
    this.map?.triggerRepaint();
  };
  private readonly onSettlementSource = (event: MapSourceDataEvent) => {
    if (event.sourceId === this.map?.getTerrain()?.source) this.onSettlementMove();
  };
  private beacon: AnchoredScene | null = null;
  private romans: AnchoredScene[] = [];
  private romanEnabled = true;
  private romanRequested = false;
  private generation = 0;
  private readonly onRomanStatus?: (status: RomanTestStatus) => void;
  private romanStatus: RomanTestStatus = { state: "waiting", loaded: 0, errors: [] };

  /** Scratch objects reused every frame to avoid per-frame allocation. */
  private readonly scratchA = new THREE.Matrix4();
  private readonly scratchB = new THREE.Matrix4();
  private readonly scratchArray = new Float32Array(16);

  constructor(options: ThreeTestLayerOptions) {
    this.id = options.id ?? "three-test-marker";
    this.lngLat = options.lngLat;
    this.onRomanStatus = options.onRomanStatus;
    this.onSettlementStatus = options.onSettlementStatus;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    this.buildLights(this.scene);
    this.buildMarker(this.scene);

    this.beacon = { scene: this.scene, lngLat: this.lngLat, altitude: NaN, anchor: geographicAnchor(this.lngLat, 0) };
    this.onRomanStatus?.(this.romanStatus);
    this.settlement = new SettlementScene(ROMAN_SETTLEMENT,
      (status) => this.onSettlementStatus?.(status), () => this.map?.triggerRepaint());
    this.updateSettlementAnchor();
    map.on("moveend", this.onSettlementMove);
    map.on("terrain", this.onSettlementTerrain);
    map.on("sourcedata", this.onSettlementSource);
  }

  onRemove(): void {
    this.map?.off("moveend", this.onSettlementMove);
    this.map?.off("terrain", this.onSettlementTerrain);
    this.map?.off("sourcedata", this.onSettlementSource);
    this.settlement?.unload();
    this.settlement = null;
    this.settlementAnchor = null;
    this.settlementEnabled = false;
    this.clearRomans();
    this.beacon = null;
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

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const { renderer, scene, camera, map } = this;
    if (!renderer || !scene || !camera || !map) return;

    // Start requests only when settlement-scale detail is useful and Giza is nearby.
    const center = map.getCenter();
    if (this.romanEnabled && !this.romanRequested && map.getZoom() >= 12 &&
        Math.abs(center.lng - ROMAN_TEST_CENTER[0]) < 0.15 && Math.abs(center.lat - ROMAN_TEST_CENTER[1]) < 0.15) {
      this.loadRomans();
    }
    renderer.resetState();
    // Shadow passes restore Three's viewport; keep it aligned after map resize.
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // Keep MapLibre's terrain depth. Clearing it here makes hills unable to occlude models.
    if (this.beacon && map.getZoom() < 12) this.drawAnchored(this.beacon, args);
    if (this.romanEnabled && map.getZoom() >= 12) {
      for (const entry of this.romans) this.drawAnchored(entry, args);
    }
    if (this.settlementEnabled && this.settlement && this.settlementAnchor && map.getZoom() >= 12) {
      this.settlement.updateTerrain((coordinate) =>
        queryTerrainSample(map, { lng: coordinate[0], lat: coordinate[1] }));
      this.drawAnchored(this.settlementAnchor, args, false);
    }
    // Static scene: only map movement, terrain updates and completed loads cause frames.
  }

  setRomanTestEnabled(enabled: boolean): void {
    this.romanEnabled = enabled;
    if (!enabled) this.clearRomans();
    this.romanStatus = { state: enabled ? "waiting" : "disabled", loaded: 0, errors: [] };
    this.onRomanStatus?.(this.romanStatus);
    this.map?.triggerRepaint();
  }

  setSettlementEnabled(enabled: boolean): void {
    this.settlementEnabled = enabled;
    if (enabled) void this.settlement?.load();
    else this.settlement?.unload();
  }

  /** Developer review fixture uses the same loader, foundations and anchor lifecycle. */
  previewRomanVariants(enabled: boolean | "baseline" = true): void {
    this.settlement?.unload();
    this.settlement = new SettlementScene(enabled === "baseline" ? ROMAN_SETTLEMENT_BASELINE : enabled ? ROMAN_VARIATION_PREVIEW : ROMAN_SETTLEMENT,
      (status) => this.onSettlementStatus?.(status), () => this.map?.triggerRepaint());
    this.updateSettlementAnchor();
    this.visitSettlement();
  }

  visitSettlement(origin?: Coordinate): void {
    if (!this.settlement || !this.map) return;
    if (origin) {
      this.settlement.relocate(origin);
      this.updateSettlementAnchor();
    }
    this.setSettlementEnabled(true);
    this.map.flyTo({ center: [...this.settlement.origin], zoom: 18.4, pitch: 55, bearing: -25 });
  }

  private updateSettlementAnchor(): void {
    if (!this.settlement) return;
    const lngLat = this.settlement.origin;
    // Surface vertices already contain displayed altitude in local metres.
    this.settlementAnchor = { scene: this.settlement.scene, lngLat, altitude: 0,
      anchor: geographicAnchor(lngLat, 0) };
  }

  private clearRomans(): void {
    this.generation++;
    for (const entry of this.romans) entry.lease?.release();
    this.romans = [];
    this.romanRequested = false;
  }

  private loadRomans(): void {
    this.romanRequested = true;
    const generation = this.generation;
    this.romanStatus = { state: "loading", loaded: 0, errors: [] };
    this.onRomanStatus?.(this.romanStatus);
    for (const placement of ROMAN_TEST_PLACEMENTS) void this.loadPlacement(placement, generation);
  }

  private async loadPlacement(placement: AssetPlacement, generation: number): Promise<void> {
    let lease: ModelLease | undefined;
    try {
      const asset = assetRegistry[placement.assetId];
      lease = await glbCache.acquire(assetUrl(asset.path));
      if (generation !== this.generation || !this.map) { lease.release(); return; }
      const scene = new THREE.Scene();
      this.buildLights(scene);
      scene.add(prepareAsset(lease.scene, asset, placement.rotationRadians));
      this.romans.push({ scene, lngLat: placement.lngLat, altitude: NaN,
        anchor: geographicAnchor(placement.lngLat, 0), lease });
      this.romanStatus.loaded++;
    } catch (error) {
      lease?.release();
      if (generation !== this.generation || !this.map) return;
      this.romanStatus.errors.push(`${placement.assetId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const { loaded, errors } = this.romanStatus;
    this.romanStatus.state = loaded + errors.length < ROMAN_TEST_PLACEMENTS.length ? "loading" : errors.length ? "error" : "ready";
    this.onRomanStatus?.({ ...this.romanStatus, errors: [...errors] });
    this.map?.triggerRepaint();
  }

  private drawAnchored(entry: AnchoredScene, args: CustomRenderMethodInput, followTerrain = true): void {
    const { map, renderer, camera } = this;
    if (!map || !renderer || !camera) return;
    // Query every map frame: DEM arrival, mesh resolution and exaggeration can all change.
    // Zero may mean no DEM yet; there is no reliable loaded-at-location flag in the public API.
    const altitude = followTerrain ? queryTerrainHeights(map, { lng: entry.lngLat[0], lat: entry.lngLat[1] })?.displayMeters ?? 0 : entry.altitude;
    if (altitude !== entry.altitude) {
      entry.altitude = altitude;
      entry.anchor = geographicAnchor(entry.lngLat, altitude);
    }
    const data = args.defaultProjectionData;
    if (map.getProjection().type === "globe") {
      const p = data.clippingPlane;
      if (dot(entry.anchor.sphere, [p[0], p[1], p[2]]) + p[3] < 0) return;
      const a = this.scratchA.fromArray(data.mainMatrix).multiply(entry.anchor.globe);
      const b = this.scratchB.fromArray(data.fallbackMatrix).multiply(entry.anchor.mercator);
      lerpMat4(this.scratchArray, b.elements, a.elements, data.projectionTransition);
      camera.projectionMatrix.fromArray(this.scratchArray);
    } else {
      camera.projectionMatrix.fromArray(data.mainMatrix).multiply(entry.anchor.mercator);
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const settlement = entry.scene === this.settlement?.scene ? this.settlement : null;
    renderer.shadowMap.enabled = settlement?.shadowsEnabled ?? false;
    if (settlement) renderer.shadowMap.needsUpdate = settlement.consumeShadowUpdate();
    renderer.render(entry.scene, camera);
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
   * `y = 0`, matching the local frame produced by {@link geographicAnchor}.
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

}
