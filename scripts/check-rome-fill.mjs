// Gate for the zoned fill of Rome c. AD 100 (lib/scenarios/romeFill.ts): it is deterministic (the same in a second process); its size
// is bounded; nothing stands on the rivers, in monumental or open ground, or inside the Forum Boarium neighbourhood; buildings keep off
// the sourced roads; density follows the housing classes and falls off outside the continuous city without a step at its edge; heights
// stay under the Roman limit; the Appia's tombs, the Tomb of Caecilia Metella, the aqueduct kit and the field strips are where they belong.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadTypescript } from './lib/load-typescript.mjs';
const { generateRomeFill } = await import(await loadTypescript('lib/scenarios/romeFill'));
const { romeZoning } = await import(await loadTypescript('lib/scenarios/zoning'));
const { forumReconstruction } = await import(await loadTypescript('lib/history/localContext'));
const { offsetCoordinate } = await import(await loadTypescript('map/settlements/romanSettlement'));
const neighbourhood = forumReconstruction.objects.map(o => o.footprint.map(p => offsetCoordinate(forumReconstruction.origin, p)));
const started = performance.now(), fill = generateRomeFill(neighbourhood), ms = performance.now() - started;
const digest = f => createHash('sha256').update(JSON.stringify(f.items)).digest('hex');
if (process.argv[2] === '--digest') { console.log(digest(fill)); process.exit(0); }
const again = spawnSync(process.execPath, ['scripts/check-rome-fill.mjs', '--digest'], { encoding: 'utf8' });
assert.equal(again.status, 0, again.stderr);
assert.equal(again.stdout.trim(), digest(fill), 'the fill is the same in a second process');

const { items, counts } = fill, KX = Math.cos(41.892 * Math.PI / 180) * 111320, KY = 110950;
const built = items.filter(i => i.kind !== 'field'), buildings = items.filter(i => ['insula', 'house', 'domus', 'warehouse', 'villa'].includes(i.kind));
assert.ok(items.length < 40000 && buildings.length > 10000, `the fill is bounded (${items.length} items, ${buildings.length} buildings)`);
const centre = i => [i.ring.reduce((a, p) => a + p[0], 0) / i.ring.length, i.ring.reduce((a, p) => a + p[1], 0) / i.ring.length];
const inRing = (p, ring) => { let x = false; for (let n = 0, m = ring.length - 1; n < ring.length; m = n++) if ((ring[n][1] > p[1]) !== (ring[m][1] > p[1]) && p[0] < (ring[m][0] - ring[n][0]) * (p[1] - ring[n][1]) / (ring[m][1] - ring[n][1]) + ring[n][0]) x = !x; return x; };
const inside = (p, mp) => mp.some(poly => inRing(p, poly[0]) && !poly.slice(1).some(hole => inRing(p, hole)));
const box = mp => { const pts = mp.flat(2); return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]; };
const inZone = z => { const b = box(z.multipolygon); return p => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inside(p, z.multipolygon); };
const now = romeZoning.zones.filter(z => z.time.start.year <= 100 && z.time.end.year >= 100 && z.multipolygon.length);

// Nothing on the rivers; no building, tomb or warehouse in monumental or open ground (aqueduct piers may cross it).
for (const z of now.filter(z => z.ring === 'river')) { const test = inZone(z); assert.equal(built.filter(i => test(centre(i))).length, 0, `nothing stands in ${z.id}`); }
for (const z of now.filter(z => ['monumental', 'open'].includes(z.use))) { const test = inZone(z); const hits = buildings.filter(i => test(centre(i))).length + items.filter(i => i.kind === 'tomb' && test(centre(i))).length; assert.equal(hits, 0, `nothing is generated in ${z.id} (${hits})`); }
// Clear of the neighbourhood: no corner of anything inside one of its footprints.
const nb = neighbourhood.map(ring => ({ ring, b: box([[ring]]) }));
const clash = items.filter(i => i.ring.some(p => nb.some(({ ring, b }) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inRing(p, ring)))).length;
assert.equal(clash, 0, 'the fill stays clear of the Forum Boarium neighbourhood');
// Buildings keep off the sourced roads (the line's own clearance is 7 m; a centre within 5 m would mean a lot on the road).
const segs = romeZoning.lines.filter(l => l.kind === 'road' && l.certainty !== 'illustrative').flatMap(l => [...l.lines, ...(l.gaps ?? [])]).flatMap(line => line.slice(1).map((b, n) => [line[n], b]));
const dist = (p, [a, b]) => { const ax = (a[0] - p[0]) * KX, ay = (a[1] - p[1]) * KY, bx = (b[0] - p[0]) * KX, by = (b[1] - p[1]) * KY, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(ax + t * dx, ay + t * dy); };
const onRoad = buildings.filter(i => { const c = centre(i); return segs.some(s => Math.abs(s[0][0] - c[0]) < 0.01 && Math.abs(s[0][1] - c[1]) < 0.01 && dist(c, s) < 5); }).length;
assert.equal(onRoad, 0, 'no building stands on a sourced road');

