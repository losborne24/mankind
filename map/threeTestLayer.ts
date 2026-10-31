import { clearSurfaceMapCache, surfaceMapCacheInfo } from "@/map/settlements/surfaceMaterials";
import { DEVELOPMENT_SETTLEMENTS, SettlementLODController, settlementDistance, type SettlementDescriptor, type SettlementLOD } from "@/map/settlements/settlementStreaming";
import { RegionalSettlement } from "@/map/settlements/RegionalSettlement";
import { PostEffects } from "@/map/settlements/PostEffects";
import { EXPOSURE } from "@/map/settlements/lighting";

/** MapLibre global-state key: 0 while the flat 2D ground/river fills show, 1 once the lit 3D ground has faded in. */
export const LOCAL_GROUND_STATE = "local-ground";
export interface AtmosphereOptions { haze: boolean; dof: boolean }

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
import { DEFAULT_AMBIENT_LIFE, type AmbientLifeOptions } from "@/map/settlements/AmbientLifeView";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap, MapSourceDataEvent } from "maplibre-gl";
import { dot, lerpMat4 } from "@/lib/geo";
import { geographicAnchor } from "@/map/geographicAnchor";
import { queryTerrainHeights, queryTerrainSample } from "@/map/terrain";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset, ROMAN_TEST_CENTER, ROMAN_TEST_PLACEMENTS, type AssetPlacement } from "@/map/romanTestScene";

import { SettlementScene, type SettlementStatus } from "@/map/settlements/SettlementScene";
import { ROMAN_SETTLEMENT, ROMAN_VARIATION_PREVIEW, ROMAN_SETTLEMENT_BASELINE, offsetCoordinate, type Coordinate } from "@/map/settlements/romanSettlement";

import { settlementProfileConfig, SETTLEMENT_PROFILES, DEFAULT_PROCEDURAL_CONFIG, type GenerationResult, type ProceduralSettlementConfig } from "@/map/settlements/proceduralSettlement";
import { ProceduralSettlementSession } from "@/map/settlements/ProceduralSettlementSession";

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

export interface StreamingStatus {
  lod: SettlementLOD; override: SettlementLOD | "auto"; activeId?: string; detailedScenes: number; descriptors: number;
  distanceMeters: number | null; stage: string; cache: ReturnType<typeof glbCache.snapshot>;
  surfaceCache: ReturnType<typeof surfaceMapCacheInfo>;
  scene?: ReturnType<SettlementScene["timing"]["snapshot"]>;
  layout?: ReturnType<ProceduralSettlementSession["timing"]["snapshot"]>;
  rendering?: {
    frames: number; samples: number; medianMs: number | null; p95Ms: number | null; cpuMedianMs: number | null;
    calls: number; triangles: number; geometries: number; textures: number;
    canvas: number[];
  };
}
export interface ThreeTestLayerOptions {
  onStreamingStatus?: (status: StreamingStatus) => void;
  id?: string;
  /** [longitude, latitude] in degrees to anchor the marker. */
  lngLat: readonly [number, number];
  onRomanStatus?: (status: RomanTestStatus) => void;
  onSettlementStatus?: (status: SettlementStatus) => void;
  onProceduralStatus?: (status: GenerationResult | null) => void;
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

