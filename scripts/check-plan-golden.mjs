// Phase 5A golden references and blueprint contracts (lib/plan). Test F: the Forum Boarium and Rome AD 100 files compile back from
// their blueprints byte for byte, and everything the generators, plan view and journey make from them matches the digests recorded
// before Phase 5A. Also: contract validation, the blueprint hierarchy, Checkpoint A over every blueprint and seeded faults, asset
// requests for every landmark placeholder, versioned generators, immutable revisions, override layers and selective invalidation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadTypescript } from './lib/load-typescript.mjs';
import { GOLDEN_FIXTURES, goldenOutputs } from './plan/golden-outputs.mjs';
const mod = async path => import(await loadTypescript(path));
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore } = await mod('lib/plan/store');
const { compileLayer } = await mod('lib/plan/codecs');
const contracts = await mod('lib/plan/contracts');
const { blueprintIssues } = await mod('lib/plan/checkpointA');
const { landmarkAssetRequest } = await mod('lib/plan/assetRequests');
const { GENERATORS } = await mod('lib/plan/generators');
const { invalidate } = await mod('lib/plan/invalidation');
const { applyOverrides, overrideIssues } = await mod('lib/plan/overrides');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const { generateRomeFill } = await mod('lib/scenarios/romeFill');
const { forumReconstruction } = await mod('lib/history/localContext');
const { offsetCoordinate } = await mod('map/settlements/romanSettlement');
const sha = text => createHash('sha256').update(text).digest('hex');
const catalogue = readAssetCatalogue(), blueprints = goldenBlueprints(), store = new BlueprintStore(blueprints), ctx = { store, catalogue };
const get = id => store.latest(id);

// Test F: byte-for-byte fixtures from the blueprints, and unchanged outputs.
const compiled = new Map();
for (const b of blueprints) for (const layer of b.layers) compiled.set(layer.output, compileLayer(layer));
for (const path of GOLDEN_FIXTURES) {
  assert.ok(compiled.has(path), `${path} is held by a golden blueprint`);
  assert.equal(compiled.get(path), await readFile(path, 'utf8'), `${path} compiles back byte for byte`);
}
const recorded = JSON.parse(await readFile('lib/plan/golden/outputs.json', 'utf8')).digests, now = await goldenOutputs();
for (const [name, digest] of Object.entries(recorded)) assert.equal(now[name], digest, `${name} is unchanged since before Phase 5A`);
assert.equal(Object.keys(recorded).length, 14);
// The generator registry pins what rome-fill gives for the golden inputs: a rule change without a version bump fails here.
const keepOut = forumReconstruction.objects.map(o => o.footprint.map(p => offsetCoordinate(forumReconstruction.origin, p)));
assert.equal(sha(JSON.stringify(generateRomeFill(keepOut).items)), GENERATORS['rome-fill'].outputDigest, 'rome-fill v1 reproduces its recorded output');

