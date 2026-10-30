import type { LocalPoint } from "@/map/settlements/romanSettlement";

/**
 * Local-context ground description, in settlement metres (east, south).
 * Everything here is styling data for the rendered ground; the evidence for each
 * zone lives with the object that supplied it (see lib/history/localContext.ts).
 */
export interface ContextGroundSpec {
  /** Side of the square the ground covers, centred on the settlement origin. */
  sizeMeters: number;
  /** Worn paved surfaces (closed rings). */
  paving: readonly (readonly LocalPoint[])[];
  /** River surface (closed rings, outer boundaries). */
  water: readonly (readonly LocalPoint[])[];
}
/** A rotated rectangle that touches the ground; darkens the ground beside it. */
export interface ContactRect { offset: LocalPoint; width: number; depth: number; heading: number }

export const MASK_RESOLUTION = 1280;

/** Even-odd scanline fill at texel centres. */
function fillRings(out: Uint8Array, res: number, size: number, rings: readonly (readonly LocalPoint[])[], channel: number) {
  const toV = (z: number) => (z / size + 0.5) * res;
  for (let j = 0; j < res; j++) {
    const y = j + 0.5, xs: number[] = [];
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const ay = toV(az), by = toV(bz);
      if ((ay > y) !== (by > y)) xs.push(((ax + (bx - ax) * (y - ay) / (by - ay)) / size + 0.5) * res);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(res - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = from; i <= to; i++) out[(j * res + i) * 4 + channel] = 255;
    }
  }
}
function fillRects(out: Uint8Array, res: number, size: number, rects: readonly ContactRect[], channel: number, grow: number) {
  const scale = res / size;
  for (const r of rects) {
    const c = Math.cos(r.heading), s = Math.sin(r.heading), hw = r.width / 2 + grow, hd = r.depth / 2 + grow;
    const reach = Math.hypot(hw, hd);
    const i0 = Math.max(0, Math.floor((r.offset[0] - reach) * scale + res / 2)), i1 = Math.min(res - 1, Math.ceil((r.offset[0] + reach) * scale + res / 2));
    const j0 = Math.max(0, Math.floor((r.offset[1] - reach) * scale + res / 2)), j1 = Math.min(res - 1, Math.ceil((r.offset[1] + reach) * scale + res / 2));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) / scale - res / 2 / scale - r.offset[0], dz = (j + 0.5) / scale - res / 2 / scale - r.offset[1];
      if (Math.abs(c * dx - s * dz) <= hw && Math.abs(s * dx + c * dz) <= hd) out[(j * res + i) * 4 + channel] = 255;
    }
  }
}
/** Separable box blur of one interleaved channel using running sums. */
function blur(data: Uint8Array, res: number, channel: number, radius: number) {
  if (radius < 1) return;
  const line = new Float32Array(res), span = radius * 2 + 1;
  for (const horizontal of [true, false]) for (let a = 0; a < res; a++) {
    const at = (b: number) => ((horizontal ? a * res + b : b * res + a) * 4) + channel;
    let sum = 0;
    for (let b = -radius; b <= radius; b++) sum += data[at(Math.min(res - 1, Math.max(0, b)))];
    for (let b = 0; b < res; b++) {
      line[b] = sum / span;
      sum += data[at(Math.min(res - 1, b + radius + 1))] - data[at(Math.max(0, b - radius))];
    }
    for (let b = 0; b < res; b++) data[at(b)] = line[b];
  }
}

/**
 * RGBA masks over the ground square: R paving, G river surface, B trodden ground
 * (a wide halo around paving and buildings), A baked contact shadow beside buildings.
 * Pure CPU work, deterministic, no canvas: it runs the same in the browser and in checks.
 */
export function buildGroundMask(spec: ContextGroundSpec, contacts: readonly ContactRect[], res = MASK_RESOLUTION): Uint8Array {
  const data = new Uint8Array(res * res * 4), texel = spec.sizeMeters / res;
  fillRings(data, res, spec.sizeMeters, spec.paving, 0);
  fillRings(data, res, spec.sizeMeters, spec.water, 1);
  // Trodden halo: paving and building footprints, spread ~25 m.
  const halo = new Uint8Array(data.length);
  fillRings(halo, res, spec.sizeMeters, spec.paving, 2);
  fillRects(halo, res, spec.sizeMeters, contacts, 2, 6);
  for (let i = 0; i < res * res; i++) data[i * 4 + 2] = halo[i * 4 + 2];
  fillRects(data, res, spec.sizeMeters, contacts, 3, 0);
  for (let pass = 0; pass < 3; pass++) blur(data, res, 2, Math.round(9 / texel));
  for (let pass = 0; pass < 2; pass++) blur(data, res, 3, Math.round(2.4 / texel));
  blur(data, res, 0, 1);
  blur(data, res, 1, Math.max(1, Math.round(2 / texel)));
  return data;
}
