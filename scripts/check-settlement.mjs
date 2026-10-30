import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadModule } from "./check-roman-assets.mjs";

const { ROMAN_SETTLEMENT, ROMAN_SETTLEMENT_ALTERNATE, offsetCoordinate } = await import(await loadModule("map/settlements/romanSettlement"));
const { SettlementScene } = await import(await loadModule("map/settlements/SettlementScene"));
const { queryTerrainSample } = await import(await loadModule("map/terrain"));
const { GlbCache } = await import(await loadModule("lib/assets/glbCache"));
const { assetRegistry } = await import(await loadModule("lib/assets/registry"));
const { createSettlementEnvironment } = await import(await loadModule("map/settlements/settlementEnvironment"));
const environment = createSettlementEnvironment(ROMAN_SETTLEMENT);
const { settlementSurfaceMaps } = await import(await loadModule("map/settlements/surfaceMaterials"));
const { roadNetworkSurface } = await import(await loadModule("map/settlements/terrainSurfaces"));
assert.equal(ROMAN_SETTLEMENT.buildings.length, 7);
assert.deepEqual(new Set(ROMAN_SETTLEMENT.groundAreas.map((area) => area.kind)), new Set(["courtyard", "garden", "field"]));
// Retain the previous union regression fixture as well as the new network below.
const legacyRoads = [{widthMeters:4,points:[[0,-32],[0,21]]},
  ...[-20,-6,10].map((z)=>({widthMeters:1.6,points:[[-2,z],[-6.5,z]]})),
  ...[-20,-6].map((z)=>({widthMeters:1.6,points:[[2,z],[6.5,z]]})),
  {widthMeters:1.6,points:[[2,12],[5.8,12]]}, {widthMeters:1.6,points:[[0,21],[0,27]]}];
