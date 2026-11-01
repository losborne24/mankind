import './glb-node-images.mjs';
// Phase 5A planning (lib/plan): the required scenarios A–E plus the other reuse cases, deterministic plans (a second process gives
// the same digest), Checkpoint A, journeys composed with no hand-authoring and played through the real player, historical session
// and scene resolver, the 2D review at each scale, and compact saves that reopen to the same arrangement. Writes measured sizes to
// docs/previews/phase5a/ when given that directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore } = await mod('lib/plan/store');
const { planScenario, structuredRequest } = await mod('lib/plan/planner');
const { validateScenePlan } = await mod('lib/plan/contracts');
const { digestOf } = await mod('lib/plan/digest');
const { composeScenario } = await mod('lib/plan/composer');
const { saveScenario, reopenScenario, scenarioBytes, serialiseScenario, ReopenError } = await mod('lib/plan/persistence');
const { planReviewSvg } = await mod('lib/plan/review');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const { generateRomeFill } = await mod('lib/scenarios/romeFill');
const { forumReconstruction } = await mod('lib/history/localContext');
const { offsetCoordinate } = await mod('map/settlements/romanSettlement');
const ctx = { store: new BlueprintStore(goldenBlueprints()), catalogue: readAssetCatalogue() };
const plan = request => planScenario(request, ctx);

if (process.argv[2] === '--digests') {
  console.log(JSON.stringify(['place:temple-of-portunus', 'place:rome', 'place:roman-empire'].map(id => digestOf(plan(structuredRequest(id, 100))))));
  process.exit(0);
}
const by = (p, state) => p.components.filter(c => c.state === state);
const refsOf = (p, blueprint) => p.components.filter(c => c.ref.blueprint === blueprint);
const sizes = {};

// Test A: Temple of Portunus, AD 100.
const a = plan(structuredRequest('place:temple-of-portunus', 100));
validateScenePlan(a); assert.ok(a.validation.ok, JSON.stringify(a.validation.issues));
assert.equal(a.lod, 'site'); assert.equal(a.focus.id, 'blueprint:temple-of-portunus');
assert.ok(a.context.some(c => c.id === 'blueprint:rome'), 'Rome city context is identified');
assert.equal(a.context[0].id, 'blueprint:forum-boarium'); assert.ok(refsOf(a, 'blueprint:forum-boarium').length > 50, 'Forum Boarium local detail is selected');
const temple = a.components.find(c => c.ref.blueprint === 'blueprint:temple-of-portunus');
assert.equal(temple.state, 'ready'); assert.equal(temple.rung, 1); assert.match(temple.reason, /catalogue:portunus-exterior@1 is usable/, 'identity and chronology checked through the catalogue');
assert.equal(a.reuse.case, 'same-place-same-date'); assert.equal(a.reuse.revalidated, 0, 'existing spatial data is reused as stored');
assert.deepEqual(a.assetRequests.map(r => r.assetType), ['interior'], 'the missing architectural assets are reported');
assert.ok(a.assetRequests[0].missing.some(m => /Interior/.test(m)));
assert.ok(a.deferred.some(d => d.blueprint?.id === 'blueprint:rome') && refsOf(a, 'blueprint:rome').length === 0, 'city detail stays deferred');
assert.deepEqual(a.scenes.map(s => s.sceneId), ['scene:forum-boarium-temples']);
assert.ok(a.absent.some(x => /Arch of Janus/.test(x.title)), 'later structures are reported absent, not shown');

// Test B: Rome, AD 100.
const b = plan(structuredRequest('place:rome', 100));
assert.ok(b.validation.ok); assert.equal(b.lod, 'city'); assert.equal(b.focus.id, 'blueprint:rome'); assert.equal(b.status, 'ready');
for (const kind of ['zone', 'water', 'route', 'marker', 'extent', 'landmark', 'fill']) assert.ok(by(b, 'ready').some(c => c.kind === kind), `zoning, fill and landmarks preserved (${kind})`);
assert.equal(b.assetRequests.length, 55, 'every landmark placeholder becomes an asset request');
assert.ok(b.components.filter(c => c.kind === 'landmark').every(c => c.state === 'ready' && c.rung === 3 && c.assetRequestId), 'available landmark content is identified at its rung');
assert.equal(refsOf(b, 'blueprint:forum-boarium').length, 0, 'the neighbourhood is not generated at full detail');
assert.ok(b.deferred.some(d => d.blueprint?.id === 'blueprint:forum-boarium') && b.deferred.filter(d => d.lod === 'neighbourhood').length >= 14, 'neighbourhoods are deferred, including the regiones');
assert.match(b.components.find(c => c.ref.feature === 'fill:rome-ad100').reason, /rome-fill v1/);
assert.equal(b.initial.title, 'Continuous city c. AD 100 · approximate extent', 'the initial area is the continuous city, not the 14 km frame');

