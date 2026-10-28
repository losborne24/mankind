import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadModule } from "./check-roman-assets.mjs";

const { ROMAN_SETTLEMENT, ROMAN_SETTLEMENT_ALTERNATE, offsetCoordinate } = await import(await loadModule("map/settlements/romanSettlement"));
const { SettlementScene } = await import(await loadModule("map/settlements/SettlementScene"));
const { queryTerrainSample } = await import(await loadModule("map/terrain"));
const { GlbCache } = await import(await loadModule("lib/assets/glbCache"));
assert.equal(ROMAN_SETTLEMENT.buildings.length, 7);
assert.ok(offsetCoordinate([12, 42], [10, 0])[0] > 12);
assert.ok(offsetCoordinate([12, 42], [0, 10])[1] < 42);
assert.ok(offsetCoordinate([179.99999, 0], [10, 0])[0] < -179);
assert.throws(() => offsetCoordinate([0, 90], [0, 0]), /poles/);

// Exercise the installed-version adapter independently of terrain renderer internals.
const terrainMap = (drawn, fallback = 0) => ({ getTerrain: () => ({ source: "dem" }),
  terrain: drawn === "no-capability" ? {} : { getDrawnElevationForLngLat: () => drawn },
  queryTerrainElevation: () => fallback });
assert.deepEqual(queryTerrainSample(terrainMap(0), [0,0]), { displayMeters: 0, readiness: "confirmed" });
assert.deepEqual(queryTerrainSample(terrainMap(undefined), [0,0]), { displayMeters: 0, readiness: "uncertain" });
assert.deepEqual(queryTerrainSample(terrainMap("no-capability"), [0,0]), { displayMeters: 0, readiness: "uncertain" });
assert.deepEqual(queryTerrainSample(terrainMap(undefined, -12), [0,0]), { displayMeters: -12, readiness: "confirmed" });
assert.equal(queryTerrainSample({getTerrain: () => null}, [0,0]).readiness, "unavailable");

const { configureTerrainShadowCaster } = await import(await loadModule("map/settlements/terrainShadows"));
const caster = new THREE.Mesh();
configureTerrainShadowCaster(caster);
let depthRange = [0.1, 0.985];
const fakeGL = { DEPTH_RANGE: 2928, getParameter: () => new Float32Array(depthRange), depthRange: (near, far) => { depthRange = [near, far]; } };
const fakeRenderer = { getContext: () => fakeGL };
caster.onBeforeShadow(fakeRenderer);
assert.deepEqual(depthRange, [0, 1], "Shadow depth uses the full offscreen range");
caster.onAfterShadow(fakeRenderer);
assert.ok(Math.abs(depthRange[0] - 0.1) < 1e-6 && Math.abs(depthRange[1] - 0.985) < 1e-6, "MapLibre's depth range is restored");

