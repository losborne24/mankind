import data from '@/lib/scenarios/fixtures/rome-ad100-landmarks.json';

/**
 * Simple landmark reconstructions for Rome c. AD 100 (Stage 3b): the monuments in the zones the fill leaves open, each drawn as a
 * kit shape (temple, basilica, precinct, amphitheatre, ...) from the parameters in rome-ad100-landmarks.json, which
 * scripts/context/rome/build-landmarks.mjs builds from the mapped remains, Pleiades and the published sizes. They are placeholders
 * for proper assets: one extrusion per piece, stepped where a roof, a dome or tiers of seating would be.
 */

export type LandmarkCertainty = 'evidence-based' | 'best-guess';
export interface Landmark {
  id: string; title: string; kit: string; centre: [number, number]; angle: number; size?: [number, number]; height: number;
  built: number; certainty: LandmarkCertainty; position: string; note: string; sources: string[];
  [param: string]: unknown;
}
/** One extruded piece, in metres in the caller's plane (x east, y north). */
export interface LandmarkPiece { id: string; ring: [number, number][]; height: number; base: number; colour: string }

export const landmarks = data.landmarks as unknown as Landmark[];

const MARBLE = '#e8e1d0', STONE = '#d6cbb2', TUFF = '#c7b99b', BRICK = '#b98a6c', ROOF = '#a8694a', SEATS = '#d9cfb8';

