// Gate for the AD 100 land-use zoning of Rome: it regenerates byte-for-byte; every zone and marker carries an evidence tier, an
// existence interval, a note and listed sources; the uses and housing classes are all present; zones present at AD 100 do not overlap
// and fill the frame; later features (Baths of Trajan, Trajan's Forum, Baths of Caracalla, Hadrian's Mausoleum) are dated after AD 100 and
// say what the date means; the suburbium has its roads, aqueducts, Vatican plain and Campagna; the extent is not the Aurelian circuit
// and nothing from the walls or their gates appears; the temple anchors sit in the Forum Boarium zone; markers sit inside what they label.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import polygonClipping from 'polygon-clipping';
const path = 'lib/scenarios/fixtures/rome-ad100-zoning.json';
const before = await readFile(path, 'utf8');
const run = spawnSync(process.execPath, ['scripts/context/rome/build-zoning.mjs'], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
assert.equal(await readFile(path, 'utf8'), before, 'the zoning regenerates identically');
const data = JSON.parse(before);
const world = JSON.parse(await readFile('lib/history/fixtures/forum-boarium.json', 'utf8'));

const sources = new Map(data.sources.map(s => [s.id, s]));
for (const s of data.sources) {
  assert.ok(s.title && s.licence && /^https:\/\//.test(s.url), `${s.id} has a title, a licence and a URL`);
  if (/formaurbis\.stanford|9780691163475/.test(s.url)) assert.match(s.licence, /reference only/i, `${s.id} is reference only`);
}
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;
const area = mp => mp.reduce((sum, poly) => sum + poly.reduce((s, ring, k) => { let a = 0; for (let n = 0; n < ring.length - 1; n++) a += ring[n][0] * ring[n + 1][1] - ring[n + 1][0] * ring[n][1]; return s + (k ? -1 : 1) * Math.abs(a / 2) * KX * KY; }, 0), 0);
const inside = (p, mp) => mp.some(poly => poly.reduce((c, ring, k) => { let x = false; for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) if ((ring[n][1] > p[1]) !== (ring[m][1] > p[1]) && p[0] < (ring[m][0] - ring[n][0]) * (p[1] - ring[n][1]) / (ring[m][1] - ring[n][1]) + ring[n][0]) x = !x; return k ? c && !x : x; }, false));
const at100 = d => d.time.start.year <= 100 && d.time.end.year >= 100;
const dated = (d, minNote = 60) => {
  assert.ok(['documented', 'approximate', 'illustrative'].includes(d.certainty), `${d.id} has an evidence tier`);
  assert.ok(Number.isFinite(d.time.start.year) && d.time.end.year >= d.time.start.year, `${d.id} has an existence interval`);
  assert.ok(d.note.length >= minNote, `${d.id} has a note`);
  assert.ok(d.sources.length && d.sources.every(id => sources.has(id)), `${d.id} cites listed sources`);
  // Nothing from the later circuit: no Aurelian walls or gates by name.
  assert.doesNotMatch(`${d.id} ${d.title}`, /aurelian|mura aureliane|porta (portuensis|portese|maggiore|san pancrazio|aurelia)\b/i, `${d.id} is not part of the later walls`);
};
const ids = new Set();
for (const z of data.zones) {
  assert.ok(!ids.has(z.id), `${z.id} is unique`); ids.add(z.id);
  dated(z);
  assert.ok((z.multipolygon.length || z.implicit) && z.multipolygon.flat(3).every(Number.isFinite), `${z.id} has geometry`);
  assert.ok((z.short || z.band > 1) && z.label.length === 2, `${z.id} has a label (outer suburban bands go unlabelled)`);
  // A hand-drawn boundary is never presented as documented, and says it is a guess or approximate.
  if (z.use !== 'open-river') assert.notEqual(z.certainty, 'documented', `${z.id}: hand-drawn outlines are not documented`);
  if (z.use !== 'open-river') assert.match(z.note, /guess|approximate/i, `${z.id}'s note says its edges are a guess`);
}
dated(data.extent);
assert.equal(data.extent.certainty, 'approximate', 'the extent is approximate');
const now = data.zones.filter(at100), later = data.zones.filter(z => !at100(z));
assert.deepEqual(later.map(z => z.id).sort(), ['zone:baths-of-caracalla', 'zone:baths-of-trajan', 'zone:forum-of-trajan', 'zone:mausoleum-hadriani'], 'only these are dated after AD 100');
for (const z of later) { assert.ok(z.time.start.year > 100, `${z.id} starts after AD 100`); assert.match(`${z.dateNote} ${z.title}`, /construction|built|opened|dedicated|finished/i, `${z.id} says what its start date means`); }
assert.match(data.zones.find(z => z.id === 'zone:forum-of-trajan').title, /construction from c\. AD 106, dedicated 112/, "Trajan's Forum date is a construction start");
assert.match(data.zones.find(z => z.id === 'zone:baths-of-trajan').title, /opened 109/, 'Baths of Trajan date is a construction start');

for (const use of ['residential', 'monumental', 'necropolis', 'horti', 'port', 'open', 'open-river', 'suburban', 'campagna']) assert.ok(now.some(z => z.use === use), `${use} is zoned`);
for (const cls of ['dense', 'mixed', 'elite', 'roadside']) assert.ok(now.some(z => z.housing === cls), `${cls} housing is zoned`);
const z = id => data.zones.find(q => q.id === id);
assert.ok(z('zone:residential-elite').density < z('zone:residential-dense').density && z('zone:residential-trastevere').density < z('zone:residential-dense').density, 'elite and Trastevere housing are looser than the dense core');
assert.match(z('zone:residential-elite').sources.join(), /aventine.*caelian/, 'elite housing is sourced');
assert.match(z('zone:residential-dense').sources.join(), /subura/, 'dense housing is sourced');
assert.equal(z('zone:residential-hills').certainty, 'illustrative', 'hill housing is illustrative');
assert.ok(z('zone:residential-hills').density < z('zone:residential-dense').density && z('zone:residential-hills').density > z('zone:residential-elite').density, 'hill housing sits between dense and elite');
// The river is filled along the whole map, well beyond the city.
const riverSpan = z('zone:tiber').multipolygon.flat(2).map(p => p[1]);
assert.ok(Math.min(...riverSpan) < 41.86 && Math.max(...riverSpan) > 41.925, 'the Tiber zone runs the length of the map');

// Temples: both anchors lie in the monumental Forum Boarium zone.
for (const id of ['place:temple-of-portunus', 'place:temple-of-hercules-victor']) {
  const at = world.places.find(p => p.id === id).position.coordinate;
  assert.ok(inside(at, z('zone:forum-boarium').multipolygon), `${id} is inside the Forum Boarium zone`);
}
assert.equal(z('zone:forum-boarium').use, 'monumental');

// No overlaps among the zones of AD 100; city zones stay inside the continuous city and the rest outside it; together they fill the frame.
const extent = [[data.extent.ring]], frame = [[data.frame]];
let union = [];
for (const q of now) {
  // Coordinates are rounded to 1e-6°, so edges shared with a large zone leave slivers: allow 50 m² or one part per million of its area.
  assert.ok(area(polygonClipping.intersection(union, q.multipolygon)) < Math.max(50, area(q.multipolygon) * 1e-6), `${q.id} overlaps no other zone`);
  if (q.ring === 'city') assert.ok(area(polygonClipping.difference(q.multipolygon, extent)) < 50, `${q.id} stays inside the extent`);
  if (q.ring === 'suburbium' || q.ring === 'campagna') assert.ok(area(polygonClipping.intersection(q.multipolygon, extent)) < 50, `${q.id} stays outside the extent`);
  union = polygonClipping.union(union, q.multipolygon);
}
// The Campagna's outline is implicit: whatever the frame holds that no other zone does.
const campagnaZone = data.zones.find(q => q.id === 'zone:campagna');
assert.equal(campagnaZone.implicit, 'the frame less every other zone');
const campagnaArea = area(frame) - area(polygonClipping.intersection(union, frame));
assert.ok(Math.abs(campagnaArea - campagnaZone.area) / campagnaZone.area < 0.01, `the Campagna is what the other zones leave (${(campagnaArea / 1e6).toFixed(1)} km²)`);
union = polygonClipping.union(union, polygonClipping.difference(frame, union));
const covered = area(polygonClipping.intersection(union, frame)) / area(frame);
assert.ok(covered > 0.99, `zones cover the frame (${(covered * 100).toFixed(1)}%)`);
assert.ok(area(polygonClipping.intersection(union, extent)) / area(extent) > 0.99, 'zones cover the continuous city');

// Suburbium: the right bank's named places, the Aniene to its confluence, roads and aqueducts.
for (const id of ['zone:circus-vaticanus', 'zone:horti-agrippinae', 'zone:vatican-necropolis', 'zone:horti-domitiae', 'zone:via-appia-tombs', 'zone:suburb-roadside', 'zone:suburbium', 'zone:campagna', 'zone:aniene'])
  assert.ok(now.some(q => q.id === id), `${id} is drawn at AD 100`);
for (const q of now.filter(q => q.ring === 'suburbium' || q.ring === 'campagna')) if (!['zone:circus-vaticanus', 'zone:horti-agrippinae', 'zone:vatican-necropolis', 'zone:horti-domitiae', 'zone:via-appia-tombs'].includes(q.id)) assert.equal(q.certainty, 'illustrative', `${q.id} is illustrative`);
// The suburbium is a continuous field: zero on the rivers, falling off with distance from the city, lower on the floodplain; its image
// fades to nothing by the frame's corners. The Appia's tombs reach the Tomb of Caecilia Metella.
const fieldFile = JSON.parse(await readFile('lib/scenarios/fixtures/rome-ad100-suburb-density.json', 'utf8')), values = Buffer.from(fieldFile.values, 'base64');
assert.equal(values.length, fieldFile.rows * fieldFile.cols, 'the field has one value per cell');
const cellOf = p => { const c = Math.floor((p[0] - fieldFile.west) * KX / fieldFile.cell), r = Math.floor((fieldFile.north - p[1]) * KY / fieldFile.cell); return values[r * fieldFile.cols + c] / 255; };
const tiberZone = data.zones.find(q => q.id === 'zone:tiber');
let wetCells = 0, wetZero = 0;
for (let r = 0; r < fieldFile.rows; r += 3) for (let c = 0; c < fieldFile.cols; c += 3) { const p = [fieldFile.west + (c + 0.5) * fieldFile.cell / KX, fieldFile.north - (r + 0.5) * fieldFile.cell / KY]; if (inside(p, tiberZone.multipolygon)) { wetCells++; if (values[r * fieldFile.cols + c] === 0) wetZero++; } }
assert.ok(wetCells > 20 && wetZero === wetCells, `no suburban density on the river (${wetZero}/${wetCells} river cells are zero)`);
const along = [[12.505, 41.904], [12.535, 41.915], [12.56, 41.925]].map(cellOf);   // out from the city towards the north-east, off the roads
assert.ok(along[0] > along[1] && along[1] >= along[2], `the field falls off with distance (${along.map(v => v.toFixed(2))})`);
assert.ok(data.zones.find(q => q.id === 'zone:suburbium').density > data.zones.find(q => q.id === 'zone:campagna').density, 'the suburbium is denser than the Campagna');
assert.ok(/floodplain/.test(data.zones.find(q => q.id === 'zone:suburbium').note) && /slope/.test(data.zones.find(q => q.id === 'zone:suburbium').note), 'the suburbium note names the floodplain and slope limits');
const png = Buffer.from(data.suburbImage.png, 'base64');
assert.equal(png.subarray(1, 4).toString(), 'PNG', 'the field image is a PNG');
assert.ok(data.suburbImage.fade.to <= Math.min(data.frame[1][0] - data.frame[0][0], data.frame[2][1] - data.frame[0][1]) / 2 * KY, 'the field fades out before the frame edge');
const caecilia = data.markers.find(m => m.id === 'marker:caecilia-metella').coordinate, tombs = data.zones.find(q => q.id === 'zone:via-appia-tombs');
assert.ok(tombs.multipolygon.flat(2).some(p => Math.hypot((p[0] - caecilia[0]) * KX, (p[1] - caecilia[1]) * KY) < 120), 'the Appia tombs reach the Tomb of Caecilia Metella');
const anieneWest = Math.min(...data.zones.find(q => q.id === 'zone:aniene').multipolygon.flat(2).map(p => p[0]));
assert.ok(anieneWest < 12.506, 'the Aniene reaches its confluence with the Tiber');
const lines = new Map(data.lines.map(l => [l.id, l]));
for (const l of data.lines) { dated(l, 60); assert.ok(l.lines.length && [...l.lines, ...(l.gaps ?? [])].every(line => line.length > 1 && line.flat().every(Number.isFinite)), `${l.id} has geometry`); assert.ok(at100(l), `${l.id} exists at AD 100`); }
// Roads are joined into one chain each, with at most a few gaps, and no road crosses the Tiber except at a bridge point.
for (const l of data.lines.filter(l => l.kind === 'road')) assert.ok(l.lines.length <= 4 && (l.gaps ?? []).length <= 3, `${l.id} is one chain with few gaps (${l.lines.length} runs)`);
// Every road from the east bank or Trastevere is carried in to its gate or bridge, and that way in ends where the road begins.
for (const l of data.lines.filter(l => l.kind === 'road' && !/triumphalis|cornelia/.test(l.id))) {
  assert.ok(l.links?.length, `${l.id} runs in to the city`);
  for (const link of l.links) { assert.deepEqual(link.line.at(-1), l.lines[0][0], `${l.id}'s way in ends where the road begins`); assert.ok(inside(link.line[0], extent), `${l.id}'s way in starts inside the city`); assert.ok(link.note, `${l.id}'s way in says where from`); }
}
const tiber = data.zones.find(q => q.id === 'zone:tiber').multipolygon, riverEdges = tiber.flatMap(poly => poly.flatMap(r => r.slice(1).map((b, n) => [r[n], b])));
const crosses = (a, b, c, e) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, e) && o(c, e, a) !== o(c, e, b); };
// Bridges a road may cross at: the Pons Neronianus (a marker) and the Pons Mulvius, where the Via Flaminia crosses 3 km north (Ponte Milvio today).
const bridges = [data.markers.find(m => m.id === 'marker:pons-neronianus').coordinate, [12.4669, 41.9357]];
const atBridge = (a, b) => bridges.some(c => [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]].some(p => Math.hypot((p[0] - c[0]) * KX, (p[1] - c[1]) * KY) < 150));
for (const l of data.lines.filter(l => l.kind === 'road')) for (const line of [...l.lines, ...(l.gaps ?? [])]) for (let n = 1; n < line.length; n++)
  if (!atBridge(line[n - 1], line[n])) assert.ok(!riverEdges.some(([c, e]) => crosses(line[n - 1], line[n], c, e)), `${l.id} does not cross the Tiber at ${line[n]}`);
