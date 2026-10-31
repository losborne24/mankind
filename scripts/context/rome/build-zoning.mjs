// Builds the dated land-use zoning of Rome around AD 100 (Stage 1 of the city expansion) as plain data. Works offline and is
// deterministic: the same snapshots give byte-identical output. Never edit the output by hand; see ZONING.md for the reasoning.
//
// Inputs: the Pleiades snapshot written by fetch-zoning-sources.mjs, the Tiber outline already in the Forum Boarium context layer, and the coarse zone outlines below. Those outlines are drawn by hand around Pleiades points at about
// 50-100 m precision, from the general topography in the works cited in SOURCES; nothing is traced from a plan. Where a line is a
// guess the zone says so in its note.
//
// Output: lib/scenarios/fixtures/rome-ad100-zoning.json, longitude/latitude, zones that never overlap (each is cut by every zone
// of higher priority), with an evidence tier, an existence interval and a source note each.
import { readFile, writeFile } from 'node:fs/promises';
import polygonClipping from 'polygon-clipping';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const pleiades = await json('data/history/rome/source/pleiades-zoning.json');
const context = await json('lib/scenarios/fixtures/forum-boarium-context.json');
const tiberSnapshot = await json('data/history/rome/source/osm-tiber.json');
const suburbSnapshot = await json('data/history/rome/source/osm-suburbium.json');
const r6 = v => Math.round(v * 1e6) / 1e6, round = p => [r6(p[0]), r6(p[1])];
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;   // metres per degree at Rome
const pl = key => pleiades.places[key] ?? (() => { throw Error(`Missing Pleiades ${key}`); })();
const P = key => `source:pleiades-${key}`;

