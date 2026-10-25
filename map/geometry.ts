/**
 * Procedural, stylized geometry for the living world.
 *
 * Everything here authors geometry in **local metre-space** (+X east, +Y up,
 * +Z south — the frame produced by {@link ./anchoring.Anchor}), with each
 * object's base sitting on the ground plane `y = 0`. The anchoring layer takes
 * care of placing that local space onto the globe.
 *
 * Art direction: a painterly, tactile *miniature* — faceted low-poly forms
 * (`flatShading`), a restrained warm-earth palette, varied heights and roof
 * silhouettes, and shared materials so the whole settlement batches well. No
 * photorealism, no neon, no per-object megatextures.
 *
 * Resource ownership:
 *  • {@link MaterialLibrary} owns the small fixed set of shared materials and
 *    disposes them once.
 *  • Builders create per-object **geometries**, which the caller disposes by
 *    traversing the returned objects via {@link disposeObject3D}.
 *
 * Scale is deliberately exaggerated (structures are tens-to-hundreds of metres)
 * so the settlement reads as a legible miniature at the zoom levels MapLibre's
 * demo globe supports, rather than as invisible real-scale buildings.
 */

import * as THREE from "three";
import type { Rng } from "@/scene/rng";

// ── Shared material palette ─────────────────────────────────────────────────

/**
 * Owns every material the renderer reuses. Created once per layer; a handful of
 * wall/roof variants are shared across all buildings so dozens of structures
 * cost only a few materials and batch cleanly.
 */
export class MaterialLibrary {
  readonly walls: THREE.MeshStandardMaterial[];
  readonly roofs: THREE.MeshStandardMaterial[];
  readonly trunk: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly road: THREE.MeshStandardMaterial;
  readonly path: THREE.MeshStandardMaterial;
  readonly ground: THREE.MeshStandardMaterial;
  readonly hull: THREE.MeshStandardMaterial;
  readonly sail: THREE.MeshStandardMaterial;
  readonly massing: THREE.MeshStandardMaterial;
  readonly smoke: THREE.MeshStandardMaterial;

  private readonly all: THREE.Material[] = [];

  constructor() {
    const wall = (color: number) =>
      this.track(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.92,
          metalness: 0.0,
          flatShading: true,
        }),
      );
    const roof = (color: number) =>
      this.track(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          metalness: 0.0,
          flatShading: true,
        }),
      );

    // Muted sun-baked clay / sandstone walls.
    this.walls = [wall(0xcdb891), wall(0xbfa178), wall(0xd8c6a0), wall(0xa98c6a)];
    // Terracotta / ochre / weathered-timber roofs.
    this.roofs = [roof(0x9c5b3b), roof(0x7a4a34), roof(0xb5703f), roof(0x6a4a33)];

    this.trunk = this.track(
      new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 1, flatShading: true }),
    );
    this.foliage = this.track(
      new THREE.MeshStandardMaterial({ color: 0x5f7a4a, roughness: 1, flatShading: true }),
    );
    this.road = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8a7351, roughness: 1, metalness: 0 }),
    );
    this.path = this.track(
      new THREE.MeshStandardMaterial({ color: 0xa79468, roughness: 1, metalness: 0 }),
    );
    this.ground = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x4a5340,
        roughness: 1,
        transparent: true,
        opacity: 0.55,
      }),
    );
    this.hull = this.track(
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85, flatShading: true }),
    );
    this.sail = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xe8dcc0,
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    // Massing: a single muted tone for the far-LOD built-up silhouette.
    this.massing = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xb9a079,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
    );
    this.smoke = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd9d2c6,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );

    // Buildings are rendered DoubleSide because the globe↔mercator model
    // placement can carry a negative determinant (MapLibre's mercator space is
    // left-handed), which would otherwise back-face-cull front faces. Normals
    // are unaffected (the model transform lives in the projection, not the
    // model-view), so lighting stays correct.
    for (const m of [...this.walls, ...this.roofs, this.trunk, this.foliage, this.road, this.path, this.hull, this.massing]) {
      m.side = THREE.DoubleSide;
    }
  }

  private track<T extends THREE.Material>(m: T): T {
    this.all.push(m);
    return m;
  }

  dispose(): void {
    for (const m of this.all) m.dispose();
    this.all.length = 0;
  }
}

// ── Disposal helper ─────────────────────────────────────────────────────────

/** Recursively dispose every geometry under `root` (materials are shared and
 * owned by {@link MaterialLibrary}, so they are not touched here). */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh> & THREE.Object3D;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

// ── Buildings ───────────────────────────────────────────────────────────────

type RoofKind = "flat" | "hipped" | "gabled";

export interface BuildingOptions {
  /** Footprint width (east) and depth (south) in metres. */
  width: number;
  depth: number;
  height: number;
  roof: RoofKind;
}

/**
 * One stylized building: a boxy body plus a varied roof, occasionally with a
 * lower annex for an irregular footprint. Returns a group with its base on
 * `y = 0`. Picks shared wall/roof materials deterministically from `rng`.
 */