for (const r of ['flaminia', 'salaria', 'nomentana', 'tiburtina', 'labicana', 'praenestina', 'latina', 'appia', 'ostiensis', 'portuensis', 'aurelia', 'triumphalis', 'cornelia']) assert.ok(lines.has(`road:via-${r}`), `Via ${r} is drawn`);
assert.equal(lines.get('road:via-appia').certainty, 'documented', 'the Via Appia is documented');
assert.equal(lines.get('road:via-cornelia').certainty, 'illustrative', 'the hand-drawn Via Cornelia is illustrative');
assert.equal(lines.get('aqueduct:claudia-arches').certainty, 'documented', 'the standing Claudia arches are documented');
for (const id of ['aqueduct:claudia-arches', 'aqueduct:claudia-route']) assert.equal(lines.get(id).time.start.year, 52, `${id} dates from AD 52`);
assert.doesNotMatch(JSON.stringify(data.lines.map(l => l.sources)), /felice/i, 'the Acqua Felice (1586) is not a source');
// Not the wall line: the Janiculum slopes inside the later wall's triangle (away from the Via Aurelia) are outside the continuous city.
for (const p of [[12.4628, 41.8895], [12.4645, 41.8800]]) assert.ok(!inside(p, extent), `${p} on the Janiculum is outside the continuous city`);
assert.ok(data.extent.area > 10e6 && data.extent.area < 16e6, 'extent is a city-sized area');
assert.ok(!inside([12.4846, 41.8956], now.filter(q => q.use === 'monumental').flatMap(q => q.multipolygon)), "Trajan's Forum site is not monumental at AD 100");

