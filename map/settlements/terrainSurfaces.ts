import * as THREE from "three";
import { GROUND_WIDTH, GROUND_DEPTH } from "@/map/settlements/surfaceMaterials";
import type { LocalPoint } from "@/map/settlements/romanSettlement";

/** Indexed surface vertices keep geographic sample points separate from mesh heights. */
export interface TerrainSurface {
  points: LocalPoint[];
  geometry: THREE.BufferGeometry;
  /** Authored bottom height per support sample (steps can sit above the main base). */
  seatingOffsets?: number[];
}

function surface(points: LocalPoint[], indices: number[]): TerrainSurface {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, 0, z]), 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x / GROUND_WIDTH + 0.5, z / GROUND_DEPTH + 0.5]), 2));
  geometry.setIndex(indices);
  return { points, geometry };
}

/** Subdivide along/across the road every ≤2 m; strips overlap at junctions. */
export function roadSurface(points: readonly LocalPoint[], width: number): TerrainSurface {
  const vertices: LocalPoint[] = [];
  const indices: number[] = [];
  for (let segment = 1; segment < points.length; segment++) {
    const [ax, az] = points[segment - 1];
    const [bx, bz] = points[segment];
    const length = Math.hypot(bx - ax, bz - az);
    if (!length) continue;
    const count = Math.ceil(length / 2);
    const nx = -(bz - az) / length * width / 2;
    const nz = (bx - ax) / length * width / 2;
    const start = vertices.length;
    const columns = Math.ceil(width / 2);
    const stride = columns + 1;
    for (let i = 0; i <= count; i++) {
      const x = ax + (bx - ax) * i / count;
      const z = az + (bz - az) * i / count;
      for (let j = 0; j <= columns; j++) {
        const across = 1 - 2 * j / columns;
        vertices.push([x + nx * across, z + nz * across]);
        if (i < count && j < columns) {
          const a = start + stride * i + j;
          indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
        }
      }
    }
  }
  return surface(vertices, indices);
}

/** A level slab with terrain-shaped lower edge, sampled throughout its footprint. */
export function foundationSurface(offset: LocalPoint, width: number, depth: number, heading: number): TerrainSurface {
  const nx = Math.ceil(width / 2);
  const nz = Math.ceil(depth / 2);
  const vertices: LocalPoint[] = [];
  const indices: number[] = [];
  const c = Math.cos(heading), s = Math.sin(heading);
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const dx = width * (x / nx - 0.5), dz = depth * (z / nz - 0.5);
    vertices.push([offset[0] + c * dx + s * dz, offset[1] - s * dx + c * dz]);
  }
  const count = vertices.length;
  vertices.push(...vertices);
  const wall = (a: number, b: number) => indices.push(a, b, a + count, b, b + count, a + count);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const a = z * (nx + 1) + x, b = a + 1, d = a + nx + 1;
    indices.push(a + count, d + count, b + count, b + count, d + count, d + count + 1);
    if (z === 0) wall(a, b);
    if (z === nz - 1) wall(d, d + 1);
    if (x === 0) wall(a, d);
    if (x === nx - 1) wall(b, d + 1);
  }
  return surface(vertices, indices);
}

/** Disconnected authored feet share one draw; no platform beneath open arches or L-plan yards. */
export function contactFoundationSurface(contacts: readonly { offset: LocalPoint; width: number; depth: number; heading: number; base?: number }[]): TerrainSurface {
  const parts = contacts.map((f) => foundationSurface(f.offset, f.width, f.depth, f.heading));
  const points = parts.flatMap((p) => p.points.slice(0, p.points.length / 2));
  const count = points.length, indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const half = part.points.length / 2;
    for (const index of part.geometry.index!.array) indices.push(index < half ? offset + index : count + offset + index - half);
    offset += half;
    part.geometry.dispose();
  }
  return { ...surface([...points, ...points], indices),
    seatingOffsets: parts.flatMap((p, i) => Array(p.points.length / 2).fill(contacts[i].base ?? 0)) };
}

