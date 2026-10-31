import field from '@/lib/scenarios/fixtures/rome-ad100-suburb-density.json';
import { romeZoning, type Zone } from '@/lib/scenarios/zoning';
import { landmarkPieces, landmarks, type LandmarkCertainty } from '@/lib/scenarios/romeLandmarks';

/**
 * The zoned fill for Rome c. AD 100 (Stage 3): every building, tomb, aqueduct pier and field strip outside the detailed
 * Forum Boarium neighbourhood, generated from the land-use zoning and the suburban density field. Pure and seeded: the same
 * inputs give the same fill, byte for byte (scripts/check-rome-fill.mjs). Nothing here is placed from a source; the zones,
 * roads and aqueduct lines it follows are (see scripts/context/rome/ZONING.md), and FILL.md gives the rules.
 *
 * - City: a block grid bent by a smooth warp, so lanes curve and never run as long straight avenues; each block is lined with
 *   attached lots round a courtyard. Which lots stand is a draw against the zone's density, thinned towards the edge of the
 *   continuous city by distance inside it, and continued outside it by the density field, so the city has no hard edge.
 * - Suburbium: villas on a jittered grid, tombs lining the roads, both drawn against the field; the Appia's tombs denser.
 * - Aqueducts: one kit piece (a pier and the span of channel it carries) repeated along each sourced line.
 * - Campagna: field strips in farm blocks where the field is low, not on water.
 * - Landmarks: the monuments in the monumental zones as simple kit shapes (romeLandmarks.ts), placed from the mapped remains,
 *   Pleiades and published sizes; pieces that would stand in the neighbourhood are left to it.
 */

export type FillKind = 'insula' | 'house' | 'domus' | 'warehouse' | 'villa' | 'tomb' | 'pier' | 'channel' | 'field' | 'landmark';
export interface FillItem {
  kind: FillKind;
  /** Four corners, longitude/latitude, counter-clockwise or clockwise. */
  ring: [number, number][];
  /** Extrusion top and base, metres above the ground (0 for field strips). */
  height: number; base: number;
  colour: string;
  /** Landmarks only: which monument, and how sure its placing is (the rest of the fill is all best guess). */
  id?: string; certainty?: LandmarkCertainty;
}
export interface RomeFill {
  items: FillItem[]; counts: Record<FillKind, number>;
  /** Landmarks not drawn because they would stand in the neighbourhood's own footprints. */
  landmarksLeftOut: string[];
}

const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;
const [[W, S], , [E, N]] = romeZoning.frame;
const LON0 = (W + E) / 2, LAT0 = (S + N) / 2;
const toXY = ([lon, lat]: readonly number[]): [number, number] => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLL = ([x, y]: readonly number[]): [number, number] => [Math.round((LON0 + x / KX) * 1e7) / 1e7, Math.round((LAT0 + y / KY) * 1e7) / 1e7];
const HALF_W = (E - W) / 2 * KX, HALF_H = (N - S) / 2 * KY;