  readonly lodController = new SettlementLODController();
  private descriptors: readonly SettlementDescriptor[] = process.env.NODE_ENV === "development" ? DEVELOPMENT_SETTLEMENTS : [];
  private streamingEnabled = true;
  private activeDescriptor?: SettlementDescriptor;
  private regional?: RegionalSettlement;
  private regionalAnchor?: AnchoredScene;
  private readonly layouts = new Map<string, import("@/map/settlements/romanSettlement").SettlementDefinition>();
  private localCandidate?: string;
  private candidateSince = 0;
  private streamTimer?: ReturnType<typeof setTimeout>;
  private lastStreamStatus = 0;
  private streamSignature = "";
  private markerFilter = "";
  private historicalSignature?: string;
  private measuredFrames = 0;
  private readonly cpuIntervals: number[] = [];
  private post?: PostEffects;
  private atmosphere: AtmosphereOptions = { haze: false, dof: false };
  private groundFadeShown = 0;
  private lastWaterFrame = 0;
  private readonly reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastMeasuredFrame = 0;
  private readonly frameIntervals: number[] = [];
  private onStreamingStatus?: (status: StreamingStatus) => void;
  private procedural: ProceduralSettlementSession | null = null;
  private committedProcedural?: GenerationResult;
  private readonly onProceduralStatus?: (status: GenerationResult | null) => void;
  private settlement: SettlementScene | null = null;
  private settlementAnchor: AnchoredScene | null = null;
  private settlementEnabled = false;
  private ambientLifeOptions = { ...DEFAULT_AMBIENT_LIFE };
  private readonly onSettlementStatus?: (status: SettlementStatus) => void;
  private readonly onVisibility = () => { this.settlement?.ambientLife.pause(); this.map?.triggerRepaint(); };
  private readonly onSettlementMove = () => {
    this.regional?.invalidate();
    this.procedural?.invalidate();
    this.settlement?.invalidateTerrain();
    this.map?.triggerRepaint();
  };
  private readonly onSettlementTerrain = () => {
    // Exaggeration/source changes invalidate heights in the old displayed frame.
    this.regional?.invalidate();
    if (this.procedural) {
      this.procedural.invalidate(true);
      this.settlement?.dispose();
      this.settlement = null; this.settlementAnchor = null;
      this.committedProcedural = undefined;
    }
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
    this.onStreamingStatus = options.onStreamingStatus;
    this.onRomanStatus = options.onRomanStatus;
    this.onSettlementStatus = options.onSettlementStatus;
    this.onProceduralStatus = options.onProceduralStatus;
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
    // Count all anchored scenes and shadow passes in this shared map frame.
    this.renderer.info.autoReset = false;
    // PCFSoftShadowMap was removed in Three 0.186: PCFShadowMap is already filtered, and light.shadow.radius widens it.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    this.buildLights(this.scene);
    this.buildMarker(this.scene);

    this.beacon = { scene: this.scene, lngLat: this.lngLat, altitude: NaN, anchor: geographicAnchor(this.lngLat, 0) };
    this.onRomanStatus?.(this.romanStatus);
    this.installSettlementMarkers();
    document.addEventListener("visibilitychange", this.onVisibility);
    map.on("moveend", this.onSettlementMove);
    map.on("terrain", this.onSettlementTerrain);
    map.on("sourcedata", this.onSettlementSource);
  }