// Test C: Roman Empire, AD 100.
const c = plan(structuredRequest('place:roman-empire', 100));
assert.ok(c.validation.ok); assert.equal(c.lod, 'empire');
assert.ok(by(c, 'ready').some(x => x.ref.feature === 'settlement:rome' && x.rung === 5), 'Rome stays a coarse settlement marker');
assert.equal(c.components.length, 2); assert.equal(c.assetRequests.length, 0, 'no requests for every building of the empire');
assert.deepEqual(c.gaps.map(g => g.kind).sort(), ['coverage', 'coverage', 'coverage', 'spatial'], 'empire-scale evidence gaps only');
assert.ok(c.gaps.every(g => g.lod === 'empire'));
assert.ok(c.deferred.some(d => d.blueprint?.id === 'blueprint:central-italy'), 'cities stay coarse until refinement');
assert.ok(c.absent.some(x => /Housesteads/.test(x.title)), 'Housesteads (from c. AD 122) is not shown at AD 100');
assert.ok(JSON.stringify(c).length < 30000, 'an empire plan stays small');

// Test D: Rome, AD 150.
const d = plan(structuredRequest('place:rome', 150));
assert.ok(d.validation.ok); assert.equal(d.reuse.case, 'same-place-other-date'); assert.equal(d.focus.id, 'blueprint:rome');
assert.equal(d.versions.blueprints.find(x => x.id === 'blueprint:rome').digest, b.versions.blueprints.find(x => x.id === 'blueprint:rome').digest, 'the same blueprint is reused, not rebuilt');
assert.ok(by(d, 'ready').some(x => x.ref.feature === 'zone:tiber') && by(d, 'ready').some(x => x.kind === 'route'), 'stable geography reused');
assert.ok(d.components.filter(x => x.kind === 'landmark').every(x => x.state === 'missing' && x.gapIds.length), 'construction-only dates are not assumed to persist');
assert.deepEqual(d.revisions.added.map(r => r.feature).sort(), ['zone:baths-of-trajan', 'zone:forum-of-trajan', 'zone:mausoleum-hadriani'], 'features started by AD 150 identified');
assert.ok(d.revisions.removed.some(r => r.feature === 'zone:horti-domitiae'), 'features ended by AD 150 identified');
assert.equal(d.components.find(x => x.ref.feature === 'fill:rome-ad100').state, 'missing', 'the AD 100 fill is not reused at AD 150');
assert.equal(d.assetRequests.length, 0, 'no models requested for features not confirmed at the date');
assert.ok(d.gaps.some(g => g.kind === 'chronology' && g.subject.blueprint === 'blueprint:rome' && !g.subject.feature), 'a dated revision of the blueprint is asked for');
const portunus150 = plan(structuredRequest('place:temple-of-portunus', 150));
assert.equal(portunus150.components.find(x => x.ref.blueprint === 'blueprint:temple-of-portunus').state, 'missing', 'the AD 100 catalogue phase is not reused at AD 150');
assert.deepEqual(portunus150.scenes, [], 'no AD 100 scene is requested for AD 150');

