// Gate for the AD 100 land-use zoning of Rome: it regenerates byte-for-byte; every zone and marker carries an evidence tier, an
// existence interval, a note and listed sources; the uses and housing classes are all present; zones present at AD 100 do not overlap
// and fill the extent; later features (Baths of Trajan, Trajan's Forum) are dated after AD 100; the extent is not the Aurelian circuit
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
  assert.ok(z.multipolygon.length && z.multipolygon.flat(3).every(Number.isFinite), `${z.id} has geometry`);
  assert.ok(z.short && z.label.length === 2, `${z.id} has a label`);
  // A hand-drawn boundary is never presented as documented, and says it is a guess or approximate.
  if (z.use !== 'open-river') assert.notEqual(z.certainty, 'documented', `${z.id}: hand-drawn outlines are not documented`);
  if (z.use !== 'open-river') assert.match(z.note, /guess|approximate/i, `${z.id}'s note says its edges are a guess`);
}
dated(data.extent);
assert.equal(data.extent.certainty, 'approximate', 'the extent is approximate');
const now = data.zones.filter(at100), later = data.zones.filter(z => !at100(z));
assert.deepEqual(later.map(z => z.id).sort(), ['zone:baths-of-trajan', 'zone:forum-of-trajan'], 'only the Trajanic works are dated after AD 100');
for (const z of later) assert.ok(z.time.start.year > 100, `${z.id} starts after AD 100`);

for (const use of ['residential', 'monumental', 'horti', 'port', 'open', 'open-river']) assert.ok(now.some(z => z.use === use), `${use} is zoned`);
for (const cls of ['dense', 'elite', 'roadside']) assert.ok(now.some(z => z.housing === cls), `${cls} housing is zoned`);
const z = id => data.zones.find(q => q.id === id);
assert.ok(z('zone:residential-elite').density < z('zone:residential-dense').density && z('zone:residential-trastevere').density < z('zone:residential-dense').density, 'elite and Trastevere housing are looser than the dense core');
assert.match(z('zone:residential-elite').sources.join(), /aventine.*caelian/, 'elite housing is sourced');
assert.match(z('zone:residential-dense').sources.join(), /subura/, 'dense housing is sourced');

// Temples: both anchors lie in the monumental Forum Boarium zone.
for (const id of ['place:temple-of-portunus', 'place:temple-of-hercules-victor']) {
  const at = world.places.find(p => p.id === id).position.coordinate;
  assert.ok(inside(at, z('zone:forum-boarium').multipolygon), `${id} is inside the Forum Boarium zone`);
}
assert.equal(z('zone:forum-boarium').use, 'monumental');

// No overlaps among the zones of AD 100; together they fill the extent.
const extent = [[data.extent.ring]];
let union = [];
for (const q of now) {
  assert.ok(area(polygonClipping.intersection(union, q.multipolygon)) < 50, `${q.id} overlaps no other zone`);
  assert.ok(area(polygonClipping.difference(q.multipolygon, extent)) < 50, `${q.id} stays inside the extent`);
  union = polygonClipping.union(union, q.multipolygon);
}
const covered = area(union) / area(extent);
assert.ok(covered > 0.99, `zones cover the extent (${(covered * 100).toFixed(1)}%)`);
// Not the wall line: the Janiculum slopes inside the later wall's triangle (away from the Via Aurelia) are outside the continuous city.
for (const p of [[12.4628, 41.8895], [12.4645, 41.8800]]) assert.ok(!inside(p, extent), `${p} on the Janiculum is outside the continuous city`);
assert.ok(data.extent.area > 10e6 && data.extent.area < 16e6, 'extent is a city-sized area');
assert.ok(!inside([12.4846, 41.8956], now.filter(q => q.use === 'monumental').flatMap(q => q.multipolygon)), "Trajan's Forum site is not monumental at AD 100");

// Markers: fourteen regions plus anchors, each dated and inside what it labels.
const markers = new Map(data.markers.map(m => [m.id, m]));
for (const m of data.markers) { dated(m, 40); assert.ok(inside(m.coordinate, extent), `${m.id} is inside the city`); }
for (const n of ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv']) assert.ok(markers.has(`marker:regio-${n}`), `Regio ${n.toUpperCase()} has a marker`);
assert.ok(inside(markers.get('marker:regio-xiv').coordinate, z('zone:residential-trastevere').multipolygon), 'Regio XIV is in Trastevere');
assert.ok(inside(markers.get('marker:horti-luculliani').coordinate, z('zone:collis-hortorum').multipolygon), 'Horti Luculliani is in its zone');
for (const id of ['marker:horti-maecenatis', 'marker:horti-lamiani']) assert.ok(inside(markers.get(id).coordinate, z('zone:esquiline-horti').multipolygon), `${id} is in its zone`);
for (const id of ['marker:emporium', 'marker:porticus-aemilia']) assert.ok(inside(markers.get(id).coordinate, z('zone:emporium').multipolygon), `${id} is in the port zone`);
console.log(`zoning ok: ${data.zones.length} zones (${later.length} after AD 100), ${data.markers.length} markers, ${(data.extent.area / 1e6).toFixed(2)} km², ${(covered * 100).toFixed(1)}% covered`);
