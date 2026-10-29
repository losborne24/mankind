import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  let { outputText } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  for (const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]) { const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec); outputText = outputText.replace(match[0], `from "${url}"`); }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { selectHistoricalWorld: select } = await import(await load('lib/history/selection'));
const { HistoricalDatasetSession } = await import(await load('lib/history/session'));
const { loadHistoricalDataset } = await import(await load('lib/history/datasets'));
const { historicalWorldOverlays } = await import(await load('map/historicalWorldOverlays'));
const { useExplorationStore: store } = await import(await load('state/explorationStore'));
const { ScenarioPlayer } = await import(await load('lib/scenarios/player'));
const { london2012 } = await import(await load('lib/scenarios/london2012'));
const raw = JSON.parse(await readFile('lib/history/fixtures/london2012.json', 'utf8')), world = validate(raw);
const at = { start: { year: 2012, month: 7, day: 27 } };
assert.equal(select(world, at).events[0].match, 'within');
assert.equal(select(world, at).descriptors.length, 0, 'London metadata must not introduce Roman geometry');
assert.equal(select(world, { start: { year: 2012, month: 7, day: 26 } }).places.filter(p => p.presence === 'within').length, 0);
assert.ok(select(world, { start: { year: 2012 } }).places.every(p => p.presence === 'possible'));
assert.equal(select(world, { start: { year: 2012, month: 7, day: 26 }, end: { year: 2012, month: 7, day: 28 } }).events[0].match, 'possible');
const synthetic = structuredClone(raw), evidence = { certainty: 'illustrative', sources: [], note: 'Synthetic selection test, not a historical reconstruction.' };
synthetic.events = []; synthetic.routes = []; synthetic.scenes = [];
synthetic.assets = [{ id: 'asset:test', category: 'building', registryId: 'roman-villa-01', evidence }];
synthetic.places = [synthetic.places[0]]; synthetic.places[0].period = { start: { year: -1 }, end: { year: 1 } };
synthetic.layouts = [{ id: 'layout:first', title: 'Synthetic dated layout', placeId: synthetic.places[0].id, frame: 'local-east-south-metres', period: { start: { year: -1 }, end: { year: 0 } }, extentMeters: 100, maxFoundationRiseMeters: 3, buildings: [{ id: 'building:test', assetId: 'asset:test', offset: [0, 0], evidence }], evidence }];
assert.equal(select(validate(synthetic), { start: { year: 0 } }).descriptors.length, 1, 'BCE/CE selection uses astronomical year zero');
const overlap = structuredClone(synthetic); overlap.layouts.push({ ...overlap.layouts[0], id: 'layout:second' });
assert.equal(select(validate(overlap), { start: { year: 0 } }).places[0].layoutStatus, 'ambiguous');
assert.equal(select(validate(overlap), { start: { year: 0 } }).descriptors.length, 0);
const ranged = structuredClone(synthetic); ranged.layouts.push({ ...ranged.layouts[0], id: 'layout:second', period: { start: { year: 1 } } });
assert.equal(select(validate(ranged), { start: { year: 0 }, end: { year: 1 } }).places[0].layoutStatus, 'ambiguous', 'Do not select just the start of an interval');
const uncertain = structuredClone(synthetic); uncertain.layouts[0].period.uncertaintyYears = 1;
assert.equal(select(validate(uncertain), { start: { year: 0 } }).places[0].layoutStatus, 'ambiguous');
const oldRoads = structuredClone(synthetic);
oldRoads.layouts[0].roadNetworkId = 'roads:dated';
oldRoads.roadNetworks = [{ id: 'roads:dated', placeId: oldRoads.places[0].id, period: { start: { year: -1 } }, frame: 'local-east-south-metres', roads: [{ id: 'main', widthMeters: 2, points: [[-10, 0], [0, 0]], evidence }], evidence }];
assert.equal(select(validate(oldRoads), { start: { year: 0 } }).places[0].layoutStatus, 'unavailable');
const missing = structuredClone(synthetic); delete missing.assets[0].registryId;
assert.equal(select(validate(missing), { start: { year: 0 } }).places[0].layoutStatus, 'unavailable');

