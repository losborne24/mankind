import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  let output;
  if (path.endsWith('.json')) output = `export default JSON.parse(${JSON.stringify(await readFile(path, 'utf8'))});`;
  else ({ outputText: output } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8').catch(() => readFile(`${path}.tsx`, 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }));
  for (const match of [...output.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec);
    output = output.replace(match[0], `from "${url}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`; modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { selectHistoricalWorld: select } = await import(await load('lib/history/selection'));
const { inspectHistoricalRecord: inspect } = await import(await load('lib/history/inspection'));
const { HistoricalDatasetSession } = await import(await load('lib/history/session'));
const { historicalWorldOverlays } = await import(await load('map/historicalWorldOverlays'));
const { HistoricalInspector } = await import(await load('components/HistoricalInspector'));
const { HISTORICAL_DATASETS, loadHistoricalDataset } = await import(await load('lib/history/datasets'));
const { GET } = await import(await load('app/api/historical-world/menander/route'));
const { createElement } = await import('react'); const { renderToStaticMarkup } = await import('react-dom/server');
const raw = JSON.parse(await readFile('lib/history/fixtures/menander.json', 'utf8'));
const source = await readFile('data/history/menander/source/property-r1-i10-p4.ttl', 'utf8');
const manifest = JSON.parse(await readFile('data/history/menander/source/manifest.json', 'utf8'));
assert.equal(createHash('sha256').update(source).digest('hex'), manifest.excerptSHA256);
assert.equal(manifest.revision, '0f723ab5fb38bf46c2402811e0f0698267387c9c');
const original = JSON.parse(JSON.parse(source.match(/p-lod:geojson ("(?:[^"\\]|\\.)*")/)[1]));
assert.equal(original.id, manifest.recordURN);
const world = validate(raw), at = year => select(world, { start: { year } }), placeId = world.places[0].id;
assert.deepEqual(world.footprints[0].geometry.coordinates[0], original.geometry.coordinates[0].map(([lng, lat]) => [lng, lat]));
assert.equal(world.footprints[0].geometry.coordinates[0].length, 40);
assert.equal(world.footprints[0].representation, 'property-extent');
assert.equal(world.footprints[0].phaseEvidence.certainty, 'inferred');
assert.equal(world.footprints[0].period.approximate, true);
assert.equal(world.assets.length + world.layouts.length + world.roadNetworks.length + world.routes.length + world.scenes.length, 0);
assert.deepEqual(await (await GET()).json(), raw);
for (const year of [1, 50, 78, 80, 200, 2025]) { assert.equal(at(year).footprints.length, 0); assert.equal(at(year).descriptors.length, 0); }
assert.equal(at(79).footprints.length, 1); assert.equal(at(79).footprints[0].match, 'possible');
assert.equal(at(79).places[0].presence, 'possible'); assert.equal(at(79).places[0].layoutStatus, 'none');
assert.equal(at(79).descriptors.length, 0, 'A property polygon cannot create a 3D building');
assert.equal(select(world, { start: { year: 79, month: 1, day: 1 } }).footprints[0].match, 'possible', 'No exact eruption date implied');
assert.equal(select(world, { start: { year: 78 }, end: { year: 80 } }).footprints[0].match, 'possible');
const view = inspect(world, at(79), { kind: 'place', id: placeId });
assert.equal(view.period, undefined); assert.equal(view.locations[0].footprints[0].match, 'possible');
assert.equal(view.locations[0].target.zoom, 18);
assert.ok(view.sources.some(s => s.id === 'source:ling-menander'));
assert.ok(view.sources.some(s => s.id === 'source:plod-menander'));
assert.equal(view.locations[0].uncertaintyMeters, undefined);
const html = renderToStaticMarkup(createElement(HistoricalInspector, { inspection: view, onClose() {}, onVisit() {}, onInspectPlace() {} }));
assert.ok(html.includes('Possible phase match')); assert.ok(html.includes('not a wall plan or roof outline')); assert.ok(html.includes('urn:p-lod:id:r1-i10-p4')); assert.ok(!html.includes('<img'));
assert.ok(html.includes('2D extent available')); assert.ok(html.includes('footprint context'));
const outside = inspect(world, at(80), { kind: 'place', id: placeId });
assert.equal(outside.locations[0].target, undefined); assert.equal(outside.locations[0].footprints[0].match, 'outside');
const reject = change => { const value = structuredClone(raw); change(value.footprints[0], value); assert.throws(() => validate(value)); };
reject(f => delete f.period); reject(f => delete f.phaseEvidence); reject(f => f.phaseEvidence.sources = []);
reject(f => delete f.period.approximate); reject(f => f.phaseEvidence.certainty = 'unknown');
reject(f => f.evidence.sources = []); reject(f => f.evidence.sources = ['missing']);
reject(f => f.phaseTitle = ''); reject(f => f.licence.attribution = '');
reject(f => f.representation = 'roof'); reject(f => f.assetId = 'roman-villa-01'); reject(f => f.heightMeters = 8);
reject(f => f.placeId = 'missing'); reject(f => f.geometry.coordinates[0].pop());
reject(f => f.geometry.coordinates[0][0][0] = 0); reject(f => f.geometry.coordinates[0][0].push(40));
reject((f, value) => value.places[0].period = { start: { year: 100 } });
reject((f, value) => value.referenceAreas = [{ id: f.id, title: 'ID collision', placeId, kind: 'site-outline', geometry: f.geometry, licence: f.licence, evidence: f.evidence }]);
reject((f, value) => value.footprints.push(structuredClone(f)));
const detached = validate(raw); detached.footprints[0].geometry.coordinates[0][0][0] = 0; assert.notEqual(raw.footprints[0].geometry.coordinates[0][0][0], 0);
const ledger = JSON.parse(await readFile('lib/history/curation/menander-review.json', 'utf8'));
assert.equal(ledger.datasetId, world.id);
for (const claim of ledger.claims) {
  let record = [...world.places, ...world.footprints].find(r => r.id === claim.recordId); assert.ok(record);
  for (const key of claim.field.split('.')) record = record[key]; assert.notEqual(record, undefined);
  for (const id of claim.sourceIds) assert.ok(world.sources.some(s => s.id === id));
}
const sources = new Map(), layers = new Map(); let data;
const map = { addSource: id => sources.set(id, { setData: value => { data = value; } }), addLayer: layer => layers.set(layer.id, layer), getSource: id => sources.get(id), getLayer: id => layers.get(id), removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id) };
const overlay = historicalWorldOverlays(map); overlay.update(at(79));
assert.equal(data.features.filter(f => f.properties.footprint).length, 1); assert.equal(data.features.filter(f => f.properties.referenceOnly).length, 0);
assert.equal(layers.get('historical-world-footprints').type, 'line', 'No property extrusion or filled roof');
overlay.update(at(80)); assert.equal(data.features.length, 0); overlay.update(null); overlay.dispose(); assert.equal(sources.size + layers.size, 0);
let time = { start: { year: 79 } }, listener, applied;
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: fn => { listener = fn; return () => {}; }, apply: s => { applied = s; }, release: () => { applied = null; }, load: async () => raw });
await session.load('menander'); session.inspect({ kind: 'place', id: placeId }); assert.equal(applied.footprints.length, 1);
time = { start: { year: 80 } }; listener(); assert.equal(applied.footprints.length, 0); assert.equal(session.getVisitTarget(placeId), undefined);
session.clear(); assert.equal(applied, null); assert.equal(session.getSnapshot().inspection, undefined); session.dispose();
const catalog = HISTORICAL_DATASETS.find(d => d.id === 'menander'); assert.deepEqual([...catalog.preview.center], world.places[0].position.coordinate);
const originalFetch = globalThis.fetch;
try { globalThis.fetch = async url => { assert.equal(url, catalog.url); return GET(); }; assert.deepEqual(await loadHistoricalDataset('menander', new AbortController().signal), raw); }
finally { globalThis.fetch = originalFetch; }
console.log('Historical footprints: pinned P-LOD vertices, phase provenance/uncertainty, property semantics, API/catalog, inspector, source attribution, date selection, validation, session and overlay cleanup pass; no implicit 3D assets.');
