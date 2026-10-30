import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTypescript } from './lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { portunusJourney: journey } = await mod('lib/scenarios/portunus');
const { ScenarioPlayer } = await mod('lib/scenarios/player');
const { validateScenario } = await mod('lib/scenarios/schema');
const { framePadding, cardLeft, cardWidth } = await mod('lib/scenarios/framing');
const { validateHistoricalWorld } = await mod('lib/history/validate');
const { assetRegistry } = await mod('lib/assets/registry');
const world = validateHistoricalWorld(JSON.parse(await readFile('lib/history/fixtures/forum-boarium.json', 'utf8')));
validateScenario(journey);

// The spec's seven beats, in order, about 90 seconds.
assert.deepEqual(journey.beats.map(b => b.id), ['rome', 'crossing', 'market', 'temples', 'structure', 'inference', 'explore']);
assert.deepEqual(journey.beats.map(b => b.title), ['Rome from above', 'The river crossing', 'The cattle market', 'Two temples', 'Read the exterior', 'Where the evidence ends', 'Inspect and explore']);
const seconds = journey.beats.flatMap(b => b.actions).reduce((total, a) => total + a.camera.duration, 0) / 1000;
assert.ok(seconds >= 80 && seconds <= 100, `journey runs about 90 s (${seconds} s)`);
assert.equal(journey.scope.time.start.year, 100);