const legacy = roadNetworkSurface(legacyRoads), lp = legacy.geometry.getAttribute("position"), li = legacy.geometry.index;
let legacyArea = 0;
for (let i=0;i<li.count;i+=3) {
  const a=li.getX(i),b=li.getX(i+1),c=li.getX(i+2);
  legacyArea += Math.abs((lp.getX(b)-lp.getX(a))*(lp.getZ(c)-lp.getZ(a))-(lp.getZ(b)-lp.getZ(a))*(lp.getX(c)-lp.getX(a)))/2;
}
assert.ok(Math.abs(legacyArea-263.68)<0.001);
legacy.geometry.dispose();
// The authored natural clumps must not obstruct the existing roads or footprints.
for (const item of ROMAN_SETTLEMENT.scenery.filter((s) => ["vegetation", "rock"].includes(assetRegistry[s.assetId].category))) {
  const radius = Math.max(assetRegistry[item.assetId].dimensionsMeters[0], assetRegistry[item.assetId].dimensionsMeters[2]) * (item.scale ?? 1) / 2;
  for (const road of ROMAN_SETTLEMENT.roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], [x, z] = item.offset;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    assert.ok(Math.hypot(x - ax - t * dx, z - az - t * dz) > radius + road.widthMeters / 2, "Scenery keeps roads and entrances clear");
  }
  for (const building of ROMAN_SETTLEMENT.buildings) {
    const [width,,depth] = assetRegistry[building.assetId].dimensionsMeters;
    const dx = item.offset[0] - building.offset[0], dz = item.offset[1] - building.offset[1], angle = building.headingRadians ?? 0;
    const x = Math.cos(angle) * dx - Math.sin(angle) * dz, z = Math.sin(angle) * dx + Math.cos(angle) * dz;
    assert.ok(Math.hypot(Math.max(0, Math.abs(x) - width / 2), Math.max(0, Math.abs(z) - depth / 2)) > radius, "Scenery clears building footprints");
  }
}
// A vegetation stamp changes its own patch, without changing unrelated ground.
const emptyPatch = { ...ROMAN_SETTLEMENT, roads: [], scenery: [] };
const bare = settlementSurfaceMaps(emptyPatch, []);
const planted = settlementSurfaceMaps({ ...emptyPatch, scenery: [{assetId: "environment-mediterranean-shrub-01", offset: [0,0]}] }, []);
const centerPixel = (352 * 512 + 256) * 4;
assert.notDeepEqual(planted.ground.image.data.slice(centerPixel, centerPixel + 4), bare.ground.image.data.slice(centerPixel, centerPixel + 4));
assert.deepEqual(planted.ground.image.data.slice(0, 256 * 4), bare.ground.image.data.slice(0, 256 * 4));
for (const map of [bare.ground, bare.road, planted.ground, planted.road]) map.dispose();
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
  if (url.endsWith("residential-variants.glb")) gltf.scene.traverse((object) => { if (object.isMesh && !originalVillaMaterial) originalVillaMaterial = object.material; });
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
  const uniqueAssets = new Set([...ROMAN_SETTLEMENT.buildings, ...ROMAN_SETTLEMENT.scenery, {assetId:"roman-villager-01"}].map((item) => assetRegistry[item.assetId].path)).size;
  assert.equal(requests.length, uniqueAssets, "Repeated buildings/scenery share one request per asset");
  assert.equal(status.sceneryLoaded, environment.scenery.length);
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
    const offsets = assembler.entries.find(e => e.mesh === foundation).surface.seatingOffsets;
    let highest = -Infinity;
    for (let i = 0; i < count; i++) {
      const h = plane(offsetCoordinate(assembler.origin, [positions.getX(i), positions.getZ(i)]));
      assert.ok(Math.abs(positions.getY(i) - (h - 0.15)) < 0.0001);
      highest = Math.max(highest, h - (offsets?.[i] ?? 0));
    }
    for (let i = count; i < positions.count; i++) assert.ok(Math.abs(positions.getY(i) - (highest + 0.015 + (offsets?.[i-count] ?? 0))) < 0.0001, "Foundation top stays level and above the sampled footprint");
    const building = assembler.scene.getObjectByName(foundation.name.replace(/-foundation$/, ""));
    assert.equal(building.visible, true);
    assert.ok(Math.abs(building.position.y - highest - 0.015) < 0.0001);
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
  assert.ok(Math.abs(roadArea - 394.3875) < 0.001, "Road triangles cover the street union once, without overlapping junctions");
  for (let i=0;i<roadIndices.count;i+=3) {
    const vertices=[0,1,2].map((j)=>roadIndices.getX(i+j));
    const x=vertices.reduce((sum,v)=>sum+roadPositions.getX(v),0)/3;
    const z=vertices.reduce((sum,v)=>sum+roadPositions.getZ(v),0)/3;
    for (const building of ROMAN_SETTLEMENT.buildings) {
      const [width,,depth]=assetRegistry[building.assetId].dimensionsMeters, angle=building.headingRadians??0;
      const dx=x-building.offset[0],dz=z-building.offset[1];
      const lx=Math.cos(angle)*dx-Math.sin(angle)*dz,lz=Math.sin(angle)*dx+Math.cos(angle)*dz;
      assert.ok(Math.abs(lx)>=width/2-0.01 || Math.abs(lz)>=depth/2-0.01, "Road interiors stay outside building footprints");
    }
  }
  for (const path of ROMAN_SETTLEMENT.roads.filter((road) => road.accessTo)) {
    const [x,z] = path.points.at(-1);
    const [ax,az] = path.points.at(-2), dx = x - ax, dz = z - az;
    const building = assembler.scene.getObjectByName(path.accessTo);
    let matched = 0;
    for (let i = 0; i < roadPositions.count; i++) {
      const distance = Math.hypot(roadPositions.getX(i) - x, roadPositions.getZ(i) - z);
      const along = ((roadPositions.getX(i) - x) * dx + (roadPositions.getZ(i) - z) * dz) / Math.hypot(dx,dz);
      if (distance <= path.widthMeters / 2 + 0.00001 && Math.abs(along) < 0.00001) {
        assert.ok(Math.abs(roadPositions.getY(i) - building.position.y) < 0.0001, "Entrance landings meet the foundation height");
        matched++;
      }
    }
    assert.ok(matched > 0);
  }
  const treatment = assembler.scene.getObjectByName("settlement-ground");
  const groundMap = treatment.material.map;
  const roadMap = network.material.map;
  assert.ok(groundMap.isDataTexture && roadMap.isDataTexture);
  assert.equal(treatment.material.depthWrite, false, "Ground blending preserves MapLibre depth");
  assert.equal(network.material.forceSinglePass, true, "Transparent roads need only one face pass");
  const pixels = groundMap.image.data, w = groundMap.image.width, h = groundMap.image.height;
  for (let i = 0; i < w; i++) {
    assert.equal(pixels[i * 4 + 3], 0);
    assert.equal(pixels[((h - 1) * w + i) * 4 + 3], 0);
  }
  for (let j = 0; j < h; j++) {
    assert.equal(pixels[(j * w) * 4 + 3], 0);
    assert.equal(pixels[(j * w + w - 1) * 4 + 3], 0);
  }
  assert.ok(pixels.some((v, i) => i % 4 === 3 && v > 120), "Wear is visible inside the transparent perimeter");
  const groundPositions = treatment.geometry.getAttribute("position");
  for (let i = 0; i < groundPositions.count; i++) {
    const y = plane(offsetCoordinate(assembler.origin, [groundPositions.getX(i), groundPositions.getZ(i)]));
    assert.ok(Math.abs(groundPositions.getY(i) - y - 0.05) < 0.0001, "Ground treatment follows the sampled terrain");
  }
  let textureDisposals = 0;
  groundMap.addEventListener("dispose", () => textureDisposals++);
  roadMap.addEventListener("dispose", () => textureDisposals++);
  const instanceMeshes = meshes().filter((mesh) => mesh.isInstancedMesh);
  const awning = instanceMeshes.find((mesh) => mesh.name.startsWith("roman-market-awning"));
  assert.ok(awning.material.map && awning.material.normalMap, "Project-owned cloth retains its authored atlas");
  const instanceColours = instanceMeshes.map((mesh) => mesh.instanceColor?.array.slice());
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
  assert.ok(sun.castShadow && sun.shadow.mapSize.x === 2048);
  const floorHeights = ROMAN_SETTLEMENT.buildings.map((building) => assembler.scene.getObjectByName(building.id).position.y);
  assert.ok(Math.abs(sun.target.position.y - floorHeights.reduce((sum, height) => sum + height, 0) / floorHeights.length) < 0.001);
  console.log(`Environment: ${status.sceneryLoaded} placements in ${instanceMeshes.length} instanced component batches.`);
  let settlementVillaMaterial;
  assembler.scene.getObjectByName("villa-west-1").traverse((object) => { if (object.isMesh && !settlementVillaMaterial) settlementVillaMaterial = object.material; });
  assert.notEqual(settlementVillaMaterial, originalVillaMaterial, "Settlement shadow overrides must not mutate the cached/Giza material");
  assert.equal(settlementVillaMaterial.shadowSide, THREE.BackSide);
  assert.notEqual(originalVillaMaterial.shadowSide, THREE.BackSide);
  const libraryMaterials = new Set();
  for (const building of ROMAN_SETTLEMENT.buildings.slice(0,5)) {
    assembler.scene.getObjectByName(building.id).traverse((o) => {
      if (o.isMesh) libraryMaterials.add(o.material);
    });
  }
  assert.equal(libraryMaterials.size, 1, "Library instances share a shadow material; pigment is baked");
  let overrideDisposed = 0;
  settlementVillaMaterial.addEventListener("dispose", () => overrideDisposed++);
  const archetypes = new Set(ROMAN_SETTLEMENT.buildings.filter((b) => !["temple","aqueduct"].includes(b.id)).map((b) => b.assetId));
  assert.equal(archetypes.size, 5, "The settlement uses three distinct residential/commercial archetypes");
  for (const building of ROMAN_SETTLEMENT.buildings) {
    let parts = 0;
    assembler.scene.getObjectByName(building.id).traverse((o) => { if (o.isMesh) { parts++; assert.ok(o.material.map && o.material.normalMap); } });
    assert.equal(parts, 1, "Each complete architectural GLB is one merged material batch");
  }
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
  assert.equal(treatment.material.map, groundMap, "Relocation reuses local ground textures");
  assert.equal(network.material.map, roadMap, "Relocation reuses local road textures");
  instanceMeshes.forEach((mesh, i) => assert.deepEqual(mesh.instanceColor?.array, instanceColours[i], "Relocation preserves scenery colour variation"));
  assembler.invalidateTerrain(true); assembler.updateTerrain(([lng]) => 200 + (lng - assembler.origin[0]) * 200000);
  assert.equal(status.steepSites, 7);
  assert.ok(status.scenerySteep > 0, "Rigid props are rejected on unsuitable footprint slopes");
  assert.ok(foundations().every((o) => !o.visible), "Unsuitable slopes must not create towering foundations");
  let disposed = 0;
  foundation.geometry.addEventListener("dispose", () => disposed++);
  assembler.unload(); assembler.unload();
  assert.equal(status.state, "unloaded");
  assert.equal(meshes().length, 0);
  assert.equal(disposed, 1, "Procedural resources are disposed once");
  assert.equal(textureDisposals, 2, "Owned ground and road textures are disposed once");
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