// ---- Extent: continuous building around AD 100, drawn by hand at about 150 m precision. It is not derived from any wall line:
// the Aurelian Walls (AD 271-275) are 170 years later and appear nowhere in this data. The east bank and Trastevere are drawn
// separately, each closed along today's bank, and joined by the river between them; short built-up ribbons run out along the
// main roads. Road lines here are approximate axes from the gates; the sourced roads replace them in the suburbium stage.
const tiberRings = context.geometries.find(g => g.id === 'tiber').coordinates, river = tiberRings[0];
const nearest = q => river.reduce((best, p, i) => { const d = Math.hypot((p[0] - q[0]) * KX, (p[1] - q[1]) * KY); return d < best.d ? { i, d } : best; }, { i: 0, d: Infinity }).i;
/** The stretch of today's bank between the points nearest `from` and `to` (the shorter way round the outline), in that order. */
function bank(from, to) {
  const [i, j] = [nearest(from), nearest(to)];
  const arcs = [river.slice(Math.min(i, j), Math.max(i, j) + 1), [...river.slice(Math.max(i, j)), ...river.slice(1, Math.min(i, j) + 1)]];
  const span = arc => Math.max(...arc.map(p => p[1])) - Math.min(...arc.map(p => p[1]));
  const arc = arcs.sort((a, b) => span(a) - span(b))[0];
  return Math.sign(arc.at(-1)[1] - arc[0][1]) === Math.sign(to[1] - from[1]) ? arc : arc.slice().reverse();
}
/** Join ways end to end into closed rings (as in the Forum Boarium context builder). */
function joinRings(ways) {
  ways = ways.map(w => w.slice()); const key = p => p.join(','), out = [];
  while (ways.length) {
    let ring = ways.shift();
    for (let progress = true; progress && key(ring[0]) !== key(ring.at(-1));) {
      progress = false;
      for (let n = 0; n < ways.length; n++) {
        const w = ways[n];
        if (key(w[0]) === key(ring.at(-1))) ring = ring.concat(w.slice(1));
        else if (key(w.at(-1)) === key(ring.at(-1))) ring = ring.concat(w.slice(0, -1).reverse());
        else if (key(w.at(-1)) === key(ring[0])) ring = w.concat(ring.slice(1));
        else if (key(w[0]) === key(ring[0])) ring = w.slice(1).reverse().concat(ring);
        else continue;
        ways.splice(n, 1); progress = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}
// The plan's frame: 0.17° of longitude round the city and the same ground distance of latitude, about 14 km square. The suburbium and
// the Campagna fill it out to its edges.
const FRAME_HALF = 0.17 * Math.cos(LAT * Math.PI / 180) / 2, FRAME = [[12.40, 41.896 - FRAME_HALF], [12.57, 41.896 - FRAME_HALF], [12.57, 41.896 + FRAME_HALF], [12.40, 41.896 + FRAME_HALF], [12.40, 41.896 - FRAME_HALF]];
/** Douglas–Peucker on a line or ring, tolerance in metres. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const d = (p, a, b) => { const dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, px = (p[0] - a[0]) * KX, py = (p[1] - a[1]) * KY, t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - t * dx, py - t * dy); };
  let worst = 0, at = 0;
  for (let n = 1; n < points.length - 1; n++) { const e = d(points[n], points[0], points.at(-1)); if (e > worst) { worst = e; at = n; } }
  return worst <= tolerance ? [points[0], points.at(-1)] : [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}
const polygonOf = e => {
  if (e.type === 'way') return [[simplify(e.geometry, 2)]];
  const outer = joinRings(e.members.filter(m => m.role === 'outer').map(m => m.geometry)), inner = joinRings(e.members.filter(m => m.role === 'inner').map(m => m.geometry));
  return polygonClipping.difference(outer.map(r => [simplify(r, 2)]), ...inner.map(r => [[simplify(r, 2)]]));
};
// The Aniene's lower course is mapped as three unnamed river polygons from the confluence (ways 184762450, 216887342, 216888510), then
// as its own relation; the rest of the river polygons are the Tiber. Simplified at 2 m so the outline is smooth, then clipped to the frame.
const ANIENE_WAYS = new Set([184762450, 216887342, 216888510]);
const fullRiver = polygonClipping.intersection(polygonClipping.union(...tiberSnapshot.elements.filter(e => !ANIENE_WAYS.has(e.id)).map(polygonOf)), [FRAME]);
const aniene = polygonClipping.difference(polygonClipping.intersection(polygonClipping.union(...tiberSnapshot.elements.filter(e => ANIENE_WAYS.has(e.id)).map(polygonOf),
  ...suburbSnapshot.elements.filter(e => e.id === 16025341).map(polygonOf)), [FRAME]), fullRiver);
/** Union of many polygons, pairwise in a tree: one call over hundreds of overlapping shapes overflows polygon-clipping's stack. */
const unionAll = shapes => { let level = shapes.filter(x => x.length); while (level.length > 1) { const next = []; for (let n = 0; n < level.length; n += 2) next.push(n + 1 < level.length ? polygonClipping.union(level[n], level[n + 1]) : level[n]); level = next; } return level[0] ?? []; };
const closed = ring => [[...ring.map(round), round(ring[0])]];
// East bank: up today's bank from the Emporium to the Mausoleum, then clockwise round the Pincian gardens, the Castra Praetoria,
// the Esquiline plateau, the Caelian and the Aventine back to the river below the Emporium.
const eastCore = closed([...bank([12.4714, 41.8742], [12.4747, 41.9070]),
  [12.4775, 41.9085], [12.4800, 41.9090], [12.4830, 41.9095], [12.4870, 41.9104], [12.4920, 41.9110], [12.4975, 41.9104], [12.5015, 41.9086], [12.5045, 41.9078],
  [12.5055, 41.9085], [12.5108, 41.9091], [12.5116, 41.9048], [12.5112, 41.9010], [12.5130, 41.8970], [12.5120, 41.8930], [12.5085, 41.8895], [12.5060, 41.8860],
  [12.5030, 41.8835], [12.4990, 41.8820], [12.4950, 41.8815], [12.4920, 41.8783], [12.4880, 41.8778], [12.4840, 41.8770], [12.4815, 41.8760], [12.4780, 41.8745], [12.4740, 41.8738]]);
// Trastevere: the flat ground between the river and the foot of the Janiculum, from below Porta Settimiana's later site to the Via Portuensis.
const westCore = closed([...bank([12.4692, 41.8933], [12.4702, 41.8752]),
  [12.4688, 41.8752], [12.4678, 41.8785], [12.4665, 41.8820], [12.4658, 41.8860], [12.4660, 41.8895], [12.4668, 41.8925], [12.4682, 41.8945]]);
const riverBetween = polygonClipping.intersection([[river]],   // outer outline only, so Tiber Island stays in the city
  [[[12.46, 41.8738], [12.49, 41.8738], [12.49, 41.8936], [12.46, 41.8936], [12.46, 41.8738]]]);
const core = polygonClipping.union(eastCore, westCore, riverBetween);

// ---- Roads: the consular roads, each drawn along the modern streets that keep its line (OpenStreetMap), simplified at 8 m and kept
// inside the frame. A road's streets are joined into one chain running out from the city: second carriageways and parallel pieces are
// dropped and the chain is joined across jumps that the street's own pieces run alongside; where the named street really breaks off and
// resumes further out (up to 3 km on), the break is kept as a gap, drawn dashed.
// Two links have no modern street and are drawn by hand: the Via Cornelia west from the Pons Neronianus along the north side of the
// circus (Pleiades), and the Via Triumphalis from the bridge to where the modern Via Trionfale begins.
const insideFrame = p => p[0] > FRAME[0][0] && p[0] < FRAME[1][0] && p[1] > FRAME[0][1] && p[1] < FRAME[2][1];
const streets = name => suburbSnapshot.elements.filter(e => e.type === 'way' && e.name === name).map(e => simplify(e.geometry, 8))
  .flatMap(line => { const runs = [[]]; for (const p of line) { if (insideFrame(p)) runs.at(-1).push(round(p)); else if (runs.at(-1).length) runs.push([]); } return runs.filter(r => r.length > 1); });
const PONS_NERONIANUS = round(pl('pons-neronianus').reprPoint), CITY_CENTRE = [12.4885, 41.8925];
const metres = (a, b) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY), lengthOf = line => line.slice(1).reduce((sum, b, n) => sum + metres(line[n], b), 0);
const toLine = (p, line) => Math.min(...line.slice(1).map((b, n) => { const a = line[n], dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, px = (p[0] - a[0]) * KX, py = (p[1] - a[1]) * KY, t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - t * dx, py - t * dy); }));
const densify = (line, step) => line.slice(1).reduce((out, b, n) => { const a = line[n], k = Math.max(1, Math.ceil(metres(a, b) / step)); for (let i = 1; i <= k; i++) out.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]); return out; }, [line[0]]);
/** One road from its pieces: drop pieces that mostly run within 35 m of a longer one, then chain outwards from the city. */
function chain(pieces, maxGap = 3000) {
  const kept = [];
  for (const piece of pieces.slice().sort((a, b) => lengthOf(b) - lengthOf(a))) if (piece.filter(p => kept.some(k => toLine(p, k) < 35)).length / piece.length < 0.6) kept.push(piece);
  if (!kept.length) return { lines: [], gaps: [] };
  const fromCentre = p => metres(p, CITY_CENTRE), nearEnd = piece => Math.min(fromCentre(piece[0]), fromCentre(piece.at(-1)));
  let first = kept.reduce((best, piece) => nearEnd(piece) < nearEnd(best) ? piece : best), rest = kept.filter(piece => piece !== first);
  if (fromCentre(first.at(-1)) < fromCentre(first[0])) first = first.slice().reverse();
  const lines = [first.slice()], gaps = [];
  for (;;) {
    const end = lines.at(-1).at(-1);
    let best = null;
    for (const piece of rest) for (const reversed of [false, true]) {
      const [a, b] = reversed ? [piece.at(-1), piece[0]] : [piece[0], piece.at(-1)], gap = metres(end, a);
      if (gap <= maxGap && fromCentre(b) > fromCentre(end) && (!best || gap < best.gap)) best = { piece, gap, reversed };
    }
    if (!best) break;
    rest = rest.filter(piece => piece !== best.piece);
    const next = best.reversed ? best.piece.slice().reverse() : best.piece;
    // A jump the street's own pieces run alongside (between carriageways, or over a dropped piece) is road; elsewhere it is a gap.
    const covered = best.gap < 1 || densify([end, next[0]], 20).every(p => pieces.some(piece => toLine(p, piece) < 40));
    if (covered) lines.at(-1).push(...(best.gap < 1 ? next.slice(1) : next)); else { gaps.push([end, next[0]]); lines.push(next.slice()); }
  }
  return { lines, gaps };
}
const trionfaleStart = chain(streets('Via Trionfale')).lines[0][0];
const roadDefs = [
  ['via-flaminia', 'Via Flaminia', ['Via Flaminia'], 'approximate', -220, 'Built by Gaius Flaminius in 220 BC; it left the Campus Martius northwards and crossed the Tiber at the Pons Mulvius, 3 km north (Wikipedia). Drawn along today\'s Via Flaminia; the dashed stretch over the river is that crossing, where today\'s bridge (Ponte Milvio) carries another name.', ['source:wikipedia-via-flaminia']],
  ['via-salaria', 'Via Salaria', ['Via Salaria'], 'approximate', -500, 'The salt road to the Sabine country, among the oldest (Wikipedia). Drawn along today\'s Via Salaria.', ['source:wikipedia-via-salaria']],
  ['via-nomentana', 'Via Nomentana', ['Via Nomentana'], 'approximate', -500, 'To Nomentum; it started at the Porta Collina of the Servian wall until the 3rd century (Wikipedia). Drawn along today\'s Via Nomentana.', [P('via-nomentana'), 'source:wikipedia-via-nomentana']],
  ['via-tiburtina', 'Via Tiburtina', ['Via Tiburtina'], 'approximate', -307, 'To Tibur, probably built in 307 BC (Wikipedia). Drawn along today\'s Via Tiburtina.', ['source:wikipedia-via-tiburtina']],
  ['via-labicana', 'Via Labicana', ['Via Labicana', 'Via Casilina'], 'approximate', -400, 'To Labici, leaving the city with the Praenestina at the aqueduct crossing later called Porta Maggiore (Wikipedia). Drawn along today\'s Via Labicana in the city and Via Casilina beyond.', ['source:wikipedia-via-labicana']],
  ['via-praenestina', 'Via Praenestina', ['Via Prenestina'], 'approximate', -400, 'To Praeneste (Wikipedia). Drawn along today\'s Via Prenestina.', ['source:wikipedia-via-praenestina']],
  ['via-latina', 'Via Latina', ['Via Latina'], 'approximate', -400, 'South-east to the Alban hills, lined with tombs (Wikipedia). Drawn along the surviving stretches named Via Latina; much of its line between is not drawn.', ['source:wikipedia-via-latina']],
  ['via-appia', 'Via Appia', ['Via di Porta San Sebastiano', 'Via Appia Antica'], 'documented', -312, 'Begun by Appius Claudius Caecus in 312 BC (Wikipedia). Outside the city the Via Appia Antica keeps the ancient line, with stretches of its paving and the tombs that lined it, so this road is marked documented; inside the later wall it follows Via di Porta San Sebastiano.', ['source:wikipedia-via-appia']],
  ['via-ostiensis', 'Via Ostiensis', ['Via Ostiense'], 'approximate', -400, 'To Ostia along the left bank (Wikipedia). Drawn along today\'s Via Ostiense.', ['source:wikipedia-via-ostiensis']],
  ['via-portuensis', 'Via Portuensis', ['Via Portuense'], 'approximate', 46, 'To Portus, Claudius\'s harbour (begun AD 46), along the right bank (Wikipedia). Drawn along today\'s Via Portuense.', ['source:wikipedia-via-portuensis']],
  ['via-aurelia', 'Via Aurelia', ['Via Aurelia Antica'], 'approximate', -241, 'West along the coast of Etruria, built in the middle Republic (Wikipedia). Drawn along today\'s Via Aurelia Antica over the Janiculum.', ['source:wikipedia-via-aurelia']],
  ['via-triumphalis', 'Via Triumphalis', ['Via Trionfale'], 'approximate', -100, 'From the Pons Neronianus towards Monte Mario (Pleiades), with a necropolis along it. Drawn along today\'s Via Trionfale, which keeps its line north of the Vatican; the link from the bridge to it is drawn by hand and is a guess.', [P('via-triumphalis'), 'source:wikipedia-via-triumphalis'],
    [], [[PONS_NERONIANUS, [12.4600, 41.9040], trionfaleStart]]],
  ['via-cornelia', 'Via Cornelia', [], 'illustrative', 40, 'Ran along the north side of the Circus of Gaius and Nero (Pleiades), perhaps built by Caligula as an approach to the Horti Agrippinae (Wikipedia). No modern street keeps it: the line west from the Pons Neronianus is drawn by hand and is a guess.', [P('via-cornelia'), 'source:wikipedia-via-cornelia'],
    [[PONS_NERONIANUS, [12.4590, 41.9033], [12.4530, 41.9032], [12.4460, 41.9040], [12.4380, 41.9060]]]],
];
const roads = roadDefs.map(([key, title, names, certainty, from, note, sourceIds, hand = [], handGaps = []]) => {
  const { lines, gaps } = chain(names.flatMap(streets));
  return { id: `road:${key}`, kind: 'road', title, certainty, time: { start: { year: from }, end: { year: 600 } }, note: gaps.length || handGaps.length ? `${note} Where the street breaks off, the gap is drawn dashed: the road is taken to run straight on, a guess.` : note,
    sources: sourceIds, lines: [...lines, ...hand.map(line => line.map(round))], gaps: [...gaps, ...handGaps].map(line => line.map(round)) };
});
// Aqueducts. The Aqua Claudia and Anio Novus shared one line of arches into the city at the later Porta Maggiore (Wikipedia). OpenStreetMap
// maps only the standing arches in the Campagna (the ways below; Pleiades cites the first); the link from them to the city is drawn by hand
// through Pleiades' point for the Aqua Claudia. The later Acqua Felice (1586), which OpenStreetMap maps along part of that line, is not used.
const way = id => simplify(suburbSnapshot.elements.find(e => e.id === id).geometry, 2).filter(insideFrame).map(round);
const ARCHES = [781857867, 781857868, 781857869, 781857870, 781857871, 781857872, 781857874, 997532460];
const archLines = ARCHES.map(way).filter(l => l.length > 1), archNorth = archLines.flat().reduce((a, p) => p[1] > a[1] ? p : a);
const PORTA_MAGGIORE = [12.5153, 41.8915];
const aqueducts = [
  { id: 'aqueduct:claudia-arches', kind: 'aqueduct', title: 'Aqua Claudia and Anio Novus · standing arches', certainty: 'documented', time: { start: { year: 52 }, end: { year: 2025 } }, lines: [...archLines, way(128274578)].filter(l => l.length > 1),
    note: 'The arches of the Aqua Claudia that still stand in the Campagna south-east of the city, with the line of the Anio Novus beside them, as mapped in OpenStreetMap (Pleiades cites the main way). Both were begun by Caligula in AD 38 and dedicated by Claudius in 52 (Wikipedia).', sources: [P('aqua-claudia'), P('aqua-anio-novus'), 'source:osm-suburbium', 'source:wikipedia-aqua-claudia', 'source:wikipedia-anio-novus'] },
  { id: 'aqueduct:claudia-route', kind: 'aqueduct', title: 'Aqua Claudia and Anio Novus · arches into the city', certainty: 'approximate', time: { start: { year: 52 }, end: { year: 537 } },
    lines: [[round(archNorth), round(pl('aqua-claudia').reprPoint), [12.5290, 41.8785], [12.5215, 41.8862], PORTA_MAGGIORE]],
    note: 'From the standing arches to the city, the Anio Novus in a channel on top of the Claudia\'s arches, rising to over 30 m as the ground falls (Wikipedia), entering at the later Porta Maggiore. Drawn by hand through Pleiades\' point for the Aqua Claudia; the line between is a guess.', sources: [P('aqua-claudia'), P('aqua-anio-novus'), 'source:wikipedia-aqua-claudia'] },
  { id: 'aqueduct:arcus-neroniani', kind: 'aqueduct', title: 'Arcus Neroniani (Claudia branch to the Caelian and Palatine)', certainty: 'illustrative', time: { start: { year: 64 }, end: { year: 537 } },
    lines: [[PORTA_MAGGIORE, [12.5085, 41.8897], [12.5020, 41.8873], [12.4970, 41.8856], [12.4940, 41.8866], [12.4895, 41.8876]]],
    note: 'Nero extended the Aqua Claudia on arches from Spes Vetus on the Esquiline to the Caelian, and Domitian carried it on across the valley to the Palatine (Wikipedia). Drawn by hand from Porta Maggiore to the Palatine; the line is a guess.', sources: ['source:wikipedia-aqua-claudia'] },
];

