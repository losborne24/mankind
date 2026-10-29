import * as THREE from "three";
import { assetRegistry } from "@/lib/assets/registry";
import { createSettlementEnvironment, footprintDistance, segmentDistance } from "@/map/settlements/settlementEnvironment";
import { settlementEnvironmentConfig as config } from "@/map/settlements/environmentConfig";
import type { LocalPoint, SettlementDefinition } from "@/map/settlements/romanSettlement";

export interface GroundFootprint { offset: LocalPoint; width: number; depth: number; heading: number }
export const GROUND_WIDTH = 96;
export const GROUND_DEPTH = 128;
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
/** Smooth, deterministic metre-space noise; independent of relocation and camera. */
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
function boxDistance(x: number, z: number, halfX: number, halfZ: number): number {
  const dx = Math.abs(x) - halfX, dz = Math.abs(z) - halfZ;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** Two small, mipmapped CPU-authored maps: no downloads or per-frame noise work. */
export function settlementSurfaceMaps(definition: SettlementDefinition, footprints: readonly GroundFootprint[], environment = createSettlementEnvironment(definition)) {
  const groundWidth = definition.groundSizeMeters ?? GROUND_WIDTH, groundDepth = definition.groundSizeMeters ?? GROUND_DEPTH;
  const seedOffset = (environment.seed >>> 0) % 8192;
  const heading = definition.roadFrameHeadingRadians ?? 0;
  const c = Math.cos(heading), s = Math.sin(heading);
  const frame = ([x,z]: LocalPoint): LocalPoint => heading ? [Math.round((c*x-s*z)*1e8)/1e8,Math.round((s*x+c*z)*1e8)/1e8] : [x,z];
  const segments = definition.roads.flatMap((road) => road.points.slice(1).map((point, i) => {
    const [ax, az] = frame(road.points[i]), [bx,bz] = frame(point);
    return { x: (ax + bx) / 2, z: (az + bz) / 2,
      hx: (Math.abs(bx - ax) + (ax === bx ? road.widthMeters : 0)) / 2,
      hz: (Math.abs(bz - az) + (az === bz ? road.widthMeters : 0)) / 2 };
  }));
  // The small extension at connected ends removes alpha seams at T junctions.
  const connected = (x: number, z: number, own: typeof segments[number]) =>
    segments.some((s) => s !== own && boxDistance(x - s.x, z - s.z, s.hx, s.hz) <= 0.001);
  const joined = segments.map((s) => {
    let { hx, hz } = s;
    let cx = s.x, cz = s.z;
    const horizontal = hx > hz;
    for (const sign of [-1, 1]) {
      if (connected(s.x + (horizontal ? sign * hx : 0), s.z + (horizontal ? 0 : sign * hz), s)) {
        if (horizontal) { hx += 0.25; cx += sign * 0.25; }
        else { hz += 0.25; cz += sign * 0.25; }
      }
    }
    return { x: cx, z: cz, hx, hz };
  });
  const roadDistance = (x: number, z: number) => {
    const [rx,rz] = frame([x,z]);
    return Math.min(...joined.map((s) => boxDistance(rx - s.x, rz - s.z, s.hx, s.hz)));
  };
  const width = 512, height = 704; // About 18 cm texels over the compact village and field margins.
  const ground = new Uint8Array(width * height * 4), road = new Uint8Array(ground.length);
  // Bounded splats, authored scenery positions only. These temporary fields tie
  // vegetation, leaf litter and pale mineral soil to the actual instanced meshes.
  // Avoid scanning every scenery instance for every texture pixel.
  const cover = new Float32Array(width * height), litter = new Float32Array(cover.length), mineral = new Float32Array(cover.length);
  for (const placement of environment.scenery) {
    const asset = assetRegistry[placement.assetId];
    if (asset.category !== "vegetation" && asset.category !== "rock") continue;
    const tree = placement.tags?.includes("tree");
    const field = asset.category === "rock" ? mineral : tree ? litter : cover;
    const radius = (tree ? 3.2 : asset.category === "rock" ? 2 : 1.25) * (placement.scale ?? 1);
    const [cx, cz] = placement.offset;
    const x0 = Math.max(0, Math.floor((cx - radius + groundWidth / 2) / groundWidth * (width - 1)));
    const x1 = Math.min(width - 1, Math.ceil((cx + radius + groundWidth / 2) / groundWidth * (width - 1)));
    const z0 = Math.max(0, Math.floor((cz - radius + groundDepth / 2) / groundDepth * (height - 1)));
    const z1 = Math.min(height - 1, Math.ceil((cz + radius + groundDepth / 2) / groundDepth * (height - 1)));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const x = groundWidth * (i / (width - 1) - 0.5), z = groundDepth * (j / (height - 1) - 0.5);
      const influence = 1 - smooth(0.15, 1, Math.hypot(x - cx, z - cz) / radius);
      field[j * width + i] = Math.max(field[j * width + i], influence);
    }
  }
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = groundWidth * (i / (width - 1) - 0.5), z = groundDepth * (j / (height - 1) - 0.5);
    const broad = noise(x * 0.17 + seedOffset, z * 0.17), grain = noise(x * 6, z * 6 + seedOffset);
    const flecks = hash(i + seedOffset, j);
    const irregular = (noise(x * 1.4, z * 1.4) - 0.5) * 0.35 + (broad - 0.5) * 0.65;
    const distance = roadDistance(x, z);
    const verge = 1 - smooth(0.05, 0.8 + broad * 2.2, distance + irregular);
    let apron = 0;
    for (const f of environment.contacts.length ? environment.contacts : footprints) {
      const d = footprintDistance([x, z], f);
      apron = Math.max(apron, 1 - smooth(0, config.wallWearMeters + broad * 0.65, d + irregular * 0.6));
    }
    const entrance = environment.entranceWear([x, z]);
    // Transparent perimeter and broken patches expose the actual biome/hillshade.
    const edge = 1 - smooth(0.65, 1, Math.hypot(x / (groundWidth / 2), z / (groundDepth / 2)));
    const wear = Math.max(verge * 0.85, apron * 0.78, entrance * 0.95);
    const dry = smooth(0.35, 0.8, broad);
    const index = j * width + i;
    const vegetation = cover[index] * (0.65 + broad * 0.35) * (1 - wear);
    const stone = mineral[index] * (0.6 + grain * 0.4) * (1 - wear);
    const leaf = litter[index] * (1 - wear);
    const alpha = edge * Math.max(wear, dry * 0.48, vegetation * 0.62, stone * 0.6, leaf * 0.42);
    const soil = [144, 128, 96], grass = [124, 126, 83];
    const shade = 0.91 + grain * 0.13 + flecks * 0.05;
    const p = (j * width + i) * 4;
    for (let k = 0; k < 3; k++) {
      let value = THREE.MathUtils.lerp(grass[k], soil[k], wear);
      value = THREE.MathUtils.lerp(value, [105, 113, 69][k], vegetation * 0.65);
      value = THREE.MathUtils.lerp(value, [129, 116, 83][k], leaf * 0.6);
      value = THREE.MathUtils.lerp(value, [157, 148, 125][k], stone * 0.8);
      ground[p + k] = THREE.MathUtils.lerp(value, [158, 146, 118][k], entrance * (0.15 + broad * 0.15)) * shade;
    }
    let areaAlpha = 0;
    for (const area of definition.groundAreas ?? []) {
      const angle = area.headingRadians ?? 0, dx = x - area.offset[0], dz = z - area.offset[1];
      const lx = Math.cos(angle) * dx - Math.sin(angle) * dz, lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
      const d = boxDistance(lx, lz, area.widthMeters / 2, area.depthMeters / 2);
      const mask = 1 - smooth(-0.65, 0.9, d + irregular * 1.5);
      const row = Math.cos(lz / 1.1 * Math.PI * 2) * 0.5 + 0.5;
      const colour = area.kind === "garden" ? [110, 99, 70] : area.kind === "field" ? [158, 147, 96] : [147, 132, 103];
      const strength = mask * (area.kind === "courtyard" ? 0.8 : 0.72);
      for (let k = 0; k < 3; k++) ground[p + k] = THREE.MathUtils.lerp(ground[p + k], colour[k] * shade * (area.kind === "courtyard" ? 1 : 0.92 + row * 0.12), strength);
      areaAlpha = Math.max(areaAlpha, strength);
    }
    ground[p + 3] = Math.max(alpha, areaAlpha * edge) * 255;
    const shoulder = smooth(-1, -0.05, distance + irregular);
    // Broken paired tracks only on cart-width streets, fading before junctions.
    let track = 0;
    for (const r of definition.roads) {
      if (r.widthMeters < 2.8) continue;
      for (let j = 1; j < r.points.length; j++) {
        const a = r.points[j - 1], b = r.points[j];
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (!length) continue;
        const along = ((x - a[0]) * dx + (z - a[1]) * dz) / length;
        if (along < 1 || along > length - 1) continue;
        const across = Math.abs(((x - a[0]) * dz - (z - a[1]) * dx) / length);
        const rut = 1 - smooth(0.03, config.trackWidthMeters + 0.1,
          Math.abs(across - config.trackGaugeMeters / 2 + (noise(x * 0.4, z * 0.4) - 0.5) * 0.12));
        if (rut <= 0) continue;
        const junction = definition.roads.some((other) => other !== r && other.points.slice(1).some((p, k) =>
          segmentDistance([x, z], other.points[k], p) < other.widthMeters / 2 + 0.55));
        if (!junction) track = Math.max(track, rut * smooth(0.25, 0.65, noise(x * 0.3 + seedOffset, z * 0.3)));
      }
    }
    const roadShade = 0.9 + broad * 0.12 + grain * 0.08 + (flecks > 0.96 ? 0.11 : 0) - shoulder * 0.06 - track * 0.13;
    for (let k = 0; k < 3; k++) road[p + k] = [151, 137, 109][k] * roadShade;
    road[p + 3] = (1 - smooth(-0.48, -0.04, distance + irregular)) * 255;
  }
  const texture = (data: Uint8Array) => {
    const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  return { ground: texture(ground), road: texture(road) };
}