/** The pieces of every landmark standing in `year`, placed with `toXY` (longitude/latitude to the caller's metres). */
export function landmarkPieces(toXY: (p: readonly number[]) => [number, number], year = 100): LandmarkPiece[] {
  const pieces: LandmarkPiece[] = [];
  for (const l of landmarks) {
    if (l.built > year) continue;
    const c = toXY(l.centre), a = l.angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    /** A point `s` metres towards the front and `t` metres to the left of the centre. */
    const P = (s: number, t: number): [number, number] => [c[0] + ux * s - uy * t, c[1] + uy * s + ux * t];
    const lift = (l.base as number | undefined) ?? 0;   // a temple on a terrace stands on it
    const add = (ring: [number, number][], height: number, colour: string, base = 0) => pieces.push({ id: l.id, ring, height: height + lift, base: base + lift, colour });
    const rect = (s0: number, s1: number, t0: number, t1: number) => [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
    /** A quad of an elliptical ring between radii fractions, from angle q0 to q1 (radians, from the front). */
    const sector = (inner: [number, number], outer: [number, number], q0: number, q1: number, s0 = 0) => {
      const e = (r: [number, number], q: number): [number, number] => P(s0 + r[0] * Math.cos(q), r[1] * Math.sin(q));
      return [e(inner, q0), e(outer, q0), e(outer, q1), e(inner, q1)];
    };
    const circle = (r: number, n = 24, s0 = 0) => Array.from({ length: n }, (_, k) => P(s0 + r * Math.cos(2 * Math.PI * k / n), r * Math.sin(2 * Math.PI * k / n)));
    const [L, W] = l.size ?? [0, 0], H = l.height;
    switch (l.kit) {
      case 'block': add(rect(-L / 2, L / 2, -W / 2, W / 2), H, STONE); break;
      case 'hall': {
        const rise = Math.min(4, W * 0.15);
        add(rect(-L / 2, L / 2, -W / 2, W / 2), H - rise, BRICK);
        add(rect(-L / 2, L / 2, -W * 0.3, W * 0.3), H - rise * 0.4, ROOF, H - rise);
        add(rect(-L / 2, L / 2, -W * 0.1, W * 0.1), H, ROOF, H - rise * 0.4);
        break;
      }
      case 'temple': {
        // Podium; the colonnaded body (stopped short at the front for the steps); a gable roof in two steps along the axis.
        const podium = l.podium as number, rise = Math.min(7, W * 0.2);
        add(rect(-L / 2, L / 2, -W / 2, W / 2), podium, TUFF);
        add(rect(-L / 2 + 1, L / 2 - Math.min(8, L * 0.15), -W / 2 + 1, W / 2 - 1), H - rise, MARBLE, podium);
        add(rect(-L / 2 + 1, L / 2 - Math.min(8, L * 0.15), -W * 0.3, W * 0.3), H - rise * 0.4, ROOF, H - rise);
        add(rect(-L / 2 + 1, L / 2 - Math.min(8, L * 0.15), -W * 0.1, W * 0.1), H, ROOF, H - rise * 0.4);
        break;
      }
      case 'round-temple': {
        const r = (l.diameter as number) / 2, podium = l.podium as number;
        add(circle(r), podium, TUFF);
        add(circle(r * 0.85), H * 0.78, MARBLE, podium);
        add(circle(r * 0.5, 16), H, ROOF, H * 0.78);
        break;
      }
      case 'basilica': {
        const aisle = l.aisle as number;
        add(rect(-L / 2, L / 2, -W / 2, W / 2), aisle, MARBLE);
        add(rect(-L / 2 + 2, L / 2 - 2, -W * 0.27, W * 0.27), H, STONE, aisle);
        add(rect(-L / 2 + 2, L / 2 - 2, -W * 0.1, W * 0.1), H + 2.5, ROOF, H);
        break;
      }
      case 'precinct': {
        // Porticoes round an open square: front and back the full width, the sides between them.
        const d = l.depth as number;
        add(rect(L / 2 - d, L / 2, -W / 2, W / 2), H, STONE);
        add(rect(-L / 2, -L / 2 + d, -W / 2, W / 2), H, STONE);
        add(rect(-L / 2 + d, L / 2 - d, W / 2 - d, W / 2), H, STONE);
        add(rect(-L / 2 + d, L / 2 - d, -W / 2, -W / 2 + d), H, STONE);
        break;
      }
      case 'baths': {
        add(rect(-L / 2, L / 2, -W / 2, W / 2), H * 0.6, BRICK);
        add(rect(-L * 0.28, L * 0.28, -W * 0.3, W * 0.3), H, BRICK, H * 0.6);
        add(rect(-L * 0.1, L * 0.1, -W * 0.45, W * 0.45), H * 0.85, BRICK, H * 0.6);
        break;
      }
      case 'amphitheatre': {
        // Four tiers stepping down from the outer wall to the open arena, as 48 sectors each.
        const [aL, aW] = l.arena as [number, number], n = 48, tiers: [number, number, number][] = [[1, 0.86, 1], [0.86, 0.6, 0.8], [0.6, 0.32, 0.56], [0.32, 0, 0.3]];
        const ring = (f: number): [number, number] => [aL / 2 + f * (L - aL) / 2, aW / 2 + f * (W - aW) / 2];
        for (const [f1, f0, h] of tiers) for (let k = 0; k < n; k++) add(sector(ring(f0), ring(f1), 2 * Math.PI * k / n, 2 * Math.PI * (k + 1) / n), H * h, f1 === 1 ? MARBLE : SEATS);
        break;
      }
      case 'stadium': case 'circus': {
        // An arena with a straight end at the front (the starting gates) and a curved end behind, stands round it in two tiers.
        // For the stadium the size is the arena (the mapped square); for the circus it is the outside, and a spine runs down the middle.
        const D = l.cavea as number, circus = l.kit === 'circus';
        const aL = circus ? L - D * 1.6 : L, aW = circus ? W - 2 * D : W, r = aW / 2, back = -aL / 2 + r, front = aL / 2;
        for (const [t0, t1, h] of [[r, r + D / 2, 0.6], [r + D / 2, r + D, 1]] as const) {
          for (const side of [1, -1]) add(rect(back, front, side * t0, side * t1), H * h, SEATS);
          for (let k = 0; k < 12; k++) add(sector([t0, t0], [t1, t1], Math.PI / 2 + Math.PI * k / 12, Math.PI / 2 + Math.PI * (k + 1) / 12, back), H * h, SEATS);
        }
        add(rect(front, front + D * 0.6, -(r + D), r + D), H * 0.6, STONE);
        if (circus) {
          add(rect(back + aL * 0.12, front - aL * 0.18, -3, 3), 1.5, TUFF);
          add(rect((back + front) / 2 - 1.5, (back + front) / 2 + 1.5, -1.5, 1.5), 25.5, STONE, 1.5);
        }
        break;
      }
      case 'theatre': {
        // A semicircular cavea behind the stage, three tiers; the stage building across its front; with `crown`, a temple at the top
        // (Pompey's Venus Victrix stood there).
        const R = (l.diameter as number) / 2, o = (l.orchestra as number) / 2;
        for (const [f0, f1, h] of [[0, 0.35, 0.45], [0.35, 0.7, 0.75], [0.7, 1, 1]] as const) {
          const r0 = o + f0 * (R - o), r1 = o + f1 * (R - o);
          for (let k = 0; k < 16; k++) add(sector([r0, r0], [r1, r1], Math.PI / 2 + Math.PI * k / 16, Math.PI / 2 + Math.PI * (k + 1) / 16), H * h, SEATS);
        }
        add(rect(4, 24, -R * 0.62, R * 0.62), H * 0.85, STONE);
        if (l.crown) add(rect(-R - 12, -R + 18, -14, 14), H + 8, MARBLE);
        break;
      }
      case 'drum': {
        let base = 0;
        for (const [r, h] of l.tiers as [number, number][]) { add(circle(r, 32), h, base ? '#8f9469' : STONE, base); base = h; }
        break;
      }
      case 'rotunda': {
        // The drum, a dome in three steps, the block between drum and porch, and the porch with its gable.
        const R = (l.diameter as number) / 2, drum = l.drum as number, [pw, pd] = l.porch as [number, number];
        add(circle(R, 32), drum, BRICK);
        add(circle(R * 0.86, 32), drum + (H - drum) * 0.5, STONE, drum);
        add(circle(R * 0.62, 24), drum + (H - drum) * 0.82, STONE, drum + (H - drum) * 0.5);
        add(circle(R * 0.34, 16), H, STONE, drum + (H - drum) * 0.82);
        add(rect(R * 0.7, R + 7, -pw / 2, pw / 2), drum + 2, BRICK);
        add(rect(R + 7, R + 7 + pd, -pw / 2, pw / 2), 19, MARBLE);
        add(rect(R + 7, R + 7 + pd, -pw * 0.3, pw * 0.3), 22, ROOF, 19);
        add(rect(R + 7, R + 7 + pd, -pw * 0.1, pw * 0.1), 24.5, ROOF, 22);
        break;
      }
      case 'camp': {
        // The walls, a headquarters block at the centre and rows of barracks, cut into 50 m lengths, filling the rest.
        const d = 4;
        add(rect(L / 2 - d, L / 2, -W / 2, W / 2), H, BRICK); add(rect(-L / 2, -L / 2 + d, -W / 2, W / 2), H, BRICK);
        add(rect(-L / 2 + d, L / 2 - d, W / 2 - d, W / 2), H, BRICK); add(rect(-L / 2 + d, L / 2 - d, -W / 2, -W / 2 + d), H, BRICK);
        add(rect(-35, 35, -30, 30), 10, STONE);
        for (let t = -W / 2 + 20; t + 8 < W / 2 - 14; t += 22) for (let s = -L / 2 + 16; s + 30 < L / 2 - 12; s += 58) {
          if (Math.abs(s + 25) < 50 && Math.abs(t + 4) < 44) continue;   // the headquarters and its square
          add(rect(s, Math.min(s + 50, L / 2 - 12), t, t + 8), 6, ROOF);
        }
        break;
      }
      default: throw Error(`Unknown landmark kit ${l.kit} (${l.id})`);
    }
  }
  return pieces.map(p => ({ ...p, height: Math.round(p.height * 10) / 10, base: Math.round(p.base * 10) / 10 }));
}
