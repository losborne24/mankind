import * as THREE from "three";

/**
 * Tileable ground textures generated here from noise: no third-party images.
 * Each tile is deterministic; sizes are chosen so a texel is a few centimetres.
 */
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise on an n×n lattice that wraps at u,v = 1, so the tile has no seam. */
function periodic(u: number, v: number, n: number, seed: number) {
  const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const w = (i: number) => ((i % n) + n) % n;
  const a = hash(w(ix), w(iy), seed), b = hash(w(ix + 1), w(iy), seed), c = hash(w(ix), w(iy + 1), seed), d = hash(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u: number, v: number, base: number, octaves: number, seed: number) {
  let sum = 0, amplitude = 0.5, total = 0;
  for (let o = 0; o < octaves; o++, amplitude /= 2) { sum += periodic(u, v, base << o, seed + o * 17) * amplitude; total += amplitude; }
  return sum / total;
}
type Rgb = readonly [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function tile(size: number, shade: (u: number, v: number) => Rgb): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const [r, g, b] = shade((i + 0.5) / size, (j + 0.5) / size), p = (j * size + i) * 4;
    data[p] = Math.max(0, Math.min(255, r)); data[p + 1] = Math.max(0, Math.min(255, g)); data[p + 2] = Math.max(0, Math.min(255, b)); data[p + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}

/** Packed earth: warm tan with pebbles and faint wheel-scuffed patches. 8 m tile. */
export function earthTexture() {
  return tile(256, (u, v) => {
    const broad = fbm(u, v, 3, 4, 3), fine = periodic(u, v, 96, 5), grit = periodic(u, v, 160, 6);
    let c = mix([138, 120, 94], [164, 146, 116], broad);
    c = mix(c, [110, 92, 68], Math.max(0, fbm(u, v, 6, 3, 9) - 0.55) * 1.6);
    const pebble = grit > 0.93 ? 1 : 0;
    c = mix(c, [190, 178, 150], pebble * 0.8);
    const k = 0.9 + fine * 0.2;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
}
/** Dry grass and scrub as it looks in a Roman late summer. 10 m tile. */
export function scrubTexture() {
  return tile(256, (u, v) => {
    const patch = fbm(u, v, 4, 4, 21), blade = periodic(u, v, 128, 22), blade2 = periodic(u, v, 200, 23);
    let c = mix([108, 122, 76], [140, 140, 88], patch);
    c = mix(c, [86, 98, 58], Math.max(0, fbm(u, v, 7, 3, 31) - 0.5) * 1.5);
    const k = 0.84 + blade * 0.22 + (blade2 > 0.9 ? 0.12 : 0);
    return [c[0] * k, c[1] * k, c[2] * k];
  });
}
/**
 * Worn paving: pale slabs in staggered courses with dark joints and worn centres.
 * A generic Roman stone-paving pattern, not a survey of any particular pavement. 6 m tile.
 */
export function pavingTexture() {
  const rows = 8, rowHeight = 1 / rows;
  // Per-row slab boundaries that wrap, so courses tile horizontally.
  const courses = Array.from({ length: rows }, (_, row) => {
    const count = 4 + Math.floor(hash(row, 1, 41) * 2), cuts: number[] = [], offset = hash(row, 2, 41);
    for (let i = 0; i < count; i++) cuts.push((offset + (i + (hash(row, i + 3, 41) - 0.5) * 0.35) / count + 1) % 1);
    return cuts.sort((a, b) => a - b);
  });
  return tile(512, (u, v) => {
    const row = Math.min(rows - 1, Math.floor(v / rowHeight)), cuts = courses[row];
    let slab = cuts.length - 1;
    for (let i = 0; i < cuts.length; i++) if (u >= cuts[i] && (i === cuts.length - 1 || u < cuts[i + 1])) slab = i;
    const start = cuts[slab], end = cuts[(slab + 1) % cuts.length], length = (end - start + 1) % 1 || 1;
    const along = ((u - start + 1) % 1) / length, across = (v - row * rowHeight) / rowHeight;
    const joint = Math.min(along * length * 6, (1 - along) * length * 6, across * 0.75 * 1.0, (1 - across) * 0.75);
    const groove = 1 - Math.min(1, Math.max(0, (joint * 11.0)));
    const tone = hash(row, slab, 51), wear = fbm(u, v, 8, 4, 53), fine = periodic(u, v, 220, 54);
    let c = mix([168, 160, 142], [190, 182, 162], tone);
    c = mix(c, [150, 140, 118], Math.max(0, wear - 0.5) * 1.2);
    c = mix(c, [96, 88, 74], groove * 0.78);
    const k = 0.93 + fine * 0.12;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
}

/** Dark irregular street paving (polygonal stone blocks) with mortar lines. 5 m tile. */
export function cobbleTexture() {
  const n = 12, points: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) points.push([(i + 0.15 + hash(i, j, 61) * 0.7) / n, (j + 0.15 + hash(i, j, 62) * 0.7) / n]);
  return tile(512, (u, v) => {
    let d1 = 9, d2 = 9, id = 0;
    const ci = Math.floor(u * n), cj = Math.floor(v * n);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ((ci + di) % n + n) % n, jj = ((cj + dj) % n + n) % n, p = points[jj * n + ii];
      const dx = p[0] + Math.floor((ci + di) / n) - u, dy = p[1] + Math.floor((cj + dj) / n) - v, d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; id = jj * n + ii; } else if (d < d2) d2 = d;
    }
    const edge = Math.min(1, (d2 - d1) * n * 5), tone = hash(id, 3, 63), wear = fbm(u, v, 8, 3, 64);
    let c = mix([92, 88, 82], [124, 118, 108], tone);
    c = mix(c, [78, 66, 52], Math.max(0, wear - 0.55) * 1.2);
    c = mix([48, 42, 36], c, Math.min(1, edge * 1.4));
    const k = 0.92 + hash(Math.floor(u * 400), Math.floor(v * 400), 65) * 0.1;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
}
