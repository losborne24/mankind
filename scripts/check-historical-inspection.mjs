import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  if (path.endsWith('.json')) { const url = `data:text/javascript;base64,${Buffer.from(`export default JSON.parse(${JSON.stringify(await readFile(path, 'utf8'))});`).toString('base64')}`; modules.set(path, url); return url; }
  let { outputText } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8').catch(() => readFile(`${path}.tsx`, 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  for (const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]) { const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec); outputText = outputText.replace(match[0], `from "${url}"`); }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { selectHistoricalWorld: select } = await import(await load('lib/history/selection'));
const { inspectHistoricalRecord: inspect } = await import(await load('lib/history/inspection'));
const { HistoricalDatasetSession } = await import(await load('lib/history/session'));
const { historicalWorldOverlays } = await import(await load('map/historicalWorldOverlays'));
const { HistoricalInspector } = await import(await load('components/HistoricalInspector'));
const raw = JSON.parse(await readFile('lib/history/fixtures/london2012.json', 'utf8')), world = validate(raw);
const exact = { start: { year: 2012, month: 7, day: 27 } }, placeKey = { kind: 'place', id: 'place:olympic-stadium' }, eventKey = { kind: 'event', id: 'event:london-2012-opening' };
const place = inspect(world, select(world, exact), placeKey);
assert.equal(place.match, 'within'); assert.equal(place.basis, 'dated-context'); assert.equal(place.period, undefined);
assert.equal(place.locations[0].layoutStatus, 'none'); assert.equal(place.locations[0].target.zoom, 14);
assert.equal(place.sources[0].publisher, 'World Athletics');
assert.equal(place.evidence[1].value.certainty, 'illustrative', 'Venue evidence must not promote coordinate certainty');
assert.equal(place.locations[0].uncertaintyMeters, undefined);
const event = inspect(world, select(world, exact), eventKey);
assert.equal(event.locations.length, 2); assert.equal(event.locations[0].role, 'ceremony venue'); assert.equal(event.locations[1].target.zoom, 11);
assert.equal(inspect(world, select(world, { start: { year: 2012 } }), eventKey).match, 'possible');
const outside = inspect(world, select(world, { start: { year: 2013 } }), eventKey);
assert.equal(outside.match, 'outside'); assert.ok(outside.locations.every(location => !location.target));
assert.equal(inspect(world, select(world, exact), { kind: 'place', id: 'missing' }), undefined);
const before = JSON.stringify(world); place.title = 'Mutated'; place.locations[0].target.center[0] = 180; assert.equal(JSON.stringify(world), before);

// Full layout availability/ambiguity metadata remains inspectable without silently picking geometry.
const synthetic = structuredClone(raw), evidence = { certainty: 'illustrative', sources: [], note: 'Synthetic inspection contract test only.' };
synthetic.layouts = [{ id: 'layout:a', title: 'Synthetic model requirement', placeId: placeKey.id, period: { start: { year: 2012 } }, frame: 'local-east-south-metres', extentMeters: 100, maxFoundationRiseMeters: 3, buildings: [{ id: 'test-building', assetId: 'asset:stadium-2012', offset: [0, 0], evidence }], evidence }];
const missingWorld = validate(synthetic), unavailable = inspect(missingWorld, select(missingWorld, exact), placeKey);
assert.equal(unavailable.locations[0].layoutStatus, 'unavailable'); assert.equal(unavailable.locations[0].target.zoom, 14, 'Unavailable models allow an explicit geographic visit only');
assert.deepEqual(unavailable.locations[0].warnings, ['A required building model is unavailable.']);
synthetic.layouts.push({ ...synthetic.layouts[0], id: 'layout:b' });
const ambiguousWorld = validate(synthetic), ambiguous = inspect(ambiguousWorld, select(ambiguousWorld, exact), placeKey);
assert.equal(ambiguous.locations[0].layoutStatus, 'ambiguous'); assert.equal(ambiguous.locations[0].layouts.length, 2);
const polar = structuredClone(raw); polar.places[1].position.coordinate[1] = 90;
const polarWorld = validate(polar); assert.equal(inspect(polarWorld, select(polarWorld, exact), placeKey).locations[0].target, undefined);

