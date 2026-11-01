import type { Bounds, ComponentState, PlanFeature, ScenePlan, SpatialBlueprint } from '@/lib/plan/contracts';
import { applyOverrides } from '@/lib/plan/overrides';
import type { PlanningContext } from '@/lib/plan/planner';
import { featureCoordinates } from '@/lib/plan/store';
import { colourOf, type Zone } from '@/lib/scenarios/zoning';
import type { Coordinate } from '@/lib/scenarios/schema';

/**
 * The general 2D review of a plan at any scale (an SVG string, like zoningPlanSvg). It draws the focus frame, its parent and child
 * frames, and every planned feature from the blueprint records, styled by state: ready solid, missing hatched red, and deferred areas
 * dashed. Asset requests are ringed. Elements carry `data-id` (the feature id) so the dialog can list a clicked item's evidence.
 */
export const REVIEW_SIZE = 1200, REVIEW_LEGEND = 300;
const STATE: Record<ComponentState, string> = { ready: '#f0e4c4', missing: '#e0645a', deferred: '#9aa6b2' };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function planReviewSvg(plan: ScenePlan, ctx: PlanningContext): string {
  const pinned = new Map(plan.versions.blueprints.map(b => [b.id, applyOverrides(ctx.store.require(b), ctx.overrides ?? []).blueprint]));
  const focus = plan.focus && pinned.get(plan.focus.id);
  // View: the focus frame (or the initial area for a place with no blueprint), padded, square on the ground.
  const base = focus?.lod === 'site' && plan.context[0] ? pinned.get(plan.context[0].id)!.bounds : focus?.bounds ?? plan.initial.bounds;
  const lat = (base[1] + base[3]) / 2, kx = Math.cos(lat * Math.PI / 180);
  const w = (base[2] - base[0]) * kx, h = base[3] - base[1], side = Math.max(w, h) * 1.08, cx = (base[0] + base[2]) / 2, cy = (base[1] + base[3]) / 2;
  const view: Bounds = [cx - side / 2 / kx, cy - side / 2, cx + side / 2 / kx, cy + side / 2];
  const S = REVIEW_SIZE, X = (x: number) => (x - view[0]) / (view[2] - view[0]) * S, Y = (y: number) => (view[3] - y) / (view[3] - view[1]) * S, f1 = (v: number) => v.toFixed(1);
  const ring = (r: Coordinate[]) => 'M' + r.map(p => `${f1(X(p[0]))},${f1(Y(p[1]))}`).join('L') + 'Z';
  const box = (b: Bounds) => ring([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S + REVIEW_LEGEND} ${S}" width="${S + REVIEW_LEGEND}" height="${S}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#1b211d"/><rect width="${S}" height="${S}" fill="#26302a"/>`;
  s += `<defs><pattern id="miss" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${STATE.missing}" stroke-width="3"/></pattern></defs><g>`;
  // Frames: context ancestors faint, deferred areas dashed, the focus solid.
  for (const c of plan.context) { const b = pinned.get(c.id); if (b) s += `<path d="${box(b.bounds)}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1"><title>${esc(b.title)} (${b.lod}, context)</title></path>`; }
  for (const d of plan.deferred) s += `<path data-id="${esc(d.blueprint?.id ?? d.title)}" d="${box(d.bounds)}" fill="${STATE.deferred}" fill-opacity=".08" stroke="${STATE.deferred}" stroke-width="1.5" stroke-dasharray="6 4"><title>${esc(d.title)} · deferred: ${esc(d.reason)}</title></path>`;
  if (focus) s += `<path d="${box(focus.bounds)}" fill="none" stroke="#fff6e0" stroke-width="2"><title>${esc(focus.title)} (${focus.lod})</title></path>`;
  s += `<path d="${box(plan.initial.bounds)}" fill="none" stroke="#4aa8f0" stroke-width="1.6" stroke-dasharray="3 3"><title>Initial view: ${esc(plan.initial.title)}</title></path>`;

  const items = plan.components.map(c => ({ c, b: pinned.get(c.ref.blueprint)!, f: pinned.get(c.ref.blueprint)!.features.find(f => f.id === c.ref.feature)! })).filter(x => x.f);
  const order = (f: PlanFeature) => ({ terrain: 0, fill: 0, zone: 1, extent: 1, water: 2, 'open-space': 3, route: 4, building: 5, structure: 5, landmark: 6, settlement: 7, marker: 7 })[f.kind];
  const shape = (b: SpatialBlueprint, f: PlanFeature) => {
    // Neighbourhood objects are stored in local metres; their geographic extent box stands in for the shape.
    if (f.record && b.layers.find(l => l.id === f.record!.layer)?.codec === 'forum-reconstruction@1') return f.geometry.bbox ? box(f.geometry.bbox) : '';
    const coords = f.geometry.type === 'polygon' || f.geometry.type === 'line' ? featureCoordinates(b, f) : undefined;
    const depth = (v: unknown): number => Array.isArray(v) ? 1 + depth(v[0]) : 0, d = depth(coords);
    if (d === 2) return f.geometry.type === 'line' ? 'M' + (coords as Coordinate[]).map(p => `${f1(X(p[0]))},${f1(Y(p[1]))}`).join('L') : ring(coords as Coordinate[]);
    if (d === 3) return (coords as Coordinate[][]).map(r => f.geometry.type === 'line' ? 'M' + r.map(p => `${f1(X(p[0]))},${f1(Y(p[1]))}`).join('L') : ring(r)).join('');
    if (d === 4) return (coords as Coordinate[][][]).flat().map(ring).join('');
    return f.geometry.bbox && f.kind !== 'fill' && f.kind !== 'terrain' ? box(f.geometry.bbox) : '';
  };
  for (const { c, b, f } of items.sort((a, z) => order(a.f) - order(z.f))) {
    const title = `<title>${esc(f.title)} · ${c.state} · rung ${c.rung} · ${f.evidence.certainty}${c.assetRequestId ? ' · model requested' : ''}</title>`, id = esc(`${c.ref.blueprint}#${f.id}`);
    const fill = c.state === 'missing' ? 'url(#miss)' : f.kind === 'zone' && f.record ? colourOf((b.layers.find(l => l.id === f.record!.layer)!.collections[f.record.collection][f.record.index]) as Zone) : f.kind === 'water' ? '#5f8ea3' : STATE.ready;
    if (f.geometry.type === 'point' && f.geometry.anchor) {
      const [x, y] = [X(f.geometry.anchor[0]), Y(f.geometry.anchor[1])], r = f.kind === 'settlement' ? 7 : f.kind === 'landmark' ? 5 : 4;
      s += `<circle data-id="${id}" cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${c.state === 'missing' ? STATE.missing : f.kind === 'marker' ? '#f0b64a' : '#fff'}" stroke="#1b211d" stroke-width="1">${title}</circle>`;
      if (c.assetRequestId) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 4}" fill="none" stroke="#e05ad8" stroke-width="1.5" pointer-events="none"/>`;
      if (f.kind === 'settlement') s += `<text x="${f1(x + 10)}" y="${f1(y + 4)}" font-size="13" fill="#fff" pointer-events="none">${esc(f.title)}</text>`;
      continue;
    }
    // The Campagna is the frame less every other zone; like the land-use plan, it is left unfilled.
    if (f.geometry.path === 'frame') continue;
    const d = shape(b, f);
    if (!d) continue;
    const line = f.geometry.type === 'line';
    s += `<path data-id="${id}" d="${d}" fill="${line ? 'none' : fill}" fill-opacity="${line ? 0 : c.state === 'missing' ? .9 : f.kind === 'zone' ? .55 : .7}" fill-rule="evenodd" stroke="${line ? (c.state === 'missing' ? STATE.missing : '#e8d3a2') : '#1b211d'}" stroke-width="${line ? 2 : .6}" stroke-opacity="${line ? 1 : .6}">${title}</path>`;
    if (c.assetRequestId) s += `<path d="${d}" fill="none" stroke="#e05ad8" stroke-width="1.5" pointer-events="none"/>`;
  }
  s += '</g>';
  const counts = (st: ComponentState) => plan.components.filter(c => c.state === st).length;
  const lines: [string, string][] = [['Ready', STATE.ready], ['Missing (hatched)', STATE.missing], ['Deferred area (dashed)', STATE.deferred], ['Model requested (ring)', '#e05ad8'], ['Initial view', '#4aa8f0'], ['Settlement / landmark', '#fff'], ['Marker', '#f0b64a']];
  const lx = S + 24;
  s += `<g pointer-events="none"><text x="${lx}" y="40" font-size="14" fill="#fff" font-weight="600">${esc(plan.place?.title ?? 'Unresolved place')}</text>`;
  s += `<text x="${lx}" y="60" font-size="11" fill="#ccc">${esc(`${plan.lod} scale · ${plan.status} · Checkpoint A ${plan.validation.ok ? 'passed' : 'failed'}`)}</text>`;
  s += `<text x="${lx}" y="78" font-size="11" fill="#ccc">${counts('ready')} ready · ${counts('missing')} missing · ${plan.deferred.length} deferred areas</text>`;
  s += `<text x="${lx}" y="96" font-size="11" fill="#ccc">${plan.gaps.length} gaps · ${plan.assetRequests.length} asset requests · ${plan.absent.length} not standing</text>`;
  lines.forEach(([t, c], n) => { s += `<rect x="${lx}" y="${118 + n * 20}" width="14" height="11" fill="${c}"/><text x="${lx + 20}" y="${128 + n * 20}" font-size="11" fill="#eee">${t}</text>`; });
  return s + '</g></svg>\n';
}
