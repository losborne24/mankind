// Gate for the neighbourhood around the two temples: every object carries a certainty, a note and licensed sources; nothing
// post-dates AD 100; no restricted geometry sources; the data regenerates byte-for-byte; buildings do not collide; the city is
// dense (attached multi-storey blocks, no detached houses); the Circus Maximus and the Palatine palace are present, sized and
// placed from their sources; documented streets are marked as such.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadTypescript } from './lib/load-typescript.mjs';
const path = 'lib/scenarios/fixtures/forum-boarium-reconstruction.json';
const before = await readFile(path, 'utf8');
const raw = JSON.parse(before);

// Deterministic: the generator reproduces the committed file exactly (seed 100).
const run = spawnSync(process.execPath, ['scripts/context/forum-boarium/build-reconstruction.mjs'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
assert.equal(await readFile(path, 'utf8'), before, 'the reconstruction regenerates identically');
assert.equal(raw.seed, 100);

// The runtime sees hydrated objects: compact lots and lanes expanded with their per-kind notes.
const { hydrateReconstruction } = await import(await loadTypescript('lib/history/reconstructionHydrate'));
const data = hydrateReconstruction(raw);

const certainties = new Set(['documented', 'evidence-based', 'best-guess']);
const sources = new Map(data.sources.map(s => [s.id, s]));
assert.equal(sources.size, data.sources.length, 'source ids are unique');
for (const s of data.sources) {
  assert.ok(s.title && s.licence, `${s.id} has a title and a licence`);
  assert.ok(/^https:\/\//.test(s.url) || s.url.startsWith('scripts/'), `${s.id} has a resolvable location`);
  // Orientation-only references: no geometry may come from these (see RECONSTRUCTION.md). Lanciani's 1901 plate is public domain and is allowed.
  assert.doesNotMatch(s.url, /formaurbis\.stanford|mapping-augustan/i, `${s.id} is not a restricted geometry source`);
  if (/lanciani/i.test(s.url)) assert.match(s.licence, /public domain/i, `${s.id} is public domain`);
}
const ids = new Set();
const forbidden = /arch of janus|arcus argentariorum|santa maria in cosmedin|constantin|septimius/i;
for (const o of data.objects) {
  assert.ok(!ids.has(o.id), `${o.id} is unique`); ids.add(o.id);
  assert.ok(certainties.has(o.certainty), `${o.id} has a certainty level`);
  assert.ok(o.note && o.note.length >= 40, `${o.id} has a note`);
  assert.ok(o.sources.length > 0, `${o.id} cites sources`);
  for (const id of o.sources) assert.ok(sources.has(id) || /^source:(osm|pleiades|wikipedia)-/.test(id), `${o.id}: source ${id} is listed`);
  assert.ok(o.footprint.length >= 3 && o.footprint.flat().every(Number.isFinite), `${o.id} has a footprint`);
  assert.doesNotMatch(`${o.id} ${o.title} ${o.note.replace(/\bSanta Maria in Cosmedin\b/g, '')}`, forbidden, `${o.id} names nothing later than AD 100`);
  // Nothing placed here may begin after AD 100.
  assert.ok((o.time?.start.year ?? 100) <= 100, `${o.id} does not post-date AD 100`);
  if (o.certainty === 'best-guess') assert.ok(/guess|likely|usual|typical|stood here/i.test(o.note), `${o.id}'s note says what is guessed`);
}
const counts = data.objects.reduce((a, o) => (a[o.certainty] = (a[o.certainty] ?? 0) + 1, a), {});
assert.deepEqual(raw.notes.counts, counts, 'the counts in the file match the hydrated objects');
assert.equal(counts.documented, 2, 'only the two standing temples are documented');
assert.ok(counts['best-guess'] > 1000 && counts['evidence-based'] >= 8);

// The things the briefs name are all there.
for (const kind of ['bridge', 'quay', 'stage', 'barge', 'square', 'altar', 'street', 'lane', 'shop', 'insula', 'flats', 'warehouse', 'stall', 'pen', 'circus', 'palace']) assert.ok(data.objects.some(o => o.kind === kind), `${kind} is present`);
assert.ok(data.objects.find(o => o.id === 'pons-aemilius').shape.spans === 7, 'seven spans (Wikipedia)');

// Landmarks: placed and sized from their sources, and evidence-based (never documented, never a bare guess).
const circus = data.objects.find(o => o.id === 'circus-maximus'), flavia = data.objects.find(o => o.id === 'domus-flavia'), augustana = data.objects.find(o => o.id === 'domus-augustana');
for (const o of [circus, flavia, augustana, data.objects.find(o => o.id === 'domus-tiberiana')]) assert.equal(o.certainty, 'evidence-based', `${o.id} is evidence-based`);
assert.equal(circus.shape.length, 621, 'Circus Maximus is 621 m long (Wikipedia)'); assert.equal(circus.shape.track, 118, '... and 118 m wide');
assert.ok(circus.sources.includes('source:osm-circus-maximus') && circus.sources.includes('source:wikipedia-circus-maximus'));
assert.ok(flavia.sources.includes('source:pleiades-domus-flavia') && augustana.sources.includes('source:pleiades-domus-augustana'));
assert.equal(flavia.shape.volumes.find(v => v.role === 'hall').height, 31, 'the great hall is over 30 m (Wikipedia)');
// The circus's axis was fitted to the OpenStreetMap outline: it runs south-east from the starting gates, and the whole outline sits in the valley south-east of the market.
const [cx, cz] = circus.shape.centre;
assert.ok(cx > 300 && cx < 500 && cz > 250 && cz < 450, 'the circus lies 400-550 m south-east of the temples, where OpenStreetMap puts its site');
assert.ok(circus.shape.axis[0] > 0.7 && circus.shape.axis[1] > 0.5, 'the circus axis runs south-east');
const centre = o => o.footprint.reduce((a, p) => [a[0] + p[0] / o.footprint.length, a[1] + p[1] / o.footprint.length], [0, 0]);
for (const o of [flavia, augustana]) { const c = centre(o); assert.ok(c[0] > 400 && c[0] < 600 && c[1] > -50 && c[1] < 200, `${o.id} stands on the Palatine, about 500 m east of the temples`); }
assert.ok(circus.shape.outerHeight * 1 > 15 && circus.shape.outerHeight < 40, 'circus massing stays plausible');

// Streets: the documented ones are named, evidence-based where a source maps them, and best guess where the line is drawn along a modern street.
const street = id => data.objects.find(o => o.id === id);
for (const id of ['street-tuscus-forum', 'street-iugarius-forum', 'street-clivus-victoriae', 'street-bridge']) assert.equal(street(id).certainty, 'evidence-based', `${id} is evidence-based`);
for (const id of ['street-tuscus-velabrum', 'street-iugarius-market', 'street-circus', 'street-quay']) assert.equal(street(id).certainty, 'best-guess', `${id} is a best guess`);
assert.ok(street('street-tuscus-forum').sources.includes('source:osm-vicus-tuscus'), 'the Vicus Tuscus segment cites the OpenStreetMap way it was taken from');
assert.ok(!data.objects.some(o => /^street-(spoke|radial)/.test(o.id)), 'no radial spokes');

// Density: attached multi-storey fabric, no detached houses. Street frontage is near-continuous, and no building is lower than two or taller than five storeys.
const buildings = data.objects.filter(o => o.shape.type === 'building');
assert.ok(buildings.length > 1500, `a dense city: ${buildings.length} buildings`);
assert.ok(!data.objects.some(o => /villa|farm|hamlet|roman-kit/i.test(`${o.id} ${o.kind} ${o.title}`)), 'no Roman-kit farmhouses or villas in the city');
const storeys = buildings.filter(b => b.kind !== 'warehouse').map(b => b.shape.storeys);
assert.ok(storeys.every(s => s >= 2 && s <= 5), 'two to five storeys');
assert.ok(storeys.filter(s => s >= 3).length / storeys.length > 0.8, 'most buildings are three to five storeys');
assert.ok(buildings.filter(b => b.kind === 'insula').length > buildings.length * 0.3, 'insulae with ground-floor shops dominate the street frontage');
assert.ok(buildings.filter(b => b.kind === 'warehouse').length >= 4, 'warehouses stay along the river');
assert.ok(raw.courts.length > 100 && data.streets.filter(s => s.id.startsWith('lane-')).length > 50, 'courtyards and narrow lanes');
assert.ok(data.streets.filter(s => s.id.startsWith('lane-')).every(s => s.width >= 3 && s.width <= 4.6), 'lanes are narrow (3-4.6 m)');
const axes = poly => poly.map((p, i) => { const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
const project = (poly, a) => { const v = poly.map(p => p[0] * a[0] + p[1] * a[1]); return [Math.min(...v), Math.max(...v)]; };
const overlap = (a, b, tol) => [...axes(a), ...axes(b)].every(ax => { const [a0, a1] = project(a, ax), [b0, b1] = project(b, ax); return a1 > b0 + tol && b1 > a0 + tol; });
// Party walls: a building's side touches a neighbour's (gap under 0.4 m) far more often than not.
let attached = 0;
const cell = new Map(), key = (i, j) => `${i},${j}`;
for (const b of buildings) { const i = Math.floor(b.shape.centre[0] / 20), j = Math.floor(b.shape.centre[1] / 20); const k = key(i, j); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(b); }
const near = b => { const i = Math.floor(b.shape.centre[0] / 20), j = Math.floor(b.shape.centre[1] / 20), out = []; for (let a = i - 2; a <= i + 2; a++) for (let c = j - 2; c <= j + 2; c++) out.push(...(cell.get(key(a, c)) ?? [])); return out; };
for (const b of buildings) { if (near(b).some(o => o !== b && overlap(b.footprint, o.footprint, -0.4) && !overlap(b.footprint, o.footprint, 0.35))) attached++; }
assert.ok(attached / buildings.length > 0.7, `party walls: ${Math.round(100 * attached / buildings.length)}% of buildings touch a neighbour`);

// Buildings never overlap each other, the temples, the square or the landmarks (separating-axis test on the rectangles; footprints are rounded to 10 cm, so party walls may touch).
const insidePolygon = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const solid = data.objects.filter(o => o.kind === 'temple' || o.kind === 'circus' || o.kind === 'palace' || o.kind === 'square');
for (const b of buildings) {
  for (const o of near(b)) if (o !== b) assert.ok(!overlap(b.footprint, o.footprint, 0.35), `${b.id} and ${o.id} do not overlap`);
  for (const t of solid) { if (t.kind === 'square') { assert.ok(!b.footprint.some(p => insidePolygon(p, t.footprint)), `${b.id} stays out of the square`); continue; } assert.ok(!overlap(b.footprint, t.footprint, 0.05), `${b.id} stays off ${t.id}`); }
  assert.ok(b.shape.storeys * 3.2 <= 18, `${b.id} stays under the Roman height limit (~17.75 m)`);
}
// Temples stay readable: nothing taller than three storeys within 120 m of them, nothing above two within 75 m.
for (const b of buildings) { const d = Math.hypot(b.shape.centre[0] - 6, b.shape.centre[1] - 20); if (d < 75) assert.ok(b.shape.storeys <= 2 || b.kind === 'warehouse', `${b.id} is low beside the temples`); else if (d < 120) assert.ok(b.shape.storeys <= 3, `${b.id} is at most three storeys near the temples`); }
// Pass D: the period survey. The ancient bank, the bridge piers, the drains, the paved street and the Statio Annonae come from Lanciani's plate 28,
// carry his source, are evidence-based and say why a find of uncertain date is shown at AD 100.
const lanciani = data.objects.filter(o => o.sources.includes('source:lanciani-fur-28'));
assert.ok(lanciani.length >= 8, `objects placed from the plate: ${lanciani.length}`);
for (const id of ['quay-wall', 'street-basalt', 'street-basalt-cross', 'cloaca-maxima', 'cloaca-circi-maximi', 'statio-annonae', 'pons-aemilius']) assert.equal(data.objects.find(o => o.id === id)?.certainty, 'evidence-based', `${id} is evidence-based`);
for (const id of ['quay-wall', 'street-basalt', 'street-basalt-cross', 'statio-annonae']) assert.ok(data.objects.find(o => o.id === id).snap?.length > 40, `${id} says why it is shown at AD 100`);
for (const id of ['cloaca-maxima', 'cloaca-circi-maximi']) assert.equal(data.objects.find(o => o.id === id).kind, 'drain', `${id} is a drain`);
const piersE = data.objects.find(o => o.id === 'pons-aemilius').shape.piersE;
assert.equal(piersE.length, 8, 'eight piers, seven spans'); assert.ok(Math.abs(piersE.at(-1) + 154.5) < 0.2 && Math.abs(piersE[4] + 98.6) < 0.2, 'the four drawn piers are where the plate puts them');
assert.ok(data.waterExtra?.[0]?.length > 20, 'the strip of river the embankments took is carried as water');
// The ancient east bank lies east of today's: every point of the strip's east edge is further east than its west edge.
{ const ring = data.waterExtra[0], half = ring.length / 2, east = ring.slice(0, half), west = ring.slice(half).reverse(); assert.ok(east.every((p, i) => p[0] > west[i][0] + 1), 'the ancient bank is east of the modern one'); }
// No building stands in the ancient river.
for (const b of buildings) assert.ok(!insidePolygon(b.shape.centre, data.waterExtra[0]), `${b.id} is not in the ancient river`);

console.log(`Reconstruction: ${data.objects.length} objects (${counts.documented} documented, ${counts['evidence-based']} evidence-based, ${counts['best-guess']} best guess), ${buildings.length} attached buildings, ${raw.courts.length} courtyards, Circus Maximus and palace from OpenStreetMap/Pleiades, documented streets marked, ancient bank, piers, drains and paved street from Lanciani's plate 28, nothing after AD 100, deterministic, no overlapping buildings.`);
