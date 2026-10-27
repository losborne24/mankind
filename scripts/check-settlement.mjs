import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadModule } from "./check-roman-assets.mjs";

const { ROMAN_SETTLEMENT, ROMAN_SETTLEMENT_ALTERNATE, offsetCoordinate } = await import(await loadModule("map/settlements/romanSettlement"));
const { SettlementScene } = await import(await loadModule("map/settlements/SettlementScene"));
const { GlbCache } = await import(await loadModule("lib/assets/glbCache"));
assert.equal(ROMAN_SETTLEMENT.buildings.length, 7);
assert.ok(offsetCoordinate([12, 42], [10, 0])[0] > 12);
assert.ok(offsetCoordinate([12, 42], [0, 10])[1] < 42);
assert.ok(offsetCoordinate([179.99999, 0], [10, 0])[0] < -179);
assert.throws(() => offsetCoordinate([0, 90], [0, 0]), /poles/);

const original = GLTFLoader.prototype.loadAsync;
const requests = [];
const waiting = [];
let pause = false, failTemple = false;
GLTFLoader.prototype.loadAsync = async function (url) {
  requests.push(url);
  if (pause) await new Promise((resolve) => waiting.push(resolve));
  if (failTemple && url.includes("temple")) throw new Error("simulated missing temple");
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
};
let status;
const assembler = new SettlementScene(ROMAN_SETTLEMENT, (next) => { status = next; }, () => {}, new GlbCache());
const meshes = () => {
  const list = [];
  assembler.scene.traverse((o) => { if (o instanceof THREE.Mesh) list.push(o); });
  return list;
};
const foundations = () => meshes().filter((o) => o.name.endsWith("-foundation"));
const plane = ([lng, lat]) => 100 + (lng - assembler.origin[0]) * 4000 + (lat - assembler.origin[1]) * 2000;
try {
  await assembler.load();
  assert.equal(status.loaded, 7);
  assert.equal(requests.length, 3, "Seven buildings must share the three asset requests");
  assembler.updateTerrain(() => null);
  assert.equal(status.state, "waiting-terrain");
  assert.ok(meshes().every((o) => { let visible = o.visible; o.traverseAncestors((parent) => { visible &&= parent.visible; }); return !visible; }), "Unknown DEM must not create sea-level geometry");
  assembler.invalidateTerrain(); assembler.updateTerrain(() => 0);
  assert.equal(status.state, "waiting-terrain", "Ambiguous zero is not a confirmed sea-level sample");
  assembler.invalidateTerrain(); assembler.updateTerrain(plane);
  assert.equal(status.state, "ready");
  assert.equal(foundations().length, 7);
  for (const foundation of foundations()) {
    assert.ok(foundation.visible);
    const positions = foundation.geometry.getAttribute("position");
    const count = positions.count / 2;
    let highest = -Infinity;
    for (let i = 0; i < count; i++) {
      const h = plane(offsetCoordinate(assembler.origin, [positions.getX(i), positions.getZ(i)]));
      assert.ok(Math.abs(positions.getY(i) - (h - 0.15)) < 0.0001);
      highest = Math.max(highest, h);
    }
    for (let i = count; i < positions.count; i++) assert.ok(Math.abs(positions.getY(i) - (highest + 0.1)) < 0.0001, "Foundation top stays level and above the sampled footprint");
    const building = assembler.scene.getObjectByName(foundation.name.replace(/-foundation$/, ""));
    assert.equal(building.visible, true);
    assert.ok(Math.abs(building.position.y - highest - 0.1) < 0.0001);
  }
  for (const road of ROMAN_SETTLEMENT.roads) {
    const mesh = assembler.scene.getObjectByName(road.id);
    assert.ok(mesh.visible);
    const p = mesh.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(p.getY(i) - plane(offsetCoordinate(assembler.origin, [p.getX(i), p.getZ(i)])) - 0.08) < 0.0001);
    }
  }
  const foundation = foundations()[0];
  const heightsBefore = foundation.geometry.getAttribute("position").array.slice();
  assembler.invalidateTerrain(); assembler.updateTerrain(() => null);
  assert.equal(status.state, "partial");
  assert.equal(status.terrainPending, 0);
  assert.ok(status.terrainRetained > 0);
  assert.deepEqual(foundation.geometry.getAttribute("position").array, heightsBefore);
  assembler.relocate(ROMAN_SETTLEMENT_ALTERNATE);
  assert.equal(foundation.visible, false, "Old-location heights must never follow a relocation");
  assembler.updateTerrain(() => null);
  assert.equal(status.state, "waiting-terrain");
  assembler.invalidateTerrain(); assembler.updateTerrain(() => 200);
  assert.equal(status.state, "ready");
  assert.equal(requests.length, 3, "Relocation reuses all models");
  assert.equal(foundations()[0], foundation, "Relocation reuses procedural geometry");
  assembler.invalidateTerrain(true); assembler.updateTerrain(([lng]) => 200 + (lng - assembler.origin[0]) * 200000);
  assert.equal(status.steepSites, 7);
  assert.ok(foundations().every((o) => !o.visible), "Unsuitable slopes must not create towering foundations");
  let disposed = 0;
  foundation.geometry.addEventListener("dispose", () => disposed++);
  assembler.unload(); assembler.unload();
  assert.equal(status.state, "unloaded");
  assert.equal(meshes().length, 0);
  assert.equal(disposed, 1, "Procedural resources are disposed once");
  pause = true;
  const pending = assembler.load();
  assembler.unload();
  pause = false;
  waiting.splice(0).forEach((resume) => resume());
  await pending;
  assert.equal(status.state, "unloaded");
  assert.equal(meshes().length, 0, "Stale load results cannot resurrect an unloaded scene");
  failTemple = true;
  await assembler.load(); assembler.updateTerrain(() => 100);
  assert.equal(status.loaded, 6);
  assert.equal(status.errors.length, 1);
  assert.equal(status.state, "partial");
  assembler.unload(); failTemple = false;
  await assembler.load(); assembler.updateTerrain(() => 100);
  assert.equal(status.state, "ready", "Unloading and loading retries failed assets");
  assembler.invalidateTerrain(true); assembler.updateTerrain(() => -20);
  assert.equal(status.state, "ready", "Valid negative elevations are supported");
} finally {
  assembler.unload();
  GLTFLoader.prototype.loadAsync = original;
}
console.log("Settlement: seven buildings, sampled roads/foundations, missing DEM, retained heights, relocation, slope limits, cleanup, pending cancellation and retry pass.");
