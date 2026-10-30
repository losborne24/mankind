import './glb-node-images.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { validateHistoricalWorld } = await mod('lib/history/validate');
const { selectHistoricalWorld } = await mod('lib/history/selection');
const { inspectHistoricalRecord } = await mod('lib/history/inspection');
const { HistoricalDatasetSession } = await mod('lib/history/session');
const { resolveHistoricalAsset } = await mod('lib/history/assetResolution');
const { validateAssetCatalogue } = await mod('lib/assets/catalogueValidation');
const { SettlementScene } = await mod('map/settlements/SettlementScene');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const world = validateHistoricalWorld(await read('lib/history/fixtures/portunus.json'));
const catalogue = validateAssetCatalogue(await read('lib/assets/catalogue.json'));
const entry = catalogue.entries.find(e => e.id === 'catalogue:portunus-exterior');
const manifest = await read('data/history/portunus/source/manifest.json');
const at = year => ({ start: { year } });
const id = world.layouts[0].id, placeId = world.places[0].id, key = { kind: 'place', id: placeId };
const select = (w = world, year = 100, explicitLayoutId = id) => selectHistoricalWorld(w, at(year), { explicitLayoutId });
const strict = selectHistoricalWorld(world, at(100));
assert.equal(strict.descriptors.length, 0);
assert.equal(strict.scenes[0].status, 'map-only');
assert.equal(strict.places[0].presence, 'possible');
const inspection = inspectHistoricalRecord(world, strict, key);
assert.deepEqual(inspection.locations[0].reconstructionPreviews.map(p => p.id), [id]);
const preview = select();
assert.equal(preview.descriptors.length, 1);
assert.equal(preview.scenes[0].status, 'ready');
assert.equal(preview.interpretationLayoutId, id);
assert.equal(preview.places[0].presence, 'possible', 'Explicit viewing cannot make uncertain evidence exact');
assert.equal(preview.descriptors[0].definition.ambientLife, false);
for (const year of [99, 101]) assert.equal(select(world, year).descriptors.length, 0);
assert.equal(select(world, 100, 'missing').descriptors.length, 0);
for (const change of [
  w => w.layouts[0].buildings[0].evidence.certainty = 'unknown',
  w => w.places[0].position.evidence.certainty = 'unknown',
  w => w.layouts[0].buildings = [],
  w => w.scenes.push({ ...structuredClone(w.scenes[0]), id: 'scene:required-missing', layoutIds: [], assetIds: [], required: true }),
]) {
  const modified = structuredClone(world); change(modified);
  assert.equal(select(validateHistoricalWorld(modified)).descriptors.length, 0, 'Explicit selection retains content and evidence guards');
}
const asset = world.assets[0];
assert.equal(resolveHistoricalAsset(asset, placeId, at(100), catalogue).status, 'catalogue-blocked');
assert.equal(resolveHistoricalAsset(asset, placeId, at(100), catalogue, true).status, 'registered');
assert.equal(resolveHistoricalAsset(asset, 'place:wrong', at(100), catalogue, true).status, 'catalogue-blocked');
for (const status of ['draft', 'retired']) {
  const copy = structuredClone(catalogue);
  copy.reviews = copy.reviews.filter(r => r.id !== entry.id);
  if (status === 'retired') copy.reviews.push({ ...catalogue.reviews.find(r => r.id === entry.id), status });
  assert.equal(resolveHistoricalAsset(asset, placeId, at(100), copy, true).status, 'catalogue-blocked');
}
for (const path of ['../secret.md', '/absolute.md', 'x/./a.md', 'x/../../a.md', 'x/a.html']) {
  const copy = structuredClone(catalogue); copy.entries.find(e => e.id === entry.id).rights.provenancePath = path;
  assert.throws(() => validateAssetCatalogue(copy));
}
await readFile(`public/assets/${entry.rights.provenancePath}`);
let time = at(100), listener, applied;
const session = new HistoricalDatasetSession({ time: () => time, subscribeTime: fn => { listener = fn; return () => {}; }, apply: s => applied = s, release: () => applied = null, load: async () => world });
await session.load('portunus');
assert.equal(session.previewReconstruction(id), false, 'Inspect offered reconstruction before activating');
session.inspect(key);
assert.equal(session.previewReconstruction('missing'), false);
assert.equal(session.previewReconstruction(id), true); assert.equal(applied.descriptors.length, 1);
assert.equal(session.previewReconstruction(null), true); assert.equal(applied.descriptors.length, 0);
assert.equal(session.previewReconstruction(id), true);
time = at(101); listener(); assert.equal(applied.descriptors.length, 0); assert.equal(session.getVisitTarget(placeId), undefined);
time = at(100); listener(); assert.equal(applied.descriptors.length, 0, 'Date change revokes preview rather than silently restoring it');
session.inspect(key); session.previewReconstruction(id); await session.load('portunus');
assert.equal(applied.descriptors.length, 0, 'Dataset reload clears explicit choice');
session.clear(); assert.equal(applied, null); session.dispose();
const bytes = await readFile('public/assets/reconstructions/portunus/portunus-v1.glb');
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(bytes), entry.rendering.sha256); assert.equal(hash(bytes), manifest.modelSHA256);
assert.equal(hash(await readFile('data/history/portunus/source/fletcher-1921-portunus.jpg')), manifest.drawingSHA256);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
let meshes = 0, triangles = 0;
const materials = new Map();
gltf.scene.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; materials.set(o.material.name, o.material.color.getHex()); assert.equal(o.material.map, null); } });
assert.equal(meshes, manifest.meshes); assert.equal(triangles, manifest.triangles);
assert.equal(gltf.animations.length, 0);
let leases = 0, releases = 0, status;
const scene = new SettlementScene(preview.descriptors[0].definition, s => status = s, () => {}, { acquire: async () => { leases++; let active = true; return { scene: gltf.scene.clone(true), release: () => { if (active) { releases++; active = false; } } }; } });
await scene.load(); scene.updateTerrain(() => ({ displayMeters: 0, readiness: 'confirmed' }));
assert.equal(status.loaded, 1); assert.equal(status.state, 'ready'); assert.deepEqual(status.errors, []);
const building = scene.scene.getObjectByName('building:portunus');
assert.ok(building?.visible); assert.equal(status.ambientLife.active, 0);
building.traverse(o => { if (o.isMesh) assert.equal(o.material.color.getHex(), materials.get(o.material.name), 'Historical assets preserve authored finishes'); });
scene.dispose(); scene.dispose(); assert.equal(leases, 1); assert.equal(releases, 1);
console.log(`Portunus reconstruction: ${meshes} meshes, ${triangles} triangles, pinned bytes and drawing; strict default/explicit preview, evidence/status/date guards, session revocation, authored materials, real scene terrain placement and lease cleanup pass.`);
