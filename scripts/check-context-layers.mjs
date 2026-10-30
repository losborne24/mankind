import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { validateScenario } = await mod('lib/scenarios/schema');
const { portunusJourney: journey } = await mod('lib/scenarios/portunus');
const { contextFeatures, matchContext } = await mod('lib/scenarios/contextLayers');
const { scenarioOverlays } = await mod('map/scenarioOverlays');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const dir = 'data/history/forum-boarium/source';
const [pleiades, osm, wikidata, context] = await Promise.all([read(`${dir}/pleiades.json`), read(`${dir}/osm.json`), read(`${dir}/wikidata.json`), read('lib/scenarios/fixtures/forum-boarium-context.json')]);

// 1. Schema: polygon/line overlays carry certainty, name, date range and sources, and bad ones are rejected.
validateScenario(journey);
const { geometries, locations } = journey.content;
assert.ok(geometries.some(g => g.kind === 'polygon') && journey.content.overlays.some(o => o.type === 'polygon') && journey.content.overlays.some(o => o.type === 'point'), 'polygon and marker overlays are present');
for (const g of geometries) { assert.ok(g.title && g.note && ['documented', 'approximate', 'illustrative'].includes(g.certainty)); if (g.certainty !== 'illustrative') assert.ok(g.sources.length, `${g.id} cites a source`); }
const bad = (name, edit) => { const copy = structuredClone(journey); edit(copy); assert.throws(() => validateScenario(copy), undefined, name); };
const geometry = (c, id) => c.content.geometries.find(g => g.id === id);
bad('modern geometry as documented', c => { geometry(c, 'tiber').certainty = 'documented'; });
bad('point-only polygon', c => { geometry(c, 'forum-boarium').basis = 'point-only'; });
bad('schematic cannot be approximate', c => { geometry(c, 'ground').certainty = 'approximate'; });
bad('approximate without source', c => { geometry(c, 'tiber').sources = []; });
bad('open ring', c => { geometry(c, 'forum-boarium').coordinates[0].pop(); });
bad('outside scenario bounds', c => { geometry(c, 'forum-boarium').coordinates[0][1] = [13, 41.89]; });
bad('unknown source', c => { geometry(c, 'tiber').sources = ['source:nowhere']; });
bad('missing note', c => { delete geometry(c, 'tiber').note; });
bad('unknown certainty', c => { geometry(c, 'tiber').certainty = 'certain'; });
bad('overlay kind mismatch', c => { c.content.overlays.find(o => o.geometry === 'tiber').type = 'line'; });
bad('overlay unknown geometry', c => { c.content.overlays.find(o => o.geometry === 'tiber').geometry = 'nowhere'; });
bad('uncertainty without dates', c => { geometry(c, 'tiber').uncertaintyYears = 5; });
bad('reversed date range', c => { geometry(c, 'forum-boarium').time = { start: { year: 10 }, end: { year: -10 } }; });
bad('marker documented extent', c => { c.content.locations.find(l => l.id === 'ara-maxima').context.certainty = 'documented'; });
bad('marker as modern geometry', c => { c.content.locations.find(l => l.id === 'ara-maxima').context.basis = 'ancient-evidence'; });
bad('line with one point', c => { const g = geometry(c, 'pons-aemilius'); g.kind = 'line'; g.coordinates = [[g.coordinates[0][0]]]; c.content.overlays.find(o => o.geometry === 'pons-aemilius').type = 'line'; });
const line = structuredClone(journey); Object.assign(geometry(line, 'pons-aemilius'), { kind: 'line', coordinates: [geometry(line, 'pons-aemilius').coordinates[0]] }); line.content.overlays.find(o => o.geometry === 'pons-aemilius').type = 'line';
validateScenario(line);

