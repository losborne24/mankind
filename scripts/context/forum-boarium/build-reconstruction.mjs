// Builds the neighbourhood around the two temples (Passes B and C) as plain data. Works offline and is deterministic:
// the same inputs and the seed below give byte-identical output. Never edit the output by hand.
//
// Inputs are data already in the repository: the context-layer file (OpenStreetMap/Pleiades/Wikidata snapshots) and the
// landmark snapshots from fetch-landmark-sources.mjs (OpenStreetMap relations and ways, Pleiades records), plus the rules in
// this file. Nothing here reads Lanciani's Forma Urbis Romae, the Stanford Digital Forma Urbis Romae Project or Mapping
// Augustan Rome: they were consulted for orientation only (see RECONSTRUCTION.md), so no restricted geometry enters.
//
// Frame: metres east (E) and south (S) of the Forum Boarium temple-pair layout origin, as in the scene definition.
// Output: `objects` (landmarks, bridge, quays, streets, square ...), `lots` (compact building rows), `lanes`, `courts`.
// lib/history/reconstructionHydrate.ts expands lots and lanes into full objects at load time.
import { readFile, writeFile } from 'node:fs/promises';
const SEED = 100;
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const ctx = await json('lib/scenarios/fixtures/forum-boarium-context.json');
const world = await json('lib/history/fixtures/forum-boarium.json');
const osmL = await json('data/history/forum-boarium/source/osm-landmarks.json');
const origin = world.places.find(p => p.id === 'place:forum-boarium-temples').position.coordinate;
const M = Math.PI / 180 * 6371008.8, cosLat = Math.cos(origin[1] * Math.PI / 180);
const local = p => [(p[0] - origin[0]) * cosLat * M, -(p[1] - origin[1]) * M];
const r1 = v => Math.round(v * 10) / 10, pt = p => [r1(p[0]), r1(p[1])], r3 = v => Math.round(v * 1000) / 1000;
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
const grow = (poly, d) => { const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]); return poly.map(p => { const l = len(c, p); return [p[0] + (p[0] - c[0]) / l * d, p[1] + (p[1] - c[1]) / l * d]; }); };
const segDistance = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const lineDistance = (p, line) => { let d = Infinity; for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDistance(p, line[i], line[i + 1])); return d; };
/** Smallest enclosing rectangle by brute force over angles: { c, u, v, long, short, angle } with u along the long side. */
function minRect(points) {
  let best;
  for (let a = 0; a < 180; a += 0.5) {
    const t = a * Math.PI / 180, u = [Math.cos(t), Math.sin(t)], v = [-u[1], u[0]], pu = points.map(p => p[0] * u[0] + p[1] * u[1]), pv = points.map(p => p[0] * v[0] + p[1] * v[1]);
    const u0 = Math.min(...pu), u1 = Math.max(...pu), v0 = Math.min(...pv), v1 = Math.max(...pv), area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, u, v, u0, u1, v0, v1 };
  }
  let { u, v } = best, lu = best.u1 - best.u0, lv = best.v1 - best.v0, cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2;
  const c = [cu * u[0] + cv * v[0], cu * u[1] + cv * v[1]];
  if (lv > lu) { [u, v] = [v, u]; [lu, lv] = [lv, lu]; }
  return { c, u, v, long: lu, short: lv };
}
const membersOf = id => osmL.elements.find(e => e.id === id).members.flatMap(m => m.geometry.map(local));
const wayOf = id => osmL.elements.find(e => e.id === id).geometry.map(local);

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
  // Pass C: landmarks and documented streets.
  { id: 'source:osm-circus-maximus', title: 'OpenStreetMap · Circo Massimo site (relation 11384819)', url: 'https://www.openstreetmap.org/relation/11384819', licence: 'ODbL · modern outline of the excavated circus; axis and extent fitted to it' },
  { id: 'source:wikipedia-circus-maximus', title: 'Wikipedia · Circus Maximus', url: 'https://en.wikipedia.org/wiki/Circus_Maximus', licence: 'CC BY-SA 4.0 · 621 m by 118 m, over 150,000 spectators, central barrier with Augustus\' obelisk, shops under the outer stands, Trajan\'s stone rebuilding' },
  { id: 'source:osm-domus-flavia', title: 'OpenStreetMap · Domus Flavia site (relation 1857984)', url: 'https://www.openstreetmap.org/relation/1857984', licence: 'ODbL · surviving walls; footprint fitted to them' },
  { id: 'source:osm-domus-augustana', title: 'OpenStreetMap · Domus Augustana site (relation 1805347)', url: 'https://www.openstreetmap.org/relation/1805347', licence: 'ODbL · surviving walls; footprint fitted to them' },
  { id: 'source:osm-domus-tiberiana', title: 'OpenStreetMap · Domus Tiberiana site (relation 1860920)', url: 'https://www.openstreetmap.org/relation/1860920', licence: 'ODbL · surviving walls; footprint fitted to them' },
  { id: 'source:pleiades-domus-flavia', title: 'Pleiades · Domus Flavia (palace complex completed ca. 92 CE)', url: 'https://pleiades.stoa.org/places/564783056', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:pleiades-domus-augustana', title: 'Pleiades · Domus Augustana (central block of the Flavian palace)', url: 'https://pleiades.stoa.org/places/792237246', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:wikipedia-domus-flavia', title: 'Wikipedia · Flavian Palace (Domus Flavia): completed AD 92; surviving walls about 16 m; hall of 30.6 m span, at least 30 m high', url: 'https://en.wikipedia.org/wiki/Flavian_Palace', licence: 'CC BY-SA 4.0 · text read for dates and heights' },
  { id: 'source:wikipedia-domus-augustana', title: 'Wikipedia · Domus Augustana: two peristyles, a sunken courtyard complex, and a great curved exedra facing the Circus Maximus', url: 'https://en.wikipedia.org/wiki/Domus_Augustana', licence: 'CC BY-SA 4.0 · text read for layout' },
  { id: 'source:wikipedia-domus-tiberiana', title: 'Wikipedia · Domus Tiberiana: about 150 m by 120 m, arcaded substructures on the north slope, rebuilt under Domitian', url: 'https://en.wikipedia.org/wiki/Domus_Tiberiana', licence: 'CC BY-SA 4.0 · text read for size and form' },
  { id: 'source:pleiades-vicus-tuscus', title: 'Pleiades · Vicus Tuscus (from the Forum to the Forum Boarium along the western flank of the Palatine, through the Velabrum)', url: 'https://pleiades.stoa.org/places/380281017', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:osm-vicus-tuscus', title: 'OpenStreetMap · Vicus Tuscus (way 998877106)', url: 'https://www.openstreetmap.org/way/998877106', licence: 'ODbL · mapped line of the street at the Forum end' },
  { id: 'source:wikipedia-vicus-tuscus', title: 'Wikipedia · Vicus Tuscus: processions of the gods from the Capitoline to the Circus Maximus', url: 'https://en.wikipedia.org/wiki/Vicus_Tuscus', licence: 'CC BY-SA 4.0 · text read for the processional route' },
  { id: 'source:pleiades-vicus-iugarius', title: 'Pleiades · Vicus Iugarius (from the Forum to the Porta Carmentalis)', url: 'https://pleiades.stoa.org/places/889101791', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:osm-vicus-iugarius', title: 'OpenStreetMap · Vicus Iugarius (way 1000529940)', url: 'https://www.openstreetmap.org/way/1000529940', licence: 'ODbL · mapped line of the street at the Forum end' },
  { id: 'source:pleiades-clivus-victoriae', title: 'Pleiades · Clivus Victoriae (steep street at the Palatine corner)', url: 'https://pleiades.stoa.org/places/668537796', licence: 'CC BY 3.0 · Pleiades contributors' },
  { id: 'source:osm-clivus-victoriae', title: 'OpenStreetMap · Clivus Victoriae (way 132682585)', url: 'https://www.openstreetmap.org/way/132682585', licence: 'ODbL · mapped line of the street' },
  { id: 'source:osm-valley-streets', title: 'OpenStreetMap · Via di San Teodoro, Via del Velabro, Via della Consolazione, Via dei Cerchi (ways 366796445, 52938659, 123817468, 82201173 and neighbours)', url: 'https://www.openstreetmap.org/way/366796445', licence: 'ODbL · modern streets in the same valleys, used only as the guide for the lines of guessed streets' },
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

// ── Streets ──────────────────────────────────────────────────────────────────────────────────────────────────
// Each street is its own certainty. Where a source gives only part of a street, the street is split: the part a source
// maps is evidence-based, the rest (drawn along the modern street in the same valley) is a best guess.
const streets = [];
function street(id, title, certainty, points, width, sourceIds, note, extra = {}) {
  const line = points.map(pt);
  streets.push({ id, points: line, width });
  add({ id, kind: 'street', title, certainty, shape: { type: 'street', points: line, width }, footprint: ribbon(sample(line, 4).map(s => s.p), width), sources: sourceIds, time: AD100, uncertaintyYears: 25, note, ...extra });
}
street('street-quay', 'Riverside road', GUESS, quayRoad.filter(p => p[1] > -262 && p[1] < 322), 7, ['source:osm-tiber'], 'A road running along the quay behind the river wall. Its line is today\'s east bank offset inland; nothing records it, so it is a guess.');
street('street-bridge', 'Road from the bridge to the Velabrum', BASED, [[bankAtBridge + 2, -34], [-45, -37], [-28, -48], [10, -54], [60, -50], [110, -40], [150, -35], [215, -35]], 7, ['source:platner-1929', 'source:osm-pons-aemilius'],
  'Platner records a road leading from the bridge across the Forum Boarium towards the Velabrum. The route is bent here to pass north of the Temple of Portunus; its exact line is a guess.');
const tuscusForum = wayOf(998877106), iugariusForum = wayOf(1000529940), victoriae = wayOf(132682585);
street('street-tuscus-forum', 'Vicus Tuscus · Forum end', BASED, tuscusForum, 6, ['source:pleiades-vicus-tuscus', 'source:osm-vicus-tuscus', 'source:wikipedia-vicus-tuscus'],
  'The line OpenStreetMap maps for the Vicus Tuscus at its Forum end (Pleiades locates it to about 20 m). Width and paving are guessed.');
street('street-tuscus-velabrum', 'Vicus Tuscus · through the Velabrum to the market', GUESS, [tuscusForum[0], [340, -253], [328, -232], [288, -159], [263, -112], [250, -82], [242, -55], [226, -46], [215, -36]], 6, ['source:pleiades-vicus-tuscus', 'source:wikipedia-vicus-tuscus', 'source:osm-valley-streets'],
  'Pleiades and Wikipedia say the street ran from the Forum along the western flank of the Palatine, through the Velabrum, to the Forum Boarium (processions went this way to the Circus). Its exact line is guessed along today\'s Via di San Teodoro and Via del Velabro, which lie in the same valley.');
street('street-iugarius-forum', 'Vicus Iugarius · Forum end', BASED, iugariusForum, 6, ['source:pleiades-vicus-iugarius', 'source:osm-vicus-iugarius'],
  'The line OpenStreetMap maps for the Vicus Iugarius near the Forum. Pleiades says it led from the Forum to the Porta Carmentalis. Width and paving are guessed.');
street('street-iugarius-market', 'Vicus Iugarius · foot of the Capitoline to the market', GUESS, [iugariusForum[0], [247, -331], [226, -312], [169, -268], [161, -259], [135, -200], [108, -139], [107, -98], [111, -49]], 6, ['source:pleiades-vicus-iugarius', 'source:platner-1929', 'source:osm-valley-streets'],
  'Platner names the Vicus Iugarius as a route into the Forum Boarium and Pleiades has it leaving by the Porta Carmentalis. Its line along the foot of the Capitoline is guessed from today\'s Via della Consolazione and Via del Velabro.');
street('street-clivus-victoriae', 'Clivus Victoriae', BASED, victoriae, 5, ['source:pleiades-clivus-victoriae', 'source:osm-clivus-victoriae'],
  'The steep street up the Palatine, on the line OpenStreetMap maps for it (Pleiades locates it to about 20 m). Width and paving are guessed.');
street('street-circus', 'Road from the market to the Circus Maximus', GUESS, [[45, 10], [108, 14], [140, 43], [173, 72], [202, 94], [190, 140]], 8, ['source:platner-1929', 'source:osm-valley-streets', 'source:wikipedia-circus-maximus'],
  'The Forum Boarium opened towards the starting gates of the Circus Maximus (Platner, Wikipedia). The road is likely; its line is guessed along today\'s Via dei Cerchi.');
street('street-trastevere', 'Road west of the bridge into Trastevere', GUESS, [[piers.at(-1) - 4, -34], [-215, -30], [-270, -18], [-340, 0], [-420, 22]], 6, ['source:wikipedia-pons-aemilius', 'source:project-rules'],
  'The Pons Aemilius led over the river to the west bank. A road continuing from the bridge is likely; its line and width are guessed.');

// ── Landmarks: the Circus Maximus and the Palatine palace ─────────────────────────────────────────────────────
// Circus: axis and centre fitted to the OpenStreetMap outline of the site; width and length from Wikipedia (118 m by 621 m).
const circusFit = minRect(membersOf(11384819));
let circusAxis = circusFit.u;                       // long axis, carceres (north-west) to curved end (south-east)
if (circusAxis[0] < 0) circusAxis = [-circusAxis[0], -circusAxis[1]];
const circusAcross = [-circusAxis[1], circusAxis[0]];
const CIRCUS = { c: circusFit.c, axis: circusAxis, across: circusAcross, length: 621, track: 118, bank: 30, outerHeight: 24 };
const circusAt = (a, b) => [CIRCUS.c[0] + circusAxis[0] * a + circusAcross[0] * b, CIRCUS.c[1] + circusAxis[1] * a + circusAcross[1] * b];
const circusOutline = (extra, steps = 14) => {
  const half = CIRCUS.track / 2 + extra, a0 = -CIRCUS.length / 2 - extra * 0.2, aEnd = CIRCUS.length / 2 - CIRCUS.track / 2, pts = [];
  pts.push(circusAt(a0, -half), circusAt(aEnd, -half));
  for (let k = 1; k < steps; k++) { const t = -Math.PI / 2 + Math.PI * k / steps; pts.push(circusAt(aEnd + Math.cos(t) * half, Math.sin(t) * half)); }
  pts.push(circusAt(aEnd, half), circusAt(a0, half));
  return pts;
};
add({ id: 'circus-maximus', kind: 'circus', title: 'Circus Maximus', certainty: BASED,
  shape: { type: 'circus', trackOutline: circusOutline(0).map(pt), centre: pt(CIRCUS.c), axis: [r3(circusAxis[0]), r3(circusAxis[1])], length: CIRCUS.length, track: CIRCUS.track, bank: CIRCUS.bank, outerHeight: CIRCUS.outerHeight, tiers: 3, spina: { from: -120, to: 175, width: 7 } },
  footprint: circusOutline(CIRCUS.bank), sources: ['source:osm-circus-maximus', 'source:wikipedia-circus-maximus', 'source:platner-1929'], time: { start: { year: -300 }, end: { year: 400 } }, uncertaintyYears: 25,
  note: `The long axis and extent are fitted to the OpenStreetMap outline of the excavated site (${Math.round(circusFit.long)} m long); the track is 118 m wide and the whole circus about 621 m long (Wikipedia). Seating, the central barrier with Augustus's obelisk, the starting gates and the outer arcade are massing only: the depth of the stands, tier heights and the 24 m outer wall are guessed. Trajan's stone rebuilding began just after AD 100.` });

// Palace wings: each footprint is the smallest rectangle around the surviving walls OpenStreetMap maps; volumes are massing.
const vol = (fit, a, b, w, d, h, role) => ({ c: pt([fit.c[0] + fit.u[0] * a + fit.v[0] * b, fit.c[1] + fit.u[1] * a + fit.v[1] * b]), size: [r1(w), r1(d)], heading: r3(Math.atan2(fit.u[1], fit.u[0])), height: h, role });
const ringOf = (fit, thickness, h) => {
  const L = fit.long, S = fit.short, out = [vol(fit, 0, 0, L, S, 0, 'platform')];
  out.push(vol(fit, 0, S / 2 - thickness / 2, L, thickness, h, 'wall'), vol(fit, 0, -S / 2 + thickness / 2, L, thickness, h, 'wall'));
  out.push(vol(fit, L / 2 - thickness / 2, 0, thickness, S - 2 * thickness, h, 'wall'), vol(fit, -L / 2 + thickness / 2, 0, thickness, S - 2 * thickness, h, 'wall'));
  return out;
};
const flavia = (() => {
  const fit = minRect(membersOf(1857984));
  const volumes = [...ringOf(fit, 24, 18), vol(fit, -fit.long / 2 + 22, 0, 40, 34, 31, 'hall'), vol(fit, fit.long / 2 - 20, 0, 34, 30, 26, 'hall')];
  add({ id: 'domus-flavia', kind: 'palace', title: 'Domus Flavia · imperial palace (public wing)', certainty: BASED, shape: { type: 'palace', volumes }, footprint: rectOf(fit.c, fit.v, fit.long, fit.short),
    sources: ['source:osm-domus-flavia', 'source:pleiades-domus-flavia', 'source:wikipedia-domus-flavia'], time: { start: { year: 92 }, end: { year: 400 } }, uncertaintyYears: 10,
    note: `Position and size fitted to the surviving walls OpenStreetMap maps (${Math.round(fit.long)} by ${Math.round(fit.short)} m); completed about AD 92 by Domitian (Pleiades, Wikipedia). Wall height (the rooms about 18 m; the great hall over 30 m, with a 30.6 m span) follows Wikipedia. The courtyard, the hall's place and every roof and facade are massing, not a reconstruction.` });
  return fit;
})();
(() => {
  const fit = minRect(membersOf(1805347)), towardCircus = Math.sign((CIRCUS.c[0] - fit.c[0]) * fit.v[0] + (CIRCUS.c[1] - fit.c[1]) * fit.v[1]) || 1;
  const volumes = [...ringOf(fit, 22, 17), vol(fit, -fit.long * 0.17, 0, 20, fit.short - 44, 17, 'wall'), vol(fit, fit.long * 0.17, 0, 20, fit.short - 44, 17, 'wall'), vol(fit, 0, towardCircus * (fit.short / 2 + 19), 76, 38, 13, 'exedra')];
  add({ id: 'domus-augustana', kind: 'palace', title: 'Domus Augustana · imperial palace (residential wing)', certainty: BASED, shape: { type: 'palace', volumes }, footprint: rectOf(fit.c, fit.v, fit.long, fit.short),
    sources: ['source:osm-domus-augustana', 'source:pleiades-domus-augustana', 'source:wikipedia-domus-augustana'], time: { start: { year: 92 }, end: { year: 400 } }, uncertaintyYears: 10,
    note: `Position and size fitted to the surviving walls OpenStreetMap maps (${Math.round(fit.long)} by ${Math.round(fit.short)} m); the central block of Domitian's palace, finished about AD 92, with two peristyles and a great curved exedra facing the Circus Maximus (Wikipedia). Heights, the courts and the exedra's size are massing, guessed.` });
})();
(() => {
  const fit = minRect(membersOf(1860920));
  const volumes = ringOf(fit, 26, 20);
  add({ id: 'domus-tiberiana', kind: 'palace', title: 'Domus Tiberiana · imperial palace (north-west corner of the Palatine)', certainty: BASED, shape: { type: 'palace', volumes }, footprint: rectOf(fit.c, fit.v, fit.long, fit.short),
    sources: ['source:osm-domus-tiberiana', 'source:wikipedia-domus-tiberiana'], time: { start: { year: 14 }, end: { year: 400 } }, uncertaintyYears: 20,
    note: `The platform at the north-west corner of the hill, fitted to the walls OpenStreetMap maps (${Math.round(fit.long)} by ${Math.round(fit.short)} m); Wikipedia gives about 150 by 120 m and arcaded supports on the north slope, rebuilt under Domitian. Its height and courtyard are massing, guessed.` });
})();
void flavia;

// ── Where nothing may be built, and where building is allowed ─────────────────────────────────────────────────
const squarePolygon = grow(forumOutline, 8);
const altar = marker('ara-maxima'), churchBlock = [[40, 74], [112, 74], [112, 130], [40, 130]];
const palaceFootprints = objects.filter(o => o.kind === 'palace').map(o => o.footprint);
const noBuild = [{ poly: squarePolygon, pad: 2 }, { poly: portunus, pad: 9 }, { poly: hercules, pad: 9 }, { poly: churchBlock, pad: 0 }, { poly: rectOf(altar, [0, 1], 22, 16), pad: 0 },
  { poly: circusOutline(CIRCUS.bank + 14), pad: 0 }, ...palaceFootprints.map(poly => ({ poly: grow(poly, 30), pad: 0 }))];
const noBuildBox = noBuild.map(n => { const xs = n.poly.map(p => p[0]), zs = n.poly.map(p => p[1]); return [Math.min(...xs) - n.pad - 1, Math.max(...xs) + n.pad + 1, Math.min(...zs) - n.pad - 1, Math.max(...zs) + n.pad + 1]; });
const roadLines = streets.filter(s => s.id !== 'street-quay').map(s => ({ line: s.points, half: s.width / 2 + 0.4 }));
const palatineFoot = [[345, -300], [330, -250], [300, -200], [285, -155], [263, -112], [250, -82], [243, -60], [240, -46], [233, 1], [227, 44], [215, 100], [205, 135]];
const footE = s => { for (let i = 0; i < palatineFoot.length - 1; i++) { const [a, b] = [palatineFoot[i], palatineFoot[i + 1]]; if (s >= a[1] && s <= b[1]) return a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]); } return s < palatineFoot[0][1] ? palatineFoot[0][0] : palatineFoot.at(-1)[0]; };
const tiberBox = [Math.min(...tiber.map(p => p[0])) - 14, Math.max(...tiber.map(p => p[0])) + 14, Math.min(...tiber.map(p => p[1])) - 14, Math.max(...tiber.map(p => p[1])) + 14];
const nearWater = (p, pad) => {
  if (p[0] < tiberBox[0] || p[0] > tiberBox[1] || p[1] < tiberBox[2] || p[1] > tiberBox[3]) return false;
  if (inside(p, tiber)) return true;
  for (let i = 0; i < tiber.length - 1; i++) if (segDistance(p, tiber[i], tiber[i + 1]) < pad) return true;
  return false;
};
const circusBand = (p) => { const a = (p[0] - CIRCUS.c[0]) * circusAxis[0] + (p[1] - CIRCUS.c[1]) * circusAxis[1], b = (p[0] - CIRCUS.c[0]) * circusAcross[0] + (p[1] - CIRCUS.c[1]) * circusAcross[1]; return { a, b }; };
/** Is this a place a street-front building may stand (urban region, off the river, hills, landmarks and fixed features)? */
function buildable(p) {
  const [e, s] = p;
  if (s < -290 || s > 470 || e < -560 || Math.hypot(e, s) > 640) return false;
  if (nearWater(p, 11)) return false;
  const west = e < -100;
  if (west) { if (s < -190) return false; }
  else {
    if (s <= 135) { if (e > footE(s) - 4) return false; if (e > 100 && s < (e <= 161 ? -262 : -259 - 0.837 * (e - 161) + 8)) return false; }
    else { const { b } = circusBand(p); if (b < 0) return false; }
  }
  for (let i = 0; i < noBuild.length; i++) {
    const n = noBuild[i], box = noBuildBox[i];
    if (e < box[0] || e > box[1] || s < box[2] || s > box[3]) continue;
    if (inside(p, n.poly) || (n.pad && n.poly.some(q => len(p, q) < n.pad))) return false;
  }
  for (const r of roadLines) if (lineDistance(p, r.line) < r.half) return false;
  return true;
}

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

// ── The city: attached multi-storey blocks (insulae) around courtyards, narrow lanes, near-continuous frontage ───
// Lots are packed by rectangle (party walls touch exactly); the 16 m spatial hash keeps the overlap tests local.
const lots = [], hash = new Map(), HASH = 16, hashKey = (i, j) => `${i},${j}`;
const axesOf = poly => poly.map((p, i) => { const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
const span = (poly, a) => { const v = poly.map(p => p[0] * a[0] + p[1] * a[1]); return [Math.min(...v), Math.max(...v)]; };
const overlaps = (a, b, tol) => [...axesOf(a), ...axesOf(b)].every(ax => { const [a0, a1] = span(a, ax), [b0, b1] = span(b, ax); return a1 > b0 + tol && b1 > a0 + tol; });
const cellsOf = rect => { const xs = rect.map(p => p[0]), zs = rect.map(p => p[1]), out = []; for (let i = Math.floor(Math.min(...xs) / HASH); i <= Math.floor(Math.max(...xs) / HASH); i++) for (let j = Math.floor(Math.min(...zs) / HASH); j <= Math.floor(Math.max(...zs) / HASH); j++) out.push(hashKey(i, j)); return out; };
const templeRects = [portunus, hercules];
const KINDS = ['insula', 'flats', 'shop', 'warehouse'];
const pairCentre = [6, 20];
/** Storey cap by distance from the two temples, so the temples stay readable from above: low shops close in, taller blocks further out. */
const storeyCap = c => { const d = len(c, pairCentre); return d < 75 ? 2 : d < 120 ? 3 : d < 170 ? 4 : 5; };
function tryLot(kind, c, front, w, d, storeys) {
  const rect = rectOf(c, front, w, d);
  const probes = [c, ...rect, ...[0, 1, 2, 3].map(i => [(rect[i][0] + rect[(i + 1) % 4][0]) / 2, (rect[i][1] + rect[(i + 1) % 4][1]) / 2])];
  if (!probes.every(buildable)) return false;
  for (const key of cellsOf(rect)) for (const other of hash.get(key) ?? []) if (overlaps(rect, other, 0.12)) return false;
  if (templeRects.some(t => overlaps(rect, t, 0.05))) return false;
  const lot = { c, front, w, d, storeys, kind, rect, tone: Math.floor(rand() * 5) };
  lots.push(lot);
  for (const key of cellsOf(rect)) { if (!hash.has(key)) hash.set(key, []); hash.get(key).push(rect); }
  return true;
}
const kindAt = (c, laneFacing) => {
  const near = len(c, pairCentre) < 150, r = rand();
  if (near && r < 0.28) return 'shop';
  if (r < (laneFacing ? 0.66 : 0.18)) return 'insula';
  return 'flats';
};
const storeysFor = (kind, c) => { if (kind === 'shop') return Math.min(storeyCap(c), 2 + (rand() < 0.4 ? 1 : 0)); const r = rand(); return Math.min(storeyCap(c), r < 0.22 ? 3 : r < 0.74 ? 4 : 5); };
const widthFor = kind => kind === 'shop' ? between(5.2, 7.4) : between(9, 17);
const depthFor = kind => kind === 'shop' ? between(8, 10.5) : between(10.5, 13.5);

/** Attached frontage along a street: lots touch; now and then a 2–3 m passage separates two blocks. */
function frontage(line, halfRoad, side, kindFor, depthCap = 14, along0 = 0) {
  const path = sample(line, 1);
  let along = along0;
  while (along < path.length - 6) {
    const s = path[Math.floor(along)], kind = kindFor(s.p), w = widthFor(kind), d = Math.min(depthFor(kind), depthCap);
    const n = [-s.t[1] * side, s.t[0] * side], mid = path[Math.min(path.length - 1, Math.floor(along + w / 2))], c = offset(mid.p, n, halfRoad + 0.6 + d / 2), front = [-n[0], -n[1]];
    if (tryLot(kind, c, front, w, d, storeysFor(kind, c))) along += w + (rand() < 0.1 ? between(2, 3) : 0); else along += 2;
  }
}
// Warehouses between the quay road and the first street frontage, upstream of the bridge (kept from the earlier pass).
{
  const line = quayRoad.filter(p => p[1] > -250 && p[1] < -62), path = sample(line, 1);
  let along = 0;
  while (along < path.length - 6) {
    const s = path[Math.floor(along)], w = between(30, 44), d = between(13, 15), n = [s.t[1], -s.t[0]], mid = path[Math.min(path.length - 1, Math.floor(along + w / 2))], c = offset(mid.p, n, 3.5 + 1.4 + d / 2);
    if (tryLot('warehouse', c, [-n[0], -n[1]], w, d, 2)) along += w + 0.5; else along += 2;
  }
  // A shorter row south of the bridge too: the river harbour needed storage on both sides.
  const south = quayRoad.filter(p => p[1] > 150 && p[1] < 300), p2 = sample(south, 1);
  along = 0;
  while (along < p2.length - 6) {
    const s = p2[Math.floor(along)], w = between(30, 40), d = between(13, 15), n = [s.t[1], -s.t[0]], mid = p2[Math.min(p2.length - 1, Math.floor(along + w / 2))], c = offset(mid.p, n, 3.5 + 1.4 + d / 2);
    if (tryLot('warehouse', c, [-n[0], -n[1]], w, d, 2)) along += w + 0.5; else along += 2;
  }
}
// Street frontage first: both sides of every street that is not the riverside road.
const mainKind = p => kindAt(p, true);
for (const s of streets.filter(s => s.id !== 'street-quay')) for (const side of [1, -1]) frontage(s.points, s.width / 2, side, mainKind);
for (const side of [-1]) frontage(quayRoad.filter(p => p[1] > -10 && p[1] < 150), 3.5, side, mainKind);

// Districts: each lays out blocks on its own grid, so the lanes bend with the valley, the river and the circus.
const districts = [
  { seed: [30, 10], angle: 100, name: 'market' }, { seed: [190, -160], angle: 108, name: 'velabrum' },
  { seed: [150, 330], angle: 37, name: 'circus-side' }, { seed: [-330, 120], angle: 95, name: 'west-bank' }, { seed: [-250, -90], angle: 85, name: 'west-north' },
];
const nearestDistrict = c => districts.reduce((best, d, i) => { const dist = len(c, d.seed) * (d.name === 'market' ? 0.85 : 1); return dist < best.dist ? { dist, i } : best; }, { dist: Infinity, i: 0 }).i;
const courts = [], laneSamples = [];
districts.forEach((district, di) => {
  const t = district.angle * Math.PI / 180, U = [Math.cos(t), Math.sin(t)], V = [-Math.sin(t), Math.cos(t)];
  const W = (u, v) => [district.seed[0] + U[0] * u + V[0] * v, district.seed[1] + U[1] * u + V[1] * v];
  const bounds = () => { const out = [0]; let x = 0; while (x < 1100) out.push(x += between(36, 56)); x = 0; const neg = [0]; while (x > -1100) neg.push(x -= between(36, 56)); return [...neg.reverse(), ...out.slice(1)]; };
  const uB = bounds(), vB = bounds();
  for (let i = 0; i < uB.length - 1; i++) for (let j = 0; j < vB.length - 1; j++) {
    const lane = between(3.2, 4.6), u0 = uB[i] + lane / 2, u1 = uB[i + 1] - lane / 2, v0 = vB[j] + lane / 2, v1 = vB[j + 1] - lane / 2;
    const centre = W((u0 + u1) / 2, (v0 + v1) / 2);
    if (nearestDistrict(centre) !== di || centre[0] < -580 || centre[0] > 480 || centre[1] < -300 || centre[1] > 480 || !buildable(centre) && !buildable(W(u0 + 4, v0 + 4)) && !buildable(W(u1 - 4, v1 - 4))) continue;
    const bw = u1 - u0, bd = v1 - v0, depth = Math.max(8.5, Math.min(13, (Math.min(bw, bd) - 6) / 2));
    const before = lots.length;
    // North and south rows run the full width; east and west rows fit between them.
    for (const [vEdge, outward] of [[v0, -1], [v1, 1]]) {
      let u = u0;
      while (u < u1 - 4) {
        const kind0 = kindAt(W(u, vEdge), true), w = Math.min(widthFor(kind0), u1 - u), c = W(u + w / 2, vEdge - outward * depth / 2), front = [V[0] * outward, V[1] * outward];
        const kind = kind0, d = kind === 'shop' ? Math.min(depth, 10) : depth;
        const cc = kind === 'shop' ? W(u + w / 2, vEdge - outward * d / 2) : c;
        if (tryLot(kind, cc, front, w, d, storeysFor(kind, cc))) u += w + (rand() < 0.08 ? between(2, 3) : 0); else u += 2;
      }
    }
    for (const [uEdge, outward] of [[u0, -1], [u1, 1]]) {
      let v = v0 + depth;
      while (v < v1 - depth - 4) {
        const kind0 = kindAt(W(uEdge, v), true), w = Math.min(widthFor(kind0), v1 - depth - v), kind = kind0, d = kind === 'shop' ? Math.min(depth, 10) : depth;
        const c = W(uEdge - outward * d / 2, v + w / 2), front = [U[0] * outward, U[1] * outward];
        if (tryLot(kind, c, front, w, d, storeysFor(kind, c))) v += w + (rand() < 0.08 ? between(2, 3) : 0); else v += 2;
      }
    }
    if (lots.length - before >= 3) {
      const cw = bw - 2 * depth, cd = bd - 2 * depth;
      if (cw > 3 && cd > 3) courts.push([...pt(W((u0 + u1) / 2, (v0 + v1) / 2)), r1(cw + 2), r1(cd + 2), r3(-t)]);
    }
  }
  // Lane centre lines: every grid line, kept only where a lot stands close by on at least one side.
  const lines = [];
  for (const u of uB) lines.push(Array.from({ length: Math.floor(2200 / 3) + 1 }, (_, k) => W(u, -1100 + k * 3)));
  for (const v of vB) lines.push(Array.from({ length: Math.floor(2200 / 3) + 1 }, (_, k) => W(-1100 + k * 3, v)));
  for (const line of lines) laneSamples.push({ line, di });
});
// Keep lane samples that sit between lots; chain consecutive samples into polylines.
const lotHashNear = (p, r) => { const i = Math.floor(p[0] / HASH), j = Math.floor(p[1] / HASH); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const rect of hash.get(hashKey(a, b)) ?? []) { const c = [(rect[0][0] + rect[2][0]) / 2, (rect[0][1] + rect[2][1]) / 2]; if (len(c, p) < r) return true; } return false; };
const lanes = [];
for (const { line, di } of laneSamples) {
  let chain = [];
  const flush = () => { if (chain.length >= 6) lanes.push({ di, points: chain.filter((_, k) => k % 3 === 0 || k === chain.length - 1).map(pt) }); chain = []; };
  for (const p of line) {
    const ok = p[0] > -580 && p[0] < 480 && p[1] > -300 && p[1] < 480 && nearestDistrict(p) === di && buildable(p) && lotHashNear(p, 18);
    if (ok) chain.push(p); else flush();
  }
  flush();
}
const laneWidth = i => r1(3.4 + (i * 7 % 10) * 0.1);
lanes.forEach((l, i) => { l.width = laneWidth(i); });

// ── Emit ───────────────────────────────────────────────────────────────────────────────────────────────────────
const templates = {
  insula: { title: 'Insula · shops below, flats above', note: 'A multi-storey block of flats with shops (tabernae) along the ground floor, the usual form in Roman streets (Wikipedia, Insula). Heights stay under the Roman limit of about 17.75 m. That a block stood here, and its size and height, are guesses.', sources: ['source:wikipedia-insula', 'source:project-rules'] },
  flats: { title: 'Block of flats (insula)', note: 'A multi-storey block of flats, typical of the dense streets and courtyards of Roman districts (Wikipedia, Insula). Heights stay under the Roman limit of about 17.75 m. That a block stood here, and its size, are guesses.', sources: ['source:wikipedia-insula', 'source:project-rules'] },
  shop: { title: 'Shop-house (taberna) with rooms above', note: 'A shop with a wide opening at street level and rooms above, the usual form in Roman streets (Wikipedia, Insula). That a shop stood here is a guess; so are its size and height.', sources: ['source:wikipedia-insula', 'source:project-rules'] },
  warehouse: { title: 'Riverside warehouse (horreum)', note: 'A two-storey warehouse with thick walls and few, high windows (Wikipedia, Horrea). Riverside storage near the harbour is likely; this building\'s place and size are guessed.', sources: ['source:wikipedia-horrea', 'source:project-rules'] },
  lane: { title: 'Back lane', note: 'A narrow lane between blocks, the usual fine grain of Roman districts (Wikipedia, Insula). That a lane ran here, and its width, are guesses; the lines are laid out by the generator, not recorded.', sources: ['source:wikipedia-insula', 'source:project-rules'] },
};
const lotRows = lots.map(l => [r1(l.c[0]), r1(l.c[1]), r3(l.front[0]), r3(l.front[1]), r1(l.w), r1(l.d), l.storeys, KINDS.indexOf(l.kind), l.tone]);
const out = { seed: SEED, origin, sources, objects, streets, templates, kinds: KINDS, lots: lotRows, lanes: lanes.map(l => [l.width, l.points]), courts,
  notes: { frame: 'Metres east (E) and south (S) of the layout origin', counts: {} } };
// Counts include hydrated lots and lanes, so the file states what the scene shows.
const counts = {};
for (const o of objects) counts[o.certainty] = (counts[o.certainty] ?? 0) + 1;
counts[GUESS] = (counts[GUESS] ?? 0) + lots.length + lanes.length;
out.notes.counts = counts;
await writeFile('lib/scenarios/fixtures/forum-boarium-reconstruction.json', JSON.stringify(out) + '\n');
const byKind = lots.reduce((a, l) => (a[l.kind] = (a[l.kind] ?? 0) + 1, a), {});
const storeyMix = lots.reduce((a, l) => (a[l.storeys] = (a[l.storeys] ?? 0) + 1, a), {});
console.log(JSON.stringify({ objects: objects.length, lots: lots.length, byKind, storeyMix, lanes: lanes.length, courts: courts.length, counts, circus: { c: CIRCUS.c.map(r1), axis: circusAxis.map(r3), fit: Math.round(circusFit.long) } }));
