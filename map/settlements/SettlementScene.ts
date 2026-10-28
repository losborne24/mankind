import * as THREE from "three";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset } from "@/lib/assets/prepareAsset";
import { offsetCoordinate, type Coordinate, type LocalPoint, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { foundationSurface, roadNetworkSurface, groundSurface, writeSurfaceHeights, type TerrainSurface } from "@/map/settlements/terrainSurfaces";

import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";
import { InstancedScenery, type GroundResult } from "@/map/settlements/InstancedScenery";

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
}
interface SurfaceEntry {
  surface: TerrainSurface;
  mesh: THREE.Mesh;
  model?: THREE.Group;
  lease?: ModelLease;
  heights?: number[];
  shadowReceiver?: boolean;
}
export type TerrainSampler = (coordinate: Coordinate) => number | null | import("@/map/terrain").TerrainSample;

/** Owns layout instances and procedural surfaces, never a renderer or render loop. */
export class SettlementScene {
  readonly scene = new THREE.Scene();
  origin: Coordinate;
  private readonly root = new THREE.Group();
  private readonly scenery = new InstancedScenery();
  private sun: THREE.DirectionalLight | null = null;
  private shadowDirty = true;
  shadowsEnabled = true;
  private entries: SurfaceEntry[] = [];
  private resources: Array<{ dispose(): void }> = [];
  private materialOverrides = new Map<THREE.Material, THREE.Material>();
  private readonly knownHeights = new Map<string, number>();
  private active = false;
  private generation = 0;
  private dirty = true;
  private loading?: Promise<void>;
  private loaded = 0;
  private errors: string[] = [];
  private lastStatus = "";
  private terrainPending = 0;
  private terrainRetained = 0;
  private steepSites = 0;

  constructor(
    readonly definition: SettlementDefinition,
    private readonly changed: (status: SettlementStatus) => void,
    private readonly repaint: () => void,
    private readonly cache: Pick<typeof glbCache, "acquire"> = glbCache,
  ) {
    this.origin = [...definition.origin];
    this.scene.add(this.root, this.scenery.group);
  }