// ---- Ribbons along the roads, tapering with distance from the continuous city: 50 m half-width at its edge, 12 m by 2.5 km. Within
// 700 m they count as part of the city; beyond that, to 2.5 km, they are the suburbium's roadside.
const coreRings = core.flatMap(poly => poly);
const insideCore = p => core.some(poly => poly.reduce((c, ring, k) => { let x = false; for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) if ((ring[n][1] > p[1]) !== (ring[m][1] > p[1]) && p[0] < (ring[m][0] - ring[n][0]) * (p[1] - ring[n][1]) / (ring[m][1] - ring[n][1]) + ring[n][0]) x = !x; return k ? c && !x : x; }, false));
const toCore = p => insideCore(p) ? 0 : Math.min(...coreRings.map(r => Math.min(...r.slice(1).map((b, n) => { const a = r[n], dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, px = (p[0] - a[0]) * KX, py = (p[1] - a[1]) * KY, t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - t * dx, py - t * dy); }))));
const NEAR = 700, FAR = 2500, halfWidth = d => d <= NEAR ? 50 - 20 * d / NEAR : 30 - 18 * Math.min(1, (d - NEAR) / (FAR - NEAR));
const segment = (a, b, wa, wb) => { const dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const side = (p, w, s, along) => [p[0] + (-uy * w * s + ux * along) / KX, p[1] + (ux * w * s + uy * along) / KY];
  return closed([side(a, wa, 1, -wa / 2), side(b, wb, 1, wb / 2), side(b, wb, -1, wb / 2), side(a, wa, -1, -wa / 2)]); };
const near = [], far = [];
// Gaps of up to 400 m carry the ribbon on; longer ones do not.
for (const line of roads.filter(r => r.certainty !== 'illustrative').flatMap(r => [...r.lines, ...r.gaps.filter(g => metres(g[0], g[1]) <= 400)])) {
  // Densify to about 100 m so the taper follows distance, not the street's own vertices.
  const dense = line.slice(1).flatMap((b, n) => { const a = line[n], steps = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) / 100)); return Array.from({ length: steps }, (_, k) => [a[0] + (b[0] - a[0]) * (k + 1) / steps, a[1] + (b[1] - a[1]) * (k + 1) / steps]); });
  const pts = [line[0], ...dense], dist = pts.map(toCore);
  for (let n = 1; n < pts.length; n++) {
    const d = (dist[n - 1] + dist[n]) / 2;
    if (d > FAR) continue;
    (d < NEAR ? near : far).push(segment(pts[n - 1], pts[n], halfWidth(dist[n - 1]), halfWidth(dist[n])));
  }
}
const nearRibbons = unionAll(near), attached = nearRibbons.filter(poly => polygonClipping.intersection([poly], core).length);
const extent = polygonClipping.union(core, attached);
if (extent.length !== 1) throw Error(`extent has ${extent.length} pieces`);
const ribbonOnly = polygonClipping.difference(attached, core);
const farRibbons = polygonClipping.difference(unionAll([...far, ...nearRibbons.filter(poly => !attached.includes(poly)).map(poly => [poly])]), extent);

