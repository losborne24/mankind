import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  let { outputText } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  for (const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const spec = match[1], url = spec.startsWith('@/') ? await load(spec.slice(2)) : import.meta.resolve(spec);
    outputText = outputText.replace(match[0], `from "${url}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  modules.set(path, url); return url;
}
const { validateHistoricalWorld: validate } = await import(await load('lib/history/validate'));
const { matchHistoricalPeriod: match, toHistoricalTime, validateHistoricalDate } = await import(await load('lib/history/time'));
const { toScenarioContent, bindHistoricalScenario, resolveHistoricalSettlement: resolve } = await import(await load('lib/history/adapters'));
const { ScenarioPlayer } = await import(await load('lib/scenarios/player'));
const { SettlementScene } = await import(await load('map/settlements/SettlementScene'));
const { RegionalSettlement } = await import(await load('map/settlements/RegionalSettlement'));
const fixture = JSON.parse(await readFile('lib/history/fixtures/london2012.json', 'utf8'));
const world = validate(fixture), at = { year: 2012, month: 7, day: 27 };
assert.deepEqual(world, fixture); assert.notEqual(world, fixture);
world.places[0].title = 'Changed'; assert.equal(fixture.places[0].title, 'London');
for (const mutate of [
  w => w.version = 2, w => w.calendar = 'julian', w => w.coordinateSystem = 'local', w => w.unknown = true,
  w => w.sources[0].url = 'javascript:alert(1)', w => w.sources[0].accessed = '2026-02-30',
  w => w.events[0].evidence.sources = [], w => w.events[0].evidence.sources = ['missing'],
  w => w.events[0].evidence.certainty = 'verified', w => w.places[1].id = w.places[0].id,
  w => w.places[0].position.coordinate = [181, 0], w => w.places[0].position.coordinate = [0, NaN],
  w => w.places[0].position.uncertaintyMeters = -1, w => w.places[0].parentId = w.places[1].id,
  w => w.events[0].period.start = { year: 2012, month: 2, day: 30 },
  w => w.events[0].period.end = { year: 2011 }, w => w.events[0].period.uncertaintyYears = -1,
  w => w.events[0].locations = [], w => w.events[0].locations[0].placeId = 'missing',
  w => w.routes[0].coordinates = [[0, 0], [0, 0]], w => w.routes[0].period.start = { year: 2026 },
  w => w.scenes[0].assetIds = ['missing'], w => w.scenes[0].required = 'yes',
]) { const invalid = structuredClone(fixture); mutate(invalid); assert.throws(() => validate(invalid)); }
const cycle = structuredClone(fixture); cycle.extra = cycle; assert.throws(() => validate(cycle), /Cyclic/);
const deep = structuredClone(fixture); let nested = deep; for (let i = 0; i < 35; i++) nested = nested.child = {}; assert.throws(() => validate(deep), /complexity/);
let getterRead = false; const getter = structuredClone(fixture); Object.defineProperty(getter, 'extra', { enumerable: true, get() { getterRead = true; return 1; } });
assert.throws(() => validate(getter)); assert.equal(getterRead, false);
assert.throws(() => validate({ ...fixture, extra: () => {} }));
validateHistoricalDate({ year: 0, month: 2, day: 29 });
assert.throws(() => validateHistoricalDate({ year: 1900, month: 2, day: 29 }));
assert.equal(match({ start: { year: -1 }, end: { year: 1 } }, { year: 0 }), 'within');
assert.equal(match({ start: { year: 2012 } }, at), 'within');
assert.equal(match({ start: at }, { year: 2012 }), 'possible');
assert.equal(match({ start: { year: 2012 }, uncertaintyYears: 2 }, { year: 2011 }), 'possible');
assert.equal(match({ start: { year: 2012 } }, { year: 2013 }), 'outside');
assert.throws(() => toHistoricalTime({ start: { year: 2012 }, uncertaintyYears: 1 }));

const projection = toScenarioContent(fixture);
assert.equal(projection.content.locations[1].certainty, 'illustrative', 'Event evidence cannot promote approximate coordinates');
assert.ok(projection.warnings.length); assert.equal(projection.content.scenes[0].required, false);
assert.equal(projection.content.routes[0].certainty, 'illustrative');
const direction = { version: 1, id: 'experience:opening', title: 'Opening ceremony context', description: 'Schema-to-player integration fixture.', scope: { bounds: [-.3, 51.4, .2, 51.7], time: { start: at } }, beats: [
  { id: 'arrival', title: 'Ceremony venue', sceneRequirements: ['scene:ceremony-context'], actions: [{ camera: { type: 'flyTo', center: [-.0166, 51.5387], zoom: 14, duration: 100 }, overlays: ['event:event:london-2012-opening', 'event:event:london-2012-opening:location:0'], time: { start: at } }] },
  { id: 'approach', title: 'Illustrative line', actions: [{ camera: { type: 'followRoute', route: 'route:london-approach', zoom: 14, pitch: 40, duration: 100 }, overlays: ['route:route:london-approach'] }] },
] };
const bound = bindHistoricalScenario(fixture, direction);
let pose = { center: [0, 0], zoom: 2, pitch: 0, bearing: 0 }, frames = new Map(), id = 0, date;
const player = new ScenarioPlayer({ camera: { read: () => pose, write: p => pose = p, stop: () => {} }, timeline: t => date = t, overlays: () => {}, frame: cb => { frames.set(++id, cb); return id; }, cancelFrame: key => frames.delete(key) });
player.load(JSON.parse(JSON.stringify(bound.scenario))); player.play();
for (let now = 0; now <= 500; now += 100) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(now)); assert.ok(frames.size <= 1); }
assert.equal(player.snapshot.state, 'completed'); assert.deepEqual(date.start, at); player.dispose(); assert.equal(frames.size, 0);
const wrongDate = structuredClone(direction); wrongDate.scope.time = { start: { year: 2013 } }; wrongDate.beats[0].actions[0].time = wrongDate.scope.time;
assert.throws(() => bindHistoricalScenario(fixture, wrongDate), /outside action date/);
const strict = structuredClone(fixture); strict.scenes[0].fallback = 'unavailable'; assert.throws(() => bindHistoricalScenario(strict, direction), /resolver unavailable/);
const polar = structuredClone(fixture); polar.places[0].position.coordinate[1] = 90; validate(polar); assert.throws(() => toScenarioContent(polar), /latitude/);

// Explicit synthetic adapter fixture, not a historical reconstruction or new building kit.
const synthetic = structuredClone(fixture), evidence = { certainty: 'illustrative', sources: [], note: 'Synthetic geometry adapter test only.' };
synthetic.assets.push({ id: 'asset:test-building', category: 'building', registryId: 'roman-villa-01', evidence });
synthetic.roadNetworks.push({ id: 'roads:test', placeId: 'place:olympic-stadium', period: { start: { year: 2012 } }, frame: 'local-east-south-metres', roads: [{ id: 'access', widthMeters: 2, points: [[-20, 0], [0, 0]], accessTo: 'building:test', evidence }], evidence });
synthetic.layouts.push({ id: 'layout:test', title: 'Synthetic adapter test', placeId: 'place:olympic-stadium', period: { start: { year: 2012 } }, frame: 'local-east-south-metres', extentMeters: 100, maxFoundationRiseMeters: 3, buildings: [{ id: 'building:test', assetId: 'asset:test-building', offset: [0, 0], evidence }], roadNetworkId: 'roads:test', evidence });
const skew = structuredClone(synthetic); skew.roadNetworks[0].roads[0].points[0] = [-20, -10];
validate(skew); assert.equal(resolve(skew, 'layout:test', at).status, 'unavailable', 'Store arbitrary sourced roads but reject unsupported rendering');
assert.deepEqual(skew.roadNetworks[0].roads[0].points[0], [-20, -10]);
const resolved = resolve(synthetic, 'layout:test', at);
assert.equal(resolved.status, 'ready'); assert.equal(resolved.descriptor.profile, undefined); assert.equal(resolved.descriptor.seed, undefined);
assert.equal(resolved.definition.buildings[0].assetId, 'roman-villa-01');
const requests = [], scene = new SettlementScene(resolved.definition, () => {}, () => {}, { acquire: async url => { requests.push(url); throw Error('Synthetic asset deliberately unavailable'); } });
scene.configureAmbientLife({ enabled: true, count: 5, paths: true });
await scene.load();
assert.equal(scene.ambientLife.options.enabled, false);
assert.equal(scene.ambientLife.status.active, 0);
assert.equal(requests.length, 1, 'Only the explicitly selected building may request an asset');
assert.ok(!requests.some(url => url.includes('villager')), 'Historical layouts must never load default Roman inhabitants');
scene.dispose();
assert.deepEqual(resolved.definition.roads[0].points, [[-20, 0], [0, 0]], 'Preserve explicit road coordinates without regeneration');
assert.notEqual(resolved.definition.buildings, synthetic.layouts[0].buildings);
const proxy = new RegionalSettlement(resolved.descriptor); proxy.updateTerrain(() => 0); assert.equal(proxy.scene.children.length, 2); proxy.dispose();
assert.equal(resolve(synthetic, 'layout:test', { year: 2013 }).status, 'outside-period');
const uncertain = structuredClone(synthetic); uncertain.layouts[0].period.uncertaintyYears = 2; assert.equal(resolve(uncertain, 'layout:test', at).status, 'uncertain-period');
const absent = structuredClone(synthetic); delete absent.assets[1].registryId; assert.equal(resolve(absent, 'layout:test', at).status, 'unavailable');
assert.equal(resolve(absent, 'layout:test', at).definition, undefined, 'No fallback to Roman architecture');
const wrongCategory = structuredClone(synthetic); wrongCategory.assets[1].registryId = 'roman-villager-01'; assert.equal(resolve(wrongCategory, 'layout:test', at).status, 'unavailable');
for (const mutate of [w => w.layouts[0].buildings[0].assetId = 'missing', w => w.layouts[0].buildings[0].offset = [5000, 0], w => w.layouts[0].frame = 'degrees', w => w.roadNetworks[0].roads[0].accessTo = 'missing', w => w.roadNetworks[0].placeId = 'place:london', w => w.roadNetworks[0].roads[0].widthMeters = -1]) {
  const invalid = structuredClone(synthetic); mutate(invalid); assert.throws(() => validate(invalid));
}
console.log('Historical world v1: plain JSON, conventions, bounded validation, citations, reference integrity, precision/BCE/uncertainty, multi-location events, temporal binding, player integration, explicit layouts/roads, profile-free descriptors and missing-asset safety pass.');
