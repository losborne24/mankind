import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  if (path.endsWith('.json')) { const url = `data:text/javascript;base64,${Buffer.from(`export default JSON.parse(${JSON.stringify(await readFile(path, 'utf8'))});`).toString('base64')}`; modules.set(path, url); return url; }
  const { outputText: code } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8').catch(() => readFile(`${path}.tsx`, 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  let output = code;
  for (const match of [...output.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec);
    output = output.replace(match[0], `from "${url}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`; modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { selectHistoricalWorld: select, resolveHistoricalScenes: resolve } = await import(await load('lib/history/selection'));
const { inspectHistoricalRecord: inspect } = await import(await load('lib/history/inspection'));
const { HistoricalDatasetSession } = await import(await load('lib/history/session'));
const { HistoricalInspector } = await import(await load('components/HistoricalInspector'));
const { createElement } = await import('react'); const { renderToStaticMarkup } = await import('react-dom/server');
const read = async name => JSON.parse(await readFile(`lib/history/fixtures/${name}.json`, 'utf8'));
const menander = await read('menander'), london = await read('london2012'), fort = await read('housesteads');
const at = year => ({ start: { year } });
const result = resolve(menander, at(79))[0];
assert.equal(result.status, 'map-only'); assert.equal(result.match, 'possible');
assert.deepEqual(result.descriptorIds, []); assert.deepEqual(result.footprintIds, ['footprint:menander-property-ad79']);
assert.ok(result.issues.some(i => i.code === 'uncertain-date')); assert.ok(result.issues.some(i => i.code === 'missing-layout'));
assert.equal(result.assets[0].status, 'catalogue-blocked'); assert.equal(result.assets[0].catalogue.status, 'draft'); assert.equal(resolve(menander, at(80))[0].status, 'outside-period');
assert.equal(resolve(london, { start: { year: 2012, month: 7, day: 27 } })[0].status, 'map-only');
assert.equal(resolve(fort, at(200)).filter(r => r.status === 'map-only').length, 1);
assert.equal(resolve(fort, at(270)).filter(r => r.status === 'map-only').length, 2);

// Explicitly synthetic model/layout: does not add a reconstruction to the real fixture.
const synthetic = structuredClone(menander), evidence = { certainty: 'illustrative', sources: [], note: 'Synthetic scene resolver fixture only; no archaeological claim.' };
delete synthetic.assets[0].catalogueRef; synthetic.assets[0].registryId = 'roman-villa-01'; synthetic.assets[0].evidence = evidence;
synthetic.layouts.push({ id: 'layout:synthetic', title: 'Synthetic scene layout', placeId: synthetic.places[0].id, period: at(79), frame: 'local-east-south-metres', extentMeters: 100, maxFoundationRiseMeters: 3, buildings: [{ id: 'building:test', assetId: synthetic.assets[0].id, offset: [0, 0], evidence }], evidence });
synthetic.scenes[0].period = at(79); synthetic.scenes[0].layoutIds = ['layout:synthetic'];
const selected = value => select(validate(value), at(79));
let selection = selected(synthetic);
assert.equal(selection.scenes[0].status, 'ready'); assert.equal(selection.scenes[0].assets[0].status, 'registered');
assert.equal(selection.descriptors.length, 1); assert.equal(selection.descriptors[0].definition.buildings[0].assetId, 'roman-villa-01');
assert.equal(selection.descriptors[0].definition.ambientLife, false); assert.equal(selection.descriptors[0].profile, undefined);
const strictReady = structuredClone(synthetic); strictReady.scenes[0].required = true; strictReady.scenes[0].fallback = 'unavailable';
assert.equal(selected(strictReady).scenes[0].status, 'ready');
const checkBlocked = (change, code, status = 'map-only') => {
  const value = structuredClone(synthetic); change(value);
  const s = selected(value); assert.equal(s.scenes[0].status, status); assert.equal(s.descriptors.length, 0);
  assert.equal(s.places[0].layoutStatus === 'ready', false);
  if (code) assert.ok(s.scenes[0].issues.some(i => i.code === code));
};
checkBlocked(w => delete w.assets[0].registryId, 'asset-unresolved');
checkBlocked(w => w.assets[0].registryId = 'does-not-exist', 'asset-unresolved');
checkBlocked(w => w.assets[0].registryId = 'roman-villager-01', 'asset-category-mismatch');
checkBlocked(w => w.assets[0].evidence = { ...evidence, certainty: 'unknown' }, 'asset-unreviewed');
checkBlocked(w => w.layouts[0].buildings[0].evidence = { ...evidence, certainty: 'unknown' }, 'unreviewed-geometry');
checkBlocked(w => w.places[0].position.evidence = { ...evidence, certainty: 'unknown' }, 'unreviewed-location');
checkBlocked(w => w.scenes[0].period.approximate = true, 'uncertain-date');
checkBlocked(w => w.layouts[0].period.approximate = true, 'ambiguous-layout');
checkBlocked(w => w.layouts[0].buildings = [], 'unavailable-layout');
checkBlocked(w => w.layouts[0].extentMeters = 1200, 'unavailable-layout');
checkBlocked(w => { w.footprints = []; w.places[0].position.coordinate[1] = 90; }, 'unsupported-location', 'unavailable');
checkBlocked(w => w.layouts.push({ ...structuredClone(w.layouts[0]), id: 'layout:overlap' }), 'ambiguous-layout');
checkBlocked(w => w.assets.push({ id: 'asset:extra', category: 'building', registryId: 'roman-villa-01', evidence }) && w.scenes[0].assetIds.push('asset:extra'), 'asset-unplaced');
checkBlocked(w => w.assets.push({ id: 'asset:tree', category: 'vegetation', registryId: 'environment-olive-tree-01', evidence }) && w.scenes[0].assetIds.push('asset:tree'), 'asset-unsupported');
checkBlocked(w => { delete w.assets[0].registryId; w.scenes[0].required = true; }, 'asset-unresolved', 'unavailable');
checkBlocked(w => { delete w.assets[0].registryId; w.scenes[0].fallback = 'unavailable'; }, 'asset-unresolved', 'unavailable');
const blocked = structuredClone(synthetic);
blocked.scenes.push({ ...structuredClone(blocked.scenes[0]), id: 'scene:mandatory', required: true, layoutIds: [], assetIds: [] });
let blockedSelection = selected(blocked); assert.equal(blockedSelection.descriptors.length, 0);
assert.equal(blockedSelection.scenes[0].status, 'unavailable'); assert.ok(blockedSelection.scenes[0].issues.some(i => i.code === 'required-scene-unavailable'));
blocked.scenes[1].period = at(80); assert.equal(selected(blocked).descriptors.length, 1, 'Inactive mandatory request cannot block another date');
const independent = structuredClone(synthetic); independent.scenes = [];
assert.equal(selected(independent).descriptors.length, 1, 'Standalone reviewed layouts retain exploration behavior');
const unrelated = structuredClone(synthetic); unrelated.scenes[0].layoutIds = []; unrelated.scenes[0].assetIds = [];
assert.equal(selected(unrelated).descriptors.length, 1, 'Optional requests do not own unrelated exploration layouts');
const invalid = structuredClone(synthetic); invalid.scenes[0].assetIds = ['missing']; assert.throws(() => resolve(invalid, at(79)));
const original = JSON.stringify(synthetic); const detached = resolve(synthetic, at(79)); detached[0].scene.title = 'changed'; assert.equal(JSON.stringify(synthetic), original);
const originalFetch = globalThis.fetch;
try { globalThis.fetch = () => { throw Error('Resolver must not fetch'); }; assert.equal(resolve(synthetic, at(79))[0].status, 'ready'); }
finally { globalThis.fetch = originalFetch; }
const world = validate(menander), view = inspect(world, select(world, at(79)), { kind: 'place', id: world.places[0].id });
const html = renderToStaticMarkup(createElement(HistoricalInspector, { inspection: view, onClose() {}, onVisit() {}, onInspectPlace() {} }));
assert.ok(html.includes('Map-only fallback')); assert.ok(html.includes('Catalogue version is draft')); assert.ok(html.includes('2D extent is available'));
assert.equal(view.locations[0].target.zoom, 18); assert.ok(view.evidence.some(e => e.label.startsWith('Model requirement')));
let time = at(79), listener, applied, applies = 0;
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: fn => { listener = fn; return () => {}; }, apply: value => { applied = value; applies++; }, release: () => { applied = null; }, load: async () => menander });
await session.load('menander'); const count = applies; session.inspect({ kind: 'place', id: world.places[0].id }); assert.equal(applies, count, 'Inspection does not reapply scenes');
assert.equal(applied.scenes[0].status, 'map-only'); time = at(80); listener(); assert.equal(applied.scenes[0].status, 'outside-period'); assert.equal(applied.descriptors.length, 0);
session.clear(); assert.equal(applied, null); assert.equal(session.getSnapshot().inspection, undefined); session.dispose();
console.log('Historical scene requirements: real map fallbacks, explicit synthetic 3D projection, unresolved/unplaced/category/evidence/date guards, mandatory blocking, standalone layouts, pure planning, inspector and session lifecycle pass.');