let time = at, dateListener, detached = 0, applied = [], released = 0, calls = [];
const pending = [];
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: listener => { dateListener = listener; return () => detached++; }, apply: selection => applied.push(selection), release: () => released++, load: (id, signal) => { calls.push({ id, signal }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } });
const first = session.load('first'), second = session.load('second');
assert.equal(calls[0].signal.aborted, true);
pending[0].resolve(raw); await first; assert.equal(session.getSnapshot().status, 'loading', 'Stale response cannot publish');
time = { start: { year: 2013 } }; dateListener(); pending[1].resolve(raw); await second;
assert.equal(session.getSnapshot().selection.events.length, 0, 'Loading commits against latest date');
time = at; dateListener(); assert.equal(session.getSnapshot().selection.events.length, 1);
assert.equal(calls.length, 2, 'Date updates never refetch');
const third = session.load('third'); session.clear(); pending[2].resolve(raw); await third;
assert.equal(session.getSnapshot().status, 'idle'); assert.equal(released, 1);
const bad = session.load('invalid'); pending[3].resolve({ version: 99 }); await bad;
assert.equal(session.getSnapshot().status, 'error'); assert.equal(applied.at(-1), null);
const final = session.load('pending-dispose'); session.dispose(); session.dispose(); pending[4].resolve(raw); await final;
assert.equal(detached, 1); assert.equal(session.getSnapshot().status, 'idle');

// Real store + scenario date port: loaded selection follows scenario dates with no camera ownership.
let updates = [], frameId = 0;
const live = new HistoricalDatasetSession({ time: () => store.getState().historicalTime ?? { start: { year: store.getState().year } }, subscribeTime: listener => store.subscribe((state, prev) => { if (state.year !== prev.year || state.historicalTime !== prev.historicalTime) listener(); }), apply: selection => updates.push(selection), release: () => {}, load: async () => raw });
store.getState().setYear(-100); await live.load('local'); assert.equal(live.getSnapshot().selection.events.length, 0);
const player = new ScenarioPlayer({ camera: { read: () => ({ center: [0, 0], zoom: 2, pitch: 0, bearing: 0 }), write: () => {}, stop: () => {} }, timeline: value => store.getState().setHistoricalTime(value), overlays: () => {}, frame: () => ++frameId, cancelFrame: () => {} });
player.load(london2012); player.jump(3); assert.equal(live.getSnapshot().selection.events[0].match, 'within');
player.pause(); store.getState().setYear(-100); assert.equal(live.getSnapshot().selection.events.length, 0);
player.resume(); assert.equal(live.getSnapshot().selection.events[0].match, 'within'); player.dispose(); live.dispose();
const count = updates.length; store.getState().setYear(1); assert.equal(updates.length, count);

// Map-only projections and listener/source cleanup use existing map ports.
const sources = new Map(), layers = new Map(); let features;
const map = { addSource: (id) => sources.set(id, { setData: data => features = data.features }), addLayer: layer => layers.set(layer.id, layer), getSource: id => sources.get(id), getLayer: id => layers.get(id), removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id) };
const overlays = historicalWorldOverlays(map); overlays.update(select(world, at)); assert.equal(features.filter(f => f.geometry.type === 'Point').length, 2);
overlays.update(select(world, { start: { year: 1 } })); assert.equal(features.length, 0); overlays.dispose(); overlays.dispose(); assert.equal(sources.size + layers.size, 0);

const originalFetch = globalThis.fetch; let urls = [];
try {
  globalThis.fetch = async (url, options) => { urls.push(url); assert.ok(options.signal); return new Response(JSON.stringify(raw)); };
  assert.deepEqual(await loadHistoricalDataset('london2012', new AbortController().signal), raw);
  await assert.rejects(() => loadHistoricalDataset('https://unregistered.example/', new AbortController().signal)); assert.equal(urls.length, 1);
  globalThis.fetch = async () => new Response('nope', { status: 503 }); await assert.rejects(() => loadHistoricalDataset('london2012', new AbortController().signal), /503/);
  globalThis.fetch = async () => new Response('not json'); await assert.rejects(() => loadHistoricalDataset('london2012', new AbortController().signal));
  globalThis.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)); await assert.rejects(() => loadHistoricalDataset('london2012', new AbortController().signal), /2 MiB/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(() => loadHistoricalDataset('london2012', abort.signal));
} finally { globalThis.fetch = originalFetch; }
console.log('Historical loading: exact/coarse/interval/BCE/uncertain dates, overlapping layouts, missing assets, stale/aborted requests, latest-date commit, store/scenario integration, teardown, map-only markers, bounded local fetch and failures pass.');