export function writeSurfaceHeights(surface: TerrainSurface, heights: readonly number[], top?: number): void {
  const positions = surface.geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = top === undefined ? surface.points.length : surface.points.length / 2;
  for (let i = 0; i < count; i++) {
    positions.setY(i, heights[i] + (top === undefined ? 0.08 : -0.15));
    if (top !== undefined) positions.setY(i + count, top + (surface.seatingOffsets?.[i] ?? 0));
  }
  positions.needsUpdate = true;
  surface.geometry.computeVertexNormals();
  surface.geometry.computeBoundingSphere();
}

/** A union grid for this small orthogonal street network: no coplanar overlaps. */
export function roadNetworkSurface(roads: readonly { widthMeters: number; points: readonly LocalPoint[] }[], heading = 0): TerrainSurface {
  if (heading) {
    const c = Math.cos(heading), s = Math.sin(heading);
    // Rotate into the existing union algorithm, then restore settlement coordinates.
    // Quantisation removes rotation round-off at shared orthogonal junctions.
    const snap = (v: number) => Math.round(v * 1e8) / 1e8;
    const result = roadNetworkSurface(roads.map((r) => ({...r, points:r.points.map(([x,z]) => [snap(c*x-s*z),snap(s*x+c*z)] as LocalPoint)})));
    result.points = result.points.map(([x,z]) => [c*x+s*z,-s*x+c*z]);
    const positions = result.geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = result.geometry.getAttribute("uv") as THREE.BufferAttribute;
    result.points.forEach(([x,z], i) => { positions.setXYZ(i,x,0,z); uv.setXY(i,x/GROUND_WIDTH+0.5,z/GROUND_DEPTH+0.5); });
    return result;
  }
  const rectangles: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
    if (ax !== bx && az !== bz) throw new Error("Prototype street junctions require orthogonal segments.");
    if (ax === bx && az === bz) continue;
    const half = road.widthMeters / 2;
    rectangles.push({ minX: Math.min(ax, bx) - (ax === bx ? half : 0), maxX: Math.max(ax, bx) + (ax === bx ? half : 0),
      minZ: Math.min(az, bz) - (az === bz ? half : 0), maxZ: Math.max(az, bz) + (az === bz ? half : 0) });
  }
  const subdivisions = (values: number[]) => {
    const unique = [...new Set(values)].sort((a, b) => a - b);
    return unique.flatMap((value, i) => {
      if (i === unique.length - 1) return [value];
      const steps = Math.ceil((unique[i + 1] - value) / 2);
      return Array.from({ length: steps }, (_, j) => value + (unique[i + 1] - value) * j / steps);
    });
  };
  const xs = subdivisions(rectangles.flatMap((r) => [r.minX, r.maxX]));
  const zs = subdivisions(rectangles.flatMap((r) => [r.minZ, r.maxZ]));
  const points: LocalPoint[] = [], indices: number[] = [], vertices = new Map<string, number>();
  const vertex = (x: number, z: number) => {
    const key = `${x},${z}`;
    if (!vertices.has(key)) { vertices.set(key, points.length); points.push([x, z]); }
    return vertices.get(key)!;
  };
  for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
    const cx = (xs[x] + xs[x + 1]) / 2, cz = (zs[z] + zs[z + 1]) / 2;
    if (!rectangles.some((r) => cx > r.minX && cx < r.maxX && cz > r.minZ && cz < r.maxZ)) continue;
    const a = vertex(xs[x], zs[z]), b = vertex(xs[x + 1], zs[z]);
    const c = vertex(xs[x], zs[z + 1]), d = vertex(xs[x + 1], zs[z + 1]);
    indices.push(a, c, b, b, c, d);
  }
  const result = surface(points, indices);
  return result;
}

export function groundSurface(width: number, depth: number, spacing = 4): TerrainSurface {
  const points: LocalPoint[] = [], indices: number[] = [];
  const nx = Math.ceil(width / spacing), nz = Math.ceil(depth / spacing);
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    points.push([width * (x / nx - 0.5), depth * (z / nz - 0.5)]);
    if (x < nx && z < nz) {
      const a = z * (nx + 1) + x, c = a + nx + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return surface(points, indices);
}
