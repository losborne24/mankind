import * as THREE from "three";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset } from "@/lib/assets/prepareAsset";
import { offsetCoordinate, type Coordinate, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { foundationSurface, roadSurface, writeSurfaceHeights, type TerrainSurface } from "@/map/settlements/terrainSurfaces";

export interface SettlementStatus {
  state: "unloaded" | "loading" | "waiting-terrain" | "ready" | "partial" | "error";
  origin: Coordinate;
  loaded: number;
  total: number;
  terrainPending: number;
  terrainRetained: number;
  steepSites: number;
  errors: string[];
}
interface SurfaceEntry {
  surface: TerrainSurface;
  mesh: THREE.Mesh;
  model?: THREE.Group;
  lease?: ModelLease;
  heights?: number[];
}
export type TerrainSampler = (coordinate: Coordinate) => number | null;

/** Owns layout instances and procedural surfaces, never a renderer or render loop. */
export class SettlementScene {
  readonly scene = new THREE.Scene();
  origin: Coordinate;
  private readonly root = new THREE.Group();
  private entries: SurfaceEntry[] = [];
  private resources: Array<{ dispose(): void }> = [];
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
    this.scene.add(this.root);
  }

  load(): Promise<void> {
    if (this.active) return this.loading ?? Promise.resolve();
    this.active = true;
    const generation = this.generation;
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x9f8d6d, roughness: 1, side: THREE.DoubleSide });
    const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x887a65, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    this.resources.push(roadMaterial, foundationMaterial);
    for (const road of this.definition.roads) {
      this.addSurface(roadSurface(road.points, road.widthMeters), roadMaterial, road.id);
    }
    this.loading = Promise.all(this.definition.buildings.map(async (building) => {
      let lease: ModelLease | undefined;
      try {
        const asset = assetRegistry[building.assetId];
        lease = await this.cache.acquire(assetUrl(asset.path));
        if (!this.active || generation !== this.generation) { lease.release(); return; }
        const model = prepareAsset(lease.scene, asset);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const heading = building.headingRadians ?? 0;
        const entry = this.addSurface(foundationSurface(building.offset, size.x + 0.4, size.z + 0.4, heading), foundationMaterial, `${building.id}-foundation`);
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
      this.dirty = true;
      this.publish();
      this.repaint();
    })).then(() => {
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
    const frameSamples = new Map<string, { height: number | undefined; retained: boolean }>();
    for (const entry of this.entries) {
      const count = entry.model ? entry.surface.points.length / 2 : entry.surface.points.length;
      const heights: number[] = [];
      let missing = false, retained = false;
      for (let i = 0; i < count; i++) {
        const point = entry.surface.points[i];
        const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
        let result = frameSamples.get(key);
        if (!result) {
          const height = sample(offsetCoordinate(this.origin, point));
          // Public MapLibre queries use 0 for missing DEM as well as sea level.
          // Do not invent a ground height from that ambiguous value.
          const valid = height !== null && Number.isFinite(height) && height !== 0;
          if (valid) this.knownHeights.set(key, height);
          result = { height: this.knownHeights.get(key), retained: !valid };
          frameSamples.set(key, result);
        }
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
      if (retained) this.terrainRetained++;
      const top = entry.model ? Math.max(...heights) + 0.1 : undefined;
      if (top !== undefined && top - Math.min(...heights) > this.definition.maxFoundationRiseMeters) {
        this.steepSites++;
        entry.mesh.visible = false;
        entry.model!.visible = false;
        continue;
      }
      if (!entry.heights || heights.some((height, i) => height !== entry.heights![i])) {
        writeSurfaceHeights(entry.surface, heights, top);
        entry.heights = heights;
      }
      entry.mesh.visible = true;
      if (entry.model) { entry.model.position.y = top!; entry.model.visible = true; }
    }
    this.publish();
  }

  unload(): void {
    this.active = false;
    this.generation++;
    for (const entry of this.entries) entry.lease?.release();
    for (const resource of this.resources) resource.dispose();
    this.root.clear();
    this.entries = [];
    this.resources = [];
    this.knownHeights.clear();
    this.loaded = this.terrainPending = this.terrainRetained = this.steepSites = 0;
    this.errors = [];
    this.loading = undefined;
    this.dirty = true;
    this.publish();
    this.repaint();
  }

  private addSurface(surface: TerrainSurface, material: THREE.Material, name: string): SurfaceEntry {
    const mesh = new THREE.Mesh(surface.geometry, material);
    mesh.name = name;
    mesh.visible = false;
    this.root.add(mesh);
    this.resources.push(surface.geometry);
    const entry = { surface, mesh };
    this.entries.push(entry);
    this.terrainPending++;
    return entry;
  }

  private publish(): void {
    const loading = this.loaded + this.errors.length < this.definition.buildings.length;
    const state: SettlementStatus["state"] = !this.active ? "unloaded" : loading ? "loading" :
      this.loaded === 0 && this.errors.length ? "error" :
      this.terrainPending === this.entries.length ? "waiting-terrain" :
      this.errors.length || this.terrainPending || this.terrainRetained || this.steepSites ? "partial" : "ready";
    const status: SettlementStatus = { state, origin: [...this.origin], loaded: this.loaded,
      total: this.definition.buildings.length, terrainPending: this.terrainPending,
      terrainRetained: this.terrainRetained, steepSites: this.steepSites, errors: [...this.errors] };
    const serialized = JSON.stringify(status);
    if (serialized !== this.lastStatus) { this.lastStatus = serialized; this.changed(status); }
  }
}