let time = exact, dateChanged, applies = 0;
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: listener => { dateChanged = listener; return () => {}; }, apply: () => applies++, release: () => {}, load: async () => raw });
await session.load('test'); const applied = applies;
assert.equal(session.inspect(eventKey), true); assert.equal(applies, applied, 'Inspection must not rebuild or reload world scenes');
assert.ok(session.getVisitTarget(placeKey.id));
time = { start: { year: 2013 } }; dateChanged(); assert.equal(session.getSnapshot().inspection.match, 'outside'); assert.equal(session.getVisitTarget(placeKey.id), undefined, 'Stale visit buttons cannot navigate after a date change');
time = exact; dateChanged(); assert.ok(session.getVisitTarget(placeKey.id));
const target = session.getVisitTarget(placeKey.id); target.center[0] = 100; assert.notEqual(session.getVisitTarget(placeKey.id).center[0], 100);
assert.equal(session.inspect({ kind: 'event', id: 'missing' }), false); assert.equal(session.getSnapshot().inspection.key.id, eventKey.id);
session.closeInspection(); assert.equal(session.getVisitTarget(placeKey.id), undefined); assert.equal(session.getSnapshot().inspection, undefined);
session.inspect(placeKey); await session.load('replacement'); assert.equal(session.getSnapshot().inspection, undefined, 'Dataset replacement closes stale inspection');
session.inspect(placeKey); session.clear(); assert.equal(session.getSnapshot().inspection, undefined); assert.equal(session.inspect(placeKey), false); session.dispose();

let click, clicks = [], registered = 0, removed = 0;
const sources = new Map(), layers = new Map();
const map = { addSource: id => sources.set(id, { setData: () => {} }), addLayer: layer => layers.set(layer.id, layer), getSource: id => sources.get(id), getLayer: id => layers.get(id), removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id), on: (type, layer, cb) => { assert.equal(type, 'click'); assert.equal(layer, 'historical-world-points'); click = cb; registered++; }, off: (_type, _layer, cb) => { assert.equal(cb, click); removed++; } };
const overlays = historicalWorldOverlays(map, id => clicks.push(id)); assert.equal(registered, 1);
overlays.update(select(world, exact)); click({ features: [{ properties: { id: placeKey.id } }] }); assert.deepEqual(clicks, [placeKey.id]);
click({ features: [{ properties: { id: 'injected-id' } }] }); assert.equal(clicks.length, 1);
overlays.update(select(world, { start: { year: 2013 } })); click({ features: [{ properties: { id: placeKey.id } }] }); assert.equal(clicks.length, 1);
overlays.dispose(); assert.equal(removed, 1); assert.equal(sources.size + layers.size, 0);

const markup = view => renderToStaticMarkup(createElement(HistoricalInspector, { inspection: view, onClose: () => {}, onVisit: () => {}, onInspectPlace: () => {} }));
const html = markup(event);
for (const text of ['Historical record', 'Matches selected date', 'World Athletics', 'Evidence and uncertainty', 'accuracy unquantified', 'ceremony venue', 'host city', 'Visit geographic context', 'Close historical record']) assert.ok(html.includes(text), text);
assert.ok(!html.includes('Visit dated layout'));
const disabled = markup(outside); assert.ok(disabled.includes('Outside selected date')); assert.equal((disabled.match(/disabled=""/g) ?? []).length, 2);
const hostile = structuredClone(event); hostile.description = '<script>alert(1)</script>'; assert.ok(!markup(hostile).includes('<script>'));
assert.ok(markup(ambiguous).includes('Layout selection is ambiguous'));
console.log('Historical inspection: evidence/source separation, multiple locations, approximate/unavailable/ambiguous geography, stale-date visit guards, no inspection scene churn, dataset teardown, marker activation/listener cleanup, safe accessible rendered controls pass.');
