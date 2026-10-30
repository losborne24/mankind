import * as THREE from "three";
import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";
import type { ReconstructionObject, ReconstructionSpec } from "@/map/settlements/reconstructionSpec";
import type { LocalPoint } from "@/map/settlements/romanSettlement";
import type { HeightResult } from "@/map/settlements/ContextGround";

const PLASTER = [0xc9b08a, 0xd6c8a8, 0xb98a68, 0xbcb3a0, 0xcb9f78].map(c => new THREE.Color(c));
const TILES = [0x9d5a3d, 0xa8643f, 0x8c533a, 0xa9714c].map(c => new THREE.Color(c));
const STONE = new THREE.Color(0xb9ae98), TIMBER = new THREE.Color(0x7d6444), DARK_TIMBER = new THREE.Color(0x4f3e2b);
const CERTAINTY_TINT = { documented: new THREE.Color(0xe9b75d), "evidence-based": new THREE.Color(0x6fc0aa), "best-guess": new THREE.Color(0xb58ad6) };
const CLOTH = [0xa4472f, 0x5f7585, 0xd9ccaa, 0x8d3a4a].map(c => new THREE.Color(c));

/** Accumulates boxes and extrusions into one vertex-coloured geometry, so a whole class of structures is one draw. */
class Mesher {
  private readonly parts: THREE.BufferGeometry[] = [];
  /** Colour mixed over everything added next (certainty tint); undefined for natural colours. */
  tint?: THREE.Color;
  private put(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, colour: THREE.Color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.applyMatrix4(matrix);
    if (this.tint) colour = colour.clone().lerp(this.tint, 0.62);
    const count = g.getAttribute("position").count, colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colour.toArray(colours, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    g.deleteAttribute("uv");
    this.parts.push(g);
  }
  /** A box centred at (x, y, z), dimensions in the box's own frame, yaw about +y. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, colour: THREE.Color) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));
    this.put(new THREE.BoxGeometry(1, 1, 1), m, colour);
  }
  cylinder(x: number, y: number, z: number, radius: number, height: number, colour: THREE.Color) {
    this.put(new THREE.CylinderGeometry(radius, radius, height, 8), new THREE.Matrix4().makeTranslation(x, y, z), colour);
  }
  extrude(shape: THREE.Shape, depth: number, matrix: THREE.Matrix4, colour: THREE.Color) {
    this.put(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }), matrix, colour);
  }
  build(): THREE.BufferGeometry | undefined {
    if (!this.parts.length) return undefined;
    const total = this.parts.reduce((n, g) => n + g.getAttribute("position").count, 0);
    const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3);
    let at = 0;
    for (const g of this.parts) {
      position.set(g.getAttribute("position").array as Float32Array, at * 3);
      normal.set(g.getAttribute("normal").array as Float32Array, at * 3);
      color.set(g.getAttribute("color").array as Float32Array, at * 3);
      at += g.getAttribute("position").count; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(position, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    out.setAttribute("color", new THREE.BufferAttribute(color, 3));
    out.computeBoundingSphere();
    return out;
  }
}

type Height = (point: LocalPoint) => number | undefined;
const yawOf = (dx: number, dz: number) => -Math.atan2(dz, dx);

/**
 * Draws the best-guess neighbourhood: attached shops, flats and warehouses as two instanced meshes (walls with a
 * procedural facade, tiled roofs), and every other structure (bridge, quay, stages, barges, altar, pens, stalls) as
 * a few merged meshes. Guessed objects live in their own group, so one switch hides all of them.
 */
export class UrbanScene {
  readonly group = new THREE.Group();
  private readonly guessed = new THREE.Group();
  private readonly based = new THREE.Group();
  private built = false;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  constructor(readonly spec: ReconstructionSpec) {
    this.group.add(this.guessed, this.based);
    this.group.name = "reconstruction";
  }
  setGuessVisible(visible: boolean) { this.guessed.visible = visible; }
  /** Colours each object by its certainty instead of its natural colour, so the guess is visible at a glance. */
  setTint(on: boolean) { if (on !== this.tinted) { this.tinted = on; this.built = false; this.signature = []; } }
  private tinted = false;
  invalidate() { this.built = false; }
  get ready() { return this.built; }

  /** Points whose ground height shapes this object. */
  private samples(o: ReconstructionObject): LocalPoint[] {
    const shape = o.shape;
    switch (shape.type) {
      case "building": return [shape.centre, ...o.footprint];
      case "bridge": return [[shape.piersE[0], shape.axisS], [shape.piersE.at(-1), shape.axisS]];
      case "quay": return shape.line;
      case "altar": case "pen": case "stall": return [shape.centre];
      default: return [];
    }
  }
  private signature: number[] = [];
  private picks: { id: string; guess: boolean; box: THREE.Box3 }[] = [];

  /** Nearest raised object under a ray (settlement frame). Objects flush with the ground are picked on the map instead. */
  pick(origin: THREE.Vector3, direction: THREE.Vector3): string | undefined {
    const ray = new THREE.Ray(origin, direction), hit = new THREE.Vector3();
    let best: string | undefined, nearest = Infinity;
    for (const p of this.picks) {
      if (p.guess && !this.guessed.visible) continue;
      if (ray.intersectBox(p.box, hit)) { const d = hit.distanceTo(origin); if (d < nearest) { nearest = d; best = p.id; } }
    }
    return best;
  }

  /**
   * Rebuild against the terrain; false while any needed height is unknown. The terrain refines as DEM tiles arrive,
   * so heights are compared on every call and the meshes are rebuilt only when they moved by more than 15 cm.
   */
  update(height: Height, waterLevel: number | undefined): boolean {
    const failed = { value: false }, cache = new Map<string, number>(), signature: number[] = [waterLevel ?? -1];
    const keyOf = (p: LocalPoint) => `${p[0]},${p[1]}`;
    for (const o of this.spec.objects) for (const p of this.samples(o)) {
      const k = keyOf(p);
      if (cache.has(k)) continue;
      const v = height(p);
      if (v === undefined) failed.value = true;
      cache.set(k, v ?? 0); signature.push(v ?? 0);
    }
    if (failed.value) return false;
    if (this.built && signature.length === this.signature.length && signature.every((v, i) => Math.abs(v - this.signature[i]) < 0.15)) return true;
    this.signature = signature;
    const h = (p: LocalPoint) => cache.get(keyOf(p)) ?? height(p) ?? 0;
    this.clear(); this.picks = [];
    const box = (o: ReconstructionObject, ground: number, top: number) => { const xs = o.footprint.map(p => p[0]), zs = o.footprint.map(p => p[1]); this.picks.push({ id: o.id, guess: o.certainty === "best-guess", box: new THREE.Box3(new THREE.Vector3(Math.min(...xs), ground, Math.min(...zs)), new THREE.Vector3(Math.max(...xs), top, Math.max(...zs))) }); };
    const walls: { o: ReconstructionObject; base: number }[] = [];
    const guessed = new Mesher(), based = new Mesher();
    const surface = waterLevel ?? Infinity;
    for (const o of this.spec.objects) {
      const mesher = o.certainty === "best-guess" ? guessed : based;
      mesher.tint = this.tinted ? CERTAINTY_TINT[o.certainty] : undefined;
      switch (o.shape.type) {
        case "building": {
          const [c0, c1, c2, c3] = o.footprint, c = o.shape.centre as LocalPoint;
          const base = Math.max(h(c), h(c0), h(c1), h(c2), h(c3));
          walls.push({ o, base }); box(o, base, base + o.shape.height + 2.5);
          break;
        }
        case "bridge": this.bridge(mesher, o, h, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 3, Math.max(h([o.shape.piersE[0], o.shape.axisS]), h([o.shape.piersE.at(-1), o.shape.axisS]), Number.isFinite(surface) ? surface + 6.5 : 0) + 1.6); break;
        case "quay": this.quay(mesher, o, h, surface); break;
        case "stage": this.stage(mesher, o, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 1.5, (Number.isFinite(surface) ? surface : 0) + 2); break;
        case "barge": this.barge(mesher, o, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 0.5, (Number.isFinite(surface) ? surface : 0) + 2.2); break;
        case "altar": this.altar(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2.8); break;
        case "pen": this.pen(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2); break;
        case "stall": this.stall(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2.4); break;
        default: break;
      }
    }
    for (const [mesher, group] of [[guessed, this.guessed], [based, this.based]] as const) {
      const geometry = mesher.build();
      if (!geometry) continue;
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true; configureTerrainShadowCaster(mesh);
      group.add(mesh); this.geometries.push(geometry); this.materials.push(material);
    }
    this.buildings(walls);
    this.built = true;
    return true;
  }

  private buildings(walls: { o: ReconstructionObject; base: number }[]) {
    if (!walls.length) return;
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const info = new Float32Array(walls.length * 4);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    wallMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfo;\nvarying vec3 vFace;\nvarying vec3 vObjNormal;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          mat3 urbanInst = mat3(instanceMatrix);
          vFace = position * vec3(length(urbanInst[0]), length(urbanInst[1]), length(urbanInst[2]));
          vInfo = aInfo; vObjNormal = normal;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec4 vInfo;\nvarying vec3 vFace;\nvarying vec3 vObjNormal;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 wallN = abs(vObjNormal);
          if (wallN.y < 0.5) {
            float along = wallN.x > 0.5 ? vFace.z : vFace.x;
            float y = vFace.y - vInfo.x;
            float storey = floor(y / 3.2), local = y - storey * 3.2;
            float kind = vInfo.z;                       // 0 shop, 1 flats, 2 warehouse
            float opening = 0.0;
            if (kind < 0.5 && storey < 0.5) { opening = step(abs(fract(along / 3.6) - 0.5), 0.3) * step(0.3, local) * step(local, 2.7); }
            else if (kind < 1.5) { opening = step(abs(fract(along / 2.9) - 0.5), 0.17) * step(abs(local - 1.9), 0.62) * step(0.5, storey + step(0.5, kind)); }
            else { opening = storey > 0.5 ? step(abs(fract(along / 4.5) - 0.5), 0.1) * step(abs(local - 2.2), 0.4) : step(abs(fract(along / 8.0) - 0.5), 0.2) * step(local, 2.8); }
            float course = smoothstep(0.0, 0.04, abs(fract(y / 0.9) - 0.5) - 0.46) * 0.05;
            diffuseColor.rgb *= 1.0 - opening * 0.72 - course;
            diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(1.2, 0.0, y);
          }`);
      shader.vertexShader = shader.vertexShader.replace("void main() {", "void main() {");
    };
    wallMaterial.customProgramCacheKey = () => "urban-wall-v1";
    const wallMesh = new THREE.InstancedMesh(box, wallMaterial, walls.length);
    const roof = new THREE.BufferGeometry();
    // Gable roof, ridge along the width: A B back eave, C D front eave, R1 R2 ridge ends.
    const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [-.5, 0, .5], D = [.5, 0, .5], R1 = [-.5, 1, 0], R2 = [.5, 1, 0];
    roof.setAttribute("position", new THREE.Float32BufferAttribute([...A, ...B, ...R2, ...A, ...R2, ...R1, ...C, ...R1, ...R2, ...C, ...R2, ...D, ...A, ...C, ...R1, ...B, ...R2, ...D], 3));
    roof.computeVertexNormals();
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const roofMesh = new THREE.InstancedMesh(roof, roofMaterial, walls.length);
    const m = new THREE.Matrix4(), tint = new THREE.Color();
    walls.forEach(({ o, base }, i) => {
      const s = o.shape as { centre: LocalPoint; front: [number, number]; size: [number, number]; storeys: number; height: number; tone: number };
      const [fe, fs] = s.front, skirt = 2.2, rise = Math.min(2.4, s.size[1] * 0.17);
      m.makeBasis(new THREE.Vector3(-fs, 0, fe), new THREE.Vector3(0, 1, 0), new THREE.Vector3(fe, 0, fs));
      const wallMatrix = m.clone().scale(new THREE.Vector3(s.size[0], s.height + skirt, s.size[1])).setPosition(s.centre[0], base - skirt, s.centre[1]);
      wallMesh.setMatrixAt(i, wallMatrix);
      const roofMatrix = m.clone().scale(new THREE.Vector3(s.size[0] + 0.5, rise, s.size[1] + 0.5)).setPosition(s.centre[0], base + s.height, s.centre[1]);
      roofMesh.setMatrixAt(i, roofMatrix);
      wallMesh.setColorAt(i, tint.copy(PLASTER[s.tone % PLASTER.length]));
      roofMesh.setColorAt(i, tint.copy(TILES[(s.tone + i) % TILES.length]));
      if (this.tinted) { wallMesh.setColorAt(i, tint.copy(PLASTER[s.tone % PLASTER.length]).lerp(CERTAINTY_TINT[o.certainty], 0.62)); roofMesh.setColorAt(i, tint.copy(TILES[(s.tone + i) % TILES.length]).lerp(CERTAINTY_TINT[o.certainty], 0.62)); }
      info[i * 4] = skirt; info[i * 4 + 1] = s.storeys; info[i * 4 + 2] = o.kind === "shop" ? 0 : o.kind === "warehouse" ? 2 : 1;
    });
    box.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    for (const mesh of [wallMesh, roofMesh]) { mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; configureTerrainShadowCaster(mesh); this.guessed.add(mesh); }
    this.geometries.push(box, roof); this.materials.push(wallMaterial, roofMaterial);
  }

  private bridge(mesher: Mesher, o: ReconstructionObject, h: Height, water: number) {
    const { axisS, piersE, deckWidth } = o.shape as { axisS: number; piersE: number[]; deckWidth: number };
    const ends = [h([piersE[0], axisS]) ?? 0, h([piersE.at(-1)!, axisS]) ?? 0];
    const deck = Math.max(ends[0], ends[1], Number.isFinite(water) ? water + 6.5 : 0) + 0.4, bottom = Number.isFinite(water) ? water - 3 : deck - 14;
    for (let i = 0; i < piersE.length - 1; i++) {
      const a = piersE[i], b = piersE[i + 1], span = a - b, pierWidth = 3.2;
      // Spandrel wall with a round arch opening, extruded across the deck width.
      const half = (span - pierWidth) / 2, spring = deck - 1.9 - half * 0.95, shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(span, 0); shape.lineTo(span, deck - bottom - 0.6); shape.lineTo(0, deck - bottom - 0.6); shape.closePath();
      const hole = new THREE.Path(), cx = span / 2, base = Math.max(0.4, Math.min(spring - bottom, deck - bottom - 3));
      hole.moveTo(cx - half, base); hole.absarc(cx, base, half, Math.PI, 0, true); hole.lineTo(cx - half, base);
      shape.holes.push(hole);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)).setPosition(a, bottom, axisS - deckWidth / 2);
      mesher.extrude(shape, deckWidth, m, STONE);
    }
    for (const e of piersE.slice(1, -1)) mesher.box(e, (deck + bottom) / 2 - 0.3, axisS, 3.4, deck - bottom - 0.6, deckWidth + 0.8, 0, STONE.clone().multiplyScalar(0.92));
    const length = piersE[0] - piersE.at(-1)!, mid = (piersE[0] + piersE.at(-1)!) / 2;
    mesher.box(mid, deck - 0.15, axisS, length, 0.7, deckWidth, 0, STONE.clone().multiplyScalar(1.05));
    for (const side of [-1, 1]) mesher.box(mid, deck + 0.6, axisS + side * (deckWidth / 2 - 0.25), length, 1.0, 0.5, 0, STONE);
    for (const [e, sign] of [[piersE[0], 1], [piersE.at(-1)!, -1]] as const) mesher.box(e + sign * 4, (deck + Math.min(ends[0], ends[1]) - 2) / 2, axisS, 8, deck - Math.min(ends[0], ends[1]) + 2, deckWidth + 1, 0, STONE.clone().multiplyScalar(0.9));
  }

  private quay(mesher: Mesher, o: ReconstructionObject, h: Height, water: number) {
    const line = o.shape.line as LocalPoint[];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], top = Math.max(h(a) ?? 0, h(b) ?? 0) + 0.3, bottom = Number.isFinite(water) ? water - 2.2 : top - 5;
      if (top < bottom + 1) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      mesher.box((a[0] + b[0]) / 2, (top + bottom) / 2, (a[1] + b[1]) / 2, l + 0.4, top - bottom, 1.8, yawOf(dx, dz), STONE.clone().multiplyScalar(0.95));
      mesher.box((a[0] + b[0]) / 2 - 0.1, top + 0.12, (a[1] + b[1]) / 2, l + 0.4, 0.3, 2.3, yawOf(dx, dz), STONE.clone().multiplyScalar(1.08));
    }
  }

  private stage(mesher: Mesher, o: ReconstructionObject, water: number) {
    const { origin, length, width } = o.shape as { origin: LocalPoint; length: number; width: number };
    const deck = (Number.isFinite(water) ? water : 0) + 1.1;
    mesher.box(origin[0] - length / 2, deck, origin[1], length, 0.25, width, 0, TIMBER);
    for (let k = 0; k <= 4; k++) for (const side of [-1, 1]) mesher.box(origin[0] - 0.8 - k * (length - 1.6) / 4, deck - 1.2, origin[1] + side * (width / 2 - 0.2), 0.3, 2.6, 0.3, 0, DARK_TIMBER);
    mesher.cylinder(origin[0] - length + 0.6, deck + 0.45, origin[1], 0.2, 0.7, DARK_TIMBER);
  }

  private barge(mesher: Mesher, o: ReconstructionObject, water: number) {
    const { centre, length, beam, cargo, crates } = o.shape as { centre: LocalPoint; length: number; beam: number; cargo: string; crates: number };
    const y = (Number.isFinite(water) ? water : 0) + 0.15, hull = new THREE.Shape(), l = length / 2, b = beam / 2;
    hull.moveTo(-l, -b * 0.55); hull.lineTo(-l * 0.55, -b); hull.lineTo(l * 0.55, -b); hull.lineTo(l, -b * 0.55); hull.lineTo(l, b * 0.55); hull.lineTo(l * 0.55, b); hull.lineTo(-l * 0.55, b); hull.lineTo(-l, b * 0.55); hull.closePath();
    // Shape lies in x/y; stand it flat (x → north-south along the barge), rise 1.1 m.
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(centre[0], y - 0.5, centre[1]);
    mesher.extrude(hull, 1.1, m, TIMBER);
    for (let k = 0; k < crates; k++) {
      const s = centre[1] - l * 0.6 + (k + 0.5) * (l * 1.2) / crates, side = (k % 2 ? 1 : -1) * b * 0.3;
      if (cargo === "amphorae") for (let a = 0; a < 3; a++) mesher.cylinder(centre[0] + side + (a - 1) * 0.55, y + 1.2, s, 0.26, 0.9, new THREE.Color(0xb9895c));
      else mesher.box(centre[0] + side, y + 0.95, s, 1.3, 0.9, 1.2, 0, cargo === "timber" ? DARK_TIMBER : cargo === "stone" ? STONE : new THREE.Color(0xcdbf9b));
    }
  }

  private altar(mesher: Mesher, o: ReconstructionObject, h: Height) {
    const { centre, platform, height } = o.shape as { centre: LocalPoint; platform: [number, number]; height: number };
    const base = h(centre) ?? 0;
    mesher.box(centre[0], base + 0.2, centre[1], platform[0], 0.6, platform[1], 0, STONE.clone().multiplyScalar(0.88));
    mesher.box(centre[0], base + 0.65, centre[1], platform[0] - 1.6, 0.4, platform[1] - 1.6, 0, STONE.clone().multiplyScalar(0.94));
    mesher.box(centre[0], base + 0.85 + height / 2, centre[1], 4.2, height, 2.4, 0, STONE);
    mesher.box(centre[0], base + 1.0 + height, centre[1], 4.7, 0.25, 2.9, 0, STONE.clone().multiplyScalar(1.08));
  }

  private pen(mesher: Mesher, o: ReconstructionObject, h: Height) {
    const { centre, size } = o.shape as { centre: LocalPoint; size: [number, number] };
    const base = h(centre) ?? 0, [w, d] = size;
    const rail = (x: number, z: number, sx: number, sz: number) => { for (const y of [0.55, 1.05]) mesher.box(x, base + y, z, sx, 0.1, sz, 0, TIMBER); };
    rail(centre[0], centre[1] - d / 2, w, 0.1); rail(centre[0], centre[1] + d / 2, w, 0.1); rail(centre[0] - w / 2, centre[1], 0.1, d); rail(centre[0] + w / 2, centre[1], 0.1, d);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) for (const z of [-d / 2, d / 2]) mesher.box(centre[0] + x, base + 0.65, centre[1] + z, 0.14, 1.3, 0.14, 0, DARK_TIMBER);
    for (let z = -d / 2 + d / 4; z < d / 2; z += d / 4) for (const x of [-w / 2, w / 2]) mesher.box(centre[0] + x, base + 0.65, centre[1] + z, 0.14, 1.3, 0.14, 0, DARK_TIMBER);
    const coats = [0x6b4a34, 0xb8a58a, 0x4a3a30, 0x8a6a4c].map(c => new THREE.Color(c));
    for (let k = 0; k < 3; k++) { const x = centre[0] + (k - 1) * w * 0.28, z = centre[1] + (k % 2 ? 1 : -1) * d * 0.15, c = coats[(k + Math.round(centre[0])) & 3];
      mesher.box(x, base + 0.85, z, 1.9, 0.9, 0.8, k * 0.7, c); mesher.box(x + Math.cos(k * 0.7) * 1.15, base + 1.1, z - Math.sin(k * 0.7) * 1.15, 0.6, 0.5, 0.5, k * 0.7, c);
      for (const [lx, lz] of [[-0.7, -0.25], [-0.7, 0.25], [0.7, -0.25], [0.7, 0.25]]) mesher.box(x + Math.cos(k * 0.7) * lx + Math.sin(k * 0.7) * lz, base + 0.2, z - Math.sin(k * 0.7) * lx + Math.cos(k * 0.7) * lz, 0.14, 0.45, 0.14, 0, c); }
  }

  private stall(mesher: Mesher, o: ReconstructionObject, h: Height) {
    const { centre, size, tone } = o.shape as { centre: LocalPoint; size: [number, number]; tone: number };
    const base = h(centre) ?? 0, [w, d] = size;
    mesher.box(centre[0], base + 0.85, centre[1] + d * 0.18, w * 0.9, 0.12, d * 0.5, 0, TIMBER);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesher.box(centre[0] + x * w / 2, base + 1.1, centre[1] + z * d / 2, 0.1, 2.2, 0.1, 0, DARK_TIMBER);
    mesher.box(centre[0], base + 2.25, centre[1], w + 0.4, 0.08, d + 0.4, 0, CLOTH[tone % CLOTH.length]);
    mesher.box(centre[0], base + 0.5, centre[1] + d * 0.18, w * 0.8, 0.5, d * 0.35, 0, new THREE.Color(0xc4b08a));
  }

  private clear() {
    for (const group of [this.guessed, this.based]) group.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0; this.materials.length = 0;
  }
  dispose() { this.clear(); }
}

export type { HeightResult };