// Contracts and hierarchy.
for (const b of blueprints) {
  contracts.validateBlueprint(b);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.features) && (b.layers.length === 0 || Object.isFrozen(b.layers[0].collections)), `${b.id} is frozen`);
  const errors = blueprintIssues(b, ctx).filter(i => i.severity === 'error');
  assert.deepEqual(errors, [], `${b.id} passes Checkpoint A`);
}
const chain = [get('blueprint:temple-of-portunus'), ...store.ancestors(get('blueprint:temple-of-portunus'))].map(b => `${b.lod}:${b.id}`);
assert.deepEqual(chain, ['site:blueprint:temple-of-portunus', 'neighbourhood:blueprint:forum-boarium', 'city:blueprint:rome', 'region:blueprint:central-italy', 'empire:blueprint:roman-empire']);
assert.deepEqual(contracts.SPATIAL_LODS, ['empire', 'region', 'city', 'neighbourhood', 'site', 'architectural']);
assert.ok(JSON.stringify(get('blueprint:roman-empire')).length < 10000 && get('blueprint:roman-empire').features.length < 5, 'the empire describes only empire-scale detail');
assert.ok(get('blueprint:rome').features.filter(f => f.kind === 'building').length === 0, 'the city holds zones, routes, landmarks and fill, not neighbourhood buildings');
// Evidence at coarse scales is not invented: frames are illustrative, settlements come from registered data only.
for (const id of ['blueprint:roman-empire', 'blueprint:central-italy']) {
  const b = get(id);
  assert.equal(b.boundsEvidence.certainty, 'illustrative');
  assert.ok(b.features.filter(f => f.kind === 'settlement').every(f => f.refs.some(r => r.store.startsWith('world:') || r.store.startsWith('fixture:'))), `${id} settlements cite registered records`);
}
// Rejections.
const reject = (fn, pattern, what) => assert.throws(fn, pattern, what);
const rome = get('blueprint:rome');
reject(() => contracts.validateBlueprint({ ...structuredClone(rome), lod: 'continent' }), /lod/, 'unknown spatial LOD');
reject(() => contracts.validateBlueprint({ ...structuredClone(rome), features: [...rome.features, rome.features[0]] }), /duplicate feature/, 'duplicate stable id');
reject(() => contracts.validateFeature({ ...structuredClone(rome.features[1]), evidence: { certainty: 'documented', sources: [], note: 'x' } }), /documented without a source/);
reject(() => contracts.validateFeature({ ...structuredClone(rome.features[1]), chronology: 'timeless' }), /must not carry/);
reject(() => contracts.validateFeature({ ...structuredClone(rome.features.find(f => f.kind === 'landmark')), rung: 1 }), /catalogue pin/, 'rung 1 needs a model');
reject(() => contracts.validateScenarioRequest({ schema: 1, place: { id: 'place:rome' }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour', text: 'take me to Rome' }), /unknown field text/, 'no free text in Phase 5A');
reject(() => contracts.validateScenarioRequest({ schema: 1, place: { title: 'Ostia', coordinate: [12.29, 95] }, time: { start: { year: 100 } }, scope: 'city', intent: 'tour' }), /number outside/);
assert.deepEqual(contracts.normaliseRequest({ intent: 'tour', scope: 'auto', time: { end: { year: 100 }, start: { year: 100 } }, place: { id: ' place:rome ' }, schema: 1 }), { schema: 1, place: { id: 'place:rome' }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour' });

// Checkpoint A catches seeded faults in an otherwise valid blueprint.
const faulty = structuredClone(rome); faulty.version = 9;
const colosseum = faulty.features.find(f => f.id === 'landmark:colosseum'), tiber = faulty.features.find(f => f.id === 'zone:tiber');
colosseum.geometry.anchor = [12.4766, 41.8905];                         // mid-river, beside Tiber Island
faulty.features.find(f => f.id === 'landmark:pantheon').geometry.anchor = [13.5, 41.9];   // outside the frame
const seeded = new BlueprintStore([...blueprints.filter(b => b.id !== 'blueprint:rome'), faulty]);
const faultIssues = blueprintIssues(faulty, { store: seeded, catalogue }), codes = faultIssues.filter(i => i.severity === 'error').map(i => `${i.code}:${i.subject}`);
assert.ok(tiber && codes.includes('placement:landmark:colosseum'), `a landmark in the river is caught (${codes})`);
assert.ok(codes.includes('coordinates:landmark:pantheon'), 'a feature outside its frame is caught');
assert.ok(faultIssues.some(i => i.code === 'inheritance-version' && i.severity === 'warning'), 'a child pinned to another parent version is reported');
const wrongPin = structuredClone(get('blueprint:temple-of-hercules-victor')); wrongPin.version = 9; wrongPin.features[0].asset.catalogue = { id: 'catalogue:portunus-exterior', version: 1 };
assert.ok(blueprintIssues(wrongPin, { store: new BlueprintStore([...blueprints, wrongPin]), catalogue }).some(i => i.code === 'asset-identity' && i.severity === 'error'), 'a model of another building is caught');
const outside = structuredClone(get('blueprint:forum-boarium')); outside.version = 9; outside.bounds = [12.6, 41.95, 12.7, 42.0];
assert.ok(blueprintIssues(outside, { store: new BlueprintStore([...blueprints, outside]), catalogue }).some(i => i.code === 'containment'), 'a child outside its parent is caught');

// Every Rome landmark placeholder is a traceable asset request.
const landmarks = rome.features.filter(f => f.kind === 'landmark');
assert.equal(landmarks.length, 55);
const requests = landmarks.map(f => landmarkAssetRequest(rome, f, catalogue));
for (const r of requests) {
  contracts.validateAssetRequest(r);
  assert.equal(r.currentRung, 3); assert.equal(r.targetRung, 1); assert.equal(r.assetType, 'bespoke-landmark');
  assert.ok(r.catalogue.proposedId.startsWith('catalogue:rome-') && !r.catalogue.existing, 'no landmark has a catalogue model yet');
  assert.ok(r.location.anchor && r.period.start && r.refs.some(ref => ref.store === 'fixture:lib/scenarios/fixtures/rome-ad100-landmarks.json') && r.missing.length >= 2);
}
assert.equal(new Set(requests.map(r => r.id)).size, 55, 'one request per monument');
assert.ok(requests.filter(r => r.evidence.certainty === 'inferred').every(r => r.missing.some(m => /best guess/.test(m))), 'best-guess placements ask for a sourced position');

// Immutable revisions and override layers.
const scratch = new BlueprintStore(blueprints), forum = scratch.latest('blueprint:forum-boarium');
const stall = forum.features.find(f => f.id.startsWith('recon:') && f.evidence.certainty === 'inferred');
const v2 = scratch.revise(forum, [{ feature: { ...stall, title: `${stall.title} (corrected)` } }], 'test correction');
assert.equal(v2.version, 2); assert.equal(scratch.get({ id: forum.id, version: 1 }), forum, 'version 1 stays registered and unchanged');
assert.notEqual(scratch.digest(v2), scratch.digest(forum));
assert.throws(() => scratch.register(forum), /immutable/);
const override = { id: 'override:test', base: { id: rome.id, version: 1, digest: store.digest(rome) }, ops: [
  { op: 'hide', feature: 'landmark:ludus-magnus', reason: 'scenario focus' },
  { op: 'add', feature: { id: 'scenario:viewpoint-marker', kind: 'marker', title: 'Scenario viewpoint', chronology: 'timeless', evidence: { certainty: 'illustrative', sources: [], note: 'Added by this scenario.' }, refs: [], geometry: { type: 'point', anchor: [12.49, 41.89] }, rung: 5 }, reason: 'test' }] };
assert.deepEqual(overrideIssues(override, store), []);
const derived = applyOverrides(rome, [override]);
assert.ok(!derived.blueprint.features.some(f => f.id === 'landmark:ludus-magnus') && derived.blueprint.features.some(f => f.id === 'scenario:viewpoint-marker'));
assert.ok(rome.features.some(f => f.id === 'landmark:ludus-magnus') && !rome.features.some(f => f.id === 'scenario:viewpoint-marker'), 'the canonical blueprint is untouched');
assert.ok(overrideIssues({ ...override, base: { ...override.base, digest: '0'.repeat(64) } }, store).some(i => i.code === 'override-base-changed'));
assert.ok(overrideIssues({ ...override, ops: [{ op: 'hide', feature: 'landmark:nowhere', reason: 'x' }] }, store).some(i => i.code === 'override-unknown-feature'));

// Selective invalidation: only what a change touches.
const keys = report => report.affected.map(a => `${a.blueprint.id}@${a.blueprint.version}`);
const asset = invalidate(store, { kind: 'asset-available', catalogue: { id: 'catalogue:rome-colosseum', version: 1 }, requestId: 'asset-request:rome/colosseum' }, [override]);
assert.deepEqual(keys(asset), ['blueprint:rome@1']); assert.deepEqual(asset.affected[0].features, ['landmark:colosseum']); assert.deepEqual(asset.affected[0].generators, [], 'a new model does not regenerate the fill');
const corrected = invalidate(store, { kind: 'feature-corrected', blueprint: { id: 'blueprint:forum-boarium', version: 1 }, feature: stall.id });
assert.deepEqual(keys(corrected), ['blueprint:forum-boarium@1', 'blueprint:rome@1']);
const romeHit = corrected.affected.find(a => a.blueprint.id === 'blueprint:rome');
assert.deepEqual(romeHit.features, [], 'no Rome feature is touched'); assert.deepEqual(romeHit.generators, ['fill:rome-ad100'], 'the fill that keeps clear of the neighbourhood is');
const rule = invalidate(store, { kind: 'rule-changed', generator: 'rome-fill', version: '2' });
assert.deepEqual(keys(rule), ['blueprint:rome@1']); assert.deepEqual(rule.affected[0].features, []);
assert.equal(rule.untouched.length, blueprints.length - 1);
const evidence = invalidate(store, { kind: 'evidence', ref: { store: 'source', id: 'source:platner-1929' } }, [override]);
// The empire and region Rome markers cite the zoning extent's sources, Platner among them; only those markers are touched there.
assert.deepEqual(keys(evidence), ['blueprint:central-italy@1', 'blueprint:forum-boarium@1', 'blueprint:roman-empire@1', 'blueprint:rome@1']);
assert.deepEqual(evidence.affected.find(a => a.blueprint.id === 'blueprint:roman-empire').features, ['settlement:rome']);
assert.ok(['blueprint:housesteads', 'blueprint:house-of-menander', 'blueprint:temple-of-portunus'].every(id => evidence.untouched.some(b => b.id === id)));
assert.deepEqual(evidence.affected.find(a => a.blueprint.id === 'blueprint:rome').overrides, ['override:test'], 'the override built on a changed feature is flagged');
assert.equal(invalidate(store, { kind: 'rule-changed', generator: 'rome-fill', version: '1' }).affected.length, 0, 'the current version invalidates nothing');

const bytes = Object.fromEntries(blueprints.map(b => [b.id, JSON.stringify(b).length]));
console.log(`Phase 5A golden: ${GOLDEN_FIXTURES.length} fixtures byte-identical from blueprints, 14 output digests unchanged, rome-fill v1 reproduced; ${blueprints.length} blueprints (empire to site) pass Checkpoint A; seeded faults caught; 55 landmark asset requests; immutable revisions, override layers and selective invalidation pass.`);
console.log(bytes);