// 2. Every coordinate traces to a stored source snapshot; nothing is invented.
const key = p => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
const osmPoints = new Set(osm.elements.flatMap(e => [...(e.geometry ?? []), ...(e.members ?? []).flatMap(m => m.geometry ?? [])].map(key)));
const [west, south, east, north] = journey.scope.bounds, onEdge = p => [west, east].includes(p[0]) || [south, north].includes(p[1]);
const expectedOsm = { 'forum-boarium': 27350575, 'hercules-victor-footprint': 251342364, 'portunus-footprint': 251331418, 'arch-of-janus': 52924046, 'santa-maria-in-cosmedin': 120854225 };
for (const g of geometries) {
  if (g.id === 'ground') { assert.equal(g.basis, 'schematic'); assert.deepEqual(g.coordinates[0].map(p => p.join()), [[west, south], [east, south], [east, north], [west, north], [west, south]].map(p => p.join()), 'ground tile is exactly the scenario bounds'); continue; }
  for (const ring of g.coordinates) for (const p of ring) assert.ok(osmPoints.has(key(p)) || (g.id === 'tiber' && onEdge(p)), `${g.id} vertex ${p} is in the OpenStreetMap snapshot`);
  assert.equal(g.basis, 'modern-geometry', `${g.id} is labelled modern geometry`);
}
for (const [id, way] of Object.entries(expectedOsm)) assert.deepEqual(geometries.find(g => g.id === id).coordinates[0], osm.elements.find(e => e.id === way).geometry.map(p => p.map(v => Math.round(v * 1e6) / 1e6)), `${id} equals OSM way ${way}`);
const marker = id => locations.find(l => l.id === id).coordinate, near = (a, b) => assert.ok(Math.abs(a[0] - b[0]) < 1.5e-6 && Math.abs(a[1] - b[1]) < 1.5e-6, `${a} vs ${b}`);
near(marker('portus-tiberinus'), wikidata['portus-tiberinus'].coordinate);
near(marker('ara-maxima'), pleiades.places['ara-maxima'].reprPoint);
near(marker('cloaca-maxima-outlet'), pleiades.places['cloaca-maxima'].locations[0].geometry.coordinates);
for (const [id, place] of [['capitoline', 'capitoline'], ['palatine', 'palatine'], ['aventine', 'aventine'], ['tiber-island', 'tiber-island'], ['circus-maximus', 'circus-maximus']]) near(marker(id), pleiades.places[place].reprPoint);
for (const id of ['portus-tiberinus', 'ara-maxima', 'cloaca-maxima-outlet']) { assert.equal(locations.find(l => l.id === id).context.basis, 'point-only'); assert.ok(!geometries.some(g => g.id === id), `${id} stays a marker`); }
assert.equal(locations.find(l => l.id === 'portus-tiberinus').context.certainty, 'approximate');
for (const id of ['capitoline', 'palatine', 'aventine', 'tiber-island', 'circus-maximus']) assert.equal(locations.find(l => l.id === id).context.style, 'orientation', `${id} is orientation only`);
const tiber = geometries.find(g => g.id === 'tiber');
assert.match(tiber.title, /modern/i); assert.match(tiber.title, /approximate/i); assert.match(tiber.note, /not the ancient course/i); assert.equal(tiber.certainty, 'approximate');
assert.match(geometries.find(g => g.id === 'ground').title, /illustrative/i);
// Licences: every source used carries its terms.
for (const s of journey.content.sources.filter(s => context.sources.some(c => c.id === s.id))) assert.ok(s.licence, `${s.id} states a licence`);
for (const s of context.sources) {
  if (s.id.startsWith('source:osm-')) assert.match(s.licence, /ODbL/); else if (s.id.startsWith('source:pleiades-')) assert.match(s.licence, /CC BY 3\.0/); else if (s.id.startsWith('source:wikidata-')) assert.match(s.licence, /CC0/);
}
assert.match(osm.licence, /ODbL/); assert.match(pleiades.licence, /CC BY 3\.0/); assert.match(wikidata.licence, /CC0/);

