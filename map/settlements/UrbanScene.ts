import * as THREE from "three";
import { configureTerrainShadowCaster } from "@/map/settlements/terrainShadows";
import type { ReconstructionObject, ReconstructionSpec } from "@/map/settlements/reconstructionSpec";
import type { LocalPoint } from "@/map/settlements/romanSettlement";
import type { HeightResult } from "@/map/settlements/ContextGround";

const PLASTER = [0xc9b08a, 0xd6c8a8, 0xb98a68, 0xbcb3a0, 0xcb9f78].map(c => new THREE.Color(c));
const TILES = [0xb06a45, 0xb97848, 0xa2603f, 0xbd8458, 0x9c6a52, 0xc08a62].map(c => new THREE.Color(c));
const STONE = new THREE.Color(0xb9ae98), TIMBER = new THREE.Color(0x7d6444), DARK_TIMBER = new THREE.Color(0x4f3e2b);
const CERTAINTY_TINT = { documented: new THREE.Color(0xe9b75d), "evidence-based": new THREE.Color(0x6fc0aa), "best-guess": new THREE.Color(0xb58ad6) };
const SAND = new THREE.Color(0xcdb88d), TRAVERTINE = new THREE.Color(0xd2c6a8), PALACE_WALL = new THREE.Color(0xe0d4b8), PALACE_STONE = new THREE.Color(0xa89f8c), PALACE_ROOF = new THREE.Color(0xa05f42), OBELISK = new THREE.Color(0xb89a78);
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
  /** A flat quad from four corners (either winding; the materials that use quads are double-sided). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colour: THREE.Color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(v => [v.x, v.y, v.z]), 3));
    g.computeVertexNormals();
    this.put(g, new THREE.Matrix4(), colour);
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
type Ground = (point: LocalPoint) => number;
const yawOf = (dx: number, dz: number) => -Math.atan2(dz, dx);
const LATTICE = 10;

/** One wing volume of a palace as the generator writes it: an oriented box on the platform. */
interface PalaceVolume { c: LocalPoint; size: [number, number]; heading: number; height: number; role: "platform" | "wall" | "hall" | "exedra" }
/** The four corners of a volume's footprint (plus its centre and edge midpoints if `dense`), for terrain sampling. */
function volumeCorners(v: PalaceVolume, dense = false): LocalPoint[] {
  const ux = Math.cos(v.heading), uz = Math.sin(v.heading), vx = -uz, vz = ux, out: LocalPoint[] = [];
  const steps = dense ? [-1, -0.5, 0, 0.5, 1] : [-1, 1];
  for (const a of steps) for (const b of steps) out.push([v.c[0] + ux * v.size[0] / 2 * a + vx * v.size[1] / 2 * b, v.c[1] + uz * v.size[0] / 2 * a + vz * v.size[1] / 2 * b]);
  return out;
}
/** The circus in its own frame: `a` along the track from the starting gates (north-west) to the curved end, `b` across it. */
function circusFrame(shape: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = shape.centre as LocalPoint, axis = shape.axis as [number, number], across: [number, number] = [-axis[1], axis[0]];
  const half = shape.track / 2, start = -shape.length / 2, straightEnd = shape.length / 2 - half;
  const at = (a: number, b: number): LocalPoint => [c[0] + axis[0] * a + across[0] * b, c[1] + axis[1] * a + across[1] * b];
  const dir = (a: number, b: number): LocalPoint => [across[0] * Math.sign(b), across[1] * Math.sign(b)];
  const dirAngle = (t: number): LocalPoint => [axis[0] * Math.cos(t) + across[0] * Math.sin(t), axis[1] * Math.cos(t) + across[1] * Math.sin(t)];
  const curve = (n: number): LocalPoint[] => Array.from({ length: n + 1 }, (_, k) => { const t = -Math.PI / 2 + Math.PI * k / n; return at(straightEnd + Math.cos(t) * half, Math.sin(t) * half); });
  /** Ground samples for the circus: the track edges, centre line and outer edge of the stands, along the straights and round the end. */
  const sampleRing = (): LocalPoint[] => {
    const out: LocalPoint[] = [], outer = half + shape.bank;
    for (let a = start; a <= straightEnd; a += 12) for (const b of [-outer, -half, -half / 2, 0, half / 2, half, outer]) out.push(at(a, b));
    for (let k = 0; k <= 16; k++) { const t = -Math.PI / 2 + Math.PI * k / 16; for (const r of [half * 0.5, half, outer]) out.push(at(straightEnd + Math.cos(t) * r, Math.sin(t) * r)); }
    for (const a of [straightEnd - 40, straightEnd, straightEnd + half * 0.6, straightEnd + half + 24, straightEnd + half + 48]) for (const b of [-half, -half / 2, 0, half / 2, half]) out.push(at(a, b));
    return out;
  };
  return { c, axis, half, start, straightEnd, at, dir, dirAngle, curve, sampleRing };
}

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
  /** Where the camera's line of sight is kept clear (the temples, settlement frame) and whether near-camera guessed buildings are dithered away. */
  private readonly focus = { value: new THREE.Vector3(0, 0, 0) };
  private readonly seeThrough = { value: 1 };
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  constructor(readonly spec: ReconstructionSpec) {
    this.group.add(this.guessed, this.based);
    this.group.name = "reconstruction";
  }
  setGuessVisible(visible: boolean) { this.guessed.visible = visible; }
  /** The point (settlement frame) the guided views look at; buildings between it and the camera thin out. */
  setFocus(point: THREE.Vector3) { this.focus.value.copy(point); }
  setSeeThrough(amount: number) { this.seeThrough.value = amount; }
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
      case "circus": return circusFrame(shape).sampleRing();
      case "palace": return (shape.volumes as PalaceVolume[]).filter(v => v.role === "platform").flatMap(v => volumeCorners(v, true));
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
   * Heights come from a 10 m lattice interpolated bilinearly: the DEM is no finer, and thousands of lots would
   * otherwise cost thousands of terrain queries.
   */
  update(height: Height, waterLevel: number | undefined): boolean {
    const failed = { value: false }, nodes = new Map<string, number>(), signature: number[] = [waterLevel ?? -1];
    const node = (i: number, j: number) => {
      const k = `${i},${j}`;
      let v = nodes.get(k);
      if (v === undefined) {
        const sampled = height([i * LATTICE, j * LATTICE]);
        if (sampled === undefined) failed.value = true;
        v = sampled ?? 0; nodes.set(k, v); signature.push(v);
      }
      return v;
    };
    const h = (p: LocalPoint) => {
      const fx = p[0] / LATTICE, fz = p[1] / LATTICE, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      return (node(i, j) * (1 - tx) + node(i + 1, j) * tx) * (1 - tz) + (node(i, j + 1) * (1 - tx) + node(i + 1, j + 1) * tx) * tz;
    };
    for (const o of this.spec.objects) for (const p of this.samples(o)) h(p);
    if (failed.value) return false;
    if (this.built && signature.length === this.signature.length && signature.every((v, i) => Math.abs(v - this.signature[i]) < 0.15)) return true;
    this.signature = signature;
    this.clear(); this.picks = [];
    const box = (o: ReconstructionObject, ground: number, top: number) => { const xs = o.footprint.map(p => p[0]), zs = o.footprint.map(p => p[1]); this.picks.push({ id: o.id, guess: o.certainty === "best-guess", box: new THREE.Box3(new THREE.Vector3(Math.min(...xs), ground, Math.min(...zs)), new THREE.Vector3(Math.max(...xs), top, Math.max(...zs))) }); };
    const walls: { o: ReconstructionObject; base: number; skirt: number }[] = [];
    const guessed = new Mesher(), based = new Mesher();
    const surface = waterLevel ?? Infinity;
    for (const o of this.spec.objects) {
      const mesher = o.certainty === "best-guess" ? guessed : based;
      mesher.tint = this.tinted ? CERTAINTY_TINT[o.certainty] : undefined;
      switch (o.shape.type) {
        case "building": {
          const [c0, c1, c2, c3] = o.footprint, c = o.shape.centre as LocalPoint, heights = [h(c), h(c0), h(c1), h(c2), h(c3)];
          const base = Math.max(...heights), skirt = base - Math.min(...heights) + 1.4;
          walls.push({ o, base, skirt }); box(o, base, base + o.shape.height + 2.5);
          break;
        }
        case "bridge": this.bridge(mesher, o, h, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 3, Math.max(h([o.shape.piersE[0], o.shape.axisS]), h([o.shape.piersE.at(-1), o.shape.axisS]), Number.isFinite(surface) ? surface + 6.5 : 0) + 1.6); break;
        case "quay": this.quay(mesher, o, h, surface); break;
        case "stage": this.stage(mesher, o, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 1.5, (Number.isFinite(surface) ? surface : 0) + 2); break;
        case "barge": this.barge(mesher, o, surface); box(o, (Number.isFinite(surface) ? surface : 0) - 0.5, (Number.isFinite(surface) ? surface : 0) + 2.2); break;
        case "altar": this.altar(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2.8); break;
        case "pen": this.pen(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2); break;
        case "stall": this.stall(mesher, o, h); box(o, h(o.shape.centre), h(o.shape.centre) + 2.4); break;
        case "circus": { const top = this.circus(mesher, o, h); box(o, top.floor - 4, top.floor + o.shape.outerHeight + 24); break; }
        case "palace": { const top = this.palace(mesher, o, h); box(o, top.low, top.high); break; }
        default: break;
      }
    }
    for (const [mesher, group, double] of [[guessed, this.guessed, false], [based, this.based, true]] as const) {
      const geometry = mesher.build();
      if (!geometry) continue;
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: double ? THREE.DoubleSide : THREE.FrontSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true; configureTerrainShadowCaster(mesh);
      group.add(mesh); this.geometries.push(geometry); this.materials.push(material);
    }
    this.buildings(walls);
    this.built = true;
    return true;
  }

  private buildings(walls: { o: ReconstructionObject; base: number; skirt: number }[]) {
    if (!walls.length) return;
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const info = new Float32Array(walls.length * 4);
    const seeThroughGlsl = `
      uniform vec3 uFocus; uniform float uSee; varying vec3 vWorld;
      float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); float x = q.x, y = q.y;
        float v = mod(x, 2.0) * 8.0 + mod(y, 2.0) * 4.0 + mod(floor(x / 2.0), 2.0) * 2.0 + mod(floor(y / 2.0), 2.0) * 1.0; // 2x2 nested, 0..15
        return (v + 0.5) / 16.0; }
      // Guessed buildings between the camera and the temples, and any right beside the camera, are dithered thin.
      float seeThrough(){
        vec3 ab = uFocus - cameraPosition; float abl = max(dot(ab, ab), 1.0);
        float t = clamp(dot(vWorld - cameraPosition, ab) / abl, 0.0, 1.0);
        float dline = length(vWorld - (cameraPosition + ab * t));
        float cone = (1.0 - smoothstep(9.0, 22.0, dline)) * smoothstep(0.0, 0.05, 1.0 - t) * (1.0 - smoothstep(180.0, 320.0, sqrt(abl)));
        float near = 1.0 - smoothstep(7.0, 20.0, length(vWorld - cameraPosition));
        return max(cone, near) * uSee * 0.66;
      }`;
    const patch = (material: THREE.MeshStandardMaterial, key: string, colour: string) => {
      material.onBeforeCompile = shader => {
        shader.uniforms.uFocus = this.focus; shader.uniforms.uSee = this.seeThrough;
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfo;\nvarying vec3 vFace;\nvarying vec3 vObjNormal;\nvarying vec3 vWorld;")
          .replace("#include <begin_vertex>", `#include <begin_vertex>
            mat3 urbanInst = mat3(instanceMatrix);
            vFace = position * vec3(length(urbanInst[0]), length(urbanInst[1]), length(urbanInst[2]));
            vInfo = aInfo; vObjNormal = normal;
            vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec4 vInfo;\nvarying vec3 vFace;\nvarying vec3 vObjNormal;\n" + seeThroughGlsl)
          .replace("#include <color_fragment>", `#include <color_fragment>
            if (seeThrough() > bayer4(gl_FragCoord.xy)) discard;
            ${colour}`);
      };
      material.customProgramCacheKey = () => key;
    };
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    patch(wallMaterial, "urban-wall-v2", `
          vec3 wallN = abs(vObjNormal);
          if (wallN.y < 0.5) {
            float along = wallN.x > 0.5 ? vFace.z : vFace.x;
            float y = vFace.y - vInfo.x;
            float storey = floor(y / 3.2), local = y - storey * 3.2;
            float kind = vInfo.z;                       // 0 shop-house, 1 flats, 2 warehouse, 3 insula (shops below flats)
            float opening = 0.0;
            if ((kind < 0.5 || kind > 2.5) && storey < 0.5) { opening = step(abs(fract(along / 3.6) - 0.5), 0.3) * step(0.3, local) * step(local, 2.7); }
            else if (kind < 1.5 || kind > 2.5) { opening = step(abs(fract(along / 2.9) - 0.5), 0.17) * step(abs(local - 1.9), 0.62) * step(0.5, storey + step(0.5, kind)); }
            else { opening = storey > 0.5 ? step(abs(fract(along / 4.5) - 0.5), 0.1) * step(abs(local - 2.2), 0.4) : step(abs(fract(along / 8.0) - 0.5), 0.2) * step(local, 2.8); }
            float course = smoothstep(0.0, 0.04, abs(fract(y / 0.9) - 0.5) - 0.46) * 0.05;
            // A projecting cornice at each floor line reads as a storey break from a distance.
            float cornice = (kind < 1.5 || kind > 2.5) ? step(local, 0.16) * step(0.5, storey) * 0.16 : 0.0;
            diffuseColor.rgb *= 1.0 - opening * 0.72 - course - cornice;
            diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 1.2, y));
          }`);
    const wallMesh = new THREE.InstancedMesh(box, wallMaterial, walls.length);
    const roof = new THREE.BufferGeometry();
    // Gable roof, ridge along the width: A B back eave, C D front eave, R1 R2 ridge ends.
    const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [-.5, 0, .5], D = [.5, 0, .5], R1 = [-.5, 1, 0], R2 = [.5, 1, 0];
    roof.setAttribute("position", new THREE.Float32BufferAttribute([...A, ...B, ...R2, ...A, ...R2, ...R1, ...C, ...R1, ...R2, ...C, ...R2, ...D, ...A, ...C, ...R1, ...B, ...R2, ...D], 3));
    roof.computeVertexNormals();
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    roofMaterial.onBeforeCompile = shader => {
      shader.uniforms.uFocus = this.focus; shader.uniforms.uSee = this.seeThrough;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWorld;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + seeThroughGlsl).replace("#include <color_fragment>", "#include <color_fragment>\nif (seeThrough() > bayer4(gl_FragCoord.xy)) discard;");
    };
    roofMaterial.customProgramCacheKey = () => "urban-roof-v2";
    const roofMesh = new THREE.InstancedMesh(roof, roofMaterial, walls.length);
    const m = new THREE.Matrix4(), tint = new THREE.Color();
    walls.forEach(({ o, base, skirt }, i) => {
      const s = o.shape as { centre: LocalPoint; front: [number, number]; size: [number, number]; storeys: number; height: number; tone: number };
      const [fe, fs] = s.front, rise = Math.min(2.4, s.size[1] * 0.17);
      // Right-handed (det +1): instanced meshes do not flip winding per instance, so a mirrored basis shows the inside of the walls.
      m.makeBasis(new THREE.Vector3(fs, 0, -fe), new THREE.Vector3(0, 1, 0), new THREE.Vector3(fe, 0, fs));
      const wallMatrix = m.clone().scale(new THREE.Vector3(s.size[0], s.height + skirt, s.size[1])).setPosition(s.centre[0], base - skirt, s.centre[1]);
      wallMesh.setMatrixAt(i, wallMatrix);
      const roofMatrix = m.clone().scale(new THREE.Vector3(s.size[0] + 0.5, rise, s.size[1] + 0.5)).setPosition(s.centre[0], base + s.height, s.centre[1]);
      roofMesh.setMatrixAt(i, roofMatrix);
      wallMesh.setColorAt(i, tint.copy(PLASTER[s.tone % PLASTER.length]));
      roofMesh.setColorAt(i, tint.copy(TILES[(s.tone + i) % TILES.length]));
      if (this.tinted) { wallMesh.setColorAt(i, tint.copy(PLASTER[s.tone % PLASTER.length]).lerp(CERTAINTY_TINT[o.certainty], 0.62)); roofMesh.setColorAt(i, tint.copy(TILES[(s.tone + i) % TILES.length]).lerp(CERTAINTY_TINT[o.certainty], 0.62)); }
      info[i * 4] = skirt; info[i * 4 + 1] = s.storeys; info[i * 4 + 2] = o.kind === "shop" ? 0 : o.kind === "warehouse" ? 2 : o.kind === "insula" ? 3 : 1;
    });
    box.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    for (const mesh of [wallMesh, roofMesh]) { mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; configureTerrainShadowCaster(mesh); this.guessed.add(mesh); }
    this.geometries.push(box, roof); this.materials.push(wallMaterial, roofMaterial);
  }

  /**
   * Circus Maximus massing: sand track, central barrier with the obelisk, starting-gate block and three tiers of stands
   * that follow the ground. Heights and the depth of the stands are guesses (see the object's note).
   */
  private circus(mesher: Mesher, o: ReconstructionObject, h: Ground): { floor: number } {
    const f = circusFrame(o.shape), tiers = o.shape.tiers as number, bank = o.shape.bank as number, top = o.shape.outerHeight as number;
    // The track is graded: at each section it sits at the highest ground across the track, so no terrain pokes through the sand,
    // and the level is interpolated between sections (24 m apart) so the sand and the stands share one surface.
    const a0 = f.start, a1 = f.straightEnd, STEP = 24, nodes: number[] = [];
    for (let a = a0; a <= a1 + f.half + STEP; a += STEP) { let m = -Infinity; for (let b = -f.half; b <= f.half; b += f.half / 2) m = Math.max(m, h(f.at(a, b))); nodes.push(m); }
    for (let i = 1; i < nodes.length; i++) nodes[i] = Math.max(nodes[i], nodes[i - 1] - 0.6);   // a gentle fall at most
    for (let i = nodes.length - 2; i >= 0; i--) nodes[i] = Math.max(nodes[i], nodes[i + 1] - 0.6);
    const floor = (a: number) => { const t = Math.max(0, (a - a0) / STEP), i = Math.min(nodes.length - 2, Math.floor(t)); return nodes[i] + (nodes[i + 1] - nodes[i]) * Math.min(1, t - i); };
    const floorStart = floor(a0);
    const V = (p: LocalPoint, y: number) => new THREE.Vector3(p[0], y, p[1]);
    // Track surface: strips across the width, then a fan round the curved end.
    for (let a = a0; a < a1; a += STEP) { const n = Math.min(a + STEP, a1); mesher.quad(V(f.at(a, -f.half), floor(a)), V(f.at(a, f.half), floor(a)), V(f.at(n, f.half), floor(n)), V(f.at(n, -f.half), floor(n)), SAND); }
    const ring = f.curve(16);
    for (let k = 0; k < ring.length - 1; k++) { const ya = floor(a1 + (ring[k][0] - f.at(a1, 0)[0]) * f.axis[0] + (ring[k][1] - f.at(a1, 0)[1]) * f.axis[1]), yb = floor(a1 + (ring[k + 1][0] - f.at(a1, 0)[0]) * f.axis[0] + (ring[k + 1][1] - f.at(a1, 0)[1]) * f.axis[1]); mesher.quad(V(f.at(a1, 0), floor(a1)), V(ring[k], ya), V(ring[k + 1], yb), V(ring[k + 1], yb), SAND); }
    // Stands: an inner and outer edge polyline per side (straight, curve, straight) with outward normals.
    const edges: { p: LocalPoint; n: LocalPoint; a: number }[][] = [];
    const side = (sign: number) => {
      const out: { p: LocalPoint; n: LocalPoint; a: number }[] = [];
      for (let a = a0 + 14; a < a1; a += 12) out.push({ p: f.at(a, sign * f.half), n: f.dir(0, sign), a });
      return out;
    };
    const north = side(-1), south = side(1);
    const curve: { p: LocalPoint; n: LocalPoint; a: number }[] = [];
    for (let k = 0; k <= 16; k++) { const t = -Math.PI / 2 + Math.PI * k / 16, n = f.dirAngle(t); curve.push({ p: f.at(a1 + Math.cos(t) * f.half, Math.sin(t) * f.half), n, a: a1 + Math.cos(t) * f.half }); }
    edges.push([...north, ...curve, ...south.reverse()]);
    const treadY = (k: number) => floor0(k);
    const floor0 = (k: number) => 5 + (k * (top - 8)) / Math.max(1, tiers - 1);
    for (const edge of edges) for (let i = 0; i < edge.length - 1; i++) {
      const A = edge[i], B = edge[i + 1], fa = floor(A.a), fb = floor(B.a);
      const at = (e: typeof A, d: number, y: number) => V([e.p[0] + e.n[0] * d, e.p[1] + e.n[1] * d], y);
      let previous = 0;
      for (let k = 0; k < tiers; k++) {
        const d0 = k * bank / tiers, d1 = (k + 1) * bank / tiers, ya = fa + treadY(k), yb = fb + treadY(k);
        mesher.quad(at(A, previous, k === 0 ? fa : fa + treadY(k - 1)), at(A, previous, ya), at(B, previous, yb), at(B, previous, k === 0 ? fb : fb + treadY(k - 1)), k === 0 ? PALACE_STONE : TRAVERTINE.clone().multiplyScalar(0.86));   // riser
        mesher.quad(at(A, d0, ya), at(A, d1, ya), at(B, d1, yb), at(B, d0, yb), TRAVERTINE.clone().multiplyScalar(0.94 + 0.04 * k));   // tread
        previous = d1;
      }
      const baseA = Math.min(fa, h([A.p[0] + A.n[0] * bank, A.p[1] + A.n[1] * bank])) - 2, baseB = Math.min(fb, h([B.p[0] + B.n[0] * bank, B.p[1] + B.n[1] * bank])) - 2;
      mesher.quad(at(A, bank, baseA), at(A, bank, fa + top), at(B, bank, fb + top), at(B, bank, baseB), TRAVERTINE);   // outer wall
    }
    // The ends of the stands at the starting gates, and the gate block itself.
    for (const sign of [-1, 1]) { const q = (d: number, y: number) => V(f.at(a0 + 14, sign * (f.half + d)), y); mesher.quad(q(0, floor(a0)), q(0, floor(a0) + 5), q(bank, floor(a0) + top), q(bank, floor(a0) - 2), TRAVERTINE.clone().multiplyScalar(0.9)); }
    const gate = f.at(a0 + 7, 0), yaw = -Math.atan2(f.axis[1], f.axis[0]);
    mesher.box(gate[0], floor(a0) + 5.5, gate[1], 14, 11, f.half * 2, yaw, TRAVERTINE.clone().multiplyScalar(0.88));
    for (const sign of [-1, 1]) { const tower = f.at(a0 + 7, sign * (f.half - 6)); mesher.box(tower[0], floor(a0) + 8, tower[1], 12, 16, 12, yaw, TRAVERTINE.clone().multiplyScalar(0.95)); }
    // Central barrier (spina) with the obelisk and a turning post at each end.
    const sp = o.shape.spina as { from: number; to: number; width: number }, mid = (sp.from + sp.to) / 2, spina = f.at(mid, 0);
    mesher.box(spina[0], floor(mid) + 1.2, spina[1], sp.to - sp.from, 2.4, sp.width, yaw, TRAVERTINE.clone().multiplyScalar(0.9));
    for (const a of [sp.from - 4, sp.to + 4]) { const p = f.at(a, 0); mesher.cylinder(p[0], floor(a) + 3, p[1], 2.4, 6, OBELISK.clone().multiplyScalar(1.1)); }
    const ob = f.at(mid + 10, 0); mesher.box(ob[0], floor(mid) + 13.5, ob[1], 2.6, 23, 2.6, yaw, OBELISK);
    return { floor: floorStart };
  }

  /** Palace massing: a terraced platform on the slope, wings round open courts, taller halls, and a curved exedra. */
  private palace(mesher: Mesher, o: ReconstructionObject, h: Ground): { low: number; high: number } {
    const volumes = o.shape.volumes as PalaceVolume[], platform = volumes.find(v => v.role === "platform")!;
    const grounds = volumeCorners(platform, true).map(p => h(p));
    const low = Math.min(...grounds) - 4, level = Math.max(...grounds) + 0.8;
    mesher.box(platform.c[0], (low + level) / 2, platform.c[1], platform.size[0], level - low, platform.size[1], -platform.heading, PALACE_STONE);
    let high = level;
    for (const v of volumes) {
      if (v.role === "platform") continue;
      const yaw = -v.heading;
      if (v.role === "exedra") {
        // A half-ring arcade bulging away from the wing, on its outer face.
        const shape = new THREE.Shape(), R = v.size[0] / 2, r = R - 8;
        shape.absarc(0, 0, R, 0, Math.PI, false); shape.absarc(0, 0, r, Math.PI, 0, true);
        const outward = new THREE.Vector2(v.c[0] - platform.c[0], v.c[1] - platform.c[1]).normalize(), along = new THREE.Vector2(-outward.y, outward.x);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(along.x, 0, along.y), new THREE.Vector3(outward.x, 0, outward.y), new THREE.Vector3(0, 1, 0)).setPosition(v.c[0] - outward.x * (v.size[1] / 2 - 19), level, v.c[1] - outward.y * (v.size[1] / 2 - 19));
        mesher.extrude(shape, v.height, m, PALACE_WALL.clone().multiplyScalar(0.96));
        high = Math.max(high, level + v.height); continue;
      }
      mesher.box(v.c[0], level + v.height / 2, v.c[1], v.size[0], v.height, v.size[1], yaw, v.role === "hall" ? PALACE_WALL.clone().multiplyScalar(1.04) : PALACE_WALL);
      mesher.box(v.c[0], level + v.height + 0.5, v.c[1], v.size[0] + 1.2, 1.0, v.size[1] + 1.2, yaw, PALACE_ROOF);
      high = Math.max(high, level + v.height + 1);
    }
    return { low, high };
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
    const line = o.shape.line as LocalPoint[], wall = (o.shape.height as number | undefined) ?? 3.2;
    for (let i = 0; i < line.length - 1; i++) {
      // The coarse terrain can sit well below the river surface along the bank, so the coping stands 1.6 m above the river
      // wherever the terrain is lower, and the wall is never shorter than its own height.
      const a = line[i], b = line[i + 1], ground = Math.max(h(a) ?? 0, h(b) ?? 0) + 0.3, top = Number.isFinite(water) ? Math.max(ground, water + 1.6) : ground, bottom = Number.isFinite(water) ? Math.min(water - 2.2, top - wall) : top - 5;
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
