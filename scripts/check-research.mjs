// Phase 5C research and acquisition, offline (no network): the allow-list, the normalisers that gate promotion from quarantine,
// the committed Ostia snapshots against their manifest digests, documents for every source kind, dates written in words, the
// research queue, drafts carrying citable sources, and an accepted draft reaching the planner and a composed journey with correct
// chronology (Ostia's Capitolium, built 120 CE, is not shown at AD 100). Reviews here use a temporary folder, never the real log.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const R = await mod('lib/research/sources');
const { researchTasks } = await mod('lib/research/queue');
const claims = await mod('lib/ai/claims');
const { assembleDraft } = await mod('lib/ai/draft');
const rv = await mod('lib/ai/review');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore } = await mod('lib/plan/store');
const { blueprintIssues } = await mod('lib/plan/checkpointA');
const { planScenario, structuredRequest } = await mod('lib/plan/planner');
const { composeScenario } = await mod('lib/plan/composer');
const { sourceIndex } = await mod('lib/plan/sources');
const { defaultPlanningContext } = await mod('lib/plan/context');
const { validateBlueprint } = await mod('lib/plan/contracts');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const catalogue = readAssetCatalogue();

// The allow-list.
for (const ok of ['https://query.wikidata.org/sparql?x', 'https://pleiades.stoa.org/places/1/json', 'https://en.wikipedia.org/api/rest_v1/page/summary/X', 'https://overpass-api.de/api/interpreter']) R.assertAllowed(ok);
for (const bad of ['http://pleiades.stoa.org/places/1/json', 'https://example.com/x', 'https://pleiades.stoa.org.evil.net/x', 'https://user:pw@en.wikipedia.org/x', 'https://de.wikipedia.org/x']) assert.throws(() => R.assertAllowed(bad), /not an allowed/, bad);
assert.equal(R.slugify('Ostia Antica (Roma)'), 'ostia-antica-roma');

// Normalisers: shapes that pass, shapes that are refused.
const sparql = { results: { bindings: [
  { item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'A' }, coord: { value: 'Point(12.5 41.9)' }, inception: { value: '-0100-01-01T00:00:00Z' } },
  { item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'A' }, coord: { value: 'Point(12.5 41.9)' }, inception: { value: '-0200-01-01T00:00:00Z' }, pleiades: { value: '42' } },
  { item: { value: 'http://www.wikidata.org/entity/Q2' }, coord: { value: 'not a point' } }] } };
const wd = R.normaliseWikidata(sparql);
assert.equal(wd.length, 1); assert.equal(wd[0].inception, '-0200-01-01T00:00:00Z', 'the earliest inception is kept'); assert.equal(wd[0].pleiadesId, '42');
assert.equal(R.wikidataYearWords('-0700-01-01T00:00:00Z'), '700 BCE'); assert.equal(R.wikidataYearWords('+0120-01-01T00:00:00Z'), '120 CE');
assert.throws(() => R.normaliseWikidata({ html: true }), /SPARQL/);
assert.throws(() => R.normalisePleiades({ uri: 'https://example.com', title: 'x' }), /not a place/);
assert.throws(() => R.normaliseWikipedia({ title: 'x', extract: 'y', content_urls: { desktop: { page: 'https://example.com' } } }), /not a page summary/);
assert.equal(R.normaliseOverpass({ elements: [{ type: 'way', id: 1, center: { lat: 41, lon: 12 }, tags: { name: 'Baths', historic: 'ruins', amenity: 'x' } }, { type: 'node', id: 2, lat: 41, lon: 12, tags: { historic: 'ruins' } }] }).features.length, 1, 'unnamed remains are dropped');
assert.ok(R.wikidataAroundQuery([12.29, 41.75], 2).includes('wikibase:radius "2"') && R.overpassAroundQuery([12.29, 41.75], 2000).includes('around:2000,41.75,12.29'));

// The committed Ostia snapshots match their manifest and render deterministically.
const manifest = JSON.parse(readFileSync('data/history/ostia/source/manifest.json', 'utf8'));
for (const e of manifest.entries) {
  assert.equal(createHash('sha256').update(readFileSync(e.file, 'utf8')).digest('hex'), e.sha256, `${e.file} matches its digest`);
  assert.ok(e.licence && e.licenceUrl && e.requests.every(u => R.assertAllowed(u)), `${e.file} has a licence and allow-listed requests`);
}
const docs = claims.placeDocuments('ostia');
assert.equal(docs.length, manifest.entries.reduce((s, e) => s + e.records, 0), 'one document per fetched record');
assert.deepEqual(claims.placeDocuments('ostia').map(d => d.text), docs.map(d => d.text));
for (const prefix of ['source:wikidata-', 'source:pleiades-', 'source:wikipedia-', 'source:osm-']) assert.ok(docs.some(d => d.sourceId.startsWith(prefix)), `${prefix} documents`);
const ostia = docs.find(d => d.sourceId === 'source:wikidata-Q1012797');
assert.match(ostia.text, /Inception: 700 BCE\./);
const dated = claims.verifyClaims(ostia, [{ feature: 'Ostia', kind: 'settlement', coordinate: [12.2875, 41.754167], existence: { startYear: -699, endYear: null }, quote: 'Coordinate: longitude 12.287500, latitude 41.754167. Inception: 700 BCE.', confidence: 'medium', note: '' },
  { feature: 'Ostia', kind: 'settlement', coordinate: null, existence: { startYear: -700, endYear: null }, quote: 'Inception: 700 BCE.', confidence: 'medium', note: '' }]);
