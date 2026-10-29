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
  gltf?: GLTF;
  lastUsed: number;
  bytes: number;
  epoch: number;
}

/** One owner for source GPU resources, even across concurrent requests. */
export class GlbCache {
  private readonly loader = new GLTFLoader();
  private readonly entries = new Map<string, Entry>();
  private epoch = 0;
  private requests = 0;
  private hits = 0;
  private decodeWallMs = 0;
  private cloneMs = 0;
  constructor(private readonly idleEntries = 0, private readonly idleBytes = 64*1024*1024) {}
  snapshot() {
    const entries=[...this.entries.values()];
    return {entries:entries.length,users:entries.reduce((n,e)=>n+e.users,0),idle:entries.filter(e=>!e.users).length,bytes:entries.reduce((n,e)=>n+e.bytes,0),requests:this.requests,hits:this.hits,decodeWallMs:this.decodeWallMs,cloneMs:this.cloneMs};
  }
  clearIdle() { this.epoch++; for (const [url,entry] of this.entries) if (!entry.users && entry.gltf) { this.entries.delete(url); disposeSource(entry.gltf); } }
  private trim() {
    const idle=[...this.entries].filter(([,e])=>!e.users && e.gltf).sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
    let bytes=idle.reduce((n,[,e])=>n+e.bytes,0);
    while (idle.length>this.idleEntries || bytes>this.idleBytes) {
      const [url,entry]=idle.shift()!;this.entries.delete(url);bytes-=entry.bytes;disposeSource(entry.gltf!);
    }
  }

  async acquire(url: string, nodeName?: string): Promise<ModelLease> {
    let entry = this.entries.get(url);
    if (!entry) {
      const started=performance.now();this.requests++;
      entry = { promise: this.loader.loadAsync(url).then(gltf=>{this.decodeWallMs+=performance.now()-started;return gltf;}), users: 0, lastUsed:0, bytes:0, epoch:this.epoch };
      this.entries.set(url, entry);
    }
    else this.hits++;
    entry.epoch=this.epoch;
    entry.users++;
    let gltf: GLTF;
    try {
      gltf = await entry.promise;
    } catch (error) {
      entry.users--;
      if (this.entries.get(url) === entry) this.entries.delete(url);
      throw error; // A later acquire can retry; rejected promises aren't cached.
    }
    if (!entry.gltf) {entry.gltf=gltf;entry.bytes=sourceBytes(gltf);}
    const source = entry;
    const started=performance.now();
    const selected=nodeName ? gltf.scene.getObjectByName(nodeName) : gltf.scene;
    if (!selected) { source.users--;this.trim();throw new Error(`Missing library node: ${nodeName}`); }
    const scene = clone(selected);
    this.cloneMs+=performance.now()-started;
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
          source.lastUsed=performance.now();
          if (source.epoch !== this.epoch) {
            if (this.entries.get(url) === source) this.entries.delete(url);
            disposeSource(gltf);
          } else this.trim();
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

function sourceBytes(gltf: GLTF): number {
  const seen=new Set<object>();let bytes=0;
  gltf.scene.traverse(o=>{if (!(o instanceof THREE.Mesh)) return;
    for (const a of [...Object.values(o.geometry.attributes),o.geometry.index]) if(a && !seen.has(a.array)) {seen.add(a.array);bytes+=a.array.byteLength;}
    for(const m of Array.isArray(o.material)?o.material:[o.material]) for(const t of Object.values(m)) if(t instanceof THREE.Texture && !seen.has(t)) {seen.add(t);bytes+=(t.image?.width??0)*(t.image?.height??0)*4*4/3;}
  });return bytes;
}
// Bounded warm sources only. Live leases are never evicted.
export const glbCache = new GlbCache(12);
