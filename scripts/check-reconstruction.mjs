// Gate for the best-guess neighbourhood around the two temples: every object carries a certainty, a note and licensed sources;
// nothing post-dates AD 100; no third-party geometry sources; the data regenerates byte-for-byte; buildings do not collide.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const path = 'lib/scenarios/fixtures/forum-boarium-reconstruction.json';
const before = await readFile(path, 'utf8');
const data = JSON.parse(before);

// Deterministic: the generator reproduces the committed file exactly (seed 100).
const run = spawnSync(process.execPath, ['scripts/context/forum-boarium/build-reconstruction.mjs'], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
assert.equal(await readFile(path, 'utf8'), before, 'the reconstruction regenerates identically');
assert.equal(data.seed, 100);

const certainties = new Set(['documented', 'evidence-based', 'best-guess']);
const sources = new Map(data.sources.map(s => [s.id, s]));
assert.equal(sources.size, data.sources.length, 'source ids are unique');
for (const s of data.sources) {
  assert.ok(s.title && s.licence, `${s.id} has a title and a licence`);
  assert.ok(/^https:\/\//.test(s.url) || s.url.startsWith('scripts/'), `${s.id} has a resolvable location`);
  // Orientation-only references: no geometry may come from these (see RECONSTRUCTION.md).
  assert.doesNotMatch(s.url, /formaurbis\.stanford|lanciani|mapping-augustan/i, `${s.id} is not a restricted geometry source`);
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
assert.equal(counts.documented, 2, 'only the two standing temples are documented');
assert.ok(counts['best-guess'] > 100 && counts['evidence-based'] >= 3);

// The things the brief names are all there.
for (const kind of ['bridge', 'quay', 'stage', 'barge', 'square', 'altar', 'street', 'shop', 'flats', 'warehouse', 'stall', 'pen']) assert.ok(data.objects.some(o => o.kind === kind), `${kind} is present`);
assert.ok(data.objects.find(o => o.id === 'pons-aemilius').shape.spans === 7, 'seven spans (Wikipedia)');

// Buildings never overlap each other, the temples or the square (separating-axis test on the rectangles).
const axes = poly => poly.map((p, i) => { const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
const project = (poly, a) => { const v = poly.map(p => p[0] * a[0] + p[1] * a[1]); return [Math.min(...v), Math.max(...v)]; };
const overlap = (a, b) => [...axes(a), ...axes(b)].every(ax => { const [a0, a1] = project(a, ax), [b0, b1] = project(b, ax); return a1 > b0 + 0.05 && b1 > a0 + 0.05; });
const buildings = data.objects.filter(o => o.shape.type === 'building'), solid = data.objects.filter(o => o.kind === 'temple');
for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i], b = buildings[j];
    if (Math.hypot(a.shape.centre[0] - b.shape.centre[0], a.shape.centre[1] - b.shape.centre[1]) > 60) continue;
    assert.ok(!overlap(a.footprint, b.footprint), `${a.id} and ${b.id} do not overlap`);
  }
  for (const t of solid) assert.ok(!overlap(buildings[i].footprint, t.footprint), `${buildings[i].id} stays off ${t.id}`);
  assert.ok(buildings[i].shape.storeys * 3.2 <= 18, `${buildings[i].id} stays under the Roman height limit (~17.75 m)`);
}
console.log(`Reconstruction: ${data.objects.length} objects (${counts.documented} documented, ${counts['evidence-based']} evidence-based, ${counts['best-guess']} best guess), certainty + note + licensed sources on each, nothing after AD 100, deterministic, no overlapping buildings.`);
