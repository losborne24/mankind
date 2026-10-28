import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";

export const DETAIL_VILLA_ID = "villa-west-2";

/** Metre-space provincial house module; +Z entrance, Y=0 floor. Owns only its resources. */
export function createEnhancedVilla(): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = "enhanced-villa";
  const textures: THREE.DataTexture[] = [];
  // Small deterministic mineral/grain maps, generated once per module, no network assets.
  const grain = (wood = false) => {
    const size = 128, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const fine = noise - Math.floor(noise);
      const wave = wood ? Math.sin(x * 1.5 + Math.sin(y * 0.08) * 0.6) * 0.09 : Math.sin(x * 0.13) * Math.sin(y * 0.17) * 0.025;
      const v = Math.round(225 + fine * 22 + wave * 100);
      const i = (y * size + x) * 4;
      pixels.set([v, v, v, 255], i);
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  };
  const mineral = grain(), timber = grain(true);
  const material = (name: string, color: number, map?: THREE.Texture, bumpScale = 0.015) => {
    const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.94, vertexColors: true,
      map: map ?? null, bumpMap: map ?? null, bumpScale, shadowSide: THREE.BackSide });
    return m;
  };
  const materials = [material("lime-plaster", 0xc9bd9f, mineral), material("limestone", 0x9d927b, mineral, 0.035),
    material("fired-terracotta", 0xa75c3c, mineral, 0.02), material("aged-timber", 0x665039, timber, 0.025),
    material("unlit-recess", 0x26251f), material("iron", 0x393b37)];
  const batches: THREE.BufferGeometry[][] = materials.map(() => []);
  let sequence = 0;
  const add = (source: THREE.BufferGeometry, mat: number, position: number[], rotation = new THREE.Euler()) => {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1)));
    const shade = 0.91 + (Math.sin(++sequence * 17.13) + 1) * 0.075;
    const colors = new Float32Array(geometry.getAttribute("position").count * 3).fill(shade);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    batches[mat].push(geometry);
  };
  const box = (mat: number, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0) =>
    add(new THREE.BoxGeometry(w, h, d), mat, [x, y, z], new THREE.Euler(0, 0, angle));
  // Solid wall segments leave actual apertures; shallow dark backing closes the interior.
  const wall = (z: number, front: boolean) => {
    const openings = front ? [[-1.75, 0.75, 1.45, 2.2], [0, 1.05, 0.12, 2.15], [1.75, 0.75, 1.45, 2.2]] : [[-1.55, 0.7, 1.55, 2.2], [1.55, 0.7, 1.55, 2.2]];
    let left = -2.72;
    for (const [x, width, bottom, top] of openings) {
      const edge = x - width / 2;
      box(0, (left + edge) / 2, 1.45, z, edge - left, 2.9, 0.28);
      if (bottom > 0) box(0, x, bottom / 2, z, width, bottom, 0.28);
      box(0, x, (top + 2.9) / 2, z, width, 2.9 - top, 0.28);
      const face = z + Math.sign(z) * 0.17;
      box(4, x, (bottom + top) / 2, z - Math.sign(z) * 0.10, width, top - bottom, 0.035);
      // Dressed lintel, projecting sill and two quiet jambs.
      box(1, x, top + 0.07, face, width + 0.26, 0.14, 0.23);
      box(1, x, bottom + 0.015, face + Math.sign(z) * 0.035, width + 0.24, 0.10, 0.29);
      for (const side of [-1, 1]) box(1, x + side * (width / 2 + 0.055), (top + bottom) / 2, face, 0.11, top - bottom, 0.19);
      if (front && x === 0) {
        // Door sits behind the jambs with distinct boards and iron straps.
        for (let i = 0; i < 6; i++) box(3, -0.505 + (i + 0.5) * 1.01 / 6, 1.125, z + 0.015, 1.01 / 6 - 0.012, 1.96, 0.07);
        for (const y of [0.55, 1.7]) box(5, 0, y, z + 0.06, 0.92, 0.045, 0.025);
        box(5, 0.32, 1.1, z + 0.09, 0.055, 0.11, 0.04);
        box(1, 0, 0.06, z + 0.36, 1.55, 0.12, 0.7);
      } else {
        // Partly closed wooden shutters, with the opening still readable in shadow.
        for (const side of [-1, 1]) {
          box(3, x + side * width * 0.34, (bottom + top) / 2, z + Math.sign(z) * 0.01, width * 0.26, top - bottom - 0.08, 0.055);
          for (const y of [bottom + 0.14, top - 0.14]) box(3, x + side * width * 0.34, y, face, width * 0.28, 0.055, 0.05);
        }
      }
      left = x + width / 2;
    }
    box(0, (left + 2.72) / 2, 1.45, z, 2.72 - left, 2.9, 0.28);
  };
  wall(2.36, true); wall(-2.36, false);
  for (const side of [-1, 1]) {
    box(0, side * 2.58, 1.45, 0, 0.28, 2.9, 4.45);
    box(1, side * 2.62, 0.22, 0, 0.3, 0.44, 4.82);
    box(3, side * 2.68, 2.84, 0, 0.19, 0.16, 5.15);
    // Exposed ends of structural rafters, under the drip edge.
    for (let i = 0; i < 12; i++) box(3, side * 2.79, 2.84, -2.4 + i * 0.435, 0.38, 0.11, 0.11);
    for (const z of [-2.36, 2.36]) for (let row = 0; row < 5; row++)
      box(1, side * 2.6, 0.18 + row * 0.28, z, 0.29 + row % 2 * 0.1, 0.25, 0.31);
  }
  for (const z of [-2.36, 2.36]) {
    // Rubble plinth; retain the door opening.
    for (let i = 0; i < 12; i++) {
      const x = -2.5 + i * 0.455;
      if (z > 0 && Math.abs(x) < 0.7) continue;
      for (let row = 0; row < 2; row++) box(1, x, 0.11 + row * 0.21, z, 0.44, 0.20, 0.31);
    }
    const shape = new THREE.Shape(); shape.moveTo(-2.72, 2.9); shape.lineTo(2.72, 2.9); shape.lineTo(0, 4.13); shape.closePath();
    add(new THREE.ExtrudeGeometry(shape, {depth: 0.25, bevelEnabled: false}), 0, [0, 0, z - 0.125]);
  }
  // Tegula beds + curved imbrices: individual overlaps and fired-clay colour variation.
  const slope = 1.3 / 3, angle = Math.atan(slope);
  for (const side of [-1, 1]) {
    box(2, side * 1.5, 3.57, 0, Math.hypot(3, 1.3), 0.10, 6.35, -side * angle);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 21; col++) {
      const x = (row + 0.5) * 0.375, y = 4.25 - x * slope, z = -3 + col * 0.30;
      box(2, side * x, y, z, 0.415, 0.045, 0.292, -side * angle);
      const cap = new THREE.BufferGeometry(), vertices: number[] = [], uv: number[] = [];
      const point = (end: number, segment: number) => [end * 0.213, Math.sin(segment * Math.PI / 6) * 0.048, Math.cos(segment * Math.PI / 6) * 0.048];
      for (let s = 0; s < 6; s++) for (const [end, seg] of [[-1,s],[1,s],[1,s+1],[-1,s],[1,s+1],[-1,s+1]]) {
        vertices.push(...point(end, seg)); uv.push((end+1)/2, seg/6);
      }
      cap.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      cap.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); cap.computeVertexNormals();
      add(cap, 2, [side * x, y + 0.028, z + 0.15], new THREE.Euler(0, 0, -side * angle));
    }
  }
  // Segmented ridge capping, with a quiet raised roll instead of ornamental finials.
  for (let i = 0; i < 16; i++) add(new THREE.CylinderGeometry(0.105, 0.105, 0.405, 8, 1, false, Math.PI / 2, Math.PI), 2,
    [0, 4.27, -3.04 + i * 0.405], new THREE.Euler(Math.PI / 2, 0, 0));
  for (const [i, geometries] of batches.entries()) {
    const merged = mergeGeometries(geometries);
    if (!merged) throw new Error("Villa geometry batch failed");
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, materials[i]);
    mesh.name = materials[i].name;
    mesh.castShadow = mesh.receiveShadow = true;
    configureTerrainShadowCaster(mesh);
    group.add(mesh);
  }
  let disposed = false;
  return { group, dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    group.removeFromParent();
  } };
}
