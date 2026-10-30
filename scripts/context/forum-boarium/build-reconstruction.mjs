// Builds the best-guess neighbourhood around the two temples (Pass B) as plain data. Works offline and is deterministic:
// the same inputs and the seed below give byte-identical output. Never edit the output by hand.
//
// Inputs are data already in the repository (OpenStreetMap/Pleiades/Wikidata snapshots through the context layer file) plus
// the rules in this file. Nothing here reads Lanciani's Forma Urbis Romae, the Stanford Digital Forma Urbis Romae Project or
// Mapping Augustan Rome: they were consulted for orientation only (see RECONSTRUCTION.md), so no third-party geometry enters.
//
// Frame: metres east (E) and south (S) of the Forum Boarium temple-pair layout origin, as in the scene definition.
import { readFile, writeFile } from 'node:fs/promises';
const SEED = 100;
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const ctx = await json('lib/scenarios/fixtures/forum-boarium-context.json');
const world = await json('lib/history/fixtures/forum-boarium.json');
const origin = world.places.find(p => p.id === 'place:forum-boarium-temples').position.coordinate;
const M = Math.PI / 180 * 6371008.8, cosLat = Math.cos(origin[1] * Math.PI / 180);
const local = p => [(p[0] - origin[0]) * cosLat * M, -(p[1] - origin[1]) * M];
const r1 = v => Math.round(v * 10) / 10, pt = p => [r1(p[0]), r1(p[1])];
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(SEED), between = (a, b) => a + (b - a) * rand(), pick = list => list[Math.floor(rand() * list.length)];

// ── Evidence the scene already carries ──────────────────────────────────────────────────────────────────────
const geometry = id => ctx.geometries.find(g => g.id === id);
const marker = id => local(ctx.locations.find(l => l.id === id).coordinate);
const ring = id => geometry(id).coordinates[0].map(local);
const tiber = ring('tiber'), forumOutline = ring('forum-boarium'), portunus = ring('portunus-footprint'), hercules = ring('hercules-victor-footprint'), pons = ring('pons-aemilius');
/** East/west bank at a given south coordinate, from today's channel (an approximation of the ancient bank, never its course). */
function crossings(s) {
  const xs = [];
  for (let i = 0; i < tiber.length - 1; i++) { const [ax, az] = tiber[i], [bx, bz] = tiber[i + 1]; if ((az > s) !== (bz > s)) xs.push(ax + (bx - ax) * (s - az) / (bz - az)); }
  return xs.sort((a, b) => a - b);
}
const eastBank = s => Math.max(...crossings(s)), westBank = s => Math.min(...crossings(s).filter(x => x > -400));
const bankLine = [];
for (let s = -270; s <= 330; s += 10) bankLine.push([eastBank(s), s]);
const smoothed = bankLine.map((p, i) => { const w = bankLine.slice(Math.max(0, i - 2), i + 3); return [w.reduce((a, q) => a + q[0], 0) / w.length, p[1]]; });
const bankAt = s => { const i = Math.max(0, Math.min(smoothed.length - 2, Math.floor((s + 270) / 10))), t = (s - smoothed[i][1]) / 10; return smoothed[i][0] * (1 - t) + smoothed[i + 1][0] * t; };

// ── Small geometry kit ───────────────────────────────────────────────────────────────────────────────────────
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function sample(line, step) {
  const out = []; let carried = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], l = len(a, b), t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    for (let d = carried; d < l; d += step) out.push({ p: [a[0] + t[0] * d, a[1] + t[1] * d], t });
    carried = ((carried - l) % step + step) % step;
  }
  return out;
}
const offset = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d];
const rectOf = (c, front, w, d) => { const u = [-front[1], front[0]]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + u[0] * w / 2 * a + front[0] * d / 2 * b, c[1] + u[1] * w / 2 * a + front[1] * d / 2 * b]); };
const ribbon = (line, width) => { const l = [], r = []; line.forEach((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], l2 = len(a, b), n = [-(b[1] - a[1]) / l2, (b[0] - a[0]) / l2]; l.push(offset(p, n, width / 2)); r.push(offset(p, n, -width / 2)); }); return [...l, ...r.reverse()]; };
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const grow = (poly, d) => { const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]); return poly.map(p => { const l = len(c, p); return [p[0] + (p[0] - c[0]) / l * d, p[1] + (p[1] - c[1]) / l * d]; }); };

