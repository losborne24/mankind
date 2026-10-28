import * as THREE from "three";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { prepareAsset } from "@/lib/assets/prepareAsset";
import type { LocalPoint, SceneryPlacement } from "@/map/settlements/romanSettlement";

import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";

export interface GroundResult { height: number | undefined; retained: boolean }
interface Batch {
  placements: readonly SceneryPlacement[];
  lease: ModelLease;
  parts: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[];
  heights: (number | undefined)[];
  materials: THREE.Material[];
}

/** One cached source lease per asset, one instanced draw per source mesh/material. */
export class InstancedScenery {
  readonly group = new THREE.Group();
  private batches: Batch[] = [];
  private generation = 0;
  loaded = 0;
  errors: string[] = [];

  async load(placements: readonly SceneryPlacement[], cache: Pick<typeof glbCache, "acquire">, changed: () => void): Promise<void> {
    const generation = this.generation;
    const groups = new Map<string, SceneryPlacement[]>();
    for (const placement of placements) {
      const group = groups.get(placement.assetId) ?? [];
      group.push(placement); groups.set(placement.assetId, group);
    }
    await Promise.all([...groups.values()].map(async (instances) => {
      let lease: ModelLease | undefined;
      try {
        const asset = assetRegistry[instances[0].assetId];
        lease = await cache.acquire(assetUrl(asset.path));
        if (generation !== this.generation) { lease.release(); return; }
        const source = prepareAsset(lease.scene, asset);
        source.updateMatrixWorld(true);
        const batch: Batch = { lease, placements: instances, parts: [], heights: [], materials: [] };
        source.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const mesh = new THREE.InstancedMesh(object.geometry, object.material, instances.length);
          if (asset.id === "roman-market-awning-01" && object.material instanceof THREE.MeshStandardMaterial && ["red", "roman_red"].includes(object.material.name)) {
            const cloth = object.material.clone();
            cloth.color.set(0xb8a37e); cloth.roughness = 1;
            mesh.material = cloth; batch.materials.push(cloth);
          }
          mesh.name = `${asset.id}-instances`;
          mesh.castShadow = !asset.id.includes("grass");
          configureTerrainShadowCaster(mesh);
          mesh.receiveShadow = true;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
          const tint = new THREE.Color();
          for (let i = 0; i < instances.length; i++) {
            mesh.setMatrixAt(i, hidden);
            if (asset.category === "vegetation" || asset.category === "rock") {
              const [x, z] = instances[i].offset;
              const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
              // Local fixture coordinates keep colours stable during relocation.
              tint.setRGB(0.89 + seed * 0.13, 0.90 + seed * 0.10, 0.84 + seed * 0.12);
              mesh.setColorAt(i, tint);
            }
          }
          mesh.visible = false;
          batch.parts.push({ mesh, local: object.matrixWorld.clone() });
          this.group.add(mesh);
        });
        this.batches.push(batch);
        this.loaded += instances.length;
      } catch (error) {
        lease?.release();
        if (generation !== this.generation) return;
        this.errors.push(`${instances[0].assetId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      changed();
    }));
  }

  updateTerrain(resolve: (point: LocalPoint) => GroundResult): { pending: number; retained: number; steep: number } {
    let pending = 0, retained = 0, steep = 0;
    const transform = new THREE.Object3D(), matrix = new THREE.Matrix4();
    for (const batch of this.batches) {
      let changed = false, visible = 0;
      batch.placements.forEach((placement, i) => {
        const result = resolve(placement.offset);
        let height = result.height, stale = result.retained, rejected = false;
        if (placement.maxGroundRiseMeters !== undefined) {
          const size = assetRegistry[placement.assetId].dimensionsMeters;
          const angle = placement.headingRadians ?? 0, scale = placement.scale ?? 1;
          const corners = [-1,1].flatMap((x) => [-1,1].map((z) => {
            const dx = x * size[0] * scale / 2, dz = z * size[2] * scale / 2;
            return resolve([placement.offset[0] + Math.cos(angle) * dx + Math.sin(angle) * dz,
              placement.offset[1] - Math.sin(angle) * dx + Math.cos(angle) * dz]);
          }));
          stale ||= corners.some((corner) => corner.retained);
          if (corners.some((corner) => corner.height === undefined)) height = undefined;
          else if (height !== undefined) {
            const heights = [height, ...corners.map((corner) => corner.height!)];
            rejected = Math.max(...heights) - Math.min(...heights) > placement.maxGroundRiseMeters;
            // Small modules seat at the low footprint point, partially embedded,
            // instead of hanging above the downhill end. Reject larger rises.
            height = rejected ? undefined : Math.min(...heights);
          }
          if (stale && batch.heights[i] !== undefined) { height = batch.heights[i]; rejected = false; }
        }
        if (rejected) steep++;
        else if (height === undefined) pending++;
        if (height !== undefined) { visible++; if (stale) retained++; }
        if (height === batch.heights[i] && batch.heights.length > i) return;
        changed = true; batch.heights[i] = height;
        transform.position.set(placement.offset[0], height ?? 0, placement.offset[1]);
        transform.rotation.set(0, placement.headingRadians ?? 0, 0);
        transform.scale.setScalar(height === undefined ? 0 : placement.scale ?? 1);
        transform.updateMatrix();
        for (const part of batch.parts) part.mesh.setMatrixAt(i, matrix.copy(transform.matrix).multiply(part.local));
      });
      for (const part of batch.parts) {
        part.mesh.visible = visible > 0;
        if (changed) { part.mesh.instanceMatrix.needsUpdate = true; part.mesh.computeBoundingSphere(); }
      }
    }
    return { pending, retained, steep };
  }

  invalidateTerrain(): void {
    for (const batch of this.batches) {
      batch.heights = [];
      for (const part of batch.parts) part.mesh.visible = false;
    }
  }

  unload(): void {
    this.generation++;
    for (const batch of this.batches) {
      for (const part of batch.parts) part.mesh.dispose(); // instance buffers only; cache owns geometry/materials
      for (const material of batch.materials) material.dispose();
      batch.lease.release();
    }
    this.batches = [];
    this.group.clear();
    this.loaded = 0;
    this.errors = [];
  }
}