export function buildBuilding(
  mats: MaterialLibrary,
  rng: Rng,
  opts: BuildingOptions,
): THREE.Group {
  const group = new THREE.Group();
  const wall = rng.pick(mats.walls);
  const roofMat = rng.pick(mats.roofs);
  const { width: w, depth: d, height: h } = opts;

  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const body = new THREE.Mesh(bodyGeo, wall);
  body.position.y = h / 2;
  group.add(body);

  group.add(buildRoof(opts.roof, w, d, h, roofMat));

  // ~40% of buildings get a lower annex offset to one side (irregular plan).
  if (rng.chance(0.4)) {
    const aw = w * rng.range(0.4, 0.7);
    const ad = d * rng.range(0.4, 0.7);
    const ah = h * rng.range(0.4, 0.65);
    const annexGeo = new THREE.BoxGeometry(aw, ah, ad);
    const annex = new THREE.Mesh(annexGeo, wall);
    const side = rng.pick([-1, 1]);
    annex.position.set(side * (w / 2 + aw / 2) * 0.9, ah / 2, rng.range(-d / 4, d / 4));
    group.add(annex);
    group.add(buildRoof("flat", aw, ad, ah, roofMat));
    const annexRoof = group.children[group.children.length - 1] as THREE.Mesh;
    annexRoof.position.x = annex.position.x;
    annexRoof.position.z = annex.position.z;
  }

  return group;
}

function buildRoof(
  kind: RoofKind,
  w: number,
  d: number,
  bodyHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  let y = bodyHeight;
  if (kind === "flat") {
    // A thin parapet slab, slightly oversized.
    geo = new THREE.BoxGeometry(w * 1.06, bodyHeight * 0.08 + w * 0.02, d * 1.06);
    y = bodyHeight + (bodyHeight * 0.08 + w * 0.02) / 2;
  } else if (kind === "hipped") {
    // A low four-sided pyramid.
    const rh = Math.max(w, d) * 0.45;
    geo = new THREE.ConeGeometry((Math.hypot(w, d) / 2) * 0.92, rh, 4);
    geo.rotateY(Math.PI / 4);
    y = bodyHeight + rh / 2;
  } else {
    // Gabled: a triangular prism spanning the depth.
    const rh = w * 0.45;
    geo = makePrism(w, rh, d);
    y = bodyHeight;
  }
  const roof = new THREE.Mesh(geo, mat);
  roof.position.y = y;
  return roof;
}

