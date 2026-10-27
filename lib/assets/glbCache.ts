import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

export interface ModelLease {
  /** Transforms belong to this instance; geometry/materials/textures are shared. */
  scene: THREE.Object3D;
  release(): void;
}

interface Entry {
  promise: Promise<GLTF>;
  users: number;
}

/** One owner for source GPU resources, even across concurrent requests. */
export class GlbCache {
  private readonly loader = new GLTFLoader();
  private readonly entries = new Map<string, Entry>();

  async acquire(url: string): Promise<ModelLease> {
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { promise: this.loader.loadAsync(url), users: 0 };
      this.entries.set(url, entry);
    }
    entry.users++;
    let gltf: GLTF;
    try {
      gltf = await entry.promise;
    } catch (error) {
      entry.users--;
      if (this.entries.get(url) === entry) this.entries.delete(url);
      throw error; // A later acquire can retry; rejected promises aren't cached.
    }
    const source = entry;
    const scene = clone(gltf.scene);
    let released = false;
    return {
      scene,
      release: () => {
        if (released) return;
        released = true;
        scene.removeFromParent();
        // SkeletonUtils gives each instance its own skeleton/bone texture.
        scene.traverse((object) => {
          if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
        });
        if (--source.users === 0) {
          this.entries.delete(url);
          disposeSource(gltf);
        }
      },
    };
  }
}

function disposeSource(gltf: GLTF): void {
  const resources = new Set<{ dispose(): void }>();
  const bitmaps = new Set<ImageBitmap>();
  for (const scene of gltf.scenes) scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        resources.add(value);
        if (typeof ImageBitmap !== "undefined" && value.image instanceof ImageBitmap) {
          bitmaps.add(value.image);
        }
      }
    }
  });
  for (const resource of resources) resource.dispose();
  for (const bitmap of bitmaps) bitmap.close();
}

export const glbCache = new GlbCache();