// The other reuse cases and refusals.
const colosseum = plan(structuredRequest('landmark:colosseum', 100));
assert.equal(colosseum.reuse.case, 'within-existing'); assert.equal(colosseum.lod, 'site'); assert.ok(colosseum.validation.ok);
assert.ok(colosseum.gaps.some(g => /No site blueprint for Flavian Amphitheatre/.test(g.title)) && colosseum.assetRequests.some(r => r.id === 'asset-request:rome/colosseum'));
assert.ok(colosseum.components.length < 20 && colosseum.deferred.some(x => x.title === 'Rest of Rome c. AD 100'), 'the larger context is reused, not re-planned');
const ostia = plan({ schema: 1, place: { title: 'Ostia', coordinate: [12.2923, 41.7556], tradition: 'roman' }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour' });
assert.equal(ostia.reuse.case, 'typology-elsewhere'); assert.ok(ostia.validation.ok); assert.equal(ostia.status, 'partial');
assert.equal(ostia.typology.tradition, 'roman'); assert.equal(ostia.components.length, 0, 'no Rome street, lot or landmark is copied to Ostia');
assert.ok(ostia.gaps.some(g => g.blocking && /No blueprint for Ostia/.test(g.title)));
const notRoman = plan({ schema: 1, place: { title: 'Ostia', coordinate: [12.2923, 41.7556], tradition: 'roman' }, time: { start: { year: 1500 } }, scope: 'auto', intent: 'tour' });
assert.equal(notRoman.typology, null, 'a Roman typology is not offered for AD 1500');
const unknown = plan(structuredRequest('place:atlantis', 100));
assert.equal(unknown.status, 'unresolved'); assert.ok(unknown.gaps.every(g => g.kind === 'place' && g.blocking)); assert.equal(unknown.components.length, 0, 'no nearby place is substituted');
assert.throws(() => composeScenario(unknown, ctx), /resolved no place/);
const forumAsCity = plan(structuredRequest('place:forum-boarium', 100, 'city'));
assert.equal(forumAsCity.focus.id, 'blueprint:rome', 'a coarser scope walks up to the containing blueprint');
const romeNeighbourhood = plan(structuredRequest('place:rome', 100, 'neighbourhood'));
assert.equal(romeNeighbourhood.focus.id, 'blueprint:forum-boarium', 'a finer scope retrieves the child blueprint');
const architectural = plan(structuredRequest('place:temple-of-portunus', 100, 'architectural'));
assert.ok(architectural.gaps.some(g => /No architectural blueprint/.test(g.title) && !g.blocking));
// Plan-level faults are refused by the contract.
const deferredWithGap = structuredClone(b); deferredWithGap.components.find(x => x.kind === 'landmark').state = 'deferred';
assert.throws(() => validateScenePlan(deferredWithGap), /deferred .* must not raise gaps/, 'deferred content never raises gaps');
const missingWithoutGap = structuredClone(b); missingWithoutGap.components.find(x => x.kind === 'zone').state = 'missing';
assert.throws(() => validateScenePlan(missingWithoutGap), /missing .* has no gap/, 'missing content always names its gap');
const misnamed = structuredClone(a); misnamed.components[0].ref.feature = 'recon:nowhere';
assert.ok(!(await mod('lib/plan/checkpointA')).checkpointA(misnamed, ctx).ok, 'a component that does not resolve fails Checkpoint A');

// Determinism, also across processes.
assert.equal(digestOf(plan(structuredRequest('place:rome', 100))), digestOf(b));
const other = spawnSync(process.execPath, ['scripts/check-phase5a-planning.mjs', '--digests'], { encoding: 'utf8' });
assert.equal(other.status, 0, other.stderr);
assert.deepEqual(JSON.parse(other.stdout.trim().split('\n').at(-1)), [a, b, c].map(digestOf), 'the same plans in a second process');

// Journeys composed with no hand-authoring.
const journeys = Object.fromEntries([['A', a], ['B', b], ['C', c], ['D', d], ['colosseum', colosseum], ['ostia', ostia]].map(([k, p]) => [k, composeScenario(p, ctx)]));
assert.ok(journeys.A.content.scenes.length === 1 && journeys.A.beats.some(x => x.sceneRequirements?.length), 'the site journey requests the existing 3D scene');
assert.equal(journeys.B.historicalDataset, 'forum-boarium', 'Rome is composed onto the dataset that hosts its zoning, plan and fill');
assert.ok(!journeys.B.content.scenes?.length, 'the city journey does not stream the neighbourhood scene');
assert.ok(journeys.C.content.locations.length === 1 && !journeys.C.historicalDataset, 'the empire journey is a coarse marker map');
for (const s of Object.values(journeys)) assert.ok(s.beats.at(-1).explorationPrompt && s.content.overlays.some(o => o.id === 'card:shown'));
// The site journey through the real player, historical session and scene resolver (as check-portunus-journey).
const { HistoricalDatasetSession } = await mod('lib/history/session');
const { ScenarioPlayer } = await mod('lib/scenarios/player');
const { HistoricalJourneyScenes } = await mod('lib/scenarios/historicalScenes');
const world = (await import('node:fs')).readFileSync('lib/history/fixtures/forum-boarium.json', 'utf8');
let time = { start: { year: 2025 } }, listener = () => {}, applied, pose = { center: [12.4808, 41.889], zoom: 19.1, pitch: 58, bearing: 0 }, frames = new Map(), id = 0, now = 0;
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: fn => { listener = fn; return () => {}; }, apply: s => applied = s, release: () => applied = null, load: async () => JSON.parse(world) });
const scenes = new HistoricalJourneyScenes(session, { 'forum-boarium': JSON.parse(world) });
const player = new ScenarioPlayer({ camera: { read: () => structuredClone(pose), write: v => pose = v, stop() {} }, timeline: v => { time = v; listener(); }, overlays() {}, scenes: (...args) => scenes.resolve(...args), releaseScenes: () => scenes.release(), frame: cb => { frames.set(++id, cb); return id; }, cancelFrame: k => frames.delete(k) });
player.load(journeys.A); player.play(); assert.equal(time.start.year, 100);
player.jump(journeys.A.beats.findIndex(x => x.id === 'arrive'));
assert.equal(applied.descriptors.length, 1, 'the composed journey selects the scene');
assert.deepEqual(applied.scenes[0].assets.map(x => x.catalogue.entry.id).sort(), ['catalogue:hercules-victor-exterior', 'catalogue:portunus-exterior'], 'through the pinned catalogue versions');
for (let i = 0; i < 400 && player.snapshot.state !== 'completed'; i++) { now += 100; const cbs = [...frames.values()]; frames.clear(); cbs.forEach(cb => cb(now)); }
assert.equal(player.snapshot.state, 'completed'); player.dispose(); assert.equal(frames.size, 0);
// Arriving by a lead-in flight, the player holds for the scene with the camera parked, so its detail can stream (a re-sent
// flight intent used to mark it travelling again and stall the wait).
let ready = false, intents = [];
pose = { center: [0, 20], zoom: 2, pitch: 0, bearing: 0 }; frames = new Map();
const parked = new ScenarioPlayer({ camera: { read: () => structuredClone(pose), write: v => pose = v, stop() {} }, timeline: v => { time = v; listener(); }, overlays() {}, scenes: (...args) => scenes.resolve(...args), releaseScenes: () => scenes.release(), ready: () => ready, streaming: v => intents.push(v), frame: cb => { frames.set(++id, cb); return id; }, cancelFrame: k => frames.delete(k) });
parked.load(journeys.A); parked.play(); parked.jump(journeys.A.beats.findIndex(x => x.id === 'arrive'));
for (let i = 0; i < 80 && (parked.snapshot.returning || parked.snapshot.state !== 'preparing'); i++) { now += 100; const cbs = [...frames.values()]; frames.clear(); cbs.forEach(cb => cb(now)); }
assert.equal(parked.snapshot.state, 'preparing'); assert.equal(parked.snapshot.returning, false);
assert.equal(intents.at(-1)?.travelling, false, 'the camera stays parked while the scene loads');
ready = true; for (let i = 0; i < 400 && parked.snapshot.state !== 'completed'; i++) { now += 100; const cbs = [...frames.values()]; frames.clear(); cbs.forEach(cb => cb(now)); }
assert.equal(parked.snapshot.state, 'completed'); parked.dispose();