  load(): Promise<void> {
    if (this.active) return this.loading ?? Promise.resolve();
    this.active = true;
    const generation = this.generation;
    const sky = new THREE.HemisphereLight(0xc3d7e4, 0x8b775a, 1.4);
    this.sun = new THREE.DirectionalLight(0xffe3b3, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -48, right: 48, top: 55, bottom: -55, near: 1, far: 180 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.root.add(sky, this.sun, this.sun.target);
    this.resources.push(this.sun.shadow);
    this.shadowDirty = true;
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x887a65, roughness: 1, flatShading: true, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
    this.resources.push(roadMaterial, foundationMaterial);
    this.addSurface(roadNetworkSurface(this.definition.roads), roadMaterial, "road-network");
    const catcher = new THREE.ShadowMaterial({ opacity: 0.27, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.resources.push(catcher);
    const ground = this.addSurface(groundSurface(64, 88), catcher, "terrain-shadow-receiver");
    ground.shadowReceiver = true;
    const sceneryLoad = this.scenery.load(this.definition.scenery ?? [], this.cache, () => {
      this.dirty = this.shadowDirty = true; this.publish(); this.repaint();
    });
    this.loading = Promise.all([sceneryLoad, ...this.definition.buildings.map(async (building) => {
      let lease: ModelLease | undefined;
      try {
        const asset = assetRegistry[building.assetId];
        lease = await this.cache.acquire(assetUrl(asset.path));
        if (!this.active || generation !== this.generation) { lease.release(); return; }
        const model = prepareAsset(lease.scene, asset);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const heading = building.headingRadians ?? 0;
        const entry = this.addSurface(foundationSurface(building.offset, size.x + 0.4, size.z + 0.4, heading), foundationMaterial, `${building.id}-foundation`);
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Closed prototype buildings are double-sided. Back-face shadow casting
            // avoids their front surfaces shadowing themselves; cache materials stay immutable.
            const shadowMaterial = (material: THREE.Material) => {
              let copy = this.materialOverrides.get(material);
              if (!copy) {
                copy = material.clone(); copy.shadowSide = THREE.BackSide;
                this.materialOverrides.set(material, copy); this.resources.push(copy);
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
      } catch (error) {
        lease?.release();
        if (!this.active || generation !== this.generation) return;
        this.errors.push(`${building.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.dirty = this.shadowDirty = true;
      this.publish();
      this.repaint();
    })]).then(() => {
      if (this.active && generation === this.generation) { this.publish(); this.repaint(); }
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
      this.knownHeights.clear();
      this.scenery.invalidateTerrain();
      this.shadowDirty = true;
      this.terrainPending = this.entries.length;
      this.terrainRetained = this.steepSites = 0;
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
    this.dirty = false;
    this.terrainPending = this.terrainRetained = this.steepSites = 0;
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
      const top = entry.model ? Math.max(...heights) + 0.1 : undefined;
      if (top !== undefined && top - Math.min(...heights) > this.definition.maxFoundationRiseMeters) {
        this.steepSites++;
        entry.mesh.visible = false;
        entry.model!.visible = false;
        continue;
      }
      if (!entry.heights || heights.some((height, i) => height !== entry.heights![i])) {
        writeSurfaceHeights(entry.surface, heights, top);
        if (entry.shadowReceiver) {
          const positions = entry.surface.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < heights.length; i++) positions.setY(i, heights[i] + 0.025);
          entry.surface.geometry.computeBoundingSphere();
        }
        entry.heights = heights;
      }
      entry.mesh.visible = true;
      if (entry.model) { entry.model.position.y = top!; entry.model.visible = true; }
    }
    const sceneryGround = this.scenery.updateTerrain(resolve);
    this.terrainPending += sceneryGround.pending;
    this.terrainRetained += sceneryGround.retained;
    const stableFloors = this.entries.filter((entry) => entry.model?.visible).map((entry) => entry.model!.position.y);
    const center = stableFloors.length ? { height: stableFloors.reduce((sum, value) => sum + value, 0) / stableFloors.length } : resolve([0, 0]);
    if (this.sun && center.height !== undefined) {
      this.sun.position.set(-35, center.height + 65, -25);
      this.sun.target.position.set(0, center.height, 0);
    }
    this.updateAccessPaths();
    this.publish();
  }

  unload(): void {
    this.active = false;
    this.generation++;
    this.scenery.unload();
    this.sun = null;
    for (const entry of this.entries) entry.lease?.release();
    for (const resource of this.resources) resource.dispose();
    this.root.clear();
    this.entries = [];
    this.resources = [];
    this.materialOverrides.clear();
    this.knownHeights.clear();
    this.loaded = this.terrainPending = this.terrainRetained = this.steepSites = 0;
    this.errors = [];
    this.loading = undefined;
    this.dirty = true;
    this.publish();
    this.repaint();
  }

  consumeShadowUpdate(): boolean {
    const dirty = this.shadowDirty;
    this.shadowDirty = false;
    return dirty;
  }

  private updateAccessPaths(): void {
    const road = this.entries.find((entry) => entry.mesh.name === "road-network");
    if (!road?.heights || !road.mesh.visible) return;
    const positions = road.surface.geometry.getAttribute("position") as THREE.BufferAttribute;
    road.surface.points.forEach(([x, z], i) => {
      let y = road.heights![i] + 0.08;
      for (const approach of this.definition.roads) {
        if (!approach.accessTo) continue;
        const building = this.root.getObjectByName(approach.accessTo);
        if (!building?.visible) continue;
        const [ax, az] = approach.points[0], [bx, bz] = approach.points[approach.points.length - 1];
        const dx = bx - ax, dz = bz - az, lengthSquared = dx * dx + dz * dz;
        const t = ((x - ax) * dx + (z - az) * dz) / lengthSquared;
        const across = Math.abs((x - ax) * dz - (z - az) * dx) / Math.sqrt(lengthSquared);
        if (t < -1e-6 || t > 1.000001 || across > approach.widthMeters / 2 + 1e-6) continue;
        const blend = Math.max(0, Math.min(1, t));
        const smooth = blend * blend * (3 - 2 * blend);
        y = y * (1 - smooth) + building.position.y * smooth;
      }
      positions.setY(i, y);
    });
    positions.needsUpdate = true;
    road.surface.geometry.computeVertexNormals();
    road.surface.geometry.computeBoundingSphere();
  }

  private addSurface(surface: TerrainSurface, material: THREE.Material, name: string): SurfaceEntry {
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
    const errors = [...this.errors, ...this.scenery.errors];
    const sceneryTotal = this.definition.scenery?.length ?? 0;
    const loading = this.loaded + this.errors.length < this.definition.buildings.length ||
      this.scenery.loaded < sceneryTotal && this.scenery.errors.length === 0;
    const state: SettlementStatus["state"] = !this.active ? "unloaded" : loading ? "loading" :
      this.loaded === 0 && this.errors.length ? "error" :
      this.terrainPending >= this.entries.length && this.entries.every((entry) => !entry.mesh.visible) ? "waiting-terrain" :
      errors.length || this.terrainPending || this.terrainRetained || this.steepSites ? "partial" : "ready";
    const status: SettlementStatus = { state, origin: [...this.origin], loaded: this.loaded,
      total: this.definition.buildings.length, terrainPending: this.terrainPending,
      terrainRetained: this.terrainRetained, steepSites: this.steepSites, errors, sceneryLoaded: this.scenery.loaded, sceneryTotal };
    const serialized = JSON.stringify(status);
    if (serialized !== this.lastStatus) { this.lastStatus = serialized; this.changed(status); }
  }
}
