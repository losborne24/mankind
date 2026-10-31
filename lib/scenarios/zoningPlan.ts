import { colourOf, romeZoning, zoneColour, type Zone, type ZoneMarker } from '@/lib/scenarios/zoning';

/**
 * The land-use zoning as a flat, labelled plan (an SVG string), for the in-app plan view and for scripts/context/rome/plot-zoning.mjs.
 * Zones and markers present in `year` are drawn and carry `data-id` so a click can open their evidence; features dated later are grey
 * hatched outlines labelled "not shown". Labels are placed greedily so none overlap: later features, then zones (largest first),
 * then markers, each trying a few offsets; a label with no free place is left out. Pure.
 */
export function zoningPlanSvg(year = 100): string {
  // Square frame: 0.13° of longitude and the same ground distance of latitude round 41.896 N.
  const KX = Math.cos(41.892 * Math.PI / 180), [x0, x1] = [12.42, 12.55], half = (x1 - x0) * KX / 2, [y0, y1] = [41.896 - half, 41.896 + half], W = 1600, H = W;
  const X = (x: number) => (x - x0) / (x1 - x0) * W, Y = (y: number) => (y1 - y) / (y1 - y0) * H, f = (v: number) => v.toFixed(1);
  const present = (d: Zone | ZoneMarker) => d.time.start.year <= year && (d.time.end?.year ?? Infinity) >= year;
  const path = (mp: Zone['multipolygon']) => mp.map(poly => poly.map(r => 'M' + r.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L') + 'Z').join('')).join('');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const { zones, markers, extent, title } = romeZoning, now = zones.filter(present), later = zones.filter(z => !present(z) && z.time.start.year > year);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#26302a"/>`;
  s += `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#ccc" stroke-opacity=".5" stroke-width="2"/></pattern></defs>`;
  for (let x = x0; x <= x1 + 1e-9; x += 0.005) s += `<line x1="${f(X(x))}" x2="${f(X(x))}" y1="0" y2="${H}" stroke="#fff" stroke-opacity=".08"/><text x="${f(X(x))}" y="14" font-size="10" fill="#9aa" text-anchor="middle">${x.toFixed(3)}</text>`;
  for (let y = Math.ceil(y0 * 200) / 200; y <= y1; y += 0.005) s += `<line y1="${f(Y(y))}" y2="${f(Y(y))}" x1="0" x2="${W}" stroke="#fff" stroke-opacity=".08"/><text x="4" y="${f(Y(y) - 3)}" font-size="10" fill="#9aa">${y.toFixed(3)}</text>`;
  for (const z of now) s += `<path data-id="${esc(z.id)}" d="${path(z.multipolygon)}" fill="${colourOf(z)}" fill-opacity="${z.certainty === 'illustrative' ? .68 : .88}" fill-rule="evenodd" stroke="#1b1b1b" stroke-width=".8" stroke-dasharray="${z.certainty === 'illustrative' ? '2 3' : z.certainty === 'approximate' ? '6 3' : ''}"><title>${esc(z.title)}</title></path>`;
  for (const z of later) s += `<path data-id="${esc(z.id)}" d="${path(z.multipolygon)}" fill="url(#hatch)" stroke="#bbb" stroke-width="1.4" stroke-dasharray="4 3"><title>${esc(z.title)} (from ${z.time.start.year}, not shown)</title></path>`;
  s += `<path data-id="${esc(extent.id)}" d="M${extent.ring.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L')}Z" fill="none" stroke="#fff6e0" stroke-width="2" stroke-dasharray="9 6" pointer-events="stroke"><title>${esc(extent.title)}</title></path>`;

  type Box = { x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [], fits = (b: Box) => b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H && !boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const place = (text: string, x: number, y: number, size: number, offsets: [number, number, 'start' | 'middle' | 'end'][], style: string) => {
    const w = text.length * size * 0.56, h = size * 1.15;
    for (const [dx, dy, anchor] of offsets) {
      const left = anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - w : x + dx - w / 2, box = { x0: left - 2, x1: left + w + 2, y0: y + dy - h, y1: y + dy + 3 };
      if (fits(box)) { boxes.push(box); s += `<text x="${f(left)}" y="${f(y + dy)}" font-size="${size}" pointer-events="none" ${style}>${esc(text)}</text>`; return; }
    }
  };
  const shownMarkers = markers.filter(present);
  for (const m of shownMarkers) boxes.push({ x0: X(m.coordinate[0]) - 5, x1: X(m.coordinate[0]) + 5, y0: Y(m.coordinate[1]) - 5, y1: Y(m.coordinate[1]) + 5 });
  const zoneOffsets: [number, number, 'middle'][] = [[0, 4, 'middle'], [0, -12, 'middle'], [0, 18, 'middle'], [-30, 4, 'middle'], [30, 4, 'middle']];
  for (const z of later) place(`${z.short} (from ${z.time.start.year}, not shown)`, X(z.label[0]), Y(z.label[1]), 10, [...zoneOffsets, [0, -26, 'middle'], [0, 32, 'middle']], 'fill="#fff" font-style="italic"');
  for (const z of now.slice().sort((a, b) => b.area - a.area)) place(z.short, X(z.label[0]), Y(z.label[1]), z.area > 4e5 ? 13 : 11, zoneOffsets, 'fill="#111" font-weight="600"');
  for (const m of shownMarkers) {
    const x = X(m.coordinate[0]), y = Y(m.coordinate[1]);
    s += `<circle data-id="${esc(m.id)}" cx="${f(x)}" cy="${f(y)}" r="5" fill="${m.certainty === 'illustrative' ? '#e05ad8' : m.kind === 'region' ? '#f0b64a' : '#4aa8f0'}" stroke="#fff" stroke-width="1.2"><title>${esc(m.title)}</title></circle>`;
    place(m.title.replace(/ \(.*\)$/, ''), x, y, 10, [[7, 4, 'start'], [-7, 4, 'end'], [0, -7, 'middle'], [0, 15, 'middle'], [7, -6, 'start'], [-7, 14, 'end'], [7, 14, 'start'], [-7, -6, 'end'], [0, -18, 'middle'], [0, 26, 'middle']], 'fill="#fff"');
  }

  const legend: [string, string][] = [['Dense housing', colourOf({ housing: 'dense' } as Zone)], ['Hill housing (mixed)', colourOf({ housing: 'mixed' } as Zone)], ['Elite housing', colourOf({ housing: 'elite' } as Zone)],
    ['Roadside ribbons', colourOf({ housing: 'roadside' } as Zone)], ['Monumental / commercial', zoneColour.monumental], ['Horti', zoneColour.horti], ['Port', zoneColour.port], ['Open ground', zoneColour.open], ['Tiber', zoneColour['open-river']]];
  const lx = W - 250, ly = H - 24 - (legend.length + 5) * 18;
  s += `<g pointer-events="none"><rect x="${lx - 10}" y="${ly - 22}" width="250" height="${(legend.length + 5) * 18 + 30}" fill="#111" fill-opacity=".8" rx="6"/><text x="${lx}" y="${ly - 6}" font-size="12" fill="#fff" font-weight="600">${esc(title)}</text>`;
  legend.forEach(([t, c], n) => { s += `<rect x="${lx}" y="${ly + n * 18 + 4}" width="14" height="11" fill="${c}"/><text x="${lx + 20}" y="${ly + n * 18 + 14}" font-size="11" fill="#eee">${t}</text>`; });
  const k = ly + legend.length * 18 + 14;
  s += `<line x1="${lx}" x2="${lx + 14}" y1="${k + 4}" y2="${k + 4}" stroke="#fff6e0" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx + 20}" y="${k + 8}" font-size="11" fill="#eee">Continuous city (approximate)</text>`;
  s += `<rect x="${lx}" y="${k + 14}" width="14" height="11" fill="url(#hatch)" stroke="#bbb"/><text x="${lx + 20}" y="${k + 24}" font-size="11" fill="#eee">After AD ${year}, not shown</text>`;
  s += `<circle cx="${lx + 7}" cy="${k + 38}" r="4" fill="#f0b64a"/><text x="${lx + 20}" y="${k + 42}" font-size="11" fill="#eee">Region · <tspan fill="#4aa8f0">anchor</tspan> · <tspan fill="#e05ad8">placed by hand</tspan></text>`;
  s += `<text x="${lx}" y="${k + 60}" font-size="10" fill="#aaa">Dashed outline approximate, dotted and pale illustrative</text></g>`;
  return s + '</svg>\n';
}