// Narration: at most 45 words, plain text, every card sourced, every source resolvable.
const text = journey.content.overlays.filter(o => o.type === 'card' || o.type === 'caption');
assert.equal(text.length, 7, 'one narration card per beat');
for (const card of text) {
  const words = card.text.trim().split(/\s+/).length;
  assert.ok(words <= 45, `${card.id} has ${words} words`);
  assert.ok(card.sources?.length, `${card.id} cites a source`);
  for (const id of card.sources) assert.ok(journey.content.sources.some(s => s.id === id && /^https:\/\//.test(s.url)), `${card.id} source ${id}`);
  assert.doesNotMatch(card.text, /[<>]|\bTODO\b/);
}
journey.beats.forEach(beat => {
  const shown = new Set(beat.actions.flatMap(a => a.overlays));
  assert.equal(beat.actions.filter(a => text.some(t => a.overlays.includes(t.id))).length, beat.actions.length, `${beat.id}: every action shows its card`);
  assert.ok([...shown].some(id => text.some(t => t.id === id)), `${beat.id} has narration`);
  assert.ok(shown.has('layer:ground') || beat.id === 'explore' || shown.has('layer:tiber'), `${beat.id}: never a featureless plane`);
});
// The local scene (lit ground, river, the two temples) is requested from the crossing on; the opening overview stays map-only.
assert.deepEqual(journey.beats.map(b => b.sceneRequirements?.length ?? 0), [0, 1, 1, 1, 1, 1, 1]);
const scene = world.scenes.find(s => s.id === journey.content.scenes[0].historicalSceneId);
assert.equal(scene.assetIds.length, 2); assert.equal(world.layouts.find(l => l.id === scene.layoutIds[0]).buildings.length, 2);
// Evidence labels: the journey never presents date-filtered or approximate layers as unlabelled fact.
assert.ok(journey.beats[0].actions[0].overlays.includes('layer:tiber') && journey.beats[0].actions[0].overlays.includes('layer:ground'));
assert.ok(journey.beats[2].actions[0].overlays.includes('layer:arch-of-janus'), 'the market beat includes the later arch so the filter is demonstrated');

// Card never covers the subject at >= 768 px: project the subject extent onto the screen axis for each camera pose.
const mPerPx = (zoom, lat) => 78271.517 * Math.cos(lat * Math.PI / 180) / 2 ** zoom;
const east = (lon, lat0, lat) => lon, metres = (a, b) => [(a[0] - b[0]) * 111320 * Math.cos(b[1] * Math.PI / 180), (a[1] - b[1]) * 110574];
const subjects = { temples: [['place:temple-of-portunus', 11], ['place:temple-of-hercules-victor', 9]], structure: [['place:temple-of-portunus', 11]], inference: [['place:temple-of-portunus', 11], ['place:temple-of-hercules-victor', 9]] };
void east;
for (const beat of journey.beats.filter(b => subjects[b.id])) for (const action of beat.actions) {
  const c = action.camera; if (c.type === 'hold') continue;
  const bearings = c.type === 'orbit' ? [0, .25, .5, .75, 1].map(t => 165 + c.degrees * t) : [c.bearing ?? 165];
  for (const bearing of bearings) for (const width of [768, 1024, 1440, 1920]) {
    const right = [Math.cos(bearing * Math.PI / 180), -Math.sin(bearing * Math.PI / 180)], pad = framePadding(width);
    const centreX = (width - pad.right) / 2;
    for (const [id, half] of subjects[beat.id]) {
      const p = world.places.find(pl => pl.id === id).position.coordinate, m = metres(p, c.center);
      const px = (m[0] * right[0] + m[1] * right[1] + half) / mPerPx(c.zoom, c.center[1]);
      assert.ok(centreX + px < cardLeft(width) - 8, `${beat.id} @${bearing.toFixed(0)}° ${width}px: ${id} reaches x=${(centreX + px).toFixed(0)}, card starts ${cardLeft(width)}`);
    }
  }
}
assert.equal(framePadding(390).right, 0); assert.ok(cardWidth(390) <= 390 - 76, 'phone card fits with margin');
for (const width of [768, 1024]) assert.equal(framePadding(width).right, cardWidth(width) + 80, 'guided subjects are centred left of the card');
assert.ok(Object.hasOwn(assetRegistry, 'hercules-victor-exterior-v1') && Object.hasOwn(assetRegistry, 'portunus-exterior-v1'));
// Hercules position: derived from the OSM outline vector, not the rounded Wikipedia point (logged correction).
const hercules = world.places.find(p => p.id === 'place:temple-of-hercules-victor').position;
const wikipedia = [12.48083, 41.88861], off = Math.hypot(...[(hercules.coordinate[0] - wikipedia[0]) * 83000, (hercules.coordinate[1] - wikipedia[1]) * 110574]);
assert.ok(off > 10 && off < 40, `Hercules anchor differs from the rounded Wikipedia point by ${off.toFixed(1)} m`);
assert.equal(hercules.evidence.certainty, 'inferred'); assert.ok(hercules.uncertaintyMeters >= 20);

// Pause / explore / resume works on every beat, and the date and camera are restored.
let now = 0, frameId = 0, time = { start: { year: 2025 } }, pose = { center: [12.4, 41.8], zoom: 3, pitch: 0, bearing: 0 }, overlayCalls = [];
const frames = new Map();
const player = new ScenarioPlayer({ camera: { read: () => structuredClone(pose), write: p => { pose = p; }, stop() {} }, timeline: t => { time = t; }, overlays: ids => overlayCalls.push(ids), scenes: () => ({}), releaseScenes() {},
  frame: cb => { frames.set(++frameId, cb); return frameId; }, cancelFrame: id => frames.delete(id) });
const tick = n => { for (let i = 0; i < n; i++) { now += 100; const cbs = [...frames.values()]; frames.clear(); cbs.forEach(cb => cb(now)); } };
player.load(journey);
for (let beat = 0; beat < journey.beats.length; beat++) {
  player.jump(beat); tick(12); assert.equal(player.snapshot.beat, beat); assert.equal(time.start.year, 100);
  const elapsed = player.snapshot.elapsed;
  player.pause('check'); assert.equal(player.snapshot.state, 'paused'); tick(10); assert.equal(player.snapshot.elapsed, elapsed, `${beat}: paused`);
  player.exploreFreely(); assert.equal(player.snapshot.suspendedForExploration, true); assert.equal(frames.size, 0);
  time = { start: { year: 400 } }; pose = { ...pose, center: [12.49, 41.89], zoom: 12 };
  player.resume(); assert.equal(player.snapshot.state, 'playing'); assert.equal(time.start.year, 100, `${beat}: AD 100 restored`);
  tick(60); assert.equal(player.snapshot.returning, false, `${beat}: returned to the journey`); assert.equal(player.snapshot.beat, beat);
}
player.restart(); tick(1100); assert.equal(player.snapshot.state, 'completed');
player.dispose();
console.log(`Portunus demo journey: seven beats in order, ${seconds} s, narration <= 45 words with sources, evidence-labelled layers, card clear of the subject from 768 px up, phone width fits, Hercules anchor provenance and pause/explore/resume on every beat pass.`);