/** Integer hash to [0, 1): the fill is drawn from positions, not from a running sequence, so one change does not reshuffle the rest. */
function hash(...v: number[]) {
  let h = 2166136261 ^ 100;
  for (const n of v) { h = Math.imul(h ^ (n | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
function noise(x: number, y: number, salt: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, salt), b = hash(i + 1, j, salt), c = hash(i, j + 1, salt), d = hash(i + 1, j + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- The density field (60 m cells, one byte each), bilinear.
const cells = Uint8Array.from(atob(field.values), c => c.charCodeAt(0));
function fieldAt([x, y]: readonly number[]) {
  const lon = LON0 + x / KX, lat = LAT0 + y / KY;
  const c = (lon - field.west) * KX / field.cell - 0.5, r = (field.north - lat) * KY / field.cell - 0.5;
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
  const v = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= field.rows || cc >= field.cols ? 0 : cells[rr * field.cols + cc] / 255;
  return v(r0, c0) * (1 - fc) * (1 - fr) + v(r0, c0 + 1) * fc * (1 - fr) + v(r0 + 1, c0) * (1 - fc) * fr + v(r0 + 1, c0 + 1) * fc * fr;
}

// ---- A 20 m raster over the frame: which zone each cell is in, the continuous city, the neighbourhood kept out.
const CELL = 20, GW = Math.ceil(2 * HALF_W / CELL), GH = Math.ceil(2 * HALF_H / CELL);
const gridOf = ([x, y]: readonly number[]) => { const c = Math.floor((x + HALF_W) / CELL), r = Math.floor((HALF_H - y) / CELL); return c < 0 || r < 0 || c >= GW || r >= GH ? -1 : r * GW + c; };
/** Scanline fill of polygons (rings in metres; even-odd within each polygon) into a raster. */
function rasterise(polygons: [number, number][][][], paint: (cell: number) => void) {
  for (const poly of polygons) {
    const ys = poly.flat().map(p => p[1]), top = Math.max(0, Math.floor((HALF_H - Math.max(...ys)) / CELL)), bottom = Math.min(GH - 1, Math.ceil((HALF_H - Math.min(...ys)) / CELL));
    for (let r = top; r <= bottom; r++) {
      const y = HALF_H - (r + 0.5) * CELL, xs: number[] = [];
      for (const ring of poly) for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) {
        const [ax, ay] = ring[m], [bx, by] = ring[n];
        if ((ay > y) !== (by > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + HALF_W) / CELL - 0.5)), c1 = Math.min(GW - 1, Math.floor((xs[k + 1] + HALF_W) / CELL - 0.5));
        for (let c = c0; c <= c1; c++) paint(r * GW + c);
      }
    }
  }
}
/** Chamfer distance (metres) from every cell to the nearest cell where `source` holds. */
function distanceTo(source: (i: number) => boolean) {
  const d = new Float32Array(GW * GH), diag = CELL * Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = source(i) ? 0 : 1e9;
  const relax = (k: number, c: number, r: number, step: number) => { if (c >= 0 && r >= 0 && c < GW && r < GH) { const v = d[r * GW + c] + step; if (v < d[k]) d[k] = v; } };
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const k = r * GW + c; relax(k, c - 1, r, CELL); relax(k, c, r - 1, CELL); relax(k, c - 1, r - 1, diag); relax(k, c + 1, r - 1, diag); }
  for (let r = GH - 1; r >= 0; r--) for (let c = GW - 1; c >= 0; c--) { const k = r * GW + c; relax(k, c + 1, r, CELL); relax(k, c, r + 1, CELL); relax(k, c + 1, r + 1, diag); relax(k, c - 1, r + 1, diag); }
  return d;
}

/** Zones present at AD 100 that the fill reads (the suburban classes and the Campagna are read from the field instead). */
const present = (z: Zone) => z.time.start.year <= 100 && (z.time.end?.year ?? Infinity) >= 100 && z.use !== 'suburban' && z.use !== 'campagna';

/**
 * Generates the fill. `keepOut` is the footprint of everything already modelled (the Forum Boarium neighbourhood), as
 * longitude/latitude rings: the fill stays clear of it with a closed margin of about 40 m, so the two never interleave.
 */
export function generateRomeFill(keepOut: [number, number][][]): RomeFill {
  const zones = romeZoning.zones.filter(present), zoneGrid = new Int16Array(GW * GH).fill(-1);
  zones.forEach((z, k) => rasterise(z.multipolygon.map(poly => poly.map(ring => ring.map(toXY))), i => { zoneGrid[i] = k; }));
  const city = new Uint8Array(GW * GH);
  rasterise([[romeZoning.extent.ring.map(toXY)]], i => { city[i] = 1; });
  const inside = distanceTo(i => !city[i]);
  // The neighbourhood: its footprints, closed (grown by 60 m, then shrunk by 40 m) so its lanes and square are kept out with it.
  let keep = new Uint8Array(GW * GH);
  rasterise(keepOut.map(ring => [ring.map(toXY)]), i => { keep[i] = 1; });
  const grow = distanceTo(i => keep[i] === 1), grown = new Uint8Array(GW * GH);
  for (let i = 0; i < grown.length; i++) grown[i] = grow[i] <= 60 ? 1 : 0;
  const shrink = distanceTo(i => !grown[i]);
  keep = new Uint8Array(GW * GH);
  for (let i = 0; i < keep.length; i++) keep[i] = shrink[i] > 20 || grow[i] === 0 ? 1 : 0;
  const zoneAt = (p: readonly number[]) => { const i = gridOf(p); return i < 0 ? undefined : zones[zoneGrid[i]]; };
  // Landmarks: one that would stand in any of the neighbourhood's own footprints (a corner or the centre of any piece inside one) is
  // left out whole and listed: the neighbourhood's models win where the two meet, and half a monument would mislead. The rest are
  // rasterised with the monumental ground, so lots keep the same margin from a landmark that overhangs its zone.
  const nb = keepOut.map(ring => { const r = ring.map(toXY), xs = r.map(p => p[0]), ys = r.map(p => p[1]); return { r, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
  const inRing = (p: readonly number[], ring: [number, number][]) => { let x = false; for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) if ((ring[n][1] > p[1]) !== (ring[m][1] > p[1]) && p[0] < (ring[m][0] - ring[n][0]) * (p[1] - ring[n][1]) / (ring[m][1] - ring[n][1]) + ring[n][0]) x = !x; return x; };
  const inNeighbourhood = (p: readonly number[]) => nb.some(({ r, b }) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inRing(p, r));
  const pieces = landmarkPieces(toXY), certainty = new Map(landmarks.map(l => [l.id, l.certainty]));
  const centreOf = (ring: [number, number][]) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const left = new Set(pieces.filter(p => [centreOf(p.ring), ...p.ring].some(inNeighbourhood)).map(p => p.id));
  const landmarkGrid = new Uint8Array(GW * GH);
  rasterise(pieces.filter(p => !left.has(p.id)).map(p => [p.ring]), i => { landmarkGrid[i] = 1; });
  // Monumental and open ground and the rivers, with a margin of one cell (20 m): no lot reaches into them, and a street's width is left round them.
  const open = distanceTo(i => landmarkGrid[i] === 1 || zoneGrid[i] >= 0 && ['monumental', 'open', 'open-river'].includes(zones[zoneGrid[i]].use));
  const nearOpen = (p: readonly number[], margin: number) => { const i = gridOf(p); return i >= 0 && open[i] <= margin; };
  const kept = (p: readonly number[]) => { const i = gridOf(p); return i >= 0 && keep[i] === 1; };
  const depthInside = (p: readonly number[]) => { const i = gridOf(p); return i < 0 || !city[i] ? 0 : inside[i]; };

  // Roads (lines, gaps and the approximate ways in, such as the Via Lata) and aqueducts as segments in 100 m buckets, for clearance.
  // The illustrative ways in are straight lines to the gates: the city's lanes are not cut along them.
  type Seg = [number, number, number, number, number];
  const buckets = new Map<number, Seg[]>(), bucket = (x: number, y: number) => Math.floor(x / 100) * 100003 + Math.floor(y / 100);
  const addLine = (line: [number, number][], clearance: number) => line.map(toXY).forEach((b, n, all) => {
    if (!n) return;
    const a = all[n - 1], seg: Seg = [a[0], a[1], b[0], b[1], clearance];
    const x0 = Math.floor((Math.min(a[0], b[0]) - 20) / 100), x1 = Math.floor((Math.max(a[0], b[0]) + 20) / 100), y0 = Math.floor((Math.min(a[1], b[1]) - 20) / 100), y1 = Math.floor((Math.max(a[1], b[1]) + 20) / 100);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = i * 100003 + j; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k)!.push(seg); }
  });
  for (const l of romeZoning.lines) {
    const clearance = l.kind === 'road' ? 7 : 4;
    for (const line of [...l.lines, ...(l.gaps ?? [])]) addLine(line, clearance);
    for (const link of l.links ?? []) if (link.certainty !== 'illustrative') addLine(link.line, 6);
  }
  /** True when a footprint of this half-size centred at `p` comes within a line's clearance. */
  const onLine = (p: readonly number[], half: number) => (buckets.get(bucket(p[0], p[1])) ?? []).some(([ax, ay, bx, by, clear]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy) < clear + half;
  });

  const items: FillItem[] = [];
  const TILES = ['#b06a45', '#b97848', '#a2603f', '#bd8458', '#9c6a52', '#c08a62'];
  const push = (kind: FillKind, corners: [number, number][], height: number, base: number, colour: string) => items.push({ kind, ring: corners.map(toLL), height: Math.round(height * 10) / 10, base: Math.round(base * 10) / 10, colour });
  const box = (c: readonly number[], length: number, width: number, angle: number): [number, number][] => {
    const ux = Math.cos(angle), uy = Math.sin(angle);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [c[0] + ux * length / 2 * s - uy * width / 2 * t, c[1] + uy * length / 2 * s + ux * width / 2 * t]);
  };

  // ---- City blocks. Column and row lines are jittered (each line keeps its own offset, so neighbouring blocks share their
  // lanes and blocks vary from about 50 to 78 m), then the whole grid is bent by a smooth warp of three octaves (up to about 70 m):
  // lanes curve and no street runs straight for long. Its slope is mostly well under 1, so blocks do not fold over each other.
  // Each residential quarter (one piece of a residential zone) has its own grid, turned to the grain of the sourced lines about it:
  // the Via Lata, the river bank and the axes of the mapped monuments, weighted by length over distance squared, averaged as
  // directions modulo 90 degrees. Its lots stay inside it, so quarters meet along a seam, as Rome's differently turned districts
  // did. Everything else (the port, the horti, the houses beyond the city) shares one grid turned 12 degrees.
  const grain: [number, number, number, number][] = [];   // x, y, direction (radians), weight (metres)
  const addGrain = (line: readonly (readonly number[])[]) => line.map(toXY).forEach((b, n, all) => {
    if (!n) return;
    const a = all[n - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = Math.atan2(b[1] - a[1], b[0] - a[0]), pieces = Math.ceil(len / 50);
    for (let k = 0; k < pieces; k++) grain.push([a[0] + (b[0] - a[0]) * (k + 0.5) / pieces, a[1] + (b[1] - a[1]) * (k + 0.5) / pieces, dir, len / pieces]);
  });
  for (const l of romeZoning.lines.filter(l => l.kind === 'road')) for (const link of l.links ?? []) if (link.certainty !== 'illustrative') addGrain(link.line);
  for (const ring of romeZoning.zones.find(z => z.id === 'zone:tiber')?.multipolygon.flatMap(poly => poly) ?? []) addGrain(ring);
  for (const l of landmarks) if (l.size) { const c = toXY(l.centre); grain.push([c[0], c[1], l.angle * Math.PI / 180, l.size[0]]); }
  const grainAt = ([x, y]: readonly number[]) => {
    let sx = 0, sy = 0;
    for (const [gx, gy, dir, w] of grain) { const k = w / (Math.hypot(gx - x, gy - y) + 100) ** 2; sx += k * Math.cos(4 * dir); sy += k * Math.sin(4 * dir); }
    return Math.atan2(sy, sx) / 4;
  };
  const quarters: { rot: number; origin: [number, number]; box: [number, number, number, number] }[] = [];
  const quarterGrid = new Int16Array(GW * GH).fill(-1);
  for (const z of zones.filter(z => z.use === 'residential')) for (const poly of z.multipolygon) {
    const rings = poly.map(ring => ring.map(toXY)), outer = rings[0], xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
    const origin: [number, number] = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
    if (depthInside(origin) === 0 && !outer.some(p => depthInside(p) > 0)) continue;   // the roadside ribbons out in the suburbium share the common grid
    const k = quarters.length;
    quarters.push({ rot: grainAt(origin), origin, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    rasterise([rings], i => { quarterGrid[i] = k; });
  }
  const quarterAt = (p: readonly number[]) => { const i = gridOf(p); return i < 0 ? -1 : quarterGrid[i]; };
  const BX = 64, BY = 50;
  const frames = [{ rot: 12 * Math.PI / 180, origin: [0, 0] as [number, number], box: [-HALF_W, -HALF_H, HALF_W, HALF_H] as [number, number, number, number] }, ...quarters];
  frames.forEach((frame, fi) => {
    const quarter = fi - 1, salt = fi * 7919, cr = Math.cos(frame.rot), sr = Math.sin(frame.rot);
    const warp = ([u, v]: readonly number[]): [number, number] => {
      const octave = (a: number, l: number, salt: number) => a * (noise(u / l, v / l, salt) - 0.5) * 2;
      const wx = octave(44, 900, 1) + octave(20, 340, 3) + octave(5, 110, 5), wy = octave(44, 900, 2) + octave(20, 340, 4) + octave(5, 110, 6);
      return [frame.origin[0] + cr * u - sr * v + wx, frame.origin[1] + sr * u + cr * v + wy];
    };
    const reach = Math.hypot(frame.box[2] - frame.box[0], frame.box[3] - frame.box[1]) / 2 + 120;
    const lineU = (i: number) => i * BX + 28 * (hash(i, 5, salt) - 0.5), lineV = (j: number) => j * BY + 22 * (hash(j, 7, salt) - 0.5);
    for (let bi = Math.floor(-reach / BX); bi <= reach / BX; bi++) for (let bj = Math.floor(-reach / BY); bj <= reach / BY; bj++) {
      const u0 = lineU(bi), v0 = lineV(bj), u1 = lineU(bi + 1), v1 = lineV(bj + 1), centre = warp([(u0 + u1) / 2, (v0 + v1) / 2]);
      if (Math.abs(centre[0]) > HALF_W || Math.abs(centre[1]) > HALF_H) continue;
      if (quarter >= 0 && (centre[0] < frame.box[0] - 80 || centre[0] > frame.box[2] + 80 || centre[1] < frame.box[1] - 80 || centre[1] > frame.box[3] + 80)) continue;
      const zone = zoneAt(centre), f = fieldAt(centre);
      if (!zone && f < 0.3) continue;
      // Lanes 4.5 m; every fourth row and column a street of 8 m.
      const laneU = bi % 4 === 0 ? 4 : 2.25, laneV = bj % 4 === 0 ? 4 : 2.25;
      const ua = u0 + laneU, ub = u1 - 2.25, va = v0 + laneV, vb = v1 - 2.25;
      const use = zone?.use, housing = zone?.housing;
      const elite = housing === 'elite' || use === 'horti', port = use === 'port';
      const depth = port ? (vb - va) / 2 : elite ? (vb - va) / 2 : housing === 'dense' ? 13 : 12;
      const widths: [number, number] = port ? [26, 48] : elite ? [20, 30] : [9, 17];
      // Strips: north and south rows the full width; west and east rows between them when the block leaves a courtyard.
      const strips: [number, number, number, number, boolean][] = [[ua, ub, vb - depth, vb, true], [ua, ub, va, va + depth, true]];
      if (!port && !elite && vb - va - 2 * depth > 8) strips.push([ua, ua + depth, va + depth, vb - depth, false], [ub - depth, ub, va + depth, vb - depth, false]);
      strips.forEach(([x0, x1, y0, y1, alongU], s) => {
        const length = alongU ? x1 - x0 : y1 - y0;
        for (let at = 0, n = 0; length - at > 5; n++) {
          let w = widths[0] + (widths[1] - widths[0]) * hash(bi + salt, bj, s, n, 11);
          if (length - at - w < widths[0] * 0.6) w = length - at;
          const q = alongU ? [[x0 + at, y0], [x0 + at + w, y0], [x0 + at + w, y1], [x0 + at, y1]] : [[x0, y0 + at], [x1, y0 + at], [x1, y0 + at + w], [x0, y0 + at + w]];
          at += w;
          const corners = q.map(warp), c = warp([(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]), r = hash(bi + salt, bj, s, n, 17);
          const lotZone = zoneAt(c), lotF = fieldAt(c);
          if (lotF <= 0.001 || kept(c) || nearOpen(c, CELL) || corners.some(p => kept(p) || nearOpen(p, 0) || quarterAt(p) !== quarter) || quarterAt(c) !== quarter) continue;
          let kind: FillKind, keepP: number, storeys: number;
          if (lotZone) {
            const u = lotZone.use, h = lotZone.housing;
            if (u === 'residential') {
              const taper = 0.55 + 0.45 * smooth(0, 300, depthInside(c));
              keepP = (lotZone.density ?? 0.5) * taper;
              kind = h === 'elite' ? 'domus' : h === 'roadside' ? 'house' : 'insula';
              storeys = h === 'dense' && (lotZone.density ?? 1) > 0.8 ? 3 + Math.floor(r * 3) : h === 'elite' ? 1 + Math.floor(r * 2) : h === 'roadside' ? 1 + Math.floor(r * 2) : 2 + Math.floor(r * 3);
              storeys = Math.max(1, Math.round(storeys * (0.7 + 0.3 * taper)));
            } else if (u === 'port') { keepP = 0.75; kind = 'warehouse'; storeys = 2; }
            else if (u === 'horti') { keepP = 0.1; kind = 'villa'; storeys = 1 + Math.floor(r * 2); }
            else continue;
          } else {
            // Beyond the continuous city: houses and workshops thinning with the field, densest along the roads.
            keepP = 0.4 * smooth(0.3, 1, lotF) ** 1.4; kind = 'house'; storeys = 1 + Math.floor(r * 2);
          }
          if (hash(bi + salt, bj, s, n, 23) >= keepP) continue;
          const half = Math.max(w, depth) / 2;
          if (onLine(c, half * 0.7)) continue;
          const height = kind === 'warehouse' ? 8 + 2 * r : kind === 'villa' ? 3.5 * storeys + 1 : Math.min(16.8, 4 + 3.2 * (storeys - 1));
          push(kind, corners, height, 0, TILES[Math.floor(hash(bi + salt, bj, s, n, 29) * TILES.length)]);
        }
      });
    }
  });

  // ---- Suburban villas: one chance per 220 m cell, drawn against the field (horti everywhere they are zoned), clear of roads.
  const VC = 220;
  for (let i = Math.floor(-HALF_W / VC); i * VC < HALF_W; i++) for (let j = Math.floor(-HALF_H / VC); j * VC < HALF_H; j++) {
    const c: [number, number] = [(i + 0.2 + 0.6 * hash(i, j, 41)) * VC, (j + 0.2 + 0.6 * hash(i, j, 43)) * VC], zone = zoneAt(c), f = fieldAt(c);
    if (depthInside(c) > 0 || kept(c) || f <= 0.02) continue;
    const p = zone?.use === 'horti' ? 0.55 : zone ? 0 : 0.6 * smooth(0.12, 0.7, f);
    if (hash(i, j, 47) >= p) continue;
    const angle = hash(i, j, 53) * Math.PI, main = box(c, 24 + 10 * hash(i, j, 59), 30 + 10 * hash(i, j, 61), angle);
    if (onLine(c, 30) || main.some(q => kept(q) || fieldAt(q) <= 0.001)) continue;
    push('villa', main, 7, 0, '#c38a62');
    for (const side of [-1, 1]) if (hash(i, j, 67, side) < 0.7) {
      const off: [number, number] = [c[0] + Math.cos(angle + Math.PI / 2) * side * 30, c[1] + Math.sin(angle + Math.PI / 2) * side * 30];
      if (!onLine(off, 12) && fieldAt(off) > 0.001) push('villa', box(off, 20, 9, angle), 5, 0, '#a9714e');
    }
  }

  // ---- Tombs along the roads beyond the continuous city, both sides, thinning with the field; denser in the Appia's tomb zone.
  for (const l of romeZoning.lines.filter(l => l.kind === 'road')) l.lines.forEach((line, li) => {
    const pts = line.map(toXY);
    let carried = 0;
    for (let n = 1; n < pts.length; n++) {
      const [a, b] = [pts[n - 1], pts[n]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = carried; t < len; ) {
        const at: [number, number] = [a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len], appia = zoneAt(at)?.id === 'zone:via-appia-tombs';
        const step = appia ? 13 : 30;
        if (depthInside(at) === 0 && !kept(at)) for (const side of [-1, 1]) {
          const k = [l.id.length, li, n, Math.round(t), side], f = fieldAt(at);
          if (hash(...k, 71) >= (appia ? 0.85 : 0.1 + 0.6 * f) || f <= 0.001) continue;
          const size = 4.5 + 6 * hash(...k, 73), off = (appia ? 9 : 10) + size / 2 + 6 * hash(...k, 79);
          const c: [number, number] = [at[0] + Math.cos(dir + Math.PI / 2) * side * off, at[1] + Math.sin(dir + Math.PI / 2) * side * off];
          const zc = zoneAt(c);
          if (zc && zc.use !== 'necropolis' && zc.housing !== 'roadside' || fieldAt(c) <= 0.001 || onLine(c, size * 0.4 - 4)) continue;
          push('tomb', box(c, size, size * (0.8 + 0.4 * hash(...k, 83)), dir), 3 + 6 * hash(...k, 89), 0, ['#d9cdb0', '#cbbd9a', '#bfae8c'][Math.floor(hash(...k, 97) * 3)]);
        }
        t += step; carried = t - len;
      }
    }
  });
  // The Vatican necropolis: tombs packed on a jittered 16 m grid.
  const necropolis = romeZoning.zones.find(z => z.id === 'zone:vatican-necropolis');
  if (necropolis) {
    const ring = necropolis.multipolygon[0][0].map(toXY), xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 16) for (let y = Math.min(...ys); y < Math.max(...ys); y += 16) {
      const c: [number, number] = [x + 4 * hash(x, y, 101), y + 4 * hash(x, y, 103)];
      if (zoneAt(c)?.id !== necropolis.id || hash(x, y, 107) > 0.55 || onLine(c, 4)) continue;
      push('tomb', box(c, 5 + 5 * hash(x, y, 109), 6 + 4 * hash(x, y, 113), 0.2), 3 + 5 * hash(x, y, 127), 0, '#cbbd9a');
    }
  }
  // The Tomb of Caecilia Metella: a drum of about 29.5 m on the Pleiades point (Wikipedia gives the size), as 24 sides.
  const metella = romeZoning.markers.find(m => m.id === 'marker:caecilia-metella');
  if (metella) {
    const c = toXY(metella.coordinate);
    items.push({ kind: 'tomb', ring: Array.from({ length: 24 }, (_, k) => toLL([c[0] + 14.75 * Math.cos(k * Math.PI / 12), c[1] + 14.75 * Math.sin(k * Math.PI / 12)])), height: 11, base: 0, colour: '#e0d6bd' });
  }

  // ---- Aqueducts: the kit piece is one pier (2.4 m along the line, 3.2 m across) and the 6.6 m of channel it carries; heights
  // swell and sink slowly along the line (9 to 20 m), lower for the Arcus Neroniani inside the city.
  for (const l of romeZoning.lines.filter(l => l.kind === 'aqueduct')) l.lines.forEach((line, li) => {
    const pts = line.map(toXY), SPAN = 6.6;
    let s = 0;
    for (let n = 1; n < pts.length; n++) {
      const [a, b] = [pts[n - 1], pts[n]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = (SPAN - s % SPAN) % SPAN; t < len; t += SPAN) {
        const at: [number, number] = [a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len], total = s + t;
        if (kept(at) || fieldAt(at) <= 0.001 || zoneAt(at)?.use === 'open-river') continue;
        const top = l.id === 'aqueduct:arcus-neroniani' ? 11 : 14.5 + 5.5 * Math.sin(total / 900 + li);
        push('pier', box(at, 2.4, 3.2, dir), top - 2.2, 0, '#c9bba0');
        const next: [number, number] = [at[0] + Math.cos(dir) * SPAN / 2, at[1] + Math.sin(dir) * SPAN / 2];
        push('channel', box(next, SPAN, 3.2, dir), top, top - 2.2, '#bfb093');
      }
      s += len;
    }
  });

  // ---- Field strips: farm blocks of 360 m, turned per 1,080 m tract, split into 3 to 6 strips with tracks between; only
  // where the field is low (beyond the suburbium's denser classes), off water and outside every named zone.
  const FB = 360, TRACT = 1080, CROPS = ['#b9a86f', '#a89a68', '#8e9563', '#9c8f6c', '#7f8a5c', '#b0a272'];
  for (let ti = Math.floor(-HALF_W / TRACT); ti * TRACT < HALF_W; ti++) for (let tj = Math.floor(-HALF_H / TRACT); tj * TRACT < HALF_H; tj++) {
    const angle = (hash(ti, tj, 131) - 0.5) * 50 * Math.PI / 180, ux = Math.cos(angle), uy = Math.sin(angle), origin = [(ti + 0.5) * TRACT, (tj + 0.5) * TRACT];
    const at = (u: number, v: number): [number, number] => [origin[0] + ux * u - uy * v, origin[1] + uy * u + ux * v];
    for (let a = -2; a < 2; a++) for (let b = -2; b < 2; b++) {
      const strips = 3 + Math.floor(hash(ti, tj, a, b, 137) * 4), acrossU = hash(ti, tj, a, b, 139) < 0.5;
      for (let k = 0; k < strips; k++) {
        const f0 = k / strips, f1 = (k + 1) / strips, inset = 5;
        const q: [number, number][] = acrossU
          ? [[a * FB + f0 * FB + inset, b * FB + inset], [a * FB + f1 * FB - inset, b * FB + inset], [a * FB + f1 * FB - inset, (b + 1) * FB - inset], [a * FB + f0 * FB + inset, (b + 1) * FB - inset]]
          : [[a * FB + inset, b * FB + f0 * FB + inset], [(a + 1) * FB - inset, b * FB + f0 * FB + inset], [(a + 1) * FB - inset, b * FB + f1 * FB - inset], [a * FB + inset, b * FB + f1 * FB - inset]];
        const corners = q.map(([u, v]) => at(u, v)), c = at((q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2);
        // Kept only if its centre lies in this tract (tracts are turned, so their blocks overlap the neighbours' a little).
        if (Math.abs(c[0] - origin[0]) > TRACT / 2 || Math.abs(c[1] - origin[1]) > TRACT / 2 || Math.abs(c[0]) > HALF_W || Math.abs(c[1]) > HALF_H) continue;
        if ([c, ...corners].some(p => { const f = fieldAt(p); return f <= 0.001 || f > 0.32 || zoneAt(p) || depthInside(p) > 0 || kept(p); })) continue;
        if (hash(ti, tj, a, b, k, 151) < 0.25) continue;   // left as open pasture: the ground shows through
        push('field', corners, 0, 0, CROPS[Math.floor(hash(ti, tj, a, b, k, 149) * CROPS.length)]);
      }
    }
  }

  // ---- Landmarks (placed above, before the lots).
  for (const piece of pieces) if (!left.has(piece.id))
    items.push({ kind: 'landmark', ring: piece.ring.map(toLL), height: piece.height, base: piece.base, colour: piece.colour, id: piece.id, certainty: certainty.get(piece.id) });

  const counts = { insula: 0, house: 0, domus: 0, warehouse: 0, villa: 0, tomb: 0, pier: 0, channel: 0, field: 0, landmark: 0 } as Record<FillKind, number>;
  for (const item of items) counts[item.kind]++;
  return { items, counts, landmarksLeftOut: [...left] };
}
