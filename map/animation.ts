/**
 * Deterministic ambient animation systems.
 *
 * Every system here is a **pure function of a single simulation time** (seconds)
 * — never of `Math.random()` or frame count. Re-rendering at the same time value
 * reproduces exactly the same state, so the world is reproducible. Placement
 * randomness is baked once at construction from a seeded {@link Rng}; only
 * phase/position evolve with time, continuously and loopably.
 *
 * Systems mutate pre-built Three.js objects in place (no per-frame allocation of
 * geometry/materials). They are cheap and few, as the brief requires.
 */

import * as THREE from "three";
import type { Rng } from "@/scene/rng";
import type { MaterialLibrary } from "./geometry";

/** Common shape: advance to an absolute simulation time, in seconds. */
export interface AnimationSystem {
  update(timeSeconds: number): void;
  /** Object to add to the scene graph. */
  readonly object: THREE.Object3D;
  /** Dispose any geometry this system owns (materials are shared). */
  dispose(): void;
}

// ── Chimney smoke ───────────────────────────────────────────────────────────

export interface SmokeSource {
  /** Local `[x, z]` of the chimney in metres. */
  position: readonly [number, number];
  /** Height of the chimney top in metres. */
  baseY: number;
  /** Rough building scale, controlling puff size and rise height. */
  scale: number;
}

/**
 * Looping chimney smoke. Each source emits a fixed number of instanced puffs
 * that rise and dissipate; a puff's phase is `(t / period + fixedOffset) mod 1`,
 * so the stream is continuous and perfectly periodic. Puff opacity is faked via
 * a grow-then-shrink scale envelope (`sin(phase·π)`), avoiding a custom shader.
 */
export class SmokeSystem implements AnimationSystem {
  readonly object: THREE.Group;
  private readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.SphereGeometry;
  private readonly count: number;
  private readonly puffsPerSource: number;
  private readonly sources: SmokeSource[];
  private readonly offsets: number[];
  private readonly periods: number[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(mats: MaterialLibrary, rng: Rng, sources: SmokeSource[], puffsPerSource = 5) {
    this.sources = sources;
    this.puffsPerSource = puffsPerSource;
    this.count = sources.length * puffsPerSource;
    this.geo = new THREE.SphereGeometry(1, 6, 5);
    this.mesh = new THREE.InstancedMesh(this.geo, mats.smoke, Math.max(1, this.count));
    this.mesh.frustumCulled = false;

    // Bake a fixed phase offset and period per puff from the seed.
    this.offsets = [];
    this.periods = [];
    for (let i = 0; i < this.count; i++) {
      this.offsets.push(rng.next());
      this.periods.push(rng.range(6, 9));
    }

    this.object = new THREE.Group();
    this.object.add(this.mesh);
  }

  update(t: number): void {
    let i = 0;
    for (const src of this.sources) {
      const riseH = src.scale * 520;
      const baseR = src.scale * 26;
      for (let k = 0; k < this.puffsPerSource; k++, i++) {
        const phase = (t / this.periods[i] + this.offsets[i]) % 1;
        const env = Math.sin(phase * Math.PI); // 0→1→0 over the loop
        const y = src.baseY + phase * riseH;
        // Gentle lateral drift as the puff rises.
        const drift = phase * src.scale * 90;
        this.p.set(src.position[0] + drift, y, src.position[1] + drift * 0.3);
        const scale = baseR * (0.6 + phase * 1.8) * Math.max(0.001, env);
        this.s.set(scale, scale, scale);
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(i, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

// ── Moving ship ─────────────────────────────────────────────────────────────

/**
 * Drives a pre-built ship group along a closed loop of local waypoints at
 * constant speed, orienting the hull along its heading, with a gentle bob/roll.
 * Position is `distance = (t / loopSeconds mod 1) · totalLength` resolved onto
 * the polyline — fully deterministic and seamless across the loop.
 */
export class ShipSystem implements AnimationSystem {
  readonly object: THREE.Group;
  private readonly waypoints: Array<readonly [number, number]>;
  private readonly cumulative: number[];
  private readonly total: number;
  private readonly loopSeconds: number;

  constructor(shipGroup: THREE.Group, localRoute: Array<readonly [number, number]>, loopSeconds: number) {
    this.object = shipGroup;
    // Close the loop.
    this.waypoints = [...localRoute, localRoute[0]];
    this.loopSeconds = loopSeconds;
    this.cumulative = [0];
    let total = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      const a = this.waypoints[i - 1];
      const b = this.waypoints[i];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.cumulative.push(total);
    }
    this.total = total || 1;
  }

  update(t: number): void {
    const f = ((t / this.loopSeconds) % 1 + 1) % 1;
    const target = f * this.total;

    // Locate the active segment.
    let seg = 1;
    while (seg < this.cumulative.length - 1 && this.cumulative[seg] < target) seg++;
    const segStart = this.cumulative[seg - 1];
    const segLen = this.cumulative[seg] - segStart || 1;
    const local = (target - segStart) / segLen;

    const a = this.waypoints[seg - 1];
    const b = this.waypoints[seg];
    const x = a[0] + (b[0] - a[0]) * local;
    const z = a[1] + (b[1] - a[1]) * local;

    // Heading: the ship model faces +X, so yaw = atan2 toward -Z gives bearing.
    const heading = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);

    const bob = Math.sin(t * 0.9) * 2.5;
    const roll = Math.sin(t * 0.7) * 0.04;

    this.object.position.set(x, bob, z);
    this.object.rotation.set(0, heading, roll);
  }

  dispose(): void {
    // Ship geometry is disposed by the layer's scene traversal.
  }
}

// ── Foliage sway ────────────────────────────────────────────────────────────

/**
 * A very cheap wind effect: nudges a group's rotation by a small, time-periodic
 * amount. Applied to foliage groups so vegetation breathes without touching
 * per-instance matrices every frame.
 */
export class SwaySystem implements AnimationSystem {
  readonly object: THREE.Group;
  private readonly amplitude: number;
  private readonly phase: number;
  private readonly speed: number;

  constructor(group: THREE.Group, rng: Rng, amplitude = 0.02) {
    this.object = group;
    this.amplitude = amplitude;
    this.phase = rng.range(0, Math.PI * 2);
    this.speed = rng.range(0.6, 1.0);
  }

  update(t: number): void {
    const a = Math.sin(t * this.speed + this.phase) * this.amplitude;
    this.object.rotation.z = a;
    this.object.rotation.x = Math.cos(t * this.speed * 0.8 + this.phase) * this.amplitude * 0.6;
  }

  dispose(): void {
    // Owns no geometry.
  }
}
