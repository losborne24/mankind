import { colourOf, lineColour, romeZoning, zoneColour, type Zone } from '@/lib/scenarios/zoning';

const W = 1600, H = W;
/** The legend sits in a panel to the right of the map, so it never covers a feature. */
export const PLAN_WIDTH = W + 300, PLAN_HEIGHT = H;
const [x0, y0] = romeZoning.frame[0], [x1, y1] = romeZoning.frame[2];
const X = (x: number) => (x - x0) / (x1 - x0) * W, Y = (y: number) => (y1 - y) / (y1 - y0) * H;

/** A viewBox round the continuous city with a margin, for a thumbnail of the plan. */
export function zoningPlanCityView(margin = 0.15) {
  const xs = romeZoning.extent.ring.map(p => X(p[0])), ys = romeZoning.extent.ring.map(p => Y(p[1]));
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (1 + 2 * margin), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return `${(cx - size / 2).toFixed(0)} ${(cy - size / 2).toFixed(0)} ${size.toFixed(0)} ${size.toFixed(0)}`;
}

/**
 * The land-use zoning as a flat, labelled plan (an SVG string), for the in-app plan view and for scripts/context/rome/plot-zoning.mjs.
 * Zones and markers present in `year` are drawn and carry `data-id` so a click can open their evidence; features dated later are grey
 * hatched outlines labelled "not shown". Labels are placed greedily so none overlap: later features, then zones (largest first),
 * then markers, each trying a few offsets; a label with no free place is left out. Pure.
 */