  onRemove(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.map?.off("moveend", this.onSettlementMove);
    this.map?.off("terrain", this.onSettlementTerrain);
    this.map?.off("sourcedata", this.onSettlementSource);
    this.clearStreamingScene();
    this.post?.dispose(); this.post = undefined;
    this.regional?.dispose();this.regional=undefined;
    this.removeSettlementMarkers();
    this.settlement?.dispose();
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
    glbCache.clearIdle();clearSurfaceMapCache();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.map = null;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const { renderer, scene, camera, map } = this;
    if (!renderer || !scene || !camera || !map) return;
    const cpuStarted = performance.now();
    renderer.info.reset();
    if (process.env.NODE_ENV === "development") {
      const now = performance.now(), interval = now - this.lastMeasuredFrame;
      // Exclude idle gaps: these are active-frame observations, not refresh-rate promises.
      if (this.lastMeasuredFrame && interval < 250) {
        this.frameIntervals.push(interval);
        if (this.frameIntervals.length > 240) this.frameIntervals.shift();
      } else this.frameIntervals.length = 0;
      this.lastMeasuredFrame = now;
      this.measuredFrames++;
    }

    // Start requests only when settlement-scale detail is useful and Giza is nearby.
    const center = map.getCenter();
    if (this.historicalSignature === undefined && this.romanEnabled && !this.romanRequested && map.getZoom() >= 12 &&
        Math.abs(center.lng - ROMAN_TEST_CENTER[0]) < 0.15 && Math.abs(center.lat - ROMAN_TEST_CENTER[1]) < 0.15) {
      this.loadRomans();
    }
    // The preserved Giza integration fixture must also release live leases on departure.
    if (this.romanRequested && (map.getZoom() < 11 || Math.abs(center.lng-ROMAN_TEST_CENTER[0]) > .2 || Math.abs(center.lat-ROMAN_TEST_CENTER[1]) > .2)) {
      this.clearRomans();
      this.romanStatus = {state:this.romanEnabled ? "waiting" : "disabled",loaded:0,errors:[]};
      this.onRomanStatus?.(this.romanStatus);
    }
    renderer.resetState();
    // Shadow passes restore Three's viewport; keep it aligned after map resize.
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // Keep MapLibre's terrain depth. Clearing it here makes hills unable to occlude models.
    if (this.beacon && map.getZoom() < 12) this.drawAnchored(this.beacon, args);
    if (this.romanEnabled && map.getZoom() >= 12) {
      for (const entry of this.romans) this.drawAnchored(entry, args);
    }
    this.updateStreaming();
    if (this.settlementEnabled && this.procedural) this.updateProcedural();
    if (this.settlementEnabled && this.settlement && this.settlementAnchor && this.lodController.current.lod === "local") {
      this.settlement.setFineDetail(this.lodController.current.distance < 250);
      const exaggeration = map.getTerrain()?.exaggeration;
      this.settlement.updateTerrain((coordinate) =>
        queryTerrainSample(map, { lng: coordinate[0], lat: coordinate[1] }), typeof exaggeration === "number" && exaggeration > 0 ? exaggeration : 1);
      if (this.settlement.timing.stage === "ready") {
        this.updateAmbientFrame(center.lng, center.lat);
        this.tickLocalGround(performance.now());
        this.drawAnchored(this.settlementAnchor, args, false);
        this.applyPostEffects(gl);
      } else this.settlement.updateAmbientLife(performance.now(),false);
    } else this.settlement?.updateAmbientLife(performance.now(),false);
    if (this.regional && this.regionalAnchor) {
      this.regional.scene.visible = !this.historicalDetailFailed && this.settlement?.timing.stage !== "ready";
      if (this.regional.scene.visible) {
        this.regional.updateTerrain(coordinate => {
          const sample = queryTerrainSample(map,{lng:coordinate[0],lat:coordinate[1]});
          return sample.readiness === "confirmed" ? sample.displayMeters ?? undefined : undefined;
        });
        this.drawAnchored(this.regionalAnchor,args,false);
      }
    }
    this.publishStreamingStatus();
    if (process.env.NODE_ENV === "development") {
      this.cpuIntervals.push(performance.now() - cpuStarted);
      if (this.cpuIntervals.length > 240) this.cpuIntervals.shift();
    }
  }

  private guessVisible = true;
  /** Shows or hides every best-guess object in the local scene (the neighbourhood and its guessed ground). */
  setBestGuessVisible(visible: boolean): void { this.guessVisible = visible; this.settlement?.setGuessVisible(visible); this.map?.triggerRepaint(); }

  /** The reconstructed object under a screen point (CSS pixels): raised objects by ray, from the last settlement frame. */
  pickReconstruction(point: { x: number; y: number }): string | undefined {
    const map = this.map, urban = this.settlement?.urban;
    if (!map || !urban || !this.settlementAnchor) return undefined;
    const canvas = map.getCanvas(), x = point.x / canvas.clientWidth * 2 - 1, y = 1 - point.y / canvas.clientHeight * 2;
    const near = new THREE.Vector4(x, y, -1, 1).applyMatrix4(this.settlementInverseProjection), far = new THREE.Vector4(x, y, 1, 1).applyMatrix4(this.settlementInverseProjection);
    const a = new THREE.Vector3(near.x / near.w, near.y / near.w, near.z / near.w), b = new THREE.Vector3(far.x / far.w, far.y / far.w, far.z / far.w);
    return urban.pick(a, b.sub(a).normalize());
  }

