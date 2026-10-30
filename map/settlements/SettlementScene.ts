import { SettlementTiming } from "@/map/settlements/settlementTiming";
import { AmbientLifeView, type AmbientLifeOptions, type AmbientLifeStatus } from "@/map/settlements/AmbientLifeView";
import { ambientNavigation } from "@/map/settlements/ambientNavigation";
import * as THREE from "three";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset } from "@/lib/assets/prepareAsset";
import { offsetCoordinate, type Coordinate, type LocalPoint, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { contactFoundationSurface, roadNetworkSurface, groundSurface, writeSurfaceHeights, type TerrainSurface } from "@/map/settlements/terrainSurfaces";

import { settlementSurfaceMapsAsync, weatheredMaterial, GROUND_WIDTH, GROUND_DEPTH, type GroundFootprint } from "@/map/settlements/surfaceMaterials";
import { buildingContacts, createSettlementEnvironment } from "@/map/settlements/settlementEnvironment";
import { settlementEnvironmentConfig } from "@/map/settlements/environmentConfig";
import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";
import { InstancedScenery, type GroundResult } from "@/map/settlements/InstancedScenery";
import { ContextGround } from "@/map/settlements/ContextGround";
import { GROUND_BOUNCE_COLOUR, SKY_COLOUR, SUN_COLOUR, SUN_DIRECTION } from "@/map/settlements/lighting";


export interface SettlementStatus {
  state: "unloaded" | "loading" | "waiting-terrain" | "ready" | "partial" | "error";
  origin: Coordinate;
  loaded: number;
  total: number;
  terrainPending: number;
  terrainRetained: number;
  steepSites: number;
  errors: string[];
  sceneryLoaded: number;
  sceneryTotal: number;
  scenerySteep: number;
  ambientLife?: AmbientLifeStatus;
}
interface SurfaceEntry {
  surface: TerrainSurface;
  mesh: THREE.Mesh;
  model?: THREE.Group;
  lease?: ModelLease;
  heights?: number[];
  shadowReceiver?: boolean;
  libraryBuilding?: boolean;
}
export type TerrainSampler = (coordinate: Coordinate) => number | null | import("@/map/terrain").TerrainSample;

/** Owns layout instances and procedural surfaces, never a renderer or render loop. */
export class SettlementScene {
  readonly timing = new SettlementTiming();
  readonly scene = new THREE.Scene();
  origin: Coordinate;
  readonly ambientLife: AmbientLifeView;
  private readonly root = new THREE.Group();
  private readonly scenery = new InstancedScenery();
  private environment: ReturnType<typeof createSettlementEnvironment> | undefined;
  private sun: THREE.DirectionalLight | null = null;
  contextGround: ContextGround | null = null;
  /** Mean floor height of the visible buildings, settlement frame; the ground the camera is looking at. */
  centreHeight = 0;
  private shadowDirty = true;
  shadowsEnabled = true;
  private entries: SurfaceEntry[] = [];
  private resources: Array<{ dispose(): void }> = [];
  private materialOverrides = new Map<THREE.Material, Map<number, THREE.Material>>();
  private buildingBatches: Array<{ mesh: THREE.InstancedMesh; sources: Array<{ mesh: THREE.Mesh; model: THREE.Object3D }> }> = [];
  private readonly knownHeights = new Map<string, number>();
  private active = false;
  private texturesReady = false;
  private fineDetail = true;
  private generation = 0;
  private dirty = true;
  private loading?: Promise<void>;
  private loaded = 0;
  private errors: string[] = [];
  private lastStatus = "";
  private readonly lastLifeStatus: AmbientLifeStatus = {active:-1,walking:-1,idle:-1,paused:true};
  private terrainPending = 0;
  private terrainRetained = 0;
  private steepSites = 0;
  private scenerySteep = 0;

  constructor(
    readonly definition: SettlementDefinition,
    private readonly changed: (status: SettlementStatus) => void,
    private readonly repaint: () => void,
    private readonly cache: Pick<typeof glbCache, "acquire"> = glbCache,
  ) {
    this.origin = [...definition.origin];
    this.ambientLife = new AmbientLifeView(definition.ambientLife === false ? { nodes: [], edges: [] } : ambientNavigation(definition), definition.seed ?? 0);
    if (definition.ambientLife === false) this.ambientLife.configure({ enabled: false, count: 0, paths: false });
    this.scene.add(this.root, this.scenery.group, this.ambientLife.group);
  }

  load(): Promise<void> {
    if (this.active) return this.loading ?? Promise.resolve();
    this.active = true;
    this.texturesReady = false;
    this.timing.reset();
    const preparationStarted = performance.now();
    const generation = this.generation;
    const width = this.definition.groundSizeMeters ?? GROUND_WIDTH, depth = this.definition.groundSizeMeters ?? GROUND_DEPTH;
    this.environment = createSettlementEnvironment(this.definition);
    const sky = new THREE.HemisphereLight(SKY_COLOUR, GROUND_BOUNCE_COLOUR, 1.4);
    this.sun = new THREE.DirectionalLight(SUN_COLOUR, 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -Math.max(68,width/2+12), right: Math.max(68,width/2+12), top: Math.max(78,depth/2+12), bottom: -Math.max(78,depth/2+12), near: 1, far: Math.max(180,depth+60) });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.radius = 3;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.root.add(sky, this.sun, this.sun.target);
    this.resources.push(this.sun.shadow);
    this.shadowDirty = true;
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    roadMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n#ifdef USE_MAP\nroughnessFactor *= 0.94 + 0.06 * texture2D(map, vMapUv).g;\n#endif');
    };
    roadMaterial.customProgramCacheKey = () => 'settlement-road-roughness-v1';
    const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x918570, roughness: 1, flatShading: true, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
    this.resources.push(roadMaterial, foundationMaterial);
    this.addSurface(roadNetworkSurface(this.definition.roads, this.definition.roadFrameHeadingRadians), roadMaterial, "road-network");
    const footprints: GroundFootprint[] = [];
    const groundMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.resources.push(groundMaterial);
    const contextSpec = this.definition.contextGround;
    // A context ground is lit and shadowed itself, so it replaces both the translucent treatment and the shadow catcher.
    if (!contextSpec) {
      const treatment = this.addSurface(groundSurface(width, depth, 2), groundMaterial, "settlement-ground");
      treatment.mesh.renderOrder = 1;
      const catcher = new THREE.ShadowMaterial({ opacity: 0.27, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      this.resources.push(catcher);
      const ground = this.addSurface(groundSurface(width, depth, 2), catcher, "terrain-shadow-receiver");
      ground.shadowReceiver = true;
      ground.mesh.renderOrder = 2;
    }
    this.entries[0].mesh.renderOrder = 3;
    const sceneryLoad = this.scenery.load(this.environment.scenery, this.cache, () => {
      this.dirty = this.shadowDirty = true; this.publish(); this.repaint();
    });
    const groundLoad = contextSpec ? new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => {
      if (!this.active || generation !== this.generation) return;
      const started = performance.now();
      this.contextGround = new ContextGround(contextSpec, this.definition.buildings.flatMap(buildingContacts));
      this.root.add(this.contextGround.group); this.resources.push(this.contextGround);
      this.timing.add("contextGround", started);
      this.dirty = this.shadowDirty = true; this.repaint();
    }) : Promise.resolve();
    this.timing.add("surfaceAndShadowSetup", preparationStarted);
    const assetsStarted = performance.now();
    this.timing.stage = "assets";
    this.loading = Promise.all([this.definition.ambientLife === false ? Promise.resolve() : this.ambientLife.load(this.cache), sceneryLoad, groundLoad, ...this.definition.buildings.map(async (building) => {
      let lease: ModelLease | undefined;
      try {
        const asset = assetRegistry[building.assetId];
        lease = await this.cache.acquire(assetUrl(asset.path), "nodeName" in asset ? asset.nodeName : undefined);
        if (!this.active || generation !== this.generation) { lease.release(); return; }
        const assemblyStarted = performance.now();
        const model = prepareAsset(lease.scene, asset);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const heading = building.headingRadians ?? 0;
        footprints.push({ offset: building.offset, width: size.x, depth: size.z, heading });
        const variant = "nodeName" in asset ? 0 : [...building.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
        const entry = this.addSurface(contactFoundationSurface(buildingContacts(building)), foundationMaterial, `${building.id}-foundation`);
        entry.libraryBuilding = "nodeName" in asset;
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Closed prototype buildings are double-sided. Back-face shadow casting
            // avoids their front surfaces shadowing themselves; cache materials stay immutable.
            const shadowMaterial = (material: THREE.Material) => {
              let variants = this.materialOverrides.get(material);
              if (!variants) { variants = new Map(); this.materialOverrides.set(material, variants); }
              let copy = variants.get(variant);
              if (!copy) {
                copy = this.definition.ambientLife === false ? material.clone() : weatheredMaterial(material, variant);
                if (this.definition.ambientLife === false) copy.shadowSide = THREE.BackSide;
                variants.set(variant, copy); this.resources.push(copy);
              }
              return copy;
            };
            object.material = Array.isArray(object.material) ? object.material.map(shadowMaterial) : shadowMaterial(object.material);
            object.castShadow = true; object.receiveShadow = true; configureTerrainShadowCaster(object);
          }
        });
        entry.mesh.castShadow = true;
        configureTerrainShadowCaster(entry.mesh);
        model.name = building.id;
        model.rotation.y = heading;
        model.position.set(building.offset[0], 0, building.offset[1]);
        model.visible = false;
        this.root.add(model);
        entry.model = model;
        entry.lease = lease;
        this.loaded++;
        this.timing.add("buildingAssembly", assemblyStarted);
      } catch (error) {
        lease?.release();
        if (!this.active || generation !== this.generation) return;
        this.errors.push(`${building.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.dirty = this.shadowDirty = true;
      this.publish();
      this.repaint();
    })]).then(async () => {
      if (this.active && generation === this.generation) {
        this.timing.add("assetWallIncludingAssembly", assetsStarted);
        this.timing.stage = "textures";
        const textureStarted = performance.now();
        const maps = await settlementSurfaceMapsAsync(this.definition, footprints, this.environment!, () => !this.active || generation !== this.generation, cpuMs=>{this.timing.totals.cpuTextures=cpuMs;});
        if (!maps) return;
        if (!this.active || generation !== this.generation) {maps.ground.dispose();maps.road.dispose();return;}
        this.timing.add("textureWall", textureStarted);
        this.texturesReady = true;
        this.timing.stage = "placement";
        this.dirty = true;
        groundMaterial.opacity = 1; roadMaterial.opacity = 1;
        groundMaterial.map = maps.ground; groundMaterial.needsUpdate = true;
        roadMaterial.map = maps.road; roadMaterial.needsUpdate = true;
        this.resources.push(maps.ground, maps.road);
        const batchStarted = performance.now();
        this.batchLibraryBuildings();
        this.timing.add("batchAssembly", batchStarted);
        this.publish(); this.repaint();
      }
    });
    this.publish();
    this.repaint();
    return this.loading;
  }

  /** Reuses loaded models and geometry; invalidates all old-location terrain samples. */
  relocate(origin: Coordinate): void {
    // Validate before changing the live scene.
    offsetCoordinate(origin, [0, 0]);
    this.origin = [...origin];
    this.invalidateTerrain(true);
    this.publish();
    this.repaint();
  }

  invalidateTerrain(reset = false): void {
    this.dirty = true;
    if (reset) {
      this.ambientLife.invalidateTerrain();
      this.knownHeights.clear();
      for (const batch of this.buildingBatches) batch.mesh.visible = false;
      this.scenery.invalidateTerrain();
      this.shadowDirty = true;
      this.terrainPending = this.entries.length;
      this.terrainRetained = this.steepSites = this.scenerySteep = 0;
      for (const entry of this.entries) {
        entry.heights = undefined;
        entry.mesh.visible = false;
        if (entry.model) entry.model.visible = false;
      }
    }
  }

  /** Call from the existing map frame after terrain/source/camera changes. */
  updateTerrain(sample: TerrainSampler): void {
    if (!this.active || !this.dirty) return;
    const terrainStarted = performance.now();
    this.dirty = false;
    this.terrainPending = this.terrainRetained = this.steepSites = this.scenerySteep = 0;
    this.shadowDirty = true;
    const frameSamples = new Map<string, GroundResult>();
    const resolve = (point: LocalPoint): GroundResult => {
      const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
      let result = frameSamples.get(key);
      if (!result) {
        const sampled = sample(offsetCoordinate(this.origin, point));
        const height = typeof sampled === "object" && sampled !== null ? sampled.displayMeters : sampled;
        const confirmed = typeof sampled !== "object" || sampled === null || sampled.readiness === "confirmed";
        const valid = confirmed && height !== null && Number.isFinite(height);
        if (valid) this.knownHeights.set(key, height);
        result = { height: this.knownHeights.get(key), retained: !valid };
        frameSamples.set(key, result);
      }
      return result;
    };
    for (const entry of this.entries) {
      const count = entry.model ? entry.surface.points.length / 2 : entry.surface.points.length;
      const heights: number[] = [];
      let missing = false, retained = false;
      for (let i = 0; i < count; i++) {
        const result = resolve(entry.surface.points[i]);
        if (result.height === undefined) missing = true;
        else heights.push(result.height);
        retained ||= result.retained;
      }
      if (missing) {
        this.terrainPending++;
        entry.mesh.visible = false;
        if (entry.model) entry.model.visible = false;
        continue;
      }
      if (retained) {
        this.terrainRetained++;
        // Keep the entire previous surface coherent while any sample is stale.
        if (entry.heights) heights.splice(0, heights.length, ...entry.heights);
      }
      const top = entry.model ? Math.max(...heights.map((h, i) => h - (entry.surface.seatingOffsets?.[i] ?? 0))) + settlementEnvironmentConfig.seatingClearance : undefined;
      if (top !== undefined && top - Math.min(...heights) > this.definition.maxFoundationRiseMeters) {
        this.steepSites++;
        entry.mesh.visible = false;
        entry.model!.visible = false;
        continue;
      }
      if (!entry.heights || heights.some((height, i) => height !== entry.heights![i])) {
        writeSurfaceHeights(entry.surface, heights, top);
        if (entry.shadowReceiver || entry.mesh.name === "settlement-ground") {
          const positions = entry.surface.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < heights.length; i++) positions.setY(i, heights[i] + (entry.shadowReceiver ? 0.065 : 0.05));
          entry.surface.geometry.computeBoundingSphere();
        }
        entry.heights = heights;
      }
      entry.mesh.visible = true;
      if (entry.model) { entry.model.position.y = top!; entry.model.visible = true; }
    }
    if (this.contextGround && this.definition.contextGround && !this.contextGround.update(resolve, this.definition.contextGround)) this.terrainPending++;
    const sceneryGround = this.scenery.updateTerrain(resolve);
    this.terrainPending += sceneryGround.pending;
    this.terrainRetained += sceneryGround.retained;
    this.scenerySteep = sceneryGround.steep;
    const stableFloors = this.entries.filter((entry) => entry.model?.visible).map((entry) => entry.model!.position.y);
    const center = stableFloors.length ? { height: stableFloors.reduce((sum, value) => sum + value, 0) / stableFloors.length } : resolve([0, 0]);
    if (center.height !== undefined) this.centreHeight = center.height;
    if (this.sun && center.height !== undefined) {
      const lightScale = Math.max(1, (this.definition.groundSizeMeters ?? GROUND_DEPTH) / GROUND_DEPTH);
      this.sun.target.position.set(0, center.height, 0);
      this.sun.position.copy(SUN_DIRECTION).multiplyScalar(95 * lightScale).add(this.sun.target.position);
    }
    this.updateAccessPaths();
    this.syncBuildingBatches();
    this.timing.add("terrainPlacement", terrainStarted);
    if (this.entries.some(e=>e.model?.visible) && this.timing.stage === "placement") this.timing.ready();
    this.publish();
  }

  unload(): void {
    this.active = false;
    this.timing.stage = "unloaded";
    this.generation++;
    this.scenery.unload();
    this.ambientLife.unload();
    this.environment = undefined;
    this.sun = null;
    this.contextGround = null;
    for (const entry of this.entries) entry.lease?.release();
    for (const resource of this.resources) resource.dispose();
    this.root.clear();
    this.entries = [];
    this.resources = [];
    this.materialOverrides.clear();
    this.buildingBatches = [];
    this.knownHeights.clear();
    this.loaded = this.terrainPending = this.terrainRetained = this.steepSites = this.scenerySteep = 0;
    this.errors = [];
    this.loading = undefined;
    this.dirty = true;
    this.publish();
    this.repaint();
  }

  configureAmbientLife(options: AmbientLifeOptions): void {
    this.ambientLife.configure(this.definition.ambientLife === false ? { enabled: false, count: 0, paths: false } : options); this.publish(); this.repaint();
  }

  updateAmbientLife(now: number, visible: boolean): boolean {
    const animationStarted = performance.now();
    const road = this.entries[0];
    const animate = this.active && this.ambientLife.update(now, visible, road?.mesh);
    // Counts only publish when they change, not on every animation frame.
    const s = this.ambientLife.status;
    const old = this.lastLifeStatus;
    if (s.active !== old.active || s.walking !== old.walking || s.idle !== old.idle || s.paused !== old.paused || s.error !== old.error) {
      Object.assign(old,s); this.publish();
    }
    this.timing.add("ambientUpdate", animationStarted);
    return animate;
  }

  dispose(): void { this.unload(); this.ambientLife.dispose(); }

  setFineDetail(enabled: boolean): void {
    if (this.fineDetail === enabled) return;
    this.fineDetail = enabled;this.scenery.setFineDetail(enabled);this.shadowDirty = true;
  }

  consumeShadowUpdate(): boolean {
    const dirty = this.shadowDirty;
    this.shadowDirty = false;
    return dirty;
  }

  /** Only repeated prebuilt library meshes are instanced. Logical plot roots retain terrain state. */
  private batchLibraryBuildings(): void {
    const groups = new Map<THREE.BufferGeometry, Array<{ mesh: THREE.Mesh; model: THREE.Object3D }>>();
    for (const entry of this.entries) {
      if (!entry.model || !entry.libraryBuilding) continue;
      entry.model.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute("color")) return;
        const sources = groups.get(object.geometry) ?? [];
        sources.push({ mesh: object, model: entry.model! }); groups.set(object.geometry, sources);
      });
    }
    for (const sources of groups.values()) {
      if (sources.length < 2) continue;
      const first = sources[0].mesh;
      const mesh = new THREE.InstancedMesh(first.geometry, first.material, sources.length);
      mesh.name = `building-batch-${first.geometry.name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false; mesh.count = 0;
      configureTerrainShadowCaster(mesh);
      for (const source of sources) source.mesh.visible = false;
      this.root.add(mesh); this.resources.push(mesh); this.buildingBatches.push({ mesh, sources });
    }
  }

  private syncBuildingBatches(): void {
    this.root.updateMatrixWorld(true);
    for (const { mesh, sources } of this.buildingBatches) {
      mesh.count = 0;
      for (const source of sources) {
        if (source.model.visible) mesh.setMatrixAt(mesh.count++, source.mesh.matrixWorld);
      }
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
    }
  }

  private updateAccessPaths(): void {
    const road = this.entries.find((entry) => entry.mesh.name === "road-network");
    if (!road?.heights || !road.mesh.visible) return;
    const positions = road.surface.geometry.getAttribute("position") as THREE.BufferAttribute;
    // Resolve model roots and segment math once, rather than searching the full
    // hierarchy for every terrain vertex × entrance on larger settlements.
    const approaches = this.definition.roads.flatMap(approach => {
      if(!approach.accessTo) return [];
      const building=this.root.getObjectByName(approach.accessTo);
      if(!building?.visible) return [];
      const [ax,az]=approach.points[approach.points.length-2],[bx,bz]=approach.points[approach.points.length-1];
      const dx=bx-ax,dz=bz-az,lengthSquared=dx*dx+dz*dz;
      return lengthSquared ? [{ax,az,dx,dz,lengthSquared,length:Math.sqrt(lengthSquared),halfWidth:approach.widthMeters/2, floor:building.position.y}] : [];
    });
    road.surface.points.forEach(([x, z], i) => {
      let y = road.heights![i] + 0.08;
      for (const {ax,az,dx,dz,lengthSquared,length,halfWidth,floor} of approaches) {
        const t = ((x - ax) * dx + (z - az) * dz) / lengthSquared;
        const across = Math.abs((x - ax) * dz - (z - az) * dx) / length;
        if (t < -1e-6 || t > 1.000001 || across > halfWidth + 1e-6) continue;
        const blend = Math.max(0, Math.min(1, t));
        const smooth = blend * blend * (3 - 2 * blend);
        y = y * (1 - smooth) + floor * smooth;
      }
      positions.setY(i, y);
    });
    positions.needsUpdate = true;
    road.surface.geometry.computeVertexNormals();
    road.surface.geometry.computeBoundingSphere();
  }

  private addSurface(surface: TerrainSurface, material: THREE.Material, name: string): SurfaceEntry {
    if (this.definition.groundSizeMeters) {
      const size = this.definition.groundSizeMeters;
      const uv = surface.geometry.getAttribute("uv") as THREE.BufferAttribute;
      surface.points.forEach(([x,z],i) => uv.setXY(i,x/size+0.5,z/size+0.5));
      uv.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(surface.geometry, material);
    mesh.name = name;
    mesh.visible = false;
    this.root.add(mesh);
    this.resources.push(surface.geometry);
    mesh.receiveShadow = true;
    const entry: SurfaceEntry = { surface, mesh };
    this.entries.push(entry);
    this.terrainPending++;
    return entry;
  }

  private publish(): void {
    const errors = [...this.errors, ...this.scenery.errors, ...(this.ambientLife.status.error ? [this.ambientLife.status.error] : [])];
    const sceneryTotal = this.environment?.scenery.length ?? this.definition.scenery?.length ?? 0;
    const loading = !this.texturesReady || this.loaded + this.errors.length < this.definition.buildings.length ||
      this.scenery.loaded < sceneryTotal && this.scenery.errors.length === 0;
    const state: SettlementStatus["state"] = !this.active ? "unloaded" : loading ? "loading" :
      this.loaded === 0 && this.errors.length ? "error" :
      this.terrainPending >= this.entries.length && this.entries.every((entry) => !entry.mesh.visible) ? "waiting-terrain" :
      errors.length || this.terrainPending || this.terrainRetained || this.steepSites || this.scenerySteep ? "partial" : "ready";
    const status: SettlementStatus = { state, origin: [...this.origin], loaded: this.loaded,
      total: this.definition.buildings.length, terrainPending: this.terrainPending,
      terrainRetained: this.terrainRetained, steepSites: this.steepSites, errors, sceneryLoaded: this.scenery.loaded, sceneryTotal, scenerySteep: this.scenerySteep, ambientLife: { ...this.ambientLife.status } };
    const serialized = JSON.stringify(status);
    if (serialized !== this.lastStatus) { this.lastStatus = serialized; this.changed(status); }
  }
}