/** A triangular prism (gable roof): ridge runs along local +Z, apex centred. */
function makePrism(width: number, height: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = new Float32Array([
    // two triangular end caps + two sloped rectangles, authored as triangles.
    // front cap (z = -hd)
    -hw, 0, -hd, hw, 0, -hd, 0, height, -hd,
    // back cap (z = +hd)
    hw, 0, hd, -hw, 0, hd, 0, height, hd,
    // left slope
    -hw, 0, -hd, 0, height, -hd, 0, height, hd,
    -hw, 0, -hd, 0, height, hd, -hw, 0, hd,
    // right slope
    hw, 0, -hd, hw, 0, hd, 0, height, hd,
    hw, 0, -hd, 0, height, hd, 0, height, -hd,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// ── Vegetation (instanced) ──────────────────────────────────────────────────

export interface TreeScatter {
  /** Local positions `[x, z]` in metres for each tree. */
  positions: Array<readonly [number, number]>;
  /** Per-tree uniform scale. */
  scales: number[];
}

/**
 * Build instanced vegetation: one InstancedMesh of trunks and one of foliage,
 * grouped. Instancing keeps a grove of dozens of trees to two draw calls.
 */
export function buildTrees(
  mats: MaterialLibrary,
  rng: Rng,
  scatter: TreeScatter,
): THREE.Group {
  const n = scatter.positions.length;
  const group = new THREE.Group();
  if (n === 0) return group;

  const trunkGeo = new THREE.CylinderGeometry(3, 4.5, 20, 5);
  const foliageGeo = new THREE.IcosahedronGeometry(13, 0);

  const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, n);
  const foliage = new THREE.InstancedMesh(foliageGeo, mats.foliage, n);
  foliage.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const [x, z] = scatter.positions[i];
    const s = scatter.scales[i];

    pos.set(x, 10 * s, z);
    scl.set(s, s, s);
    m.compose(pos, q, scl);
    trunks.setMatrixAt(i, m);

    pos.set(x, (20 + 11) * s, z);
    const fs = s * rng.range(0.85, 1.25);
    scl.set(fs, fs * rng.range(0.9, 1.3), fs);
    m.compose(pos, q, scl);
    foliage.setMatrixAt(i, m);

    // Subtle green variation per tree.
    color.setHSL(0.26 + rng.range(-0.03, 0.04), 0.33, 0.33 + rng.range(-0.05, 0.06));
    foliage.setColorAt(i, color);
  }
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;

  group.add(trunks, foliage);
  return group;
}

// ── Roads / paths ───────────────────────────────────────────────────────────

/**
 * Build a flat ribbon following `points` (local metre-space `[x, z]`), laid
 * just above the ground plane so it reads over the terrain colour without
 * z-fighting.
 */
export function buildRoad(
  mats: MaterialLibrary,
  points: ReadonlyArray<readonly [number, number]>,
  widthMeters: number,
  variant: "road" | "path",
): THREE.Mesh {
  const half = widthMeters / 2;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Perpendicular in the ground plane.
    const nx = -dz;
    const nz = dx;
    const [x, z] = points[i];
    left.push([x + nx * half, z + nz * half]);
    right.push([x - nx * half, z - nz * half]);
  }

  const positions: number[] = [];
  const y = widthMeters * 0.02 + 1; // hair above the ground plane
  for (let i = 0; i < points.length - 1; i++) {
    const l0 = left[i];
    const l1 = left[i + 1];
    const r0 = right[i];
    const r1 = right[i + 1];
    // Two triangles per segment.
    positions.push(l0[0], y, l0[1], r0[0], y, r0[1], l1[0], y, l1[1]);
    positions.push(r0[0], y, r0[1], r1[0], y, r1[1], l1[0], y, l1[1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, variant === "road" ? mats.road : mats.path);
}

// ── Ground pad ──────────────────────────────────────────────────────────────

/**
 * A soft, **organically shaped** patch seating a settlement into the terrain,
 * hiding the hard cutoff between built geometry and the flat map surface. The
 * outline is an irregular jittered polygon (seeded), so settlements do not all
 * share an identical circular footprint.
 */
export function buildGroundPad(
  mats: MaterialLibrary,
  rng: Rng,
  radiusMeters: number,
): THREE.Mesh {
  const segments = 26;
  const pts: THREE.Vector2[] = [];
  // A slowly varying radius gives a lobed, natural edge rather than a circle.
  const phase = rng.range(0, Math.PI * 2);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const wobble = 0.82 + 0.18 * Math.sin(a * 3 + phase) + rng.range(-0.06, 0.06);
    const r = radiusMeters * wobble;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
  geo.rotateX(-Math.PI / 2); // Shape authored in XY → lay flat in the X/Z plane
  const pad = new THREE.Mesh(geo, mats.ground);
  pad.position.y = 0.5;
  return pad;
}

// ── Ship ────────────────────────────────────────────────────────────────────

/**
 * A small stylized vessel, authored facing local +X (east), base at the
 * waterline `y = 0`. Returned as a group so the animation system can translate
 * and rotate it as a whole. `lengthMeters` sets overall scale.
 */
export function buildShip(mats: MaterialLibrary, lengthMeters: number): THREE.Group {
  const group = new THREE.Group();
  const L = lengthMeters;
  const beam = L * 0.32;
  const hullH = L * 0.16;

  // Hull: a box tapered toward the bow by scaling its front vertices.
  const hullGeo = new THREE.BoxGeometry(L, hullH, beam);
  const pos = hullGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x > 0) {
      // pinch the bow
      pos.setZ(i, pos.getZ(i) * 0.25);
      pos.setY(i, pos.getY(i) + (pos.getY(i) > 0 ? 0 : hullH * 0.15));
    }
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, mats.hull);
  hull.position.y = hullH / 2;
  group.add(hull);

  // Mast + single square sail.
  const mastGeo = new THREE.CylinderGeometry(L * 0.015, L * 0.015, L * 0.7, 5);
  const mast = new THREE.Mesh(mastGeo, mats.hull);
  mast.position.set(0, hullH + L * 0.35, 0);
  group.add(mast);

  const sailGeo = new THREE.PlaneGeometry(L * 0.5, L * 0.5);
  const sail = new THREE.Mesh(sailGeo, mats.sail);
  sail.position.set(0, hullH + L * 0.4, 0);
  sail.rotation.y = Math.PI / 2; // face across the hull
  group.add(sail);

  return group;
}

// ── Far-LOD massing ─────────────────────────────────────────────────────────

/** Minimal footprint description needed to build a far-LOD massing block. */
export interface MassingBlock {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/**
 * The far-level settlement representation: the built-up area as a single
 * instanced cluster of simple flat-topped blocks, one per building, at the real
 * building positions. There is **no beacon, pin, or billboard** — the
 * settlement reads purely as a compact, organically shaped physical silhouette
 * whose outline and density come from the same layout the detailed levels use,
 * so zooming in refines what is already there rather than swapping it out.
 *
 * One InstancedMesh ⇒ one draw call regardless of building count; cheap enough
 * to leave on for distant settlements. No roofs, trees, or animation.
 */
export function buildFarMassing(
  mats: MaterialLibrary,
  blocks: readonly MassingBlock[],
): THREE.Group {
  const group = new THREE.Group();
  const n = blocks.length;
  if (n === 0) return group;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, mats.massing, n);
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    // Flatten slightly so the massing reads as simplified blocks, not towers.
    const h = b.h * 0.8;
    p.set(b.x, h / 2, b.z);
    s.set(b.w, h, b.d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  group.add(mesh);
  return group;
}