export function zoningPlanSvg(year = 100): string {
  // The frame is the zoning's own (about 14 km square, the suburbium and the Campagna round the city); its latitude span matches its width on the ground.
  const f = (v: number) => v.toFixed(1);
  const present = (d: { time: Zone['time'] }) => d.time.start.year <= year && (d.time.end?.year ?? Infinity) >= year;
  const path = (mp: Zone['multipolygon']) => mp.map(poly => poly.map(r => 'M' + r.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L') + 'Z').join('')).join('');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const { zones, markers, extent, title, lines } = romeZoning, now = zones.filter(present), later = zones.filter(z => !present(z) && z.time.start.year > year);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLAN_WIDTH} ${H}" width="${PLAN_WIDTH}" height="${H}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#1b211d"/><rect width="${W}" height="${H}" fill="#26302a"/><clipPath id="map"><rect width="${W}" height="${H}"/></clipPath><g clip-path="url(#map)">`;
  s += `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#ccc" stroke-opacity=".5" stroke-width="2"/></pattern></defs>`;
  for (let x = Math.ceil(x0 * 100) / 100; x <= x1 + 1e-9; x += 0.01) s += `<line x1="${f(X(x))}" x2="${f(X(x))}" y1="0" y2="${H}" stroke="#fff" stroke-opacity=".08"/><text x="${f(X(x))}" y="14" font-size="10" fill="#9aa" text-anchor="middle">${x.toFixed(3)}</text>`;
  for (let y = Math.ceil(y0 * 100) / 100; y <= y1; y += 0.01) s += `<line y1="${f(Y(y))}" y2="${f(Y(y))}" x1="0" x2="${W}" stroke="#fff" stroke-opacity=".08"/><text x="4" y="${f(Y(y) - 3)}" font-size="10" fill="#9aa">${y.toFixed(3)}</text>`;
  for (const z of now) s += `<path data-id="${esc(z.id)}" d="${path(z.multipolygon)}" fill="${colourOf(z)}" fill-opacity="${z.ring === 'campagna' ? .5 : z.use === 'suburban' ? .62 : z.certainty === 'illustrative' ? .68 : .88}" fill-rule="evenodd" ${z.ring === 'river' || z.ring === 'campagna' || z.use === 'suburban' ? 'stroke="none"' : `stroke="#1b1b1b" stroke-width=".8" stroke-dasharray="${z.certainty === 'illustrative' ? '2 3' : z.certainty === 'approximate' ? '6 3' : ''}"`}><title>${esc(z.title)}</title></path>`;
  for (const z of later) s += `<path data-id="${esc(z.id)}" d="${path(z.multipolygon)}" fill="url(#hatch)" stroke="#bbb" stroke-width="1.4" stroke-dasharray="4 3"><title>${esc(z.title)} (not shown at AD ${year})</title></path>`;
  // Roads and aqueducts: solid documented, dashed approximate, dotted illustrative; aqueducts carry ticks for their arches.
  for (const l of lines.filter(present)) {
    const toPath = (set: [number, number][][]) => set.map(line => 'M' + line.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L')).join('');
    const d = toPath(l.lines), dash = l.certainty === 'documented' ? '' : l.certainty === 'approximate' ? '7 4' : '2 4';
    if (l.gaps?.length) s += `<path d="${toPath(l.gaps)}" fill="none" stroke="${lineColour[l.kind]}" stroke-opacity=".8" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round"/>`;
    s += l.kind === 'aqueduct'
      ? `<g data-id="${esc(l.id)}"><path d="${d}" fill="none" stroke="${lineColour.aqueduct}" stroke-width="3" stroke-dasharray="${dash}"/><path d="${d}" fill="none" stroke="${lineColour.aqueduct}" stroke-width="9" stroke-dasharray="1.5 5"/><path d="${d}" fill="none" stroke="transparent" stroke-width="12"/><title>${esc(l.title)}</title></g>`
      : `<g data-id="${esc(l.id)}"><path d="${d}" fill="none" stroke="#1b1b1b" stroke-opacity=".5" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${lineColour.road}" stroke-width="2" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="transparent" stroke-width="10"/><title>${esc(l.title)}</title></g>`;
  }
  s += `<path data-id="${esc(extent.id)}" d="M${extent.ring.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L')}Z" fill="none" stroke="#fff6e0" stroke-width="2" stroke-dasharray="9 6" pointer-events="stroke"><title>${esc(extent.title)}</title></path>`;

  type Box = { x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [], fits = (b: Box) => b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H && !boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const place = (text: string, x: number, y: number, size: number, offsets: [number, number, 'start' | 'middle' | 'end'][], style: string) => {
    const w = text.length * size * 0.6, h = size * 1.2;
    for (const [dx, dy, anchor] of offsets) {
      const left = anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - w : x + dx - w / 2, box = { x0: left - 4, x1: left + w + 4, y0: y + dy - h - 1, y1: y + dy + 4 };
      if (fits(box)) { boxes.push(box); s += `<text x="${f(left)}" y="${f(y + dy)}" font-size="${size}" pointer-events="none" ${style}>${esc(text)}</text>`; return; }
    }
  };
  const shownMarkers = markers.filter(present);
  for (const m of shownMarkers) boxes.push({ x0: X(m.coordinate[0]) - 5, x1: X(m.coordinate[0]) + 5, y0: Y(m.coordinate[1]) - 5, y1: Y(m.coordinate[1]) + 5 });
  const zoneOffsets: [number, number, 'middle'][] = [[0, 4, 'middle'], [0, -12, 'middle'], [0, 18, 'middle'], [-30, 4, 'middle'], [30, 4, 'middle']];
  // Features not shown: name and date on two short lines centred on their own hatched footprint, placed first so nothing displaces them.
  for (const z of later) {
    const x = X(z.label[0]), y = Y(z.label[1]), lines = [z.short, `${z.dateNote ?? `from ${z.time.start.year}`} · not shown`], w = Math.max(...lines.map(t => t.length)) * 9 * 0.6;
    boxes.push({ x0: x - w / 2 - 3, x1: x + w / 2 + 3, y0: y - 14, y1: y + 12 });
    s += `<text x="${f(x)}" y="${f(y - 2)}" font-size="10" text-anchor="middle" pointer-events="none" fill="#fff" font-weight="600" stroke="#26302a" stroke-width="3" paint-order="stroke">${esc(lines[0])}</text>`;
    s += `<text x="${f(x)}" y="${f(y + 9)}" font-size="9" text-anchor="middle" pointer-events="none" fill="#eee" font-style="italic" stroke="#26302a" stroke-width="3" paint-order="stroke">${esc(lines[1])}</text>`;
  }
  for (const z of now.filter(z => z.ring !== 'campagna' && z.short).sort((a, b) => b.area - a.area)) place(z.short, X(z.label[0]), Y(z.label[1]), z.area > 4e5 ? 13 : 11, zoneOffsets, z.ring === 'river' ? 'fill="#d8eef7" font-style="italic"' : 'fill="#111" font-weight="600"');
  // Road names near their outer end, where there is room.
  for (const l of lines.filter(l => present(l) && l.kind === 'road')) {
    const pts = l.lines.flat(), far = pts.reduce((a, p) => Math.hypot(X(p[0]) - W / 2, Y(p[1]) - H / 2) > Math.hypot(X(a[0]) - W / 2, Y(a[1]) - H / 2) ? p : a);
    const at = pts.reduce((a, p) => { const t = Math.hypot(X(p[0]) - X(far[0]), Y(p[1]) - Y(far[1])); return Math.abs(t - 140) < Math.abs(Math.hypot(X(a[0]) - X(far[0]), Y(a[1]) - Y(far[1])) - 140) ? p : a; });
    place(l.title, X(at[0]), Y(at[1]), 11, [[8, 4, 'start'], [-8, 4, 'end'], [0, -8, 'middle'], [0, 16, 'middle']], 'fill="#f3e2b8" font-style="italic"');
  }
  for (const l of lines.filter(l => present(l) && l.kind === 'aqueduct').slice(0, 1)) { const p = l.lines[0][Math.floor(l.lines[0].length / 2)]; place('Aqua Claudia · Anio Novus', X(p[0]), Y(p[1]), 10, [[10, 4, 'start'], [-10, 4, 'end'], [0, -10, 'middle']], 'fill="#cfe0ee" font-style="italic"'); }
  for (const m of shownMarkers) {
    const x = X(m.coordinate[0]), y = Y(m.coordinate[1]);
    s += `<circle data-id="${esc(m.id)}" cx="${f(x)}" cy="${f(y)}" r="5" fill="${m.certainty === 'illustrative' ? '#e05ad8' : m.kind === 'region' ? '#f0b64a' : '#4aa8f0'}" stroke="#fff" stroke-width="1.2"><title>${esc(m.title)}</title></circle>`;
    place(m.title.replace(/ \(.*\)$/, ''), x, y, 10, [[7, 4, 'start'], [-7, 4, 'end'], [0, -7, 'middle'], [0, 15, 'middle'], [7, -6, 'start'], [-7, 14, 'end'], [7, 14, 'start'], [-7, -6, 'end'], [0, -18, 'middle'], [0, 26, 'middle']], 'fill="#fff"');
  }

  s += '</g>';
  const legend: [string, string][] = [['Dense housing', colourOf({ housing: 'dense' } as Zone)], ['Hill housing (mixed)', colourOf({ housing: 'mixed' } as Zone)], ['Elite housing', colourOf({ housing: 'elite' } as Zone)],
    ['Roadside ribbons', colourOf({ housing: 'roadside' } as Zone)], ['Monumental / commercial', zoneColour.monumental], ['Horti', zoneColour.horti], ['Port', zoneColour.port], ['Open ground', zoneColour.open], ['Tombs', zoneColour.necropolis], ['Suburbium, near the roads', colourOf({ use: 'suburban', band: 1 })], ['Suburbium, thinning out', colourOf({ use: 'suburban', band: 3 })], ['Campagna', zoneColour.campagna], ['Tiber, Aniene', zoneColour['open-river']]];
  const lx = W + 28, ly = 52;
  s += `<g pointer-events="none"><text x="${lx}" y="${ly - 6}" font-size="12" fill="#fff" font-weight="600">${esc(title)}</text>`;
  legend.forEach(([t, c], n) => { s += `<rect x="${lx}" y="${ly + n * 18 + 4}" width="14" height="11" fill="${c}"/><text x="${lx + 20}" y="${ly + n * 18 + 14}" font-size="11" fill="#eee">${t}</text>`; });
  const k = ly + legend.length * 18 + 14;
  s += `<line x1="${lx}" x2="${lx + 14}" y1="${k + 4}" y2="${k + 4}" stroke="#fff6e0" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx + 20}" y="${k + 8}" font-size="11" fill="#eee">Continuous city (approximate)</text>`;
  s += `<rect x="${lx}" y="${k + 14}" width="14" height="11" fill="url(#hatch)" stroke="#bbb"/><text x="${lx + 20}" y="${k + 24}" font-size="11" fill="#eee">After AD ${year}, not shown</text>`;
  s += `<circle cx="${lx + 7}" cy="${k + 38}" r="4" fill="#f0b64a"/><text x="${lx + 20}" y="${k + 42}" font-size="11" fill="#eee">Region · <tspan fill="#4aa8f0">anchor</tspan> · <tspan fill="#e05ad8">placed by hand</tspan></text>`;
  s += `<line x1="${lx}" x2="${lx + 14}" y1="${k + 56}" y2="${k + 56}" stroke="${lineColour.road}" stroke-width="2"/><text x="${lx + 20}" y="${k + 60}" font-size="11" fill="#eee">Consular road</text>`;
  s += `<line x1="${lx}" x2="${lx + 14}" y1="${k + 74}" y2="${k + 74}" stroke="${lineColour.aqueduct}" stroke-width="7" stroke-dasharray="1.5 4"/><text x="${lx + 20}" y="${k + 78}" font-size="11" fill="#eee">Aqueduct arches</text>`;
  s += `<line x1="${lx}" x2="${lx + 14}" y1="${k + 92}" y2="${k + 92}" stroke="${lineColour.road}" stroke-width="1.6" stroke-dasharray="2 4"/><text x="${lx + 20}" y="${k + 96}" font-size="11" fill="#eee">Gap in the source, road assumed</text>`;
  s += `<text x="${lx}" y="${k + 114}" font-size="10" fill="#aaa">Solid documented, dashed approximate,</text><text x="${lx}" y="${k + 127}" font-size="10" fill="#aaa">dotted illustrative</text></g>`;
  return s + '</svg>\n';
}