// ---- Sources. Everything here is cited for text or a point; nothing restricted is used for geometry.
const src = (id, title, url, licence) => ({ id, title, url, licence });
const sources = [
  ...Object.entries(pleiades.places).map(([k, p]) => src(P(k), `Pleiades · ${p.title}`, p.uri, pleiades.licence)),
  src('source:osm-tiber', 'OpenStreetMap · Tiber water polygon (relation 5071)', 'https://www.openstreetmap.org/relation/5071', 'ODbL 1.0 · © OpenStreetMap contributors'),
  src('source:osm-tiber-reaches', 'OpenStreetMap · Tiber water polygons upstream and downstream of the city (relations 15909049, 17258409 and 14 ways)', 'https://www.openstreetmap.org/relation/17258409', tiberSnapshot.licence),
  src('source:wikipedia-via-flaminia', 'Wikipedia · Via Flaminia', 'https://en.wikipedia.org/wiki/Via_Flaminia', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-salaria', 'Wikipedia · Via Salaria', 'https://en.wikipedia.org/wiki/Via_Salaria', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-nomentana', 'Wikipedia · Via Nomentana', 'https://en.wikipedia.org/wiki/Via_Nomentana', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-tiburtina', 'Wikipedia · Via Tiburtina', 'https://en.wikipedia.org/wiki/Via_Tiburtina', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-labicana', 'Wikipedia · Via Labicana', 'https://en.wikipedia.org/wiki/Via_Labicana', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-praenestina', 'Wikipedia · Via Praenestina', 'https://en.wikipedia.org/wiki/Via_Praenestina', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-latina', 'Wikipedia · Via Latina', 'https://en.wikipedia.org/wiki/Via_Latina', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-appia', 'Wikipedia · Appian Way', 'https://en.wikipedia.org/wiki/Appian_Way', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-ostiensis', 'Wikipedia · Via Ostiensis', 'https://en.wikipedia.org/wiki/Via_Ostiensis', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-portuensis', 'Wikipedia · Via Portuensis', 'https://en.wikipedia.org/wiki/Via_Portuensis', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-aurelia', 'Wikipedia · Via Aurelia', 'https://en.wikipedia.org/wiki/Via_Aurelia', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-triumphalis', 'Wikipedia · Via Trionfale (the modern road on the Via Triumphalis)', 'https://en.wikipedia.org/wiki/Via_Trionfale', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-via-cornelia', 'Wikipedia · Via Cornelia', 'https://en.wikipedia.org/wiki/Via_Cornelia', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-aqua-claudia', 'Wikipedia · Aqua Claudia (begun AD 38, finished 52)', 'https://en.wikipedia.org/wiki/Aqua_Claudia', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-anio-novus', 'Wikipedia · Aqua Anio Novus', 'https://en.wikipedia.org/wiki/Aqua_Anio_Novus', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-circus-of-nero', 'Wikipedia · Circus of Nero (begun under Caligula, AD 37-41)', 'https://en.wikipedia.org/wiki/Circus_of_Nero', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-vatican-necropolis', 'Wikipedia · Vatican Necropolis (on the slope beside the circus)', 'https://en.wikipedia.org/wiki/Vatican_Necropolis', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-pons-neronianus', 'Wikipedia · Pons Neronianus', 'https://en.wikipedia.org/wiki/Pons_Neronianus', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-castel-sant-angelo', 'Wikipedia · Castel Sant\'Angelo (Hadrian\'s tomb, AD 134-139)', 'https://en.wikipedia.org/wiki/Castel_Sant%27Angelo', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-baths-of-caracalla', 'Wikipedia · Baths of Caracalla (built AD 212-216)', 'https://en.wikipedia.org/wiki/Baths_of_Caracalla', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-caecilia-metella', 'Wikipedia · Tomb of Caecilia Metella (third mile of the Via Appia, c. 30-10 BC)', 'https://en.wikipedia.org/wiki/Tomb_of_Caecilia_Metella', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-roman-campagna', 'Wikipedia · Roman Campagna', 'https://en.wikipedia.org/wiki/Roman_Campagna', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-aniene', 'Wikipedia · Aniene (the ancient Anio)', 'https://en.wikipedia.org/wiki/Aniene', 'CC BY-SA 4.0 · text read'),
  src('source:osm-suburbium', 'OpenStreetMap · streets on the consular roads, Aqua Claudia ways 98554683 and 781857867, Anio Novus way 128274578, Aniene relation 16025341', 'https://www.openstreetmap.org/way/781857867', suburbSnapshot.licence),
  src('source:wikipedia-quirinal', 'Wikipedia · Quirinal Hill (temples of Quirinus, Sancus and others)', 'https://en.wikipedia.org/wiki/Quirinal_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-esquiline', 'Wikipedia · Esquiline Hill (favoured by the aristocracy for their houses)', 'https://en.wikipedia.org/wiki/Esquiline_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-regions', 'Wikipedia · Fourteen regions of Augustan Rome', 'https://en.wikipedia.org/wiki/Fourteen_regions_of_Augustan_Rome', 'CC BY-SA 4.0 · text read for the regions and their contents'),
  src('source:wikipedia-subura', 'Wikipedia · Subura ("a vast and populous neighborhood")', 'https://en.wikipedia.org/wiki/Subura', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-aventine', 'Wikipedia · Aventine Hill (imperial era: aristocratic residences, Trajan\'s private house)', 'https://en.wikipedia.org/wiki/Aventine_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-caelian', 'Wikipedia · Caelian Hill (a fashionable residential district of the wealthy)', 'https://en.wikipedia.org/wiki/Caelian_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-forum-boarium', 'Wikipedia · Forum Boarium (cattle market, original docks, intense commercial activity)', 'https://en.wikipedia.org/wiki/Forum_Boarium', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-velabrum', 'Wikipedia · Velabrum (the valley joining the Forum and the Forum Boarium; its edges are unclear)', 'https://en.wikipedia.org/wiki/Velabrum', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-baths-of-trajan', 'Wikipedia · Baths of Trajan (over the Domus Aurea wing burned in AD 104; dedicated 109)', 'https://en.wikipedia.org/wiki/Baths_of_Trajan', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-trajans-forum', 'Wikipedia · Trajan\'s Forum (the last imperial forum; dedicated AD 112)', 'https://en.wikipedia.org/wiki/Trajan%27s_Forum', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-baths-of-agrippa', 'Wikipedia · Baths of Agrippa (with the Stagnum Agrippae lake and the Euripus canal to the Tiber)', 'https://en.wikipedia.org/wiki/Baths_of_Agrippa', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-campus-martius', 'Wikipedia · Campus Martius (insulae and villas encroached from Sulla on; crowded by the Flavians)', 'https://en.wikipedia.org/wiki/Campus_Martius', 'CC BY-SA 4.0 · text read'),
  src('source:lanciani-fur', 'Lanciani, Forma Urbis Romae (1893-1901), general layout', 'https://commons.wikimedia.org/wiki/Category:Forma_Urbis_Romae_(Lanciani)', 'Public domain (published 1901) · consulted for layout, no plate traced for these zones'),
  src('source:platner-1929', 'Platner & Ashby, A Topographical Dictionary of Ancient Rome (1929): Horti, Subura, Campus Martius, Emporium', 'https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Roma/Rome/_Texts/PLATOP*/home.html', 'Public domain (published 1929) · text read'),
  src('source:severan-plan', 'Severan Marble Plan (Forma Urbis Romae, AD 203-211), via the Stanford Digital FUR Project', 'https://formaurbis.stanford.edu/', 'Reference only: later than AD 100 and not licensed for derived geometry; nothing traced'),
  src('source:atlas-ancient-rome', 'Carandini (ed.), The Atlas of Ancient Rome (Princeton, 2017)', 'https://press.princeton.edu/books/hardcover/9780691163475/the-atlas-of-ancient-rome', 'Copyright · reference only, nothing traced'),
];


// ---- Zones. Coordinates are [longitude, latitude], drawn coarsely; anything that reaches into the river or past the extent is cut.
// `interval` is the span over which the zone, as drawn, is defended as a description of the city; the scene date is AD 100.
// A zone whose interval starts after AD 100 is kept so the date filter can name it as left out; it never cuts the zones of AD 100.
const regions = ['regio-i', 'regio-ii', 'regio-iii', 'regio-iv', 'regio-v', 'regio-vi', 'regio-vii', 'regio-viii', 'regio-ix', 'regio-x', 'regio-xi', 'regio-xii', 'regio-xiii', 'regio-xiv'].map(P);
const zone = (id, use, title, certainty, interval, outline, note, sourceIds, extra = {}) => ({ id, use, title, certainty, time: { start: { year: interval[0] }, end: { year: interval[1] } }, outline, note, sources: sourceIds, ...extra });
const GUESS = 'The outline is drawn by hand at about 100 m precision and its edges are a guess.';
const drawn = [
  // Monumental, public and commercial
  zone('zone:forum-palatine', 'monumental', 'Capitoline, Forum Romanum, Palatine, Colosseum valley and Circus Maximus', 'approximate', [80, 104],
    [[12.4797, 41.8946], [12.4838, 41.8950], [12.4865, 41.8952], [12.4882, 41.8947], [12.4893, 41.8935], [12.4912, 41.8922], [12.4940, 41.8920], [12.4952, 41.8902],
      [12.4934, 41.8884], [12.4905, 41.8872], [12.4903, 41.8848], [12.4890, 41.8834], [12.4815, 41.8862], [12.4810, 41.8876], [12.4836, 41.8885], [12.4846, 41.8903],
      [12.4826, 41.8907], [12.4812, 41.8912], [12.4796, 41.8926]],
    `Temples, basilicas, imperial fora (Caesar, Augustus, the Templum Pacis, Nerva's forum of AD 97), the palaces on the Palatine, the Flavian amphitheatre (AD 80) and the Circus Maximus, around Pleiades points for each. The saddle where Trajan's Forum was built from about AD 106 is outside this zone (see the Trajan's Forum zone, left out at AD 100). ${GUESS}`,
    [P('forum-romanum'), P('forum-iulium'), P('templum-pacis'), P('amphitheatrum-flavium'), P('jupiter-capitolinus'), P('palatine'), P('circus-maximus'), P('regio-viii'), P('regio-x'), P('regio-xi'), 'source:wikipedia-regions', 'source:lanciani-fur']),
  zone('zone:forum-boarium', 'monumental', 'Forum Boarium and Velabrum: temples, markets and the river harbour', 'approximate', [-200, 300],
    [[12.4793, 41.8899], [12.4800, 41.8906], [12.4822, 41.8909], [12.4843, 41.8906], [12.4847, 41.8890], [12.4832, 41.8878], [12.4812, 41.8871], [12.4795, 41.8869], [12.4789, 41.8880]],
    `The cattle market by the original docks of Rome, with the temples of Portunus and Hercules Victor, the Ara Maxima, the Portus Tiberinus and the Velabrum valley up to the Forum: a place of temples, markets and trade more than of housing. The Velabrum's own edges are unclear (Wikipedia); ${GUESS.toLowerCase()}`,
    ['source:wikipedia-forum-boarium', 'source:wikipedia-velabrum', P('regio-xi'), P('regio-viii'), 'source:platner-1929', 'source:lanciani-fur']),
  zone('zone:oppian', 'monumental', 'Oppian: Baths of Titus and the Domus Aurea pavilion', 'approximate', [80, 104],
    [[12.4925, 41.8940], [12.4990, 41.8938], [12.4992, 41.8915], [12.4945, 41.8912], [12.4925, 41.8920]],
    `The Baths of Titus (AD 80) and the Oppian wing of Nero's Domus Aurea, still in use by the Flavians until it burned in AD 104. The Baths of Trajan were built over it after the fire and dedicated in 109, so they are not shown at AD 100. ${GUESS}`,
    [P('regio-iii'), 'source:wikipedia-baths-of-trajan', 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:claudianum', 'monumental', 'Caelian: Temple of the Deified Claudius', 'approximate', [75, 300],
    [[12.4920, 41.8883], [12.4952, 41.8883], [12.4952, 41.8857], [12.4920, 41.8857]],
    `The terrace of the Temple of Claudius, begun after AD 54 and finished under Vespasian (Wikipedia). Placed by the Regio II record; its size here is a round figure. ${GUESS}`,
    [P('regio-ii'), 'source:wikipedia-caelian', 'source:platner-1929']),
  zone('zone:circus-flaminius', 'monumental', 'Forum Holitorium, Theatre of Marcellus and the Circus Flaminius porticoes', 'approximate', [-13, 300],
    [[12.4752, 41.8936], [12.4800, 41.8943], [12.4813, 41.8925], [12.4808, 41.8906], [12.4795, 41.8900], [12.4779, 41.8909], [12.4753, 41.8925]],
    `The vegetable market and its temples, the Theatre of Marcellus (13 BC), the Porticus Octaviae and the Circus Flaminius, a public square ringed by temples and porticoes. The circus's exact line is disputed; ${GUESS.toLowerCase()}`,
    [P('theatrum-marcelli'), P('forum-holitorium'), P('circus-flaminius'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:campus-centre', 'monumental', 'Central Campus Martius: Pantheon, Saepta, Baths of Agrippa and lake, Stadium of Domitian, Theatre of Pompey, porticoes up to the sundial', 'approximate', [86, 300],
    [[12.4711, 41.8976], [12.4716, 41.9006], [12.4745, 41.9016], [12.4772, 41.9022], [12.4800, 41.9022], [12.4806, 41.8996], [12.4802, 41.8962], [12.4787, 41.8947], [12.4762, 41.8944], [12.4733, 41.8943], [12.4716, 41.8948]],
    `Public buildings packed close: Agrippa's Pantheon and baths with their lake (Stagnum Agrippae), the Saepta Julia, the temples of the Largo Argentina, Pompey's theatre and portico, Domitian's stadium and odeum (after AD 86), and the porticoes between the Pantheon and the Horologium. Extended north to meet the Mausoleum zone; the northern edge is new and approximate. ${GUESS}`,
    [P('pantheon'), P('saepta-iulia'), P('stadium-domitiani'), P('theatrum-pompei'), P('horologium-augusti'), P('campus-martius'), P('regio-ix'), 'source:wikipedia-baths-of-agrippa', 'source:platner-1929']),
  zone('zone:campus-north', 'monumental', 'Northern Campus Martius: Mausoleum of Augustus, Ara Pacis and the sundial', 'approximate', [-9, 300],
    [[12.4748, 41.9076], [12.4778, 41.9076], [12.4800, 41.9040], [12.4800, 41.9022], [12.4772, 41.9022], [12.4748, 41.9044]],
    `Augustus's mausoleum and its park, the Ara Pacis (9 BC) and the Horologium, placed from their Pleiades points. ${GUESS}`,
    [P('mausoleum-augusti'), P('ara-pacis'), P('horologium-augusti'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:castra-praetoria', 'monumental', 'Castra Praetoria (camp of the Praetorian Guard)', 'approximate', [23, 312],
    [[12.5057, 41.9083], [12.5106, 41.9089], [12.5113, 41.9050], [12.5064, 41.9043]],
    `The walled camp built under Tiberius (AD 23) on the plateau beyond the Viminal. Placed as a rectangle of about 440 by 380 m; ${GUESS.toLowerCase()}`,
    [P('regio-vi'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:tiber-island', 'monumental', 'Tiber Island: sanctuary of Aesculapius', 'approximate', [-291, 2025],
    [[12.4758, 41.8907], [12.4772, 41.8917], [12.4794, 41.8906], [12.4786, 41.8896], [12.4768, 41.8898]],
    'The island and its sanctuary (temple of Aesculapius, 291 BC; temple of Faunus, 196 BC). The island is today\'s outline; its ancient shore is not traced, so the edge is a guess.',
    [P('regio-xiv'), 'source:platner-1929', 'source:osm-tiber']),
  // Later than AD 100: kept for the date filter only.
  zone('zone:baths-of-trajan', 'monumental', 'Baths of Trajan (built after the fire of AD 104, opened 109)', 'approximate', [104, 537],
    [[12.4940, 41.8952], [12.4995, 41.8948], [12.4998, 41.8915], [12.4945, 41.8912]],
    `Built over the Domus Aurea wing after the fire of AD 104 and dedicated in July 109 (Wikipedia), so not standing at AD 100. ${GUESS}`,
    ['source:wikipedia-baths-of-trajan', P('regio-iii')], { later: true, dateNote: 'built from 104, opened 109' }),
  zone('zone:forum-of-trajan', 'monumental', "Trajan's Forum and Markets (construction from c. AD 106, dedicated 112)", 'approximate', [106, 600],
    [[12.4828, 41.8948], [12.4850, 41.8970], [12.4868, 41.8962], [12.4862, 41.8947], [12.4842, 41.8942]],
    `The last imperial forum, cut into the saddle between the Capitoline and the Quirinal from about AD 106 and dedicated in 112, so not built at AD 100. What stood on the saddle before is uncertain; it falls to housing. ${GUESS}`,
    ['source:wikipedia-trajans-forum', P('regio-viii')], { later: true, dateNote: 'construction from c. 106, dedicated 112' }),
  zone('zone:baths-of-caracalla', 'monumental', 'Baths of Caracalla (built c. AD 212-216)', 'approximate', [212, 537],
    [[12.4904, 41.8804], [12.4944, 41.8804], [12.4944, 41.8774], [12.4904, 41.8774]],
    `Built between about AD 212 and 216 (Wikipedia), so not standing at AD 100; at AD 100 the site lies in the roadside and housing zones. The enclosure is a rectangle of about 330 by 330 m round the Pleiades point. ${GUESS}`,
    ['source:wikipedia-baths-of-caracalla', P('thermae-antoninianae')], { later: true, dateNote: 'built c. 212-216' }),
  // Port and warehouses
  zone('zone:emporium', 'port', 'Emporium, Porticus Aemilia and the horrea below the Aventine', 'approximate', [-193, 300],
    [[12.4786, 41.8868], [12.4775, 41.8850], [12.4762, 41.8840], [12.4748, 41.8830], [12.4733, 41.8820], [12.4720, 41.8810], [12.4709, 41.8800], [12.4702, 41.8790], [12.4700, 41.8770], [12.4706, 41.8750], [12.4716, 41.8725],
      [12.4760, 41.8722], [12.4805, 41.8755], [12.4790, 41.8770], [12.4778, 41.8790], [12.4772, 41.8815], [12.4778, 41.8840], [12.4792, 41.8862], [12.4795, 41.8868]],
    'The river port on the plain south of the Aventine: the Emporium quay (Pleiades point), the Porticus Aemilia warehouse (193 BC) and the horrea (Galbana, Lolliana and others) between it and the hill. The amphora dump of Monte Testaccio was growing here; it is not modelled. ' + GUESS,
    [P('emporium'), P('porticus-aemilia'), P('regio-xiii'), 'source:platner-1929', 'source:lanciani-fur']),
  zone('zone:trastevere-river', 'port', 'Trastevere riverfront', 'illustrative', [0, 200],
    [[12.4793, 41.8890], [12.4796, 41.8875], [12.4786, 41.8860], [12.4762, 41.8840], [12.4733, 41.8820], [12.4709, 41.8800], [12.4700, 41.8780], [12.4699, 41.8760],
      [12.4687, 41.8760], [12.4686, 41.8780], [12.4694, 41.8805], [12.4718, 41.8825], [12.4746, 41.8845], [12.4770, 41.8865], [12.4778, 41.8885], [12.4776, 41.8893]],
    'A band about 100 m deep along the west bank south of the island, where landing places and storehouses for the river traffic are likely but not mapped. Its depth and extent are a guess.',
    [P('regio-xiv'), 'source:wikipedia-regions']),
  // Horti (estate gardens)
  zone('zone:collis-hortorum', 'horti', 'Pincian (Collis Hortorum): Horti Luculliani, Sallustiani and others', 'approximate', [-60, 300],
    [[12.4788, 41.9122], [12.4840, 41.9140], [12.4960, 41.9125], [12.5020, 41.9107], [12.5026, 41.9066], [12.4986, 41.9046], [12.4930, 41.9050], [12.4880, 41.9060], [12.4830, 41.9057], [12.4800, 41.9074]],
    `The hill of gardens: the Horti Luculliani above the Campus and the imperial Horti Sallustiani in the valley towards the Quirinal. Mostly gardens, pavilions and a few great houses. ${GUESS}`,
    [P('horti-luculliani'), P('horti-sallustiani'), P('regio-vi'), P('regio-vii'), 'source:platner-1929']),
  zone('zone:esquiline-horti', 'horti', 'Esquiline: Horti Maecenatis and Lamiani', 'approximate', [-30, 300],
    [[12.4998, 41.8962], [12.5040, 41.8990], [12.5090, 41.8975], [12.5100, 41.8930], [12.5060, 41.8905], [12.5010, 41.8922]],
    `The gardens laid out over the old Esquiline cemetery beyond the Servian agger (Maecenas's, then imperial; the Lamian gardens beside them), placed by their Pleiades points. ${GUESS}`,
    [P('horti-maecenatis'), P('horti-lamiani'), P('regio-v'), 'source:platner-1929']),
  zone('zone:esquiline-plateau', 'horti', 'Esquiline and Viminal plateau', 'illustrative', [0, 200],
    [[12.5030, 41.9040], [12.5110, 41.9042], [12.5165, 41.8960], [12.5150, 41.8898], [12.5100, 41.8930], [12.5090, 41.8975], [12.5040, 41.8990], [12.5000, 41.9010]],
    'The outer plateau between the Castra Praetoria and the aqueducts. Suburban gardens and villas are likely; nothing specific is mapped here. The extent is a guess.',
    [P('regio-v'), P('regio-vi'), 'source:wikipedia-regions']),
  zone('zone:caelian-east', 'horti', 'Eastern Caelian: great houses and gardens', 'illustrative', [0, 200],
    [[12.4985, 41.8900], [12.5070, 41.8895], [12.5105, 41.8855], [12.5070, 41.8822], [12.4990, 41.8840]],
    'The eastern Caelian, towards the later Lateran, was a quarter of large houses with gardens (the house of the Laterani among them). The extent and the share of garden are guesses.',
    [P('regio-ii'), 'source:wikipedia-caelian', 'source:platner-1929']),
  // Open ground
  zone('zone:campus-river', 'open', 'Campus Martius by the river bend: Trigarium and Tarentum', 'approximate', [-17, 300],
    [[12.4690, 41.8950], [12.4711, 41.8960], [12.4716, 41.9006], [12.4740, 41.9030], [12.4725, 41.9045], [12.4650, 41.9022], [12.4618, 41.8990], [12.4645, 41.8950]],
    `The open ground inside the river bend: the Trigarium exercise ground and the Tarentum, where the altar of Dis and Proserpina was used for the Secular Games (17 BC, AD 88), with the Euripus canal from Agrippa's lake. From Sulla on, insulae and villas encroached on the Campus (Wikipedia), so some building stood here too; the extent and the share left open are approximate. ${GUESS}`,
    [P('campus-martius'), P('regio-ix'), 'source:wikipedia-campus-martius', 'source:wikipedia-baths-of-agrippa', 'source:platner-1929']),
];
// Low-density elite housing: drawn on the two hills the sources describe that way; the rest of the housing is dense.
const elite = {
  aventine: closed([[12.4790, 41.8862], [12.4815, 41.8862], [12.4860, 41.8840], [12.4878, 41.8810], [12.4880, 41.8785], [12.4840, 41.8770], [12.4800, 41.8768], [12.4778, 41.8795], [12.4775, 41.8830]]),
  caelian: closed([[12.4912, 41.8890], [12.4990, 41.8897], [12.4997, 41.8845], [12.4950, 41.8828], [12.4912, 41.8843]]),
};
// Mixed hill housing: the Quirinal, Viminal, upper Esquiline and the Pincian slope, between the dense valleys and the gardens.
const hills = closed([[12.4838, 41.8995], [12.4870, 41.8985], [12.4935, 41.8990], [12.4965, 41.8962], [12.5000, 41.8945], [12.5040, 41.8990], [12.5030, 41.9040],
  [12.4990, 41.9048], [12.4930, 41.9050], [12.4880, 41.9062], [12.4825, 41.9058], [12.4815, 41.9030], [12.4825, 41.9000]]);

// ---- Resolve: river first, then each zone in priority order, every one cut by everything above it; housing is what is left.
const priority = ['open-river', 'monumental', 'necropolis', 'port', 'horti', 'open', 'residential', 'suburban', 'campagna'];
const areaOf = mp => mp.reduce((sum, poly) => sum + poly.reduce((s, ring, k) => { let a = 0; for (let n = 0; n < ring.length - 1; n++) a += ring[n][0] * ring[n + 1][1] - ring[n + 1][0] * ring[n][1]; return s + (k ? -1 : 1) * Math.abs(a / 2) * KX * KY; }, 0), 0);
const water = fullRiver;
let taken = water;
const resolved = [];
const keep = mp => mp.filter(poly => areaOf([poly]) > 400);   // drop slivers left by the cuts
resolved.push({ id: 'zone:tiber', use: 'open-river', ring: 'river', title: 'Tiber', certainty: 'approximate', time: { start: { year: -753 }, end: { year: 2025 } }, multipolygon: water,
  note: 'Today\'s channel (OpenStreetMap), standing in for the ancient river, which was wider and had no embankments (begun 1876). Drawn across the whole plan, inside and outside the city, simplified at 2 m; the 3D water uses the urban stretch only.', sources: ['source:osm-tiber', 'source:osm-tiber-reaches'] });
resolved.push({ id: 'zone:aniene', use: 'open-river', ring: 'river', title: 'Aniene (Anio) to its confluence with the Tiber', certainty: 'approximate', time: { start: { year: -753 }, end: { year: 2025 } }, multipolygon: keep(aniene),
  note: 'Today\'s channel (OpenStreetMap: three river polygons from the confluence, then the Aniene relation), standing in for the ancient Anio; the confluence was controlled by Antemnae (Wikipedia). Its ancient course may have differed.', sources: ['source:osm-tiber-reaches', 'source:osm-suburbium', 'source:wikipedia-aniene'] });
for (const use of ['monumental', 'port', 'horti', 'open']) for (const z of drawn.filter(z => z.use === use)) {
  const outline = [[[...z.outline, z.outline[0]]]];
  const shape = keep(polygonClipping.difference(polygonClipping.intersection(extent, outline), z.later ? water : taken, ...(z.use === 'open' ? [attached] : [])));
  if (!z.later) taken = polygonClipping.union(taken, shape);
  const { outline: _o, later: _l, ...rest } = z; void _o; void _l;
  resolved.push({ ...rest, ring: 'city', multipolygon: shape });
}
// Housing: the remainder, in four classes. Roadside ribbons outside the core; low-density elite on the Aventine and Caelian;
// Trastevere; dense on the east bank.
const rest = keep(polygonClipping.difference(extent, taken));
const roadside = keep(polygonClipping.intersection(rest, ribbonOnly)), inCore = polygonClipping.difference(rest, ribbonOnly);
const eliteShape = keep(polygonClipping.intersection(inCore, elite.aventine, ...[]).concat(polygonClipping.intersection(inCore, elite.caelian)));
const notElite = polygonClipping.difference(inCore, elite.aventine, elite.caelian);
const hillShape = keep(polygonClipping.intersection(notElite, hills)), valleys = polygonClipping.difference(notElite, hills);
const residential = [
  { id: 'zone:residential-dense', cls: 'dense', title: 'Dense housing: the valleys of the east bank (Subura, Argiletum, Via Lata, the Circus Maximus side)', shape: keep(polygonClipping.difference(valleys, westCore)), density: 1, certainty: 'approximate',
    note: 'Blocks of flats over shops, packed close. The Subura was "a vast and populous neighborhood" (Wikipedia) in the valley below the Esquiline, Viminal and Quirinal; the same dense fabric is attested along the Via Lata. The zone is what the others leave in the valleys, so its edges are theirs: approximate.',
    sources: [...regions.filter(id => !/regio-(ii|xiii|xiv)$/.test(id)), 'source:wikipedia-subura', 'source:wikipedia-regions', 'source:platner-1929'] },
  { id: 'zone:residential-hills', cls: 'mixed', title: 'Mixed housing on the hills: Quirinal, Viminal, upper Esquiline, Pincian slope', shape: keep(polygonClipping.difference(hillShape, westCore)), density: 0.6, certainty: 'illustrative',
    note: 'Between the dense valleys and the gardens: temples (Quirinus, Sancus and others on the Quirinal), houses of the well-off (the Esquiline was favoured by the aristocracy for their houses) and blocks of flats. Wikipedia supports the mix but not its share or extent; the outline of the hills is drawn by hand and is a guess.',
    sources: [P('regio-vi'), P('regio-v'), P('regio-iv'), 'source:wikipedia-quirinal', 'source:wikipedia-esquiline'] },
  { id: 'zone:residential-elite', cls: 'elite', title: 'Low-density elite housing: Aventine and Caelian', shape: eliteShape, density: 0.35, certainty: 'approximate',
    note: 'Large houses (domus) with gardens and fewer blocks of flats. In the imperial era the Aventine became the seat of aristocratic residences, among them Trajan\'s own house before he became emperor; the Caelian was a fashionable residential district of the wealthy (Wikipedia). The hill outlines are drawn by hand; their edges are a guess.',
    sources: [P('regio-xiii'), P('regio-ii'), 'source:wikipedia-aventine', 'source:wikipedia-caelian'] },
  { id: 'zone:residential-trastevere', cls: 'dense', title: 'Housing: Trastevere (Regio XIV)', shape: keep(polygonClipping.intersection(notElite, westCore)), density: 0.6, certainty: 'approximate',
    note: 'Across the river: workshops, flats and immigrant communities on the flat ground below the Janiculum, generally less dense than the east-bank core. The zone is what the others leave there, so its edges are theirs: approximate.',
    sources: [P('regio-xiv'), 'source:wikipedia-regions', 'source:platner-1929'] },
  { id: 'zone:residential-roadside', cls: 'roadside', title: 'Roadside building along the main roads out of the city', shape: roadside, density: 0.45, certainty: 'illustrative',
    note: 'Shops, inns, workshops and tombs along the consular roads within about 700 m of the continuous city, narrowing from 100 m to 60 m wide with distance. The roads are sourced (see each road); the ribbons and their width are a guess.',
    sources: ['source:osm-suburbium', 'source:wikipedia-regions', 'source:platner-1929'] },
];
for (const r of residential) resolved.push({ id: r.id, use: 'residential', ring: 'city', housing: r.cls, title: r.title, certainty: r.certainty, time: { start: { year: 64 }, end: { year: 200 } }, density: r.density, multipolygon: r.shape,
  note: `${r.note} Dated from the rebuilding after the fire of AD 64.`, sources: r.sources });

// ---- Suburbium: named places on the right bank first, then the roadside ribbons, the belt of villas and gardens between the roads
// (about 2.5 km beyond the continuous city) and the Campagna out to the frame. Brickworks, clay pits and market gardens are not drawn:
// no source used here places them.
const suburbDrawn = [
  zone('zone:circus-vaticanus', 'monumental', 'Circus of Gaius and Nero (Vatican circus)', 'approximate', [40, 320],
    [[12.4500, 41.9018], [12.4568, 41.9018], [12.4568, 41.9009], [12.4500, 41.9009]],
    `Begun under Caligula (AD 37-41) and completed under Claudius, in the gardens of Agrippina, with the obelisk now in St Peter's Square on its spina (Wikipedia, Pleiades). Placed as a rectangle about 560 by 100 m round the Pleiades point, the axis east-west; ${GUESS.toLowerCase()}`,
    [P('circus-gaii-et-neronis'), P('vatican-obelisk'), 'source:wikipedia-circus-of-nero']),
  zone('zone:vatican-necropolis', 'necropolis', 'Vatican necropolis (tombs on the slope beside the circus)', 'approximate', [-50, 330],
    [[12.4500, 41.9019], [12.4560, 41.9019], [12.4560, 41.9031], [12.4500, 41.9031]],
    `A burial ground on the southern slope of the Vatican hill, beside the circus and along the Via Cornelia (Wikipedia). Its extent here is a guess.`,
    ['source:wikipedia-vatican-necropolis', P('vaticanus-ager')]),
  zone('zone:horti-domitiae', 'horti', 'Horti Domitiae (gardens of Domitia)', 'approximate', [70, 140],
    [[12.4600, 41.9055], [12.4640, 41.9082], [12.4710, 41.9078], [12.4712, 41.9040], [12.4680, 41.9020], [12.4648, 41.9028]],
    `The gardens of Domitia Longina, Domitian's wife, in the river bend where Hadrian's mausoleum was later built (Pleiades). Pleiades gives no location of its own; ${GUESS.toLowerCase()}`,
    [P('horti-domitiae'), P('mausoleum-hadriani')]),
  zone('zone:horti-agrippinae', 'horti', 'Horti Agrippinae (gardens of Agrippina) on the Vatican plain', 'approximate', [20, 200],
    [[12.4440, 41.9048], [12.4600, 41.9054], [12.4645, 41.9028], [12.4665, 41.8995], [12.4675, 41.8962], [12.4665, 41.8946], [12.4610, 41.8950], [12.4540, 41.8972], [12.4470, 41.8992]],
    `Extensive gardens on the right bank, first owned by Agrippina the Elder and then imperial, with the circus inside them (Pleiades). Pleiades gives no location of its own; ${GUESS.toLowerCase()}`,
    [P('horti-agrippinae'), P('vaticanus-ager'), 'source:wikipedia-circus-of-nero']),
  zone('zone:mausoleum-hadriani', 'monumental', "Hadrian's Mausoleum (construction from AD 134, finished 139)", 'approximate', [134, 2025],
    [[12.4658, 41.9034], [12.4670, 41.9034], [12.4670, 41.9026], [12.4658, 41.9026]],
    `Built between AD 134 and 139 in the gardens of Domitia (Wikipedia), so not standing at AD 100. A square of about 90 m round the Pleiades point. ${GUESS}`,
    [P('mausoleum-hadriani'), 'source:wikipedia-castel-sant-angelo'], { later: true, dateNote: 'construction from 134, finished 139' }),
];
let suburbTaken = polygonClipping.union(extent, fullRiver, aniene);
for (const z of suburbDrawn) {
  const shape = keep(polygonClipping.difference(polygonClipping.intersection([FRAME], [[[...z.outline, z.outline[0]]]]), z.later ? fullRiver : suburbTaken));
  if (!z.later) suburbTaken = polygonClipping.union(suburbTaken, shape);
  const { outline: _o, later: _l, ...rest } = z; void _o; void _l;
  resolved.push({ ...rest, ring: 'suburbium', multipolygon: shape });
}
// Tombs along the Via Appia: from the edge of the city past the Tomb of Caecilia Metella (third mile), 90 m wide.
const CAECILIA = round(pl('caecilia-metella').reprPoint), appia = roads.find(r => r.id === 'road:via-appia');
const appiaPath = [...appia.lines.flat()], cmAt = appiaPath.reduce((best, p, n) => metres(p, CAECILIA) < metres(appiaPath[best], CAECILIA) ? n : best, 0);
const appiaOut = densify(appiaPath.slice(0, cmAt + 1), 50), beyond = densify(appiaPath.slice(cmAt), 50).filter((p, n, all) => lengthOf(all.slice(0, n + 1)) < 400);
const tombPath = [...appiaOut, ...beyond.slice(1)].filter(p => toCore(p) > 0);
const appiaTombs = keep(polygonClipping.difference(polygonClipping.intersection(unionAll(tombPath.slice(1).map((b, n) => segment(tombPath[n], b, 45, 45))), [FRAME]), suburbTaken));
suburbTaken = polygonClipping.union(suburbTaken, appiaTombs);
resolved.push({ id: 'zone:via-appia-tombs', use: 'necropolis', ring: 'suburbium', density: 0.3, title: 'Tombs along the Via Appia', certainty: 'approximate', time: { start: { year: -300 }, end: { year: 400 } }, multipolygon: appiaTombs,
  note: 'The Appian Way was lined with tombs outside the city; the Tomb of Caecilia Metella at the third mile (built c. 30-10 BC) is one of the best preserved (Wikipedia). Drawn along the road from the edge of the continuous city to about 400 m past that tomb, 90 m wide: the line is the road\'s, the width and length are a guess.',
  sources: ['source:wikipedia-via-appia', 'source:wikipedia-caecilia-metella', P('caecilia-metella')] });
const suburbRoadside = keep(polygonClipping.difference(polygonClipping.intersection(farRibbons, [FRAME]), suburbTaken));
suburbTaken = polygonClipping.union(suburbTaken, suburbRoadside);
resolved.push({ id: 'zone:suburb-roadside', use: 'residential', housing: 'roadside', ring: 'suburbium', density: 0.2, title: 'Suburbium · tombs, inns, workshops and small clusters along the roads', certainty: 'illustrative',
  time: { start: { year: 0 }, end: { year: 300 } }, multipolygon: suburbRoadside,
  note: 'Along each consular road from about 700 m to 2.5 km beyond the continuous city, narrowing from 60 m to 25 m wide: tombs, inns, workshops and small clusters of houses, as the tomb-lined Via Appia and Via Latina show (Wikipedia). The roads are sourced; the ribbons, their width and their length are a guess.',
  sources: ['source:osm-suburbium', 'source:wikipedia-via-appia', 'source:wikipedia-via-latina'] });
// The belt, in three bands that thin out with distance from the city and from the roads (out to 2.5 km from the city): within 300 m,
// 300-700 m and 700-1,200 m. Each band is the union of circles round points spaced half its width apart, so the edges stay smooth.
const circle = (c, r) => closed(Array.from({ length: 16 }, (_, k) => [c[0] + Math.cos(k * Math.PI / 8) * r / KX, c[1] + Math.sin(k * Math.PI / 8) * r / KY]));
const beltRoads = roads.filter(r => r.certainty !== 'illustrative').flatMap(r => r.lines);
const around = r => unionAll([extent, ...densify(extent[0][0], r / 2).map(p => circle(p, r)),
  ...beltRoads.flatMap(line => densify(line, r / 2)).filter(p => toCore(p) < 2500).map(p => circle(p, r))]);
const BANDS = [[300, 0.06, 'Suburbium · villas, gardens and farms close to the city and the roads'], [700, 0.03, 'Suburbium · scattered villas and farms'], [1200, 0.012, 'Suburbium · farms thinning into the Campagna']];
BANDS.forEach(([radius, density, title], n) => {
  const band = keep(polygonClipping.difference(polygonClipping.intersection(around(radius), [FRAME]), suburbTaken));
  suburbTaken = polygonClipping.union(suburbTaken, band);
  resolved.push({ id: `zone:suburb-belt-${n + 1}`, use: 'suburban', band: n + 1, ring: 'suburbium', density, title, certainty: 'illustrative', time: { start: { year: 0 }, end: { year: 300 } }, multipolygon: band,
    note: `Land ${n ? `${BANDS[n - 1][0]}-${radius}` : `within ${radius}`} m of the continuous city or of a road (out to 2.5 km from the city), between the roads: suburban villas and horti like those named on the Vatican plain and the Esquiline, with farms and pasture, thinning with distance. Nothing here is placed from a source; the bands and their densities are a guess.`,
    sources: [P('vaticanus-ager'), P('horti-agrippinae'), 'source:platner-1929'] });
});
const campagna = keep(polygonClipping.difference([FRAME], suburbTaken));
resolved.push({ id: 'zone:campagna', use: 'campagna', ring: 'campagna', density: 0.01, title: 'Roman Campagna · farmland, pasture and scattered villas', certainty: 'illustrative', time: { start: { year: -300 }, end: { year: 400 } }, multipolygon: campagna,
  note: 'The low countryside round Rome beyond the suburbium (Wikipedia, Roman Campagna): farmland, pasture and scattered villas and tombs. Nothing here is placed from a source; where it begins is a guess.',
  sources: ['source:wikipedia-roman-campagna'] });

// Labels: a coarse interior point of the largest piece, far from its edges.
function labelPoint(poly) {
  const ring = poly[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const inside = (x, y) => { let c = false; for (const r of poly) for (let n = 0; n < r.length - 1; n++) { const [ax, ay] = r[n], [bx, by] = r[n + 1]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
  const edge = (x, y) => Math.min(...poly.flatMap(r => r.slice(1).map((b, n) => { const a = r[n], dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, px = (x - a[0]) * KX, py = (y - a[1]) * KY, t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - t * dx, py - t * dy); })));
  let best = [ring[0][0], ring[0][1]], score = -1;
  for (let a = 0; a <= 30; a++) for (let b = 0; b <= 30; b++) {
    const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * a / 30, y = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * b / 30;
    if (inside(x, y)) { const d = edge(x, y); if (d > score) { score = d; best = [x, y]; } }
  }
  return round(best);
}
const shortNames = { 'zone:tiber': 'Tiber', 'zone:forum-palatine': 'Fora · Palatine', 'zone:forum-boarium': 'Forum Boarium', 'zone:oppian': 'Oppian', 'zone:claudianum': 'Claudianum',
  'zone:circus-flaminius': 'Circus Flaminius', 'zone:campus-centre': 'Campus Martius', 'zone:campus-north': 'Mausoleum', 'zone:castra-praetoria': 'Castra Praetoria', 'zone:tiber-island': 'Tiber Island',
  'zone:baths-of-trajan': 'Baths of Trajan', 'zone:forum-of-trajan': "Trajan's Forum", 'zone:emporium': 'Emporium', 'zone:trastevere-river': 'Riverfront',
  'zone:collis-hortorum': 'Collis Hortorum', 'zone:esquiline-horti': 'Esquiline horti', 'zone:esquiline-plateau': 'Esquiline gardens', 'zone:caelian-east': 'Caelian houses',
  'zone:campus-river': 'Trigarium', 'zone:residential-dense': 'Dense housing', 'zone:residential-hills': 'Hill housing', 'zone:residential-elite': 'Elite houses',
  'zone:residential-trastevere': 'Trastevere', 'zone:residential-roadside': 'Roadside', 'zone:aniene': 'Aniene', 'zone:baths-of-caracalla': 'Baths of Caracalla',
  'zone:circus-vaticanus': 'Circus of Gaius and Nero', 'zone:vatican-necropolis': 'Necropolis', 'zone:horti-domitiae': 'Horti Domitiae', 'zone:horti-agrippinae': 'Horti Agrippinae',
  'zone:mausoleum-hadriani': "Hadrian's Mausoleum", 'zone:suburb-roadside': 'Roadside', 'zone:suburb-belt-1': 'Suburbium', 'zone:via-appia-tombs': 'Appia tombs', 'zone:campagna': 'Campagna' };
for (const z of resolved) if (!z.multipolygon.length) throw Error(`${z.id} is empty after the cuts`);
const zones = resolved.sort((a, b) => priority.indexOf(a.use) - priority.indexOf(b.use)).map(z => ({
  ...z, short: shortNames[z.id], area: Math.round(areaOf(z.multipolygon)), label: labelPoint(z.multipolygon.slice().sort((a, b) => areaOf([b]) - areaOf([a]))[0]),
  multipolygon: z.multipolygon.map(poly => poly.map(ring => ring.map(round))) }));

// ---- Markers: one per Augustan region and per named anchor. Pleiades points are used as they are unless they fall outside what they
// label; those are moved by hand and say so. Gates and walls of the later circuit are not markers.
const region = { i: 'Regio I (Porta Capena)', ii: 'Regio II (Caelimontium)', iii: 'Regio III (Isis et Serapis)', iv: 'Regio IV (Templum Pacis)', v: 'Regio V (Esquiliae)', vi: 'Regio VI (Alta Semita)', vii: 'Regio VII (Via Lata)',
  viii: 'Regio VIII (Forum Romanum)', ix: 'Regio IX (Circus Flaminius)', x: 'Regio X (Palatium)', xi: 'Regio XI (Circus Maximus)', xii: 'Regio XII (Piscina Publica)', xiii: 'Regio XIII (Aventinus)', xiv: 'Regio XIV (Transtiberim)' };
const moved = {
  i: [[12.4935, 41.8810], 'The Pleiades point lies about 1 km further south, at the later Aurelian gate; moved by hand to the Via Appia just outside Porta Capena, where the region began.'],
  v: [[12.5030, 41.8960], 'Pleiades gives this region no location; placed by hand on the Esquiline beyond the Servian agger, among the gardens the region held.'],
  xiv: [[12.4700, 41.8880], 'The Pleiades point lies across the river bend to the north-west, outside Trastevere; moved by hand to the middle of the Trastevere housing.'],
};
const markers = [
  ...Object.entries(region).map(([k, title]) => {
    const p = pl(`regio-${k}`), [coordinate, why] = moved[k] ?? [p.reprPoint, null];
    return { id: `marker:regio-${k}`, kind: 'region', title, coordinate: round(coordinate), certainty: why ? 'illustrative' : 'approximate', time: { start: { year: -7 }, end: { year: 400 } },
      note: `One of the fourteen regions into which Augustus divided the city in 7 BC. ${why ?? 'Placed at the Pleiades representative point, derived from the places Pleiades links to the region.'}`, sources: [P(`regio-${k}`), 'source:wikipedia-regions'] };
  }),
  ...[['horti-luculliani', -60, [12.4835, 41.9078], 'The Pleiades point lies about 700 m north, beyond the gardens; moved by hand onto the Pincian slope above the Campus, inside the Collis Hortorum zone.'],
    ['horti-sallustiani', -40], ['horti-lamiani', 0], ['emporium', -193], ['porticus-aemilia', -193]].map(([key, from, at, why]) => ({
    id: `marker:${key}`, kind: 'anchor', title: pl(key).title, coordinate: round(at ?? pl(key).reprPoint), certainty: at ? 'illustrative' : 'approximate', time: { start: { year: from }, end: { year: 300 } },
    note: why ?? 'Placed at the Pleiades representative point; the zone around it is drawn from it.', sources: [P(key), 'source:platner-1929'] })),
  { id: 'marker:pons-neronianus', kind: 'anchor', title: 'Pons Neronianus', coordinate: PONS_NERONIANUS, certainty: 'approximate', time: { start: { year: 40 }, end: { year: 400 } },
    note: 'A bridge built by Caligula or Nero to join the Campus Martius to the Vatican fields (Wikipedia); there is no direct evidence that Nero built it. Placed at the Pleiades point; the Via Triumphalis and Via Cornelia start here.', sources: [P('pons-neronianus'), 'source:wikipedia-pons-neronianus'] },
  { id: 'marker:caecilia-metella', kind: 'anchor', title: 'Tomb of Caecilia Metella', coordinate: CAECILIA, certainty: 'approximate', time: { start: { year: -20 }, end: { year: 2025 } },
    note: 'A drum on a square podium at the third mile of the Via Appia, probably built c. 30-10 BC (Wikipedia). At the Pleiades point.', sources: [P('caecilia-metella'), 'source:wikipedia-caecilia-metella'] },
  { id: 'marker:via-triumphalis-necropolis', kind: 'anchor', title: 'Via Triumphalis necropolis', coordinate: round(pl('via-triumphalis-necropolis').reprPoint), certainty: 'approximate', time: { start: { year: -30 }, end: { year: 330 } },
    note: 'A stretch of imperial necropolis preserved along the road (Pleiades), at the Pleiades point.', sources: [P('via-triumphalis-necropolis')] },
];

const used = new Set([...zones.flatMap(z => z.sources), ...markers.flatMap(m => m.sources), ...roads.flatMap(r => r.sources), ...aqueducts.flatMap(a => a.sources), 'source:osm-tiber', 'source:osm-tiber-reaches', 'source:lanciani-fur', 'source:atlas-ancient-rome', 'source:severan-plan']);
const out = {
  title: 'Land use, Rome c. AD 100', date: { year: 100 }, generator: 'scripts/context/rome/build-zoning.mjs',
  extent: { id: 'zone:extent', title: 'Continuous city c. AD 100 · approximate extent', certainty: 'approximate', time: { start: { year: 64 }, end: { year: 200 } },
    note: 'Where building was more or less continuous around AD 100, drawn by hand at about 150 m precision from the topography of the fourteen regions (Pleiades), Platner and the general layout in Lanciani\'s plan, with modern atlases as reference only. It includes the gardens at the edge of the city (Pincian, Esquiline) and ribbons along the consular roads within about 700 m of it; Trastevere stops at the foot of the Janiculum. The edge is a guess: building thinned out gradually rather than stopping at a line. It is not taken from any wall; the Aurelian Walls were built in AD 271-275.',
    sources: [...regions, 'source:platner-1929', 'source:lanciani-fur', 'source:atlas-ancient-rome', 'source:osm-tiber'], area: Math.round(areaOf(extent)), ring: extent[0][0].map(round) },
  frame: FRAME.map(round),
  lines: [...roads, ...aqueducts],
  sources: sources.filter(s => used.has(s.id)),
  zones, markers,
};
await writeFile('lib/scenarios/fixtures/rome-ad100-zoning.json', JSON.stringify(out) + '\n');
console.log(JSON.stringify({ extentKm2: +(out.extent.area / 1e6).toFixed(2), markers: markers.length, lines: out.lines.map(l => [l.id, l.lines.length, l.lines.flat().length]), zones: zones.map(z => [z.id, z.use, z.certainty, +(z.area / 1e6).toFixed(3)]) }));