assert.equal(dated.accepted.length, 1, '700 BCE is astronomical -699'); assert.match(dated.discarded[0].reason, /year -700 not in the quote/);
assert.equal(claims.scoreClaims([dated], goldenBlueprints()).precision, null, 'a place with no curated features is reported, not scored');

// The research queue.
const elsewhere = planScenario({ schema: 1, place: { title: 'Ostia', coordinate: [12.2923, 41.7556], tradition: 'roman' }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour' }, defaultPlanningContext());
const fetchTask = researchTasks(elsewhere).find(t => t.kind === 'fetch-place');
assert.ok(fetchTask?.command.includes('fetch-place.mjs --title "Ostia" --lng 12.2923 --lat 41.7556'));
const rome150 = researchTasks(planScenario(structuredRequest('place:rome', 150), defaultPlanningContext()));
assert.ok(rome150.some(t => t.kind === 'date-evidence' && /55 features/.test(t.title)));
assert.ok(researchTasks(planScenario(structuredRequest('place:rome', 100), defaultPlanningContext())).some(t => t.kind === 'model' && /Deferred/.test(t.note)));

// An accepted draft from fetched sources: citable sources, Checkpoint A, planned and composed with correct chronology.
const tmp = mkdtempSync(join(tmpdir(), 'mankind-research-'));
try {
  const located = docs.filter(d => ['source:wikidata-Q1012797', 'source:wikidata-Q1728612', 'source:pleiades-422995'].includes(d.sourceId)).map(d => {
    const m = /longitude (-?\d+\.\d+), latitude (-?\d+\.\d+)\./.exec(d.text), start = /Inception: (\d+) (BCE|CE)/.exec(d.text);
    return claims.verifyClaims(d, [{ feature: d.title, kind: d.sourceId.includes('Q1728612') ? 'landmark' : 'settlement', coordinate: [Number(m[1]), Number(m[2])], existence: { startYear: start ? (start[2] === 'BCE' ? 1 - Number(start[1]) : Number(start[1])) : null, endYear: null }, quote: start ? `${m[0]} ${start[0]}.` : m[0], confidence: 'high', note: '' }]);
  });
  assert.ok(located.every(r => r.accepted.length === 1), JSON.stringify(located.map(r => r.discarded)));
  for (const r of located) rv.saveDraft('claims', r.sourceId.replace(/^source:/, ''), r, tmp);
  assert.deepEqual(rv.acceptedClaims(tmp), [], 'nothing is used before review');
  for (const r of located) rv.review('claims', r.sourceId.replace(/^source:/, ''), 'accepted', 'Test reviewer', '', tmp);
  const frame = { id: 'blueprint:draft-ostia', title: 'Ostia c. AD 100 (drafted from fetched sources)', placeId: 'place:ostia', placeTitle: 'Ostia', aliases: ['Ostia'], lod: 'city', bounds: [12.268, 41.738, 12.316, 41.774], applicability: { start: { year: 100 } }, traditions: ['roman'], anchor: [12.2923, 41.7556] };
  const draft = assembleDraft(frame, rv.acceptedClaims(tmp), [], claims.sourceEntries(docs), 'data/history/ostia/source/sources.json');
  assert.deepEqual(draft.layers[0].collections.sources.map(s => s.id), ['source:pleiades-422995', 'source:wikidata-Q1012797', 'source:wikidata-Q1728612'], 'the draft carries exactly the sources it cites');
  const store = new BlueprintStore([...goldenBlueprints(), draft]);
  assert.deepEqual(blueprintIssues(draft, { store, catalogue }).filter(i => i.severity === 'error'), []);
  assert.ok(sourceIndex(store.all(), catalogue).get('source:wikidata-Q1728612')?.url.startsWith('https://www.wikidata.org/'));
  rv.saveDraft('blueprint', 'draft-ostia', draft, tmp); rv.review('blueprint', 'draft-ostia', 'accepted', 'Test reviewer', '', tmp);
  const published = rv.acceptedBlueprints(tmp); assert.equal(published.length, 1); validateBlueprint(JSON.parse(JSON.stringify(published[0])));
  const ctx = { store, catalogue };
  const at100 = planScenario({ schema: 1, place: { title: 'Ostia', coordinate: [12.2923, 41.7556] }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour' }, ctx);
  assert.equal(at100.focus.id, 'blueprint:draft-ostia', 'the name now resolves to the accepted blueprint'); assert.ok(at100.validation.ok);
  assert.ok(at100.absent.some(a => a.title === 'Capitolium' && /120 CE/.test(a.reason)), 'the Capitolium (120 CE) is not shown at AD 100');
  const journey = composeScenario(at100, ctx);
  assert.ok(journey.content.sources.some(s => s.id === 'source:wikidata-Q1012797'), 'the journey cites the fetched sources');
  const at130 = planScenario({ schema: 1, place: { id: 'place:ostia' }, time: { start: { year: 130 } }, scope: 'auto', intent: 'tour' }, ctx);
  assert.equal(at130.components.find(c => c.title === 'Capitolium').state, 'missing', 'and at AD 130 its survival past the blueprint date is unconfirmed, not assumed');
  // The app's context loads published drafts and still validates them.
  const accepted = JSON.parse(readFileSync('lib/plan/accepted/blueprints.json', 'utf8'));
  assert.ok(Array.isArray(accepted)); accepted.forEach(b => validateBlueprint(b));
  assert.equal(defaultPlanningContext().store.all().length, goldenBlueprints().length + accepted.length);
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log(`Research (offline): allow-list, normalisers, ${docs.length} Ostia documents matching their manifest digests, dates in words, research queue, drafts with citable sources, and an accepted Ostia draft planned and composed with correct chronology pass.`);
