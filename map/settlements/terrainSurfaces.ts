import * as THREE from "three";
import type { LocalPoint } from "@/map/settlements/romanSettlement";

/** Indexed surface vertices keep geographic sample points separate from mesh heights. */
export interface TerrainSurface {
  points: LocalPoint[];
  geometry: THREE.BufferGeometry;
}

function surface(points: LocalPoint[], indices: number[]): TerrainSurface {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, 0, z]), 3));
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

export function writeSurfaceHeights(surface: TerrainSurface, heights: readonly number[], top?: number): void {
  const positions = surface.geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = top === undefined ? surface.points.length : surface.points.length / 2;
  for (let i = 0; i < count; i++) {
    positions.setY(i, heights[i] + (top === undefined ? 0.08 : -0.15));
    if (top !== undefined) positions.setY(i + count, top);
  }
  positions.needsUpdate = true;
  surface.geometry.computeVertexNormals();
  surface.geometry.computeBoundingSphere();
}