  private tint = false;
  /** Colours reconstructed objects by certainty in the 3D scene. */
  setReconstructionTint(on: boolean): void { this.tint = on; this.settlement?.setReconstructionTint(on); this.map?.triggerRepaint(); }

  /** Turns distance haze and depth of field on for guided beats; bloom stays with the local scene. */
  setAtmosphere(options: AtmosphereOptions): void {
    if (options.haze === this.atmosphere.haze && options.dof === this.atmosphere.dof) return;
    this.atmosphere = { ...options };
    this.map?.triggerRepaint();
  }

  /** Camera position in the settlement frame (+x east, +y up, +z south), metres. */
  private cameraInSettlementFrame(target: THREE.Vector3): THREE.Vector3 {
    const map = this.map!, origin = this.settlement!.origin, eye = map._camera.transform.getCameraLngLat();
    const metresPerDegree = Math.PI / 180 * 6371008.8;
    return target.set((eye.lng - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * metresPerDegree,
      map._camera.transform.getCameraAltitude(), -(eye.lat - origin[1]) * metresPerDegree);
  }
  /** Dev inspection only. */
  get debugSettlement() { return this.settlement; }
  private readonly eyeScratch = new THREE.Vector3();
  private readonly eyeTranslation = new THREE.Matrix4();
  private readonly settlementInverseProjection = new THREE.Matrix4();
  private readonly centreScratch = new THREE.Vector3();

  /** Animates the lit ground and river, and hands the flat 2D fills over to it as it fades in. */
  private tickLocalGround(now: number): void {
    const map = this.map!, ground = this.settlement?.contextGround;
    const eye = this.cameraInSettlementFrame(this.eyeScratch);
    const needsFrames = ground?.tick(now, eye, !this.reducedMotion && !document.hidden) ?? false;
    const fade = ground ? Math.round(ground.groundFade * 50) / 50 : 0;
    if (fade !== this.groundFadeShown) { this.groundFadeShown = fade; map.setGlobalStateProperty(LOCAL_GROUND_STATE, fade); }
    if (needsFrames && now - this.lastWaterFrame > 32) { this.lastWaterFrame = now; map.triggerRepaint(); }
  }

  /** Bloom, haze and depth of field over the frame drawn so far (see PostEffects). */
  private applyPostEffects(gl: WebGL2RenderingContext): void {
    const { renderer, camera, map, settlement } = this;
    if (!renderer || !camera || !map || !settlement) return;
    const { haze, dof } = this.atmosphere;
    this.post ??= new PostEffects();
    const eye = this.cameraInSettlementFrame(this.eyeScratch), c = map.getCenter(), origin = settlement.origin;
    const metresPerDegree = Math.PI / 180 * 6371008.8, groundY = settlement.centreHeight;
    const centre = this.centreScratch.set((c.lng - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * metresPerDegree, groundY, -(c.lat - origin[1]) * metresPerDegree);
    this.post.apply(renderer, gl, { bloom: 0.2, haze: haze ? 1 : 0, dof: dof ? 0.7 : 0, inverseProjection: this.settlementInverseProjection,
      eye, groundY, focusMeters: Math.max(40, eye.distanceTo(centre)) });
  }

  private updateAmbientFrame(lng: number, lat: number): void {
    if (this.settlement && this.map) {
      const map = this.map;
      const origin = this.settlement.origin;
      const east = (lng-origin[0])*Math.cos(origin[1]*Math.PI/180)*111320;
      const south = (lat-origin[1])*111320;
      const visible = this.settlementEnabled && this.lodController.current.lod === "local" && Math.hypot(east,south) < 850 &&
        !document.hidden && map.getBounds().contains([origin[0],origin[1]]);
      if (this.settlement.updateAmbientLife(performance.now(),visible)) map.triggerRepaint();
    }
  }

  configureAmbientLife(options: AmbientLifeOptions): void {
    this.ambientLifeOptions = { ...options };
    this.settlement?.configureAmbientLife(options);
    this.map?.triggerRepaint();
  }

  setRomanTestEnabled(enabled: boolean): void {
    this.romanEnabled = enabled;
    if (!enabled) this.clearRomans();
    this.romanStatus = { state: enabled ? "waiting" : "disabled", loaded: 0, errors: [] };
    this.onRomanStatus?.(this.romanStatus);
    this.map?.triggerRepaint();
  }

  /** Explicit debug visits use the same distance gates, cancellation and single scene slot. */
  setSettlementEnabled(enabled: boolean): void {
    this.streamingEnabled=enabled;
    if(this.map?.getLayer("settlement-descriptors")) this.map.setLayoutProperty("settlement-descriptors","visibility",enabled?"visible":"none");
    if (!enabled) {this.clearStreamingScene();this.regional?.dispose();this.regional=undefined;this.regionalAnchor=undefined;}
    this.map?.triggerRepaint();
  }

  previewRomanVariants(enabled: boolean | "baseline" = true): void {
    this.visitDefinition(enabled === "baseline" ? ROMAN_SETTLEMENT_BASELINE : enabled ? ROMAN_VARIATION_PREVIEW : ROMAN_SETTLEMENT);
  }
  private visitDefinition(definition: import("@/map/settlements/romanSettlement").SettlementDefinition, origin: Coordinate=definition.origin): void {
    this.setDebugDescriptor({id:definition.id,origin,radiusMeters:(definition.groundSizeMeters??140)/2,profile:"village",seed:definition.seed??7,definition:{...definition,origin}});
    this.map?.flyTo({center:[...origin],zoom:18.4,pitch:55,bearing:-25});
  }
  visitSettlement(origin?: Coordinate): void {
    this.visitDefinition(ROMAN_SETTLEMENT,origin??ROMAN_SETTLEMENT.origin);
  }
  visitProceduralSettlement(seed = 7, origin: Coordinate = DEFAULT_PROCEDURAL_CONFIG.origin, overrides?: Partial<ProceduralSettlementConfig>): void {
    const config={...(overrides?.profile ? settlementProfileConfig(overrides.profile) : DEFAULT_PROCEDURAL_CONFIG),...overrides,seed,origin};
    this.setDebugDescriptor({id:"debug-procedural",origin,radiusMeters:config.extentMeters+25,profile:config.profile??"village",seed,config});
    this.map?.flyTo({center:[...origin],zoom:18.4,pitch:55,bearing:-25});
  }
  private setDebugDescriptor(descriptor: SettlementDescriptor): void {
    this.historicalSignature = undefined;
    this.clearStreamingScene();this.regional?.dispose();this.regional=undefined;this.regionalAnchor=undefined;
    this.layouts.clear();this.descriptors=[descriptor];this.streamingEnabled=true;
    this.lodController.current={lod:"global",distance:Infinity};
    this.installSettlementMarkers();this.map?.triggerRepaint();
  }
  useDevelopmentSettlements(): void {
    this.historicalSignature = undefined;
    this.clearStreamingScene();this.regional?.dispose();this.regional=undefined;this.regionalAnchor=undefined;
    this.descriptors=DEVELOPMENT_SETTLEMENTS;this.streamingEnabled=true;
    this.lodController.current={lod:"global",distance:Infinity};
    this.installSettlementMarkers();this.map?.triggerRepaint();
  }
  visitStreamingSettlement(id: string): void {
    this.useDevelopmentSettlements();const d=this.descriptors.find(d=>d.id===id);
    if(d)this.map?.flyTo({center:[...d.origin],zoom:18.4,pitch:55,bearing:-25});
  }
  /** Dataset selection supplies explicit definitions; an empty set never falls back to fixtures. */
  setHistoricalSettlements(descriptors: readonly SettlementDescriptor[]): void {
    if (descriptors.some(d => !d.definition)) throw Error('Historical streaming requires explicit layouts');
    const signature = JSON.stringify(descriptors);
    if (signature === this.historicalSignature) return;
    this.historicalSignature = signature;
    this.clearRomans();
    this.romanStatus = { state: this.romanEnabled ? 'waiting' : 'disabled', loaded: 0, errors: [] };
    this.onRomanStatus?.(this.romanStatus);
    this.clearStreamingScene(); this.regional?.dispose(); this.regional = undefined; this.regionalAnchor = undefined;
    this.layouts.clear(); this.descriptors = descriptors; this.streamingEnabled = true;
    this.lodController.override = 'auto'; this.lodController.current = { lod: 'global', distance: Infinity };
    this.installSettlementMarkers(); this.map?.triggerRepaint();
  }
  setSettlementLOD(override: SettlementLOD | "auto"): void {this.lodController.override=override;this.map?.triggerRepaint();}
  getStreamingStatus(): StreamingStatus {
    const c=this.lodController.current;
    const intervals = [...this.frameIntervals].sort((a,b)=>a-b);
    const rendering = process.env.NODE_ENV === "development" && this.renderer ? {
      frames: this.measuredFrames, samples: intervals.length,
      medianMs: intervals.length ? intervals[Math.floor(intervals.length*.5)] : null,
      cpuMedianMs: this.cpuIntervals.length ? [...this.cpuIntervals].sort((a,b)=>a-b)[Math.floor(this.cpuIntervals.length*.5)] : null,
      p95Ms: intervals.length ? intervals[Math.min(intervals.length-1,Math.floor(intervals.length*.95))] : null,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      canvas: [this.map!.getCanvas().width,this.map!.getCanvas().height],
    } : undefined;
    return {lod:c.lod,override:this.lodController.override,activeId:this.activeDescriptor?.id??(c.lod!=="global"?c.descriptor?.id:undefined),detailedScenes:this.settlement?1:0,descriptors:this.descriptors.length,distanceMeters:Number.isFinite(c.distance)?Math.round(c.distance):null,
      stage:!this.streamingEnabled?"disabled":this.settlement?.timing.stage??this.procedural?.timing.stage??(this.localCandidate?"queued":c.lod),cache:glbCache.snapshot(),surfaceCache:surfaceMapCacheInfo(),scene:this.settlement?.timing.snapshot(),layout:this.procedural?.timing.snapshot(),rendering};
  }
  private clearStreamingScene(): void {
    if(this.streamTimer)clearTimeout(this.streamTimer);this.streamTimer=undefined;this.localCandidate=undefined;
    this.procedural?.cancel();this.procedural=null;this.committedProcedural=undefined;
    this.settlementEnabled=false;this.activeDescriptor=undefined;
    this.settlement?.dispose();this.settlement=null;this.settlementAnchor=null;this.historicalDetailFailed=false;
    if (this.groundFadeShown) { this.groundFadeShown = 0; this.map?.setGlobalStateProperty(LOCAL_GROUND_STATE, 0); }
    this.onProceduralStatus?.(null);
  }
  /** Scenario travel shares the existing debounce and scene/cache ownership. No speculative asset loads. */
  private historicalDetailFailed = false;
  private scenarioTravelling = false;
  setScenarioTravel(active: boolean): void { this.scenarioTravelling = active; this.map?.triggerRepaint(); }
  private updateStreaming(): void {
    const map=this.map;if(!map)return;
    // MapLibre 6.15 exposes its projection-aware camera via _camera; keep this adapter here.
    const eye=map._camera.transform.getCameraLngLat(), altitude=Math.max(0,map._camera.transform.getCameraAltitude()-map.getCameraTargetElevation());
    // A settlement is in view when the camera stands inside its extent or any of its centre and rim projects on screen,
    // so panning the origin out of frame while looking at the rest of a large city keeps it streaming.
    const canvas=map.getCanvas(),onScreen=(c:Coordinate)=>{const p=map.project([...c]);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-100&&p.y>=-100&&p.x<=canvas.clientWidth+100&&p.y<=canvas.clientHeight+100;};
    const observations=this.streamingEnabled?this.descriptors.map(descriptor=>{
      const distance=settlementDistance([eye.lng,eye.lat],altitude,descriptor),r=descriptor.radiusMeters;
      const visible=settlementDistance([eye.lng,eye.lat],0,descriptor)===0||onScreen(descriptor.origin)||
        Array.from({length:12},(_,i)=>i*Math.PI/6).some(a=>onScreen(offsetCoordinate(descriptor.origin,[Math.cos(a)*r,Math.sin(a)*r])));
      return {descriptor,distance,visible};
    }):[];
    const decision=this.lodController.update(observations),d=decision.descriptor;
    const markerFilter=decision.lod === "global" || this.historicalDetailFailed ? "" : d?.id ?? "";
    if(markerFilter!==this.markerFilter && map.getLayer("settlement-descriptors")) {
      this.markerFilter=markerFilter;
      map.setFilter("settlement-descriptors",["!=",["get","id"],markerFilter]);
    }
    if (this.activeDescriptor && (decision.lod!=="local" || this.activeDescriptor.id!==d?.id)) this.clearStreamingScene();
    if (decision.lod==="global" || !d) {
      if(this.localCandidate)this.clearStreamingScene();
      this.regional?.dispose();this.regional=undefined;this.regionalAnchor=undefined;
    } else {
      if(this.regional?.descriptor!==d) {
        this.regional?.dispose();this.regional=new RegionalSettlement(d,this.layouts.get(d.id)??d.definition);
        this.regionalAnchor={scene:this.regional.scene,lngLat:d.origin,altitude:0,anchor:geographicAnchor(d.origin,0)};
      }
      // Remain on the cheap silhouette while travelling or waiting for DEM/assets.
      if (decision.lod==="local" && !this.activeDescriptor) {
        const now=performance.now();
        if(this.localCandidate!==d.id) {this.localCandidate=d.id;this.candidateSince=now;}
if(!this.scenarioTravelling && !map.isMoving() && now-this.candidateSince>=200) {
          this.activeDescriptor=d;this.localCandidate=undefined;
          this.settlementEnabled=true;
          if(d.definition) {
            this.settlement=new SettlementScene(d.definition,s=>{
              this.historicalDetailFailed=d.definition!.ambientLife===false && s.loaded===0 && s.errors.length>0;
              this.onSettlementStatus?.(s);
            },()=>this.map?.triggerRepaint());
            this.settlement.setGuessVisible(this.guessVisible); this.settlement.setReconstructionTint(this.tint);
            this.updateSettlementAnchor();void this.settlement.load();
          } else {
            const config={...settlementProfileConfig(d.profile),...d.config,origin:d.origin,seed:d.seed};
            this.ambientLifeOptions.count=config.profile ? SETTLEMENT_PROFILES[config.profile].villagers : DEFAULT_AMBIENT_LIFE.count;
            this.procedural=new ProceduralSettlementSession(config);this.procedural.start();
          }
        } else if(!this.streamTimer) this.streamTimer=setTimeout(()=>{this.streamTimer=undefined;this.map?.triggerRepaint();},220);
      } else if(decision.lod!=="local" && this.localCandidate) this.clearStreamingScene();
    }
    // Hide the proxy once terrain-attached detailed buildings are visible.
    if(this.regional)this.regional.scene.visible=!this.historicalDetailFailed && !(this.settlement && this.settlement.timing.stage==="ready");
  }
  private publishStreamingStatus(): void {
    const status=this.getStreamingStatus();
    const signature=JSON.stringify([status.lod,status.override,status.activeId,status.detailedScenes,status.descriptors,status.stage,status.cache.entries,status.cache.users]);
    if(signature!==this.streamSignature || performance.now()-this.lastStreamStatus>400) {
      this.streamSignature=signature;this.lastStreamStatus=performance.now();this.onStreamingStatus?.(status);
    }
  }
  private installSettlementMarkers(): void {
    const map=this.map;if(!map)return;
    this.removeSettlementMarkers();this.markerFilter="";
    map.addSource("settlement-descriptors",{type:"geojson",data:{type:"FeatureCollection",features:this.descriptors.map(d=>({type:"Feature",properties:{id:d.id,profile:d.profile,fictional:this.historicalSignature===undefined},geometry:{type:"Point",coordinates:[...d.origin]}}))}});
    map.addLayer({id:"settlement-descriptors",type:"circle",source:"settlement-descriptors",paint:{"circle-radius":3,"circle-color":"#d1ad7a","circle-stroke-color":"#40382a","circle-stroke-width":1}});
  }
  private removeSettlementMarkers(): void {
    if(this.map?.getLayer("settlement-descriptors"))this.map.removeLayer("settlement-descriptors");
    if(this.map?.getSource("settlement-descriptors"))this.map.removeSource("settlement-descriptors");
  }

  private updateProcedural(): void {
    if (!this.procedural || !this.map) return;
    try {
      const result = this.procedural.update((coordinate) => queryTerrainSample(this.map!,{lng:coordinate[0],lat:coordinate[1]}));
      if (!result || result === this.committedProcedural) return;
      // Invalidated plots must never remain visible while their replacement waits for DEM.
      this.settlement?.dispose(); this.settlement = null; this.settlementAnchor = null;
      this.committedProcedural = result;
      if(result.definition && this.activeDescriptor) {
        this.layouts.set(this.activeDescriptor.id,result.definition);
        // Upgrade representative clusters to real footprint metadata without a second GLB.
        this.regional?.dispose();this.regional=new RegionalSettlement(this.activeDescriptor,result.definition);
        this.regionalAnchor={scene:this.regional.scene,lngLat:this.activeDescriptor.origin,altitude:0,anchor:geographicAnchor(this.activeDescriptor.origin,0)};
      }
      this.onProceduralStatus?.(result);
      if (result.definition) {
        this.settlement = new SettlementScene(result.definition,
          (status) => this.onSettlementStatus?.(status), () => this.map?.triggerRepaint());
        this.updateSettlementAnchor();
        void this.settlement.load();
      }
    } catch (error) {
      const config = this.procedural.config;
      this.procedural.cancel();
      this.onProceduralStatus?.({state:"unsuitable",seed:config.seed,requested:config.targetBuildingCount,accepted:0,rejected:0,terrainReady:false,message:`Generation error: ${error instanceof Error ? error.message : String(error)}`,navigation:{nodes:[],edges:[]}});
    }
  }

  private updateSettlementAnchor(): void {
    if (!this.settlement) return;
    this.settlement.configureAmbientLife(this.ambientLifeOptions);
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
    // Lighting needs the real eye position (specular, reflections). The projection above maps settlement metres
    // straight to clip space, so seat the camera at the eye and fold the inverse translation into the projection.
    if (settlement) {
      this.settlementInverseProjection.copy(camera.projectionMatrixInverse);
      this.cameraInSettlementFrame(camera.position);
      camera.projectionMatrix.multiply(this.eyeTranslation.makeTranslation(camera.position.x, camera.position.y, camera.position.z));
    } else camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const renderStarted = performance.now();
    const shadows = settlement?.shadowsEnabled && settlement.consumeShadowUpdate();
    // Filmic tone mapping applies to the lit local scene only; the globe-scale markers keep their original look.
    renderer.toneMapping = settlement ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.shadowMap.enabled = settlement?.shadowsEnabled ?? false;
    if (settlement) renderer.shadowMap.needsUpdate = Boolean(shadows);
    renderer.render(entry.scene, camera);
    settlement?.timing.add(shadows ? "renderWithShadowCpu" : "renderCpu", renderStarted);
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