// Markers: fourteen regions plus anchors, each dated and inside what it labels.
const markers = new Map(data.markers.map(m => [m.id, m]));
const suburbMarkers = new Set(['marker:pons-neronianus', 'marker:via-triumphalis-necropolis', 'marker:caecilia-metella']);
for (const m of data.markers) { dated(m, 40); assert.equal(inside(m.coordinate, extent), !suburbMarkers.has(m.id), `${m.id} is ${suburbMarkers.has(m.id) ? 'outside' : 'inside'} the city`); }
for (const n of ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv']) assert.ok(markers.has(`marker:regio-${n}`), `Regio ${n.toUpperCase()} has a marker`);
assert.ok(inside(markers.get('marker:regio-xiv').coordinate, z('zone:residential-trastevere').multipolygon), 'Regio XIV is in Trastevere');
assert.ok(inside(markers.get('marker:horti-luculliani').coordinate, z('zone:collis-hortorum').multipolygon), 'Horti Luculliani is in its zone');
assert.ok(!markers.has('marker:horti-maecenatis'), 'the Horti Maecenatis zone is not duplicated by a marker');
for (const id of ['marker:horti-lamiani']) assert.ok(inside(markers.get(id).coordinate, z('zone:esquiline-horti').multipolygon), `${id} is in its zone`);
for (const id of ['marker:emporium', 'marker:porticus-aemilia']) assert.ok(inside(markers.get(id).coordinate, z('zone:emporium').multipolygon), `${id} is in the port zone`);
console.log(`zoning ok: ${data.zones.length} zones (${later.length} after AD 100), ${data.lines.length} roads and aqueducts, ${data.markers.length} markers, city ${(data.extent.area / 1e6).toFixed(2)} km², frame ${(covered * 100).toFixed(1)}% covered`);