// The 2D review at every scale.
for (const [k, p] of Object.entries({ a, b, c, d, ostia })) { const svg = planReviewSvg(p, ctx); assert.ok(svg.startsWith('<svg') && svg.length > 2000 && (k === 'ostia' || svg.includes('data-id=')), `review of ${k}`); sizes[`review svg ${k}`] = svg.length; }

// Test E: save and reopen a Rome scenario.
const saved = saveScenario(b, journeys.B, ctx), text = serialiseScenario(saved);
assert.ok(!text.includes('"multipolygon"') && !text.includes('"lots"') && !text.includes('.glb'), 'no shared geometry, layout or mesh is copied into the save');
const reopened = reopenScenario(JSON.parse(text), ctx);
const anchors = p => p.components.filter(x => x.kind === 'landmark').map(x => [x.ref.feature, ctx.store.require(p.versions.blueprints.find(v => v.id === x.ref.blueprint)).features.find(f => f.id === x.ref.feature).geometry.anchor]);
assert.deepEqual(anchors(reopened.plan), anchors(b), 'same landmark placements');
assert.deepEqual(reopened.plan.versions.blueprints, b.versions.blueprints, 'same blueprint references');
assert.deepEqual(reopened.saved.evidence, saved.evidence, 'same evidence references');
assert.deepEqual(reopened.plan.initial.viewpoint, b.initial.viewpoint, 'same initial viewpoint');
assert.equal(digestOf(reopened.scenario), digestOf(journeys.B), 'same journey');
const keepOut = forumReconstruction.objects.map(o => o.footprint.map(p => offsetCoordinate(forumReconstruction.origin, p)));
const fill = generateRomeFill(keepOut), fillJson = JSON.stringify(fill.items);
assert.equal(createHash('sha256').update(fillJson).digest('hex'), saved.generated[0].outputDigest, 'same generated layout, verified by digest, not trusted to a seed');
sizes['rome save bytes'] = scenarioBytes(saved); sizes['rome fill if stored instead of referenced'] = fillJson.length;
assert.ok(sizes['rome save bytes'] < 5 * 1024 * 1024 && sizes['rome save bytes'] < 100000, `the city save is compact (${sizes['rome save bytes']} bytes)`);
for (const [k, p] of Object.entries({ portunus: a, empire: c, rome150: d })) sizes[`${k} save bytes`] = scenarioBytes(saveScenario(p, journeys[{ portunus: 'A', empire: 'C', rome150: 'D' }[k]], ctx));
// A scenario override with its own generated feature is stored in the save, and reopens to the same arrangement.
const romeRef = b.versions.blueprints.find(x => x.id === 'blueprint:rome');
const override = { id: 'override:viewpoint', base: romeRef, ops: [{ op: 'hide', feature: 'landmark:ludus-magnus', reason: 'not in this scenario' }, { op: 'add', reason: 'scenario marker', feature: { id: 'scenario:gathering', kind: 'marker', title: 'Gathering point', chronology: 'timeless', evidence: { certainty: 'illustrative', sources: [], note: 'Placed by this scenario only.' }, refs: [], geometry: { type: 'point', anchor: [12.4905, 41.8902] }, rung: 5 } }] };
const octx = { ...ctx, overrides: [override] }, op = planScenario(structuredRequest('place:rome', 100), octx);
assert.ok(op.validation.ok && !op.components.some(x => x.ref.feature === 'landmark:ludus-magnus') && op.components.some(x => x.ref.feature === 'scenario:gathering'));
const osaved = saveScenario(op, composeScenario(op, octx), octx);
assert.equal(osaved.overrides.length, 1); assert.ok(serialiseScenario(osaved).includes('"scenario:gathering"'), 'the generated feature is stored');
assert.equal(reopenScenario(JSON.parse(serialiseScenario(osaved)), ctx).plan.id, op.id, 'and reopens without the caller supplying it');
sizes['rome save with override bytes'] = scenarioBytes(osaved);
// Changed references are refused, never silently replaced.
const tampered = JSON.parse(text); tampered.blueprints[0].digest = '0'.repeat(64);
assert.throws(() => reopenScenario(tampered, ctx), e => e instanceof ReopenError && e.reason === 'blueprint-changed');
const otherVersion = JSON.parse(text); otherVersion.versions.planner = '0.0';
assert.throws(() => reopenScenario(otherVersion, ctx), e => e instanceof ReopenError && e.reason === 'versions');
const revised = new BlueprintStore(goldenBlueprints()), forum = revised.latest('blueprint:forum-boarium');
revised.revise(forum, [{ feature: { ...forum.features[0], title: 'Corrected ground' } }], 'test');
assert.equal(reopenScenario(JSON.parse(text), { ...ctx, store: revised }).plan.id, b.id, 'a save pinned to version 1 reopens after a correction creates version 2');

const report = { plans: Object.fromEntries(Object.entries({ A: a, B: b, C: c, D: d, colosseum, ostia, unknown }).map(([k, p]) => [k, { id: p.id, status: p.status, lod: p.lod, focus: p.focus?.id, reuse: p.reuse.case, ready: by(p, 'ready').length, missing: by(p, 'missing').length, deferred: p.deferred.length, absent: p.absent.length, gaps: p.gaps.length, assetRequests: p.assetRequests.length, checkpointA: p.validation.ok, warnings: p.validation.issues.filter(i => i.severity === 'warning').length }])), sizes };
if (process.argv[2]) { mkdirSync(process.argv[2], { recursive: true }); writeFileSync(`${process.argv[2]}/planning-report.json`, JSON.stringify(report, null, 2) + '\n'); }
console.log('Phase 5A planning: Temple of Portunus, Rome, the Roman Empire and Rome AD 150 planned (ready, missing and deferred kept apart); within-existing, typology-elsewhere and unknown places; deterministic across processes; Checkpoint A; journeys composed and played through the real player and scene resolver; 2D review at every scale; saves reopen to the same arrangement.');
console.log(report.plans, sizes);