// ── Sources ──────────────────────────────────────────────────────────────────────────────────────────────────
const sources = [
  { id: 'source:platner-1929', title: 'Platner & Ashby, A Topographical Dictionary of Ancient Rome (1929): Forum Boarium (LacusCurtius transcription)', url: 'https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Roma/Rome/_Texts/PLATOP*/Forum_Boarium.html', licence: 'Public domain (published 1929) · read for the extent, streets and the road from the bridge' },
  { id: 'source:wikipedia-forum-boarium', title: 'Wikipedia · Forum Boarium', url: 'https://en.wikipedia.org/wiki/Forum_Boarium', licence: 'CC BY-SA 4.0 · text read for monuments and dates' },
  { id: 'source:wikipedia-pons-aemilius', title: 'Wikipedia · Pons Aemilius (stone bridge begun 179 BC, completed 151 BC; seven spans)', url: 'https://en.wikipedia.org/wiki/Pons_Aemilius', licence: 'CC BY-SA 4.0 · text read for dates and span count' },
  { id: 'source:it-wikipedia-porto-tiberino', title: 'Wikipedia (it) · Porto tiberino (6th century BC; kept active at least to the Flavians)', url: 'https://it.wikipedia.org/wiki/Porto_tiberino', licence: 'CC BY-SA 4.0 · text read for dates and setting' },
  { id: 'source:wikipedia-great-altar', title: 'Wikipedia · Great Altar of Hercules (foundations possibly under Santa Maria in Cosmedin)', url: 'https://en.wikipedia.org/wiki/Great_Altar_of_Hercules', licence: 'CC BY-SA 4.0 · text read for one claim' },
  { id: 'source:wikipedia-insula', title: 'Wikipedia · Insula (building): tabernae below flats; height limits of 70 then 60 Roman feet', url: 'https://en.wikipedia.org/wiki/Insula_(building)', licence: 'CC BY-SA 4.0 · text read for typical form and height limits' },
  { id: 'source:wikipedia-horrea', title: 'Wikipedia · Horrea: rows of tabernae, two or more storeys, thick walls, high narrow windows', url: 'https://en.wikipedia.org/wiki/Horrea', licence: 'CC BY-SA 4.0 · text read for typical form' },
  { id: 'source:osm-tiber', title: 'OpenStreetMap · Tiber water polygon (relation 5071)', url: 'https://www.openstreetmap.org/relation/5071', licence: 'ODbL · modern geometry' },
  { id: 'source:osm-forum-boarium', title: 'OpenStreetMap · Foro Boario site (way 27350575)', url: 'https://www.openstreetmap.org/way/27350575', licence: 'ODbL · modern geometry' },
  { id: 'source:osm-pons-aemilius', title: 'OpenStreetMap · Ponte Emilio (relation 6384861)', url: 'https://www.openstreetmap.org/relation/6384861', licence: 'ODbL · modern geometry' },
  { id: 'source:osm-cloaca', title: 'OpenStreetMap · mouth of the Cloaca Maxima (node 4754734734)', url: 'https://www.openstreetmap.org/node/4754734734', licence: 'ODbL · modern geometry' },
  { id: 'source:wikidata-portus', title: 'Wikidata · Portus Tiberinus (Q3909304), coordinate', url: 'https://www.wikidata.org/wiki/Q3909304', licence: 'CC0 · point with about 1 km precision' },
  { id: 'source:pleiades-ara-maxima', title: 'Pleiades · Ara Maxima Herculis', url: 'https://pleiades.stoa.org/places/207271757', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:project-rules', title: 'Mankind project rules for the best-guess neighbourhood (scripts/context/forum-boarium/build-reconstruction.mjs)', url: 'scripts/context/forum-boarium/RECONSTRUCTION.md', licence: 'Project-authored; seed 100; see RECONSTRUCTION.md' },
];
const GUESS = 'best-guess', BASED = 'evidence-based', DOCUMENTED = 'documented';
const AD100 = { start: { year: 100 }, end: { year: 100 } };
const objects = [];
const add = o => { objects.push({ ...o, footprint: o.footprint.map(pt) }); return o; };

// ── Fixed points ─────────────────────────────────────────────────────────────────────────────────────────────
add({ id: 'temple-portunus', kind: 'temple', title: 'Temple of Portunus', certainty: DOCUMENTED, shape: { type: 'catalogue' }, footprint: portunus, sources: ['source:osm-portunus'],
  note: 'The standing temple, modelled in the catalogue. Footprint is the present-day OpenStreetMap outline; the model itself is drawn from a historic plan (see its own evidence card).', time: { start: { year: -120 }, end: { year: 2025 } } });
add({ id: 'temple-hercules-victor', kind: 'temple', title: 'Temple of Hercules Victor', certainty: DOCUMENTED, shape: { type: 'catalogue' }, footprint: hercules, sources: ['source:osm-hercules'],
  note: 'The standing round temple, modelled in the catalogue. Footprint is the present-day OpenStreetMap outline; its original roof is lost.', time: { start: { year: -143 }, end: { year: 2025 } } });
const bankAtBridge = bankAt(-34), westAtBridge = westBank(-34);

// Bridge: the Ponte Rotto arch fixes two piers; the rest are spaced to meet the modern banks. Seven spans (Wikipedia).
const fragmentE = [Math.min(...pons.map(p => p[0])), Math.max(...pons.map(p => p[0]))], bridgeS = r1(pons.reduce((a, p) => a + p[1], 0) / pons.length);
const piers = [bankAtBridge - 1.5, (bankAtBridge - 1.5 + fragmentE[1]) / 2, fragmentE[1], fragmentE[0]];
const west = westAtBridge + 4, run = (fragmentE[0] - west) / 4;
for (let i = 1; i <= 4; i++) piers.push(fragmentE[0] - run * i);
piers.sort((a, b) => b - a);
add({ id: 'pons-aemilius', kind: 'bridge', title: 'Pons Aemilius', certainty: BASED, shape: { type: 'bridge', axisS: bridgeS, piersE: piers.map(r1), deckWidth: 9, spans: piers.length - 1 },
  footprint: [[piers[0], bridgeS - 4.5], [piers.at(-1), bridgeS - 4.5], [piers.at(-1), bridgeS + 4.5], [piers[0], bridgeS + 4.5]], sources: ['source:osm-pons-aemilius', 'source:wikipedia-pons-aemilius', 'source:platner-1929'], time: { start: { year: -179 }, end: { year: 2025 } }, uncertaintyYears: 28,
  note: `Position from the surviving Ponte Rotto arch (two piers fixed at E ${r1(fragmentE[0])} and ${r1(fragmentE[1])} m); stone, seven spans (Wikipedia). The other pier positions, the deck width and the arch profile are guessed so the bridge meets today's banks.` });

// ── River frontage: quay wall, quay road, stages and barges ──────────────────────────────────────────────────
const quayRuns = [[-262, -52], [-18, 322]];
const quayLine = run => sample(smoothed.filter(p => p[1] >= run[0] && p[1] <= run[1]), 6).map(q => [q.p[0] + 1.5, q.p[1]]);
quayRuns.forEach((run, i) => {
  const line = quayLine(run);
  add({ id: `quay-${i ? 'south' : 'north'}`, kind: 'quay', title: i ? 'River quay · south of the bridge' : 'River quay · Portus Tiberinus frontage', certainty: GUESS,
    shape: { type: 'quay', line: line.map(pt), height: 3.2 }, footprint: ribbon(line, 3), sources: ['source:osm-tiber', 'source:it-wikipedia-porto-tiberino'], time: AD100, uncertaintyYears: 25,
    note: `A stone-faced river wall with steps, set along today's east bank of the Tiber (an approximation of the ancient bank, not its course). That Rome's river harbour had built quays is likely, but no source here records this stretch.` });
});
const quayRoad = [];
for (const q of sample(smoothed, 10)) quayRoad.push([q.p[0] + 8, q.p[1]]);
const streets = [];
function street(id, title, certainty, points, width, sourceIds, note, extra = {}) {
  const line = points.map(pt);
  streets.push({ id, points: line, width });
  add({ id, kind: 'street', title, certainty, shape: { type: 'street', points: line, width }, footprint: ribbon(sample(line, 4).map(s => s.p), width), sources: sourceIds, time: AD100, uncertaintyYears: 25, note, ...extra });
}
street('street-quay', 'Riverside road', GUESS, quayRoad.filter(p => p[1] > -262 && p[1] < 322), 7, ['source:osm-tiber'], 'A road running along the quay behind the river wall. Its line is today\'s east bank offset inland; nothing records it, so it is a guess.');
street('street-bridge', 'Road from the bridge to the Velabrum', BASED, [[bankAtBridge + 2, -34], [-45, -37], [-28, -48], [10, -54], [60, -50], [110, -40], [150, -35], [215, -35]], 7, ['source:platner-1929', 'source:osm-pons-aemilius'],
  'Platner records a road leading from the bridge across the Forum Boarium towards the Velabrum. The route is bent here to pass north of the Temple of Portunus; its exact line is a guess.');
street('street-iugarius', 'Vicus Iugarius', GUESS, [[10, -54], [30, -120], [60, -220], [95, -330], [115, -380]], 6, ['source:platner-1929'],
  'Platner names the Vicus Iugarius as a route into the Forum Boarium from the north-east. The street existed; this line, towards the foot of the Capitoline, is a guess.');
street('street-tuscus', 'Vicus Tuscus', GUESS, [[110, -40], [150, -120], [205, -200]], 6, ['source:platner-1929'],
  'Platner names the Vicus Tuscus as a route into the Forum Boarium. The street existed; its line here, towards the Roman Forum, is a guess.');
street('street-circus', 'Road to the Circus Maximus valley', GUESS, [[20, 91], [80, 150], [170, 215], [300, 290], [390, 330]], 8, ['source:platner-1929'],
  'The Forum Boarium opened south into the valley of the Circus Maximus (Platner). A road in that direction is likely; the line is a guess.');

// Occupancy grid: where nothing may be built (water, streets, the square, temples, the altar, the church site).
const CELL = 2, blocked = new Set(), key = (i, j) => `${i},${j}`, cellOf = v => Math.floor(v / CELL);
const squarePolygon = grow(forumOutline, 8);
const altar = marker('ara-maxima'), churchBlock = [[40, 74], [112, 74], [112, 130], [40, 130]];
const noBuild = [{ poly: squarePolygon, pad: 2 }, { poly: portunus, pad: 9 }, { poly: hercules, pad: 9 }, { poly: churchBlock, pad: 0 }, { poly: rectOf(altar, [0, 1], 22, 16), pad: 0 }];
for (let i = cellOf(-420); i <= cellOf(480); i++) for (let j = cellOf(-420); j <= cellOf(460); j++) {
  const p = [(i + .5) * CELL, (j + .5) * CELL];
  if (p[0] < bankAt(p[1]) + 11 && p[1] > -280 && p[1] < 340) { blocked.add(key(i, j)); continue; }
  if (p[0] < -150 || noBuild.some(n => inside(p, n.poly) || (n.pad && n.poly.some(q => len(p, q) < n.pad)))) blocked.add(key(i, j));
}
for (const s of streets.filter(s => s.id !== 'street-quay')) for (const q of sample(s.points, 1.5)) for (let a = -s.width / 2 - 0.5; a <= s.width / 2 + 0.5; a += 1) {
  const n = [-q.t[1], q.t[0]], p = offset(q.p, n, a); blocked.add(key(cellOf(p[0]), cellOf(p[1])));
}
const free = rect => { const [c0, c1, c2] = [rect[0], rect[1], rect[2]]; const wv = [c1[0] - c0[0], c1[1] - c0[1]], dv = [c2[0] - c1[0], c2[1] - c1[1]], wl = Math.hypot(...wv), dl = Math.hypot(...dv);
  const cells = []; for (let a = 0.25; a < wl; a += 1) for (let b = 0.25; b < dl; b += 1) { const p = [c0[0] + wv[0] * a / wl + dv[0] * b / dl, c0[1] + wv[1] * a / wl + dv[1] * b / dl]; cells.push(key(cellOf(p[0]), cellOf(p[1]))); }
  return cells.every(c => !blocked.has(c)) ? cells : null; };

// ── Docks: stages and barges upstream of the bridge ────────────────────────────────────────────────────────────
const dockS = []; for (let s = -70; s > -250; s -= 24) dockS.push(s);
dockS.forEach((s, i) => {
  const e = bankAt(s) + 1.5, stage = [[e, s - 1.6], [e - 12, s - 1.6], [e - 12, s + 1.6], [e, s + 1.6]];
  add({ id: `stage-${i + 1}`, kind: 'stage', title: `Timber landing stage ${i + 1}`, certainty: GUESS, shape: { type: 'stage', origin: pt([e, s]), length: 12, width: 3.2 }, footprint: stage,
    sources: ['source:wikidata-portus', 'source:it-wikipedia-porto-tiberino'], time: AD100, uncertaintyYears: 25,
    note: 'A timber landing stage for the river harbour. The Portus Tiberinus is recorded only as a point about 1 km wide and as in use to at least AD 96; the stages and their spacing are guessed.' });
  if (rand() < 0.75) {
    const bl = between(15, 20), bw = between(4, 5.2), side = rand() < 0.5 ? 1 : -1, bs = s + side * 13, be = e - 5 - bw / 2;
    add({ id: `barge-${i + 1}`, kind: 'barge', title: `Moored river barge ${i + 1}`, certainty: GUESS, shape: { type: 'barge', centre: pt([be, bs]), length: r1(bl), beam: r1(bw), cargo: pick(['amphorae', 'sacks', 'timber', 'stone']), crates: Math.floor(between(3, 7)) },
      footprint: [[be - bw / 2, bs - bl / 2], [be + bw / 2, bs - bl / 2], [be + bw / 2, bs + bl / 2], [be - bw / 2, bs + bl / 2]], sources: ['source:it-wikipedia-porto-tiberino'], time: AD100, uncertaintyYears: 25,
      note: 'A river barge of the kind that brought goods upstream from Ostia, towed by men on the bank (Italian Wikipedia). Size, cargo and mooring are guessed.' });
  }
});

// ── The open market square, altar, pens and stalls ──────────────────────────────────────────────────────────────
add({ id: 'forum-square', kind: 'square', title: 'Forum Boarium · open paved square', certainty: GUESS, shape: { type: 'square' }, footprint: squarePolygon, sources: ['source:osm-forum-boarium', 'source:platner-1929', 'source:wikipedia-forum-boarium'], time: AD100, uncertaintyYears: 25,
  note: 'The cattle market was an open public space (Platner, Wikipedia). The present-day site outline is widened slightly here to give an open square; the true ancient extent is not recorded, and its surface (paving) is a guess.' });
add({ id: 'ara-maxima', kind: 'altar', title: 'Ara Maxima of Hercules', certainty: BASED, shape: { type: 'altar', centre: pt(altar), platform: [12, 9], height: 1.4 }, footprint: rectOf(altar, [0, 1], 12, 9), sources: ['source:pleiades-ara-maxima', 'source:wikipedia-great-altar'],
  time: { start: { year: -500 }, end: { year: 2025 } }, uncertaintyYears: 100,
  note: 'Placed at Pleiades\' derived point for the altar; its foundations are tentatively a tuff platform in the crypt of Santa Maria in Cosmedin. Size, steps and the altar block are guessed.' });
const pens = []; for (let k = 0; k < 2; k++) { const c = [[-13, 4], [14, 9]][k], pen = rectOf(c, [0, 1], 13, 9); if (!pen.some(p => !inside(p, squarePolygon))) pens.push(pen), add({ id: `pen-${k + 1}`, kind: 'pen', title: `Cattle pen ${k + 1}`, certainty: GUESS, shape: { type: 'pen', centre: pt(c), size: [13, 9] }, footprint: pen, sources: ['source:wikipedia-forum-boarium'], time: AD100, uncertaintyYears: 25, note: 'A timber-railed pen for the cattle market. The market is documented; pens, their number and their place are guessed.' }); }
let stalls = 0;
for (let tries = 0; tries < 400 && stalls < 16; tries++) {
  const c = [between(-48, 44), between(-46, 94)], sz = [between(3, 4.2), between(2.4, 3)], r = rectOf(c, [0, 1], sz[0], sz[1]);
  if (r.some(p => !inside(p, squarePolygon)) || [portunus, hercules, ...pens].some(poly => r.some(p => inside(p, grow(poly, 5)) || false) || poly.some(p => len(p, c) < 10)) || len(c, altar) < 13 || c[0] < bankAt(c[1]) + 14) continue;
  if (objects.some(o => o.kind === 'stall' && len(o.shape.centre, c) < 7)) continue;
  stalls++;
  add({ id: `stall-${stalls}`, kind: 'stall', title: `Market stall ${stalls}`, certainty: GUESS, shape: { type: 'stall', centre: pt(c), size: sz.map(r1), tone: Math.floor(rand() * 4) }, footprint: r, sources: ['source:wikipedia-forum-boarium'], time: AD100, uncertaintyYears: 25,
    note: 'A trader\'s stall with a cloth awning. Trade here is documented; individual stalls and their places are guessed.' });
}

// ── Frontage buildings: shops and flats along the streets, long warehouses behind the quay ─────────────────────
const axesOf = poly => poly.map((p, i) => { const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
const span = (poly, a) => { const v = poly.map(p => p[0] * a[0] + p[1] * a[1]); return [Math.min(...v), Math.max(...v)]; };
const overlaps = (a, b) => [...axesOf(a), ...axesOf(b)].every(ax => { const [a0, a1] = span(a, ax), [b0, b1] = span(b, ax); return a1 > b0 + 0.05 && b1 > a0 + 0.05; });
const collides = rect => objects.some(o => (o.shape.type === 'building' || o.kind === 'temple') && len(o.shape.centre ?? o.footprint[0], rect[0]) < 90 && overlaps(rect, o.footprint));
let serial = 0, lastKind = '';
function place(kind, c, front, w, d, extra, evidence) {
  const rect = rectOf(c, front, w, d), cells = free(rect);
  if (!cells || collides(rect)) return false;
  cells.forEach(k => blocked.add(k));
  serial++;
  const storeys = extra.storeys, height = r1(extra.height);
  add({ id: `${kind}-${serial}`, kind, title: extra.title, certainty: GUESS, shape: { type: 'building', centre: pt(c), front: [r1(front[0] * 1000) / 1000, r1(front[1] * 1000) / 1000], size: [r1(w), r1(d)], storeys, height, tone: Math.floor(rand() * 5), roof: extra.roof }, footprint: rect,
    sources: evidence, time: AD100, uncertaintyYears: 25, note: extra.note });
  return true;
}
const SHOP = { title: 'Shop (taberna) with rooms above', note: 'A shop with a wide opening at street level and rooms above, the usual form in Roman streets (Wikipedia, Insula). That a shop stood here is a guess; so are its size and height.' };
const FLATS = { title: 'Block of flats (insula)', note: 'A multi-storey block of flats, usually with shops on the ground floor (Wikipedia, Insula). Heights stay under the Roman limit of about 18–21 m. That a block stood here, and its size, are guesses.' };
const STORE = { title: 'Riverside warehouse (horreum)', note: 'A two-storey warehouse with thick walls and few, high windows (Wikipedia, Horrea). Riverside storage near the harbour is likely; this building\'s place and size are guessed.' };
const frontageSources = ['source:wikipedia-insula', 'source:project-rules'];
function frontage(line, halfRoad, kindFor, side, depthRange) {
  let along = 0; const path = sample(line, 1);
  while (along < path.length - 8 && objects.filter(o => o.certainty === GUESS && /building/.test(o.shape?.type ?? '')).length < 330) {
    const s = path[Math.floor(along)], kind = kindFor(s.p), spec = kind.spec, w = between(...kind.width), d = between(...depthRange(kind));
    const n = [-s.t[1] * side, s.t[0] * side], c0 = offset(s.p, n, halfRoad + 1.4 + d / 2), mid = path[Math.min(path.length - 1, Math.floor(along + w / 2))], c = offset(mid.p, n, halfRoad + 1.4 + d / 2);
    const front = [-n[0], -n[1]], ok = place(kind.id, c, front, w, d, { ...spec, storeys: kind.storeys(), height: 0, roof: 'gable' }, kind.sources);
    void c0;
    if (ok) { const o = objects.at(-1); o.shape.height = r1(o.shape.storeys * 3.2 + 0.8); along += w + (rand() < 0.15 ? between(1, 3) : 0.2); } else along += 2;
    lastKind = kind.id;
  }
}
const nearSquare = p => Math.min(len(p, [0, 20]), 1e9) < 130;
const shopKind = p => rand() < (nearSquare(p) ? 0.8 : 0.45) ? { id: 'shop', spec: SHOP, width: [5.2, 7.2], storeys: () => 2, sources: frontageSources } : { id: 'flats', spec: FLATS, width: [11, 19], storeys: () => 3 + (rand() < 0.45 ? 1 : 0), sources: frontageSources };
const flatKind = () => ({ id: 'flats', spec: FLATS, width: [10, 18], storeys: () => 3 + (rand() < 0.4 ? 1 : 0), sources: frontageSources });
for (const s of streets.filter(s => s.id !== 'street-quay')) for (const side of [1, -1]) {
  frontage(s.points, s.width / 2, shopKind, side, k => k.id === 'shop' ? [8, 11] : [12, 16]);
  // Rear row behind the frontage: back-to-back flats.
}
// Warehouses between the quay road and the first street frontage, upstream of the bridge.
for (const side of [-1]) frontage(quayRoad.filter(p => p[1] > -250 && p[1] < -62), 3.5, () => ({ id: 'warehouse', spec: STORE, width: [30, 44], storeys: () => 2, sources: ['source:wikipedia-horrea', 'source:project-rules'] }), side, () => [13, 15]);
// Shops along the south quay road, flats behind.
for (const side of [-1]) frontage(quayRoad.filter(p => p[1] > -10 && p[1] < 300), 3.5, shopKind, side, k => k.id === 'shop' ? [8, 10] : [12, 15]);
// Rear rows: for every frontage building, try a second row behind it.
for (const o of [...objects].filter(o => o.shape?.type === 'building' && o.kind !== 'warehouse')) {
  const f = o.shape.front, back = [-f[0], -f[1]], w = between(10, 18), d = between(9, 13), c = offset(o.shape.centre, back, o.shape.size[1] / 2 + d / 2 + 0.2);
  if (rand() < 0.8) place('flats', c, f, Math.min(w, o.shape.size[0] + 4), d, { ...FLATS, storeys: 3 + (rand() < 0.3 ? 1 : 0), height: 0, roof: 'gable' }, frontageSources) && (objects.at(-1).shape.height = r1(objects.at(-1).shape.storeys * 3.2 + 0.8));
}

const out = { seed: SEED, origin, sources, objects, streets, notes: { frame: 'Metres east (E) and south (S) of the layout origin', counts: objects.reduce((a, o) => (a[o.certainty] = (a[o.certainty] ?? 0) + 1, a), {}) } };
await writeFile('lib/scenarios/fixtures/forum-boarium-reconstruction.json', JSON.stringify(out) + '\n');
const byKind = objects.reduce((a, o) => (a[o.kind] = (a[o.kind] ?? 0) + 1, a), {});
console.log(JSON.stringify({ objects: objects.length, byKind, counts: out.notes.counts, piers: piers.map(r1) }));
void area; void lastKind;