/** Object-space detail keeps the source UVs, geometry and cache immutable. */
export function weatheredMaterial(source: THREE.Material, variant: number): THREE.Material {
  const copy = source.clone();
  copy.shadowSide = THREE.BackSide;
  if (!(copy instanceof THREE.MeshStandardMaterial)) return copy;
  copy.roughness = Math.max(copy.roughness, 0.94);
  copy.metalness = 0;
  if (copy.map) {
    copy.color.multiplyScalar([0.97, 1, 1.025][variant]);
    return copy;
  }
  const roof = copy.name === "terra";
  if (roof) copy.color.lerp(new THREE.Color(0x85644e), 0.28);
  else copy.color.lerp(new THREE.Color(0xb7aa8d), 0.08);
  copy.color.multiplyScalar([0.94, 1, 1.045][variant]);
  if (copy.name === "window") { copy.emissive.multiplyScalar(0.15); copy.color.multiplyScalar(0.65); }
  copy.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSurfacePoint;\nvarying vec3 vSurfaceNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurfacePoint = position;\nvSurfaceNormal = normal;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vSurfacePoint;
      varying vec3 vSurfaceNormal;
      float patina(vec3 p) {
        vec2 q = p.xy + p.z * vec2(0.73, 0.37);
        vec2 cell = floor(q), f = fract(q); f = f*f*(3.0-2.0*f);
        vec2 a = vec2(17.1, 91.7);
        return mix(mix(fract(sin(dot(cell,a))*43758.5453), fract(sin(dot(cell+vec2(1,0),a))*43758.5453),f.x),
          mix(fract(sin(dot(cell+vec2(0,1),a))*43758.5453), fract(sin(dot(cell+vec2(1,1),a))*43758.5453),f.x),f.y);
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float weather = patina(vSurfacePoint * 2.5);
        float fine = patina(vSurfacePoint * 24.0);
        float detailFade = 1.0 - smoothstep(0.03, 0.15, length(fwidth(vSurfacePoint)));
        diffuseColor.rgb *= 0.93 + 0.1 * weather + (fine - 0.5) * 0.08 * detailFade;
        ${roof ? `
        // Generic terracotta courses, not a reconstruction of a particular roof.
        vec3 roofNormal = normalize(vSurfaceNormal);
        vec2 tileUv = abs(roofNormal.z) > abs(roofNormal.x)
          ? vec2(vSurfacePoint.x / 0.27, vSurfacePoint.z / max(abs(roofNormal.y), 0.2) / 0.43)
          : vec2(vSurfacePoint.z / 0.27, vSurfacePoint.x / max(abs(roofNormal.y), 0.2) / 0.43);
        vec2 tileEdge = min(fract(tileUv), 1.0 - fract(tileUv));
        vec2 aa = max(fwidth(tileUv), vec2(0.001));
        vec2 seam = 1.0 - smoothstep(vec2(0.02), vec2(0.02) + aa, tileEdge);
        float tileFade = (1.0 - smoothstep(0.15, 0.65, max(aa.x, aa.y))) * smoothstep(0.25, 0.5, abs(roofNormal.y));
        float tileTone = fract(sin(dot(floor(tileUv), vec2(71.3, 19.7))) * 43758.5453);
        diffuseColor.rgb *= 1.0 + tileFade * ((tileTone - 0.5) * 0.14 - max(seam.x, seam.y) * 0.16);
        ` : ""}
      `);
  };
  copy.customProgramCacheKey = () => roof ? "settlement-terracotta-v2" : "settlement-patina-v1";
  return copy;
}
