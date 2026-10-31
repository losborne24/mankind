// Gate for the AD 100 land-use zoning of Rome: it regenerates byte-for-byte; every zone carries an evidence tier, an existence
// interval that contains AD 100, a note and listed sources; the five uses are all present; zones do not overlap and stay inside the
// extent; no restricted source supplies geometry; the Aurelian Walls (AD 271) are not a zone or a drawn feature.
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

const sources = new Map(data.sources.map(s => [s.id, s]));
for (const s of data.sources) {
  assert.ok(s.title && s.licence && /^https:\/\//.test(s.url), `${s.id} has a title, a licence and a URL`);
  if (/formaurbis\.stanford|atlas-of-ancient-rome|9780691163475/.test(s.url)) assert.match(s.licence, /reference only/i, `${s.id} is reference only`);
}
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;
const area = mp => mp.reduce((sum, poly) => sum + poly.reduce((s, ring, k) => { let a = 0; for (let n = 0; n < ring.length - 1; n++) a += ring[n][0] * ring[n + 1][1] - ring[n + 1][0] * ring[n][1]; return s + (k ? -1 : 1) * Math.abs(a / 2) * KX * KY; }, 0), 0);
const ids = new Set();
for (const z of data.zones) {
  assert.ok(!ids.has(z.id), `${z.id} is unique`); ids.add(z.id);
  assert.ok(['documented', 'approximate', 'illustrative'].includes(z.certainty), `${z.id} has an evidence tier`);
  assert.ok(z.time.start.year <= 100 && z.time.end.year >= 100, `${z.id} exists at AD 100`);
  assert.ok(z.note.length >= 60, `${z.id} has a note`);
  assert.ok(z.sources.length && z.sources.every(id => sources.has(id)), `${z.id} cites listed sources`);
  assert.ok(z.multipolygon.length && z.multipolygon.flat(3).every(Number.isFinite), `${z.id} has geometry`);
  assert.ok(z.short && z.label.length === 2, `${z.id} has a label`);
  // A hand-drawn boundary is never presented as documented, and says it is a guess.
  if (z.use !== 'open-river') assert.notEqual(z.certainty, 'documented', `${z.id}: hand-drawn outlines are not documented`);
  if (z.use !== 'open-river' && z.use !== 'residential') assert.match(z.note, /guess/i, `${z.id}'s note says its edges are a guess`);
  assert.doesNotMatch(`${z.id} ${z.title}`, /aurelian|mura aureliane/i, `${z.id} is not the later wall`);
}
for (const use of ['residential', 'monumental', 'horti', 'port', 'open', 'open-river']) assert.ok(data.zones.some(z => z.use === use), `${use} is zoned`);
const trastevere = data.zones.find(z => z.id === 'zone:residential-trastevere'), east = data.zones.find(z => z.id === 'zone:residential-east');
assert.ok(trastevere.density < east.density && trastevere.area > 5e5, 'Trastevere is zoned for housing, looser than the east bank');
assert.ok(data.zones.find(z => z.id === 'zone:emporium').use === 'port', 'the riverside south of the Aventine is port');

// No overlaps; together they fill the extent.
const extent = [[data.extent.ring]];
let union = [];
for (const z of data.zones) {
  assert.ok(area(polygonClipping.intersection(union, z.multipolygon)) < 50, `${z.id} overlaps no other zone`);
  assert.ok(area(polygonClipping.difference(z.multipolygon, extent)) < 50, `${z.id} stays inside the extent`);
  union = polygonClipping.union(union, z.multipolygon);
}
const covered = area(union) / area(extent);
assert.ok(covered > 0.99, `zones cover the extent (${(covered * 100).toFixed(1)}%)`);
assert.ok(data.extent.area > 12e6 && data.extent.area < 15e6, 'extent is about the 13.7 km² the Aurelian circuit encloses');
// Trajan's Forum (dedicated c. AD 112) is not part of the monumental zoning at AD 100: its centre is not in a monumental zone.
const inside = (p, mp) => mp.some(poly => poly.reduce((c, ring, k) => { let x = false; for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) if ((ring[n][1] > p[1]) !== (ring[m][1] > p[1]) && p[0] < (ring[m][0] - ring[n][0]) * (p[1] - ring[n][1]) / (ring[m][1] - ring[n][1]) + ring[n][0]) x = !x; return k ? c && !x : x; }, false));
assert.ok(!data.zones.filter(z => z.use === 'monumental').some(z => inside([12.4846, 41.8956], z.multipolygon)), "Trajan's Forum site is not zoned monumental at AD 100");
console.log(`zoning ok: ${data.zones.length} zones, ${(data.extent.area / 1e6).toFixed(2)} km², ${(covered * 100).toFixed(1)}% covered`);
