import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  let outputText;
  if (path.endsWith('.json')) outputText = `export default JSON.parse(${JSON.stringify(await readFile(path, 'utf8'))});`;
  else ({ outputText } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8').catch(() => readFile(`${path}.tsx`, 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }));
  for (const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]) { const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec); outputText = outputText.replace(match[0], `from "${url}"`); }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { selectHistoricalWorld: select } = await import(await load('lib/history/selection'));
const { inspectHistoricalRecord: inspect } = await import(await load('lib/history/inspection'));
const { matchHistoricalPeriod: match, toHistoricalTime } = await import(await load('lib/history/time'));
const { toScenarioContent } = await import(await load('lib/history/adapters'));
const { HISTORICAL_DATASETS, loadHistoricalDataset } = await import(await load('lib/history/datasets'));
const { GET } = await import(await load('app/api/historical-world/housesteads/route'));
const { formatInspectionPeriod } = await import(await load('components/HistoricalInspector'));
const raw = JSON.parse(await readFile('lib/history/fixtures/housesteads.json', 'utf8'));
const ledger = JSON.parse(await readFile('lib/history/curation/housesteads-review.json', 'utf8'));
const world = validate(raw), at = year => ({ start: { year } });
assert.deepEqual(await GET().json(), raw);
assert.equal(world.places.length, 2); assert.equal(world.layouts.length, 3); assert.equal(world.events.length, 2);
assert.equal(world.sources.length, 6); assert.equal(world.roadNetworks.length + world.routes.length, 0);
assert.ok(world.assets.every(asset => !asset.registryId));
assert.ok(world.layouts.every(layout => !layout.buildings.length));
assert.ok(world.scenes.every(scene => scene.fallback === 'map-only' && !scene.required));
const fort = 'place:housesteads-fort';
const fortRow = year => select(world, at(year)).places.find(row => row.place.id === fort);
assert.equal(fortRow(200).layoutStatus, 'unavailable'); assert.deepEqual(fortRow(200).layoutIds, ['layout:housesteads-middle']);
assert.equal(fortRow(125).presence, 'possible'); assert.equal(fortRow(125).layoutStatus, 'ambiguous');
assert.ok(fortRow(125).warnings.some(warning => warning.includes('no building positions')));
assert.equal(fortRow(270).layoutStatus, 'ambiguous'); assert.equal(fortRow(270).layoutIds.length, 2);
assert.equal(fortRow(300).layoutStatus, 'ambiguous');
assert.equal(fortRow(150).layoutIds.length, 0, 'Do not interpolate the published phase gap');
assert.equal(select(world, at(500)).places.filter(row => ['within', 'possible'].includes(row.presence)).length, 0);
for (const year of [122, 125, 138, 150, 170, 200, 206, 270, 300, 400, 410, 500]) assert.equal(select(world, at(year)).descriptors.length, 0, 'No placeholder architecture is streamed');
const view = inspect(world, select(world, at(200)), { kind: 'place', id: fort });
assert.equal(view.period, undefined, 'No invented full site lifetime');
assert.equal(view.locations[0].layoutStatus, 'unavailable'); assert.equal(view.locations[0].target.zoom, 14);
assert.ok(view.sources.some(source => source.id === 'source:eh-housesteads-phases'));
assert.ok(view.sources.some(source => source.id === 'source:nt-housesteads'));
assert.equal(view.locations[0].uncertaintyMeters, undefined, 'Grid precision is not positional accuracy');
const event = inspect(world, select(world, at(206)), { kind: 'event', id: 'event:housesteads-granary-rebuilding' });
assert.equal(event.match, 'possible'); assert.equal(event.locations.length, 2);
assert.ok(formatInspectionPeriod(event.period).includes('approximate'));
assert.equal(match({ start: { year: 122 }, end: { year: 138 }, approximate: true }, { year: 125 }), 'possible');
assert.equal(match({ start: { year: 122 }, end: { year: 138 }, approximate: false }, { year: 125 }), 'within');
assert.throws(() => toHistoricalTime({ start: { year: 122 }, approximate: true }), /explicit presentation/);
const invalid = structuredClone(raw); invalid.layouts[0].period.approximate = 'circa'; assert.throws(() => validate(invalid));
const routeWorld = structuredClone(raw); routeWorld.routes.push({ id: 'route:approximate-test', title: 'Synthetic date adapter test', period: { start: { year: 200 }, approximate: true }, coordinates: [[0, 0], [1, 0]], placeIds: [], evidence: { certainty: 'illustrative', sources: [], note: 'Synthetic test only.' } });
const projection = toScenarioContent(routeWorld); assert.equal(projection.content.routes[0].time, undefined); assert.ok(projection.warnings.some(w => w.includes('Uncertain route')));

const records = new Map(['places', 'layouts', 'events', 'scenes', 'assets', 'referenceAreas'].flatMap(key => (world[key] ?? []).map(record => [record.id, record])));
assert.equal(ledger.datasetId, world.id);
for (const claim of ledger.claims) {
  assert.ok(records.has(claim.recordId));
  let value = records.get(claim.recordId); for (const key of claim.field.split('.')) value = value[key];
  assert.notEqual(value, undefined);
  assert.ok(claim.sourceIds.length); for (const id of claim.sourceIds) assert.ok(world.sources.some(source => source.id === id));
}
for (const anchor of ledger.anchors.rows) assert.deepEqual(records.get(anchor.recordId).position.coordinate, anchor.coordinate);
assert.ok(ledger.gaps.every(gap => gap.status === 'open'));
assert.equal(ledger.anchors.rows[0].gridReference, 'NY 7897 6879');
assert.equal(ledger.anchors.rows[1].gridReference, 'NY 7898 6882');
const catalog = HISTORICAL_DATASETS.find(dataset => dataset.id === 'housesteads');
assert.deepEqual([...catalog.preview.center], world.places[0].position.coordinate);
assert.equal(fortRow(catalog.preview.date.year).layoutStatus, 'unavailable');
const originalFetch = globalThis.fetch; let requested;
try { globalThis.fetch = async url => { requested = url; return GET(); }; assert.deepEqual(await loadHistoricalDataset('housesteads', new AbortController().signal), raw); assert.equal(requested, catalog.url); }
finally { globalThis.fetch = originalFetch; }
console.log('Housesteads curation: primary citations/claim ledger, reproducible anchors, source-qualified chronology, circa date handling, phase boundaries/gaps, unavailable geometry, map-only visits, no Roman substitution, local API/catalog and unchanged source records pass.');
