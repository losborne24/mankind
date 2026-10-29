import * as THREE from "three";
import { assetRegistry, assetUrl } from "@/lib/assets/registry";
import { glbCache, type ModelLease } from "@/lib/assets/glbCache";
import { AmbientLifeSimulation, type VillagerState } from "@/map/settlements/AmbientLifeSimulation";
import type { NavigationGraph } from "@/map/settlements/proceduralSettlement";

export interface AmbientLifeOptions { enabled: boolean; count: number; paths: boolean }
export const DEFAULT_AMBIENT_LIFE: AmbientLifeOptions = { enabled: true, count: 3, paths: false };
export interface AmbientLifeStatus { active: number; walking: number; idle: number; paused: boolean; error?: string }
interface Actor {
  model: THREE.Object3D;
  leftLeg: THREE.Object3D; rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D; rightArm: THREE.Object3D; body: THREE.Object3D;
  height?: number; frameHeight?: number; blend: number;
}
/** Owns transforms only. The existing GLB cache owns all shared source GPU resources. */
export class AmbientLifeView {
  readonly group = new THREE.Group();
  readonly simulation: AmbientLifeSimulation;
  options = { ...DEFAULT_AMBIENT_LIFE };
  readonly status: AmbientLifeStatus = { active: 0, walking: 0, idle: 0, paused: true };
  private actors: Actor[] = [];
  private lease?: ModelLease;
  private revision = 0;
  private lastTime?: number;
  private clock = 0;
  private road?: THREE.Mesh;
  private readonly ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0,-1,0));
  private readonly hits: THREE.Intersection[] = [];
  private readonly debug: THREE.LineSegments;
  constructor(graph: NavigationGraph, seed: number) {
    this.simulation = new AmbientLifeSimulation(graph, seed);
    const points: number[] = [];
    for (const e of graph.edges) for (const id of [e.from,e.to]) {
      const p = this.simulation.nodes.get(id)!.point; points.push(p[0], 0, p[1]);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points,3));
    this.debug = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color:0xffcc66,depthTest:false}));
    this.debug.frustumCulled = false; this.debug.renderOrder = 10; this.debug.visible = false;
    this.group.add(this.debug);
  }
  async load(cache: Pick<typeof glbCache,"acquire">): Promise<void> {
    const revision = ++this.revision;
    try {
      const lease = await cache.acquire(assetUrl(assetRegistry["roman-villager-01"].path));
      if (revision !== this.revision) { lease.release(); return; }
      this.lease = lease; this.status.error = undefined; this.syncActors();
    } catch (e) {
      if (revision === this.revision) this.status.error = `Villager: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  configure(options: AmbientLifeOptions): void {
    this.options = { ...options, count: Number.isFinite(options.count) ? Math.max(0,Math.min(5,Math.floor(options.count))) : 0 };
    this.simulation.setCount(this.options.count); this.syncActors(); this.lastTime = undefined;
    this.group.visible = this.options.enabled;
    if (!this.options.enabled || !this.options.count) this.pause();
  }
  private syncActors(): void {
    while (this.actors.length > this.simulation.villagers.length) this.actors.pop()!.model.removeFromParent();
    if (!this.lease) return;
    while (this.actors.length < this.simulation.villagers.length) {
      const model = this.lease.scene.clone(true);
      model.visible = false;
      this.group.add(model);
      const part = (name: string) => model.getObjectByName(name)!;
      this.actors.push({model,leftLeg:part("leftLeg"),rightLeg:part("rightLeg"),leftArm:part("leftArm"),rightArm:part("rightArm"),body:part("body"),blend:0});
    }
  }
  /** Reset heights after relocation/exaggeration, never interpolate across geographic frames. */
  invalidateTerrain(): void {
    for (const a of this.actors) { a.height = undefined; a.model.visible = false; }
    this.lastTime = undefined;
  }
  pause(): void { this.lastTime = undefined; this.status.paused = true; }
  private heightAt(x: number, z: number): number | undefined {
    if (!this.road?.visible) return undefined;
    this.ray.ray.origin.set(x,1e6,z); this.hits.length = 0;
    this.ray.intersectObject(this.road,false,this.hits);
    if (this.hits.length) return this.hits[0].point.y;
    // Graph endpoints lie exactly on Float32 road caps. A 3 cm sole tolerance
    // avoids losing a character to sub-millimetre triangulation rounding.
    for (let i=0;i<4;i++) {
      this.ray.ray.origin.set(x+(i===0?.03:i===1?-.03:0),1e6,z+(i===2?.03:i===3?-.03:0));
      this.hits.length=0; this.ray.intersectObject(this.road,false,this.hits);
      if (this.hits.length) return this.hits[0].point.y;
    }
    return undefined;
  }
  private readonly canPlace = (v: VillagerState, x: number, z: number): boolean => {
    const a = this.actors[this.simulation.villagers.indexOf(v)];
    if (!a) return false;
    const h = this.heightAt(x,z);
    return h !== undefined && a.height !== undefined && Math.abs(h-a.height) < .12;
  };
  /** Returns true only when useful animation requires another MapLibre frame. No DEM queries here. */
  update(now: number, visible: boolean, road?: THREE.Mesh): boolean {
    this.road = road;
    if (!visible || !this.options.enabled || !this.options.count || !this.actors.length || !road?.visible) {
      this.group.visible = false; this.pause(); this.status.active = this.status.walking = this.status.idle = 0; return false;
    }
    this.group.visible = true; road.updateWorldMatrix(true,false);
    const dt = this.lastTime === undefined ? 0 : Math.max(0,Math.min(.25,(now-this.lastTime)/1000));
    this.lastTime = now; this.clock += dt;
    let placed = 0;
    for (let i=0;i<this.actors.length;i++) {
      const a=this.actors[i],v=this.simulation.villagers[i],h=this.heightAt(v.x,v.z);
      if (h === undefined) { a.model.visible = false; continue; }
      a.frameHeight = a.height;
      // A newly confirmed DEM can replace a coarse retained surface by many metres.
      // Hidden actors can reseat immediately; small changes still interpolate below.
      if (a.height === undefined || !a.model.visible && Math.abs(h-a.height) > 8) {
        a.height = h; a.frameHeight = undefined;
      }
      else a.height += Math.max(-dt*.8,Math.min(dt*.8,h-a.height));
      a.model.visible = Math.abs(a.height-h) < .12;
      placed++;
    }
    if (!placed) { this.pause(); this.status.active = this.status.walking = this.status.idle = 0; return false; }
    this.simulation.advance(dt,this.canPlace);
    this.status.active = this.status.walking = this.status.idle = 0;
    for (let i=0;i<this.actors.length;i++) {
      const a=this.actors[i],v=this.simulation.villagers[i];
      if (!a.model.visible) continue;
      const h=this.heightAt(v.x,v.z);
      if (h === undefined) {a.model.visible=false;continue;}
      // Follow continuous road slopes exactly; smooth changed terrain while stationary above.
      const previousHeight = a.frameHeight ?? a.height!;
      a.height = previousHeight + Math.max(-dt*.8,Math.min(dt*.8,h-previousHeight));
      const moving=v.state === "walking" && this.canPlace(v,v.x,v.z);
      a.blend += ((moving?1:0)-a.blend)*Math.min(1,dt*8);
      const phase=v.distance*Math.PI*2/1.35;
      const angle=Math.sin(phase)*.30*a.blend;
      const lift=Math.max(0,.16*Math.abs(Math.sin(angle))-.79*(1-Math.cos(angle)));
      a.model.position.set(v.x,a.height!+lift,v.z);
      // Shortest angular arc across -PI/PI.
      a.model.rotation.y += Math.atan2(Math.sin(v.facing-a.model.rotation.y),Math.cos(v.facing-a.model.rotation.y))*Math.min(1,dt*10);
      a.leftLeg.rotation.x=angle; a.rightLeg.rotation.x=-angle;
      a.leftArm.rotation.x=-angle*.7; a.rightArm.rotation.x=angle*.7;
      a.body.position.y=Math.sin(this.clock*1.8+i)*.004*(1-a.blend);
      this.status.active++; if(v.state === "walking") this.status.walking++; else this.status.idle++;
    }
    this.debug.visible = this.options.paths;
    if (this.debug.visible) {
      const p=this.debug.geometry.getAttribute("position") as THREE.BufferAttribute;
      for(let i=0;i<p.count;i++) p.setY(i,(this.heightAt(p.getX(i),p.getZ(i))??-1e5)+.12);
      p.needsUpdate=true;
    }
    this.status.paused=false;
    return true;
  }
  unload(): void {
    this.revision++; this.pause();
    for (const a of this.actors) a.model.removeFromParent();
    this.actors=[]; this.lease?.release(); this.lease=undefined;
    this.simulation.reset();
    this.status.active=this.status.walking=this.status.idle=0;
  }
  dispose(): void { this.unload(); this.debug.geometry.dispose(); (this.debug.material as THREE.Material).dispose(); }
}