const original = GLTFLoader.prototype.loadAsync;
const requests = [];
const waiting = [];
let pause = false, failTemple = false;
let originalVillaMaterial;
GLTFLoader.prototype.loadAsync = async function (url) {
  requests.push(url);
  if (pause) await new Promise((resolve) => waiting.push(resolve));
  if (failTemple && url.includes("temple")) throw new Error("simulated missing temple");
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  if (url.endsWith("villa.glb")) gltf.scene.traverse((object) => { if (object.isMesh && !originalVillaMaterial) originalVillaMaterial = object.material; });
  return gltf;
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
  const uniqueAssets = new Set([...ROMAN_SETTLEMENT.buildings, ...ROMAN_SETTLEMENT.scenery].map((item) => item.assetId)).size;
  assert.equal(requests.length, uniqueAssets, "Repeated buildings/scenery share one request per asset");
  assert.equal(status.sceneryLoaded, ROMAN_SETTLEMENT.scenery.length);
  assembler.updateTerrain(() => null);
  assert.equal(status.state, "waiting-terrain");
  assert.ok(meshes().every((o) => { let visible = o.visible; o.traverseAncestors((parent) => { visible &&= parent.visible; }); return !visible; }), "Unknown DEM must not create sea-level geometry");
  assembler.invalidateTerrain(); assembler.updateTerrain(() => ({ displayMeters: 0, readiness: "uncertain" }));
  assert.equal(status.state, "waiting-terrain", "Ambiguous zero is not a confirmed sea-level sample");
  assembler.invalidateTerrain(); assembler.updateTerrain(() => ({ displayMeters: 0, readiness: "confirmed" }));
  assert.equal(status.state, "ready", "Confirmed sea level must be usable");
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
  const network = assembler.scene.getObjectByName("road-network");
  assert.ok(network.visible);
  const roadPositions = network.geometry.getAttribute("position");
  const roadIndices = network.geometry.index;
  let roadArea = 0;
  for (let i = 0; i < roadIndices.count; i += 3) {
    const a = roadIndices.getX(i), b = roadIndices.getX(i + 1), c = roadIndices.getX(i + 2);
    roadArea += Math.abs((roadPositions.getX(b) - roadPositions.getX(a)) * (roadPositions.getZ(c) - roadPositions.getZ(a)) -
      (roadPositions.getZ(b) - roadPositions.getZ(a)) * (roadPositions.getX(c) - roadPositions.getX(a))) / 2;
  }
  assert.ok(Math.abs(roadArea - 263.68) < 0.001, "Road triangles cover the street union once, without overlapping junctions");
  for (const path of ROMAN_SETTLEMENT.roads.filter((road) => road.accessTo)) {
    const [x,z] = path.points.at(-1);
    const building = assembler.scene.getObjectByName(path.accessTo);
    let matched = 0;
    for (let i = 0; i < roadPositions.count; i++) {
      const distance = Math.hypot(roadPositions.getX(i) - x, roadPositions.getZ(i) - z);
      if (distance <= path.widthMeters / 2 + 0.00001) {
        assert.ok(Math.abs(roadPositions.getY(i) - building.position.y) < 0.0001, "Entrance landings meet the foundation height");
        matched++;
      }
    }
    assert.ok(matched > 0);
  }
  const instanceMeshes = meshes().filter((mesh) => mesh.isInstancedMesh);
  assert.ok(instanceMeshes.length < ROMAN_SETTLEMENT.scenery.length / 4, "Repeated scenery must be instanced");
  for (const mesh of instanceMeshes) {
    assert.ok(mesh.visible);
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
      assert.ok(matrix.elements.every(Number.isFinite));
    }
  }
  assert.ok(assembler.scene.getObjectByName("terrain-shadow-receiver").receiveShadow);
  const sun = assembler.scene.children[0].children.find((object) => object.isDirectionalLight);
  assert.ok(sun.castShadow && sun.shadow.mapSize.x === 1024);
  const floorHeights = ROMAN_SETTLEMENT.buildings.map((building) => assembler.scene.getObjectByName(building.id).position.y);
  assert.ok(Math.abs(sun.target.position.y - floorHeights.reduce((sum, height) => sum + height, 0) / floorHeights.length) < 0.001);
  console.log(`Environment: ${status.sceneryLoaded} placements in ${instanceMeshes.length} instanced component batches.`);
  let settlementVillaMaterial;
  assembler.scene.getObjectByName("villa-west-1").traverse((object) => { if (object.isMesh && !settlementVillaMaterial) settlementVillaMaterial = object.material; });
  assert.notEqual(settlementVillaMaterial, originalVillaMaterial, "Settlement shadow overrides must not mutate the cached/Giza material");
  assert.equal(settlementVillaMaterial.shadowSide, THREE.BackSide);
  assert.notEqual(originalVillaMaterial.shadowSide, THREE.BackSide);
  let overrideDisposed = 0;
  settlementVillaMaterial.addEventListener("dispose", () => overrideDisposed++);
  const foundation = foundations()[0];
  const heightsBefore = foundation.geometry.getAttribute("position").array.slice();
  const roadHeightsBefore = network.geometry.getAttribute("position").array.slice();
  let partialQueries = 0;
  assembler.invalidateTerrain(); assembler.updateTerrain(() => ++partialQueries % 2 ? 500 : null);
  assert.equal(status.state, "partial");
  assert.equal(status.terrainPending, 0);
  assert.ok(status.terrainRetained > 0);
  assert.deepEqual(foundation.geometry.getAttribute("position").array, heightsBefore);
  assert.deepEqual(network.geometry.getAttribute("position").array, roadHeightsBefore, "A partially sampled road remains coherent");
  assert.equal(assembler.consumeShadowUpdate(), true);
  assert.equal(assembler.consumeShadowUpdate(), false, "Static shadows do not request perpetual updates");
  assembler.relocate(ROMAN_SETTLEMENT_ALTERNATE);
  assert.equal(foundation.visible, false, "Old-location heights must never follow a relocation");
  assembler.updateTerrain(() => null);
  assert.equal(status.state, "waiting-terrain");
  assembler.invalidateTerrain(); assembler.updateTerrain(() => 200);
  assert.equal(status.state, "ready");
  assert.equal(requests.length, uniqueAssets, "Relocation reuses all models");
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
  assert.equal(overrideDisposed, 1, "Owned shadow material copies are disposed once");
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
console.log("Settlement: seven buildings, joined roads, entrance ramps, instanced scenery, shadows, zero/uncertain DEM, retained heights, relocation, slope limits, cleanup, pending cancellation and retry pass.");