// 3. Date filtering is a feature: AD 100 leaves out the Arch of Janus and Santa Maria in Cosmedin.
const all = journey.content.overlays.filter(o => ['polygon', 'line', 'point'].includes(o.type)).map(o => o.id);
const at = year => Object.fromEntries(contextFeatures(journey, all, { start: { year } }).map(f => [f.id, f.match]));
const ad100 = at(100);
assert.equal(ad100['arch-of-janus'], 'outside'); assert.equal(ad100['santa-maria-in-cosmedin'], 'outside');
assert.equal(ad100['forum-boarium'], 'within'); assert.equal(ad100['pons-aemilius'], 'within'); assert.equal(ad100['hercules-victor-footprint'], 'within');
assert.equal(ad100['portus-tiberinus'], 'possible', 'Docks: dated only to at least the Flavian period, so possible at AD 100');
assert.equal(ad100.capitoline, 'within', 'Landforms have no date range');
assert.equal(at(400)['arch-of-janus'], 'within'); assert.equal(at(400)['santa-maria-in-cosmedin'], 'outside'); assert.equal(at(1000)['santa-maria-in-cosmedin'], 'within');
assert.equal(at(-500)['hercules-victor-footprint'], 'outside');
assert.equal(matchContext({ certainty: 'illustrative', basis: 'schematic', style: 'ground', note: 'x' }, { start: { year: -2000 } }), 'within');
// Renderer: the map source receives only features inside the date range, tiny GeoJSON, with an inspect callback.
const layers = [], sources = {}, handlers = [];
const map = { addSource: (id, s) => { sources[id] = { ...s, setData(d) { this.data = d; } }; }, addLayer: l => layers.push(l.id), getLayer: id => layers.includes(id), removeLayer: id => layers.splice(layers.indexOf(id), 1), getSource: id => sources[id], removeSource: id => delete sources[id], on: (...a) => handlers.push(a), off: (...a) => handlers.splice(0, handlers.length, ...handlers.filter(h => h[1] !== a[1] || h[0] !== a[0])), getCanvas: () => ({ style: {} }) };
const inspected = []; const overlays = scenarioOverlays(map, id => inspected.push(id));
const ids = journey.beats.find(b => b.id === 'market').actions[0].overlays;
const titles = data => data.features.map(f => f.properties.id).filter(Boolean);
overlays.update(ids, journey, { start: { year: 100 } });
const shown = new Set(titles(sources['scenario-geography'].data));
assert.ok(shown.has('forum-boarium') && shown.has('ara-maxima') && shown.has('tiber'));
assert.ok(!shown.has('arch-of-janus') && !shown.has('santa-maria-in-cosmedin'), 'AD 100 leaves out the Arch of Janus and Santa Maria in Cosmedin');
overlays.update(ids, journey, { start: { year: 400 } });
assert.ok(titles(sources['scenario-geography'].data).includes('arch-of-janus'), 'The arch appears once the date allows it');
assert.ok(sources['scenario-geography'].data.features.every(f => f.properties.state !== 'outside'));
assert.ok(handlers.some(h => h[0] === 'click'), 'layers are clickable for inspection');
overlays.dispose(); assert.equal(layers.length, 0); assert.equal(Object.keys(sources).length, 0); assert.equal(handlers.filter(h => h[0] === 'click').length, 0, 'inspection listeners removed');

// 4. Generated files are reproducible from the snapshots (no hand edits).
const before = await Promise.all(['lib/scenarios/fixtures/forum-boarium-context.json', 'lib/history/fixtures/forum-boarium.json'].map(p => readFile(p, 'utf8')));
execFileSync(process.execPath, ['scripts/context/forum-boarium/build-context.mjs'], { stdio: 'pipe' });
execFileSync(process.execPath, ['scripts/reconstructions/forum-boarium/prepare-data.mjs'], { stdio: 'pipe' });
const after = await Promise.all(['lib/scenarios/fixtures/forum-boarium-context.json', 'lib/history/fixtures/forum-boarium.json'].map(p => readFile(p, 'utf8')));
assert.deepEqual(after, before, 'generators reproduce the committed fixtures');
console.log('Context layers: polygon/line/marker overlay schema and rejection rules, source-traced coordinates, modern-geometry and point-only labelling, licences, AD 100 date filtering (Arch of Janus and Santa Maria in Cosmedin left out), renderer listeners and reproducible generators pass.');
