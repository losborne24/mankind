// Integration acceptance: actual player/session/streamer/cache/model, simulated map and flat DEM.
import './glb-node-images.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { HistoricalDatasetSession } = await mod('lib/history/session');
const { HistoricalJourneyScenes } = await mod('lib/scenarios/historicalScenes');
const { ScenarioPlayer } = await mod('lib/scenarios/player');
const { portunusJourney } = await mod('lib/scenarios/portunus');
const { ThreeTestLayer } = await mod('map/threeTestLayer');
const { glbCache } = await mod('lib/assets/glbCache');
const { clearSurfaceMapCache, surfaceMapCacheInfo } = await mod('map/settlements/surfaceMaterials');
const world = JSON.parse(await readFile('lib/history/fixtures/forum-boarium.json', 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const models = { '/assets/reconstructions/portunus/portunus-v1.glb': await readFile('public/assets/reconstructions/portunus/portunus-v1.glb'), '/assets/reconstructions/hercules-victor/hercules-victor-v1.glb': await readFile('public/assets/reconstructions/hercules-victor/hercules-victor-v1.glb') };
const model = models['/assets/reconstructions/portunus/portunus-v1.glb'];
const at = year => ({ start: { year } });
let time = at(2025), listener, selection, pendingLoad, delayedAsset, rejectModel = false;
let frames = new Map(), frameId = 0, clock = 0, pose = { center: [12.48082325, 41.889033274], zoom: 18.3, pitch: 58, bearing: 165 };
const requests = [], statuses = [], rows = [];
const original = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function(url) {
  requests.push(url);
  if (delayedAsset) await delayedAsset;
  if (rejectModel) throw Error('acceptance: missing model');
  const bytes = models[url];
  assert.ok(bytes, 'No substitute/other asset request');
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
const layer = new ThreeTestLayer({ lngLat: [0, 0], onSettlementStatus: status => statuses.push(status) });
layer.map = {
  _camera: { transform: { getCameraLngLat: () => ({ lng: pose.center[0], lat: pose.center[1] }), getCameraAltitude: () => 120 } },
  getCameraTargetElevation: () => 0, project: () => ({ x: 500, y: 500 }), getCanvas: () => ({ clientWidth: 1000, clientHeight: 1000 }),
  getLayer: () => undefined, getSource: () => undefined, addSource() {}, addLayer() {}, off() {},
  isMoving: () => false, triggerRepaint() {}, getTerrain: () => ({ exaggeration: 1 }),
  terrain: { getDrawnElevationForLngLat: () => 0 }, queryTerrainElevation: () => 0,
};
const session = new HistoricalDatasetSession({
  time: () => time, subscribeTime: fn => { listener = fn; return () => {}; },
  apply: value => { selection = value; layer.setHistoricalSettlements(value?.descriptors ?? []); },
  release: () => { selection = null; layer.useDevelopmentSettlements(); },
  load: async () => pendingLoad ?? world,
});
const coordinator = new HistoricalJourneyScenes(session, { 'forum-boarium': world });
const player = new ScenarioPlayer({
  camera: { read: () => structuredClone(pose), write: value => pose = value, stop() {} },
  timeline: value => { if (JSON.stringify(time) !== JSON.stringify(value)) { time = value; listener(); } },
  overlays() {}, scenes: (...args) => coordinator.resolve(...args), releaseScenes: () => coordinator.release(),
  streaming: intent => layer.setScenarioTravel(intent?.travelling ?? false),
  frame: callback => { frames.set(++frameId, callback); return frameId; }, cancelFrame: id => frames.delete(id),
});
const tick = count => { for (let i = 0; i < count; i++) { clock += 100; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(clock)); assert.ok(frames.size <= 1); } };
const flat = () => ({ displayMeters: 0, readiness: 'confirmed' });
const settle = async () => {
  layer.updateStreaming(); await new Promise(resolve => setTimeout(resolve, 230)); layer.updateStreaming();
  if (layer.settlement) { await layer.settlement.load(); layer.settlement.updateTerrain(flat); layer.updateStreaming(); }
};
try {
  player.load(portunusJourney); player.play(); await settle();
  assert.equal(requests.length, 0, 'Overview never loads the model');
  assert.equal(selection.descriptors.length, 0);
  for (let cycle = 0; cycle < 10; cycle++) {
    if (cycle < 5) { glbCache.clearIdle(); clearSurfaceMapCache(); }
    const before = requests.length, started = performance.now();
    player.jump(3); player.pause('Acceptance detail visit'); await settle();
    const scene = layer.settlement;
    assert.ok(scene?.scene.getObjectByName('building:portunus')?.visible);
    assert.ok(scene.scene.getObjectByName('building:hercules-victor')?.visible, 'Both temples are in the one detailed scene');
    assert.equal(scene.definition.ambientLife, false);
    assert.equal(glbCache.snapshot().users, 2); assert.equal(layer.getStreamingStatus().detailedScenes, 1);
    assert.equal(statuses.at(-1).state, 'ready');
    rows.push({ cycle, cache: cycle < 5 ? 'cold' : 'warm', settleWallMs: performance.now() - started, scene: scene.timing.snapshot(), sourceRequests: requests.length - before, sourceCache: glbCache.snapshot(), surfaceCache: surfaceMapCacheInfo() });
    player.exploreFreely(); time = at(101); listener();
    assert.equal(layer.settlement, null); assert.equal(glbCache.snapshot().users, 0);
    player.resume(); assert.equal(time.start.year, 100); tick(20); player.pause(); await settle();
    assert.equal(glbCache.snapshot().users, 2); assert.equal(statuses.at(-1).state, 'ready');
    const restored = layer.settlement;
    player.jump(4); player.pause(); layer.updateStreaming();
    assert.equal(layer.settlement, restored, 'Same date/model across beats does not churn the scene');
    player.stop(); layer.updateStreaming();
    assert.equal(glbCache.snapshot().users, 0); assert.equal(layer.settlement, null); assert.equal(frames.size, 0);
    assert.ok(glbCache.snapshot().idle <= 12); assert.ok(surfaceMapCacheInfo().bytes <= 9 * 1024 * 1024);
  }
  assert.ok(rows.slice(5).every(row => row.sourceRequests === 0), 'Warm reuse needs no further parse/source load');
  // Full sequencing, including entry from near/far views, must end on the two temples.
  for (const entry of [
    { center: [30, 25], zoom: 2.1, pitch: 0, bearing: 0 },
    { center: [...world.places[0].position.coordinate], zoom: 19.1, pitch: 55, bearing: 230 },
    { center: [-0.1, 51.5], zoom: 14, pitch: 48, bearing: -25 },
  ]) {
    pose = entry; player.play(); tick(1100);
    assert.equal(player.snapshot.state, 'completed');
    assert.deepEqual(pose.center, world.places.find(p => p.id === 'place:forum-boarium-temples').position.coordinate);
    assert.equal(pose.zoom, 18.3); assert.equal(pose.pitch, 55);
    await settle(); assert.equal(statuses.at(-1).state, 'ready');
    assert.ok(layer.settlement.scene.getObjectByName('building:portunus').visible && layer.settlement.scene.getObjectByName('building:hercules-victor').visible);
    player.stop(); assert.equal(glbCache.snapshot().users, 0);
  }
  // A late dataset request cannot overwrite a journey adopted in the meantime.
  let finishDataset; pendingLoad = new Promise(resolve => finishDataset = resolve);
  const loading = session.load('london2012'); player.play(); player.jump(3); player.pause();
  finishDataset({ ...world, id: 'world:late' }); await loading; pendingLoad = undefined;
  assert.equal(session.getSnapshot().datasetId, 'forum-boarium'); assert.equal(selection.descriptors.length, 1);
  player.stop(); glbCache.clearIdle(); clearSurfaceMapCache();
  // Delayed model completion after exit cannot resurrect a scene or retain a lease.
  let finishAsset; delayedAsset = new Promise(resolve => finishAsset = resolve);
  player.play(); player.jump(3); player.pause();
  layer.updateStreaming(); await new Promise(resolve => setTimeout(resolve, 230)); layer.updateStreaming();
  const stale = layer.settlement, staleLoading = stale.load(); player.stop(); finishAsset(); delayedAsset = undefined;
  await staleLoading; assert.equal(stale.loaded, 0); assert.equal(glbCache.snapshot().users, 0); assert.equal(layer.settlement, null);
  // Failure suppresses the coarse historical proxy; a restart retries the original file.
  glbCache.clearIdle(); rejectModel = true; player.play(); player.jump(3); player.pause(); await settle();
  assert.equal(statuses.at(-1).loaded, 0); assert.ok(statuses.at(-1).errors.length);
  assert.equal(layer.regional.scene.visible, false); assert.equal(layer.historicalDetailFailed, true);
  player.stop(); assert.equal(layer.historicalDetailFailed, false);
  rejectModel = false; player.play(); player.jump(3); player.pause(); await settle();
  assert.equal(statuses.at(-1).state, 'ready'); assert.equal(glbCache.snapshot().users, 2);
  player.dispose(); session.dispose();
  globalThis.document = new EventTarget();
  try { layer.onRemove(); layer.onRemove(); } finally { delete globalThis.document; }
  assert.equal(glbCache.snapshot().entries, 0); assert.equal(surfaceMapCacheInfo().bytes, 0); assert.equal(frames.size, 0);
} finally {
  player.dispose(); session.dispose(); layer.clearStreamingScene(); layer.regional?.dispose();
  glbCache.clearIdle(); clearSurfaceMapCache(); GLTFLoader.prototype.loadAsync = original;
}
if (process.argv[2]) {
  await mkdir(process.argv[2], { recursive: true });
  await writeFile(`${process.argv[2]}/pipeline-performance.json`, JSON.stringify({
    recordedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch },
    note: 'Node CPU, actual player/session/streamer/cache/GLB. Simulated map, confirmed flat DEM, no network/GPU. Settle wall includes 230 ms dwell; scene readyWall starts at construction. Five cold and five warm cycles; not device-wide performance guarantees.',
    model: { bytes: model.length, sha256: sha256(model) }, rows, final: { sourceCache: glbCache.snapshot(), surfaceCache: surfaceMapCacheInfo(), frames: frames.size },
  }, null, 2) + '\n');
}
console.log('Phase 4 acceptance: real pipeline, 10 repeated visits/date restores, stable cross-beat reuse, three full near/far terminal replays, bounded warm caches, stale dataset/model races, failed proxy suppression, retry and complete teardown pass.');