// Density by housing class: built-up share of each residential zone's area.
const area = ring => { let a = 0; for (let n = 0; n < ring.length; n++) { const p = ring[n], q = ring[(n + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2) * KX * KY; };
const zoneArea = z => z.multipolygon.reduce((s, poly) => s + area(poly[0]) - poly.slice(1).reduce((h, r) => h + area(r), 0), 0);
const cover = id => { const z = now.find(z => z.id === id), test = inZone(z); return buildings.filter(i => test(centre(i))).reduce((s, i) => s + area(i.ring), 0) / zoneArea(z); };
const share = Object.fromEntries(['zone:residential-dense', 'zone:residential-hills', 'zone:residential-elite', 'zone:residential-trastevere'].map(id => [id, +cover(id).toFixed(3)]));
assert.ok(share['zone:residential-dense'] > share['zone:residential-hills'] && share['zone:residential-hills'] > share['zone:residential-elite'], `coverage follows the housing classes (${JSON.stringify(share)})`);
assert.ok(share['zone:residential-dense'] > share['zone:residential-trastevere'], 'Trastevere is looser than the core');
assert.ok(share['zone:residential-dense'] > 0.3, 'the dense core is built up');

// No hard edge: building cover in rings round the continuous city's edge, 150 m wide, falls off steadily outside it, and the first
// ring outside holds a good part of the cover of the last ring inside.
const edge = romeZoning.extent.ring.slice(1).map((b, n) => [romeZoning.extent.ring[n], b]);
const toEdge = p => Math.min(...edge.map(s => dist(p, s)));
const rings = new Map();
for (const i of buildings) {
  const c = centre(i), d = toEdge(c), signed = inRing(c, romeZoning.extent.ring) ? -d : d;
  if (signed < -300 || signed > 1500) continue;
  const k = Math.floor(signed / 150); rings.set(k, (rings.get(k) ?? 0) + area(i.ring));
}
const ringCover = k => rings.get(k) ?? 0, outside = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(ringCover);
assert.ok(outside.every((v, k) => k < 2 || v <= outside[k - 2] * 1.05), `cover falls off outside the city (${outside.map(v => Math.round(v / 1000))} thousand m² per 150 m ring)`);
assert.ok(ringCover(0) > 0.25 * ringCover(-1), `no step at the edge of the city (${Math.round(ringCover(-1))} m² inside, ${Math.round(ringCover(0))} m² outside)`);
assert.ok(outside[9] > 0 && outside[9] < outside[0] / 4, 'building thins out to scattered houses beyond about 1.5 km');

// Heights: lots stay under the Roman limit of about 17.75 m (60 Roman feet); warehouses and villas are low.
assert.ok(items.filter(i => ['insula', 'house', 'domus'].includes(i.kind)).every(i => i.height <= 17.75), 'no lot is taller than about 17.75 m');
// The Appia's tombs and the Tomb of Caecilia Metella; the Vatican necropolis; the aqueduct kit, pier by pier; the field strips.
const appia = inZone(now.find(z => z.id === 'zone:via-appia-tombs')), vatican = inZone(now.find(z => z.id === 'zone:vatican-necropolis'));
const tombs = items.filter(i => i.kind === 'tomb'), appiaTombs = tombs.filter(i => appia(centre(i))).length;
assert.ok(appiaTombs > 150, `the Via Appia is lined with tombs (${appiaTombs})`);
assert.ok(tombs.filter(i => vatican(centre(i))).length > 30, 'the Vatican necropolis has tombs');
const metella = romeZoning.markers.find(m => m.id === 'marker:caecilia-metella').coordinate;
assert.ok(tombs.some(i => i.ring.length === 24 && Math.hypot((centre(i)[0] - metella[0]) * KX, (centre(i)[1] - metella[1]) * KY) < 1 && i.height === 11), 'the Tomb of Caecilia Metella stands on its point');
assert.ok(counts.pier > 500 && counts.pier === counts.channel, `the aqueducts are one kit piece repeated (${counts.pier} piers)`);
assert.ok(items.filter(i => i.kind === 'channel').every(i => i.base > 5 && Math.abs(i.height - i.base - 2.2) < 0.11), 'every channel span rides on its piers');
const extent = [[romeZoning.extent.ring]];
assert.ok(counts.field > 2000 && items.filter(i => i.kind === 'field').every(i => !inside(centre(i), extent)), `field strips lie in the Campagna (${counts.field})`);
console.log(`rome fill ok: ${items.length} items (${JSON.stringify(counts)}) in ${Math.round(ms)} ms; cover ${JSON.stringify(share)}; outside the edge ${outside.map(v => Math.round(v / 1000)).join(' ')} thousand m² per 150 m ring`);
