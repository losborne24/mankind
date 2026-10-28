import "./glb-node-images.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Run the real TypeScript modules in Node without adding a test dependency.
const modules = new Map();
export async function loadModule(path) {
  if (modules.has(path)) return modules.get(path);
  let { outputText } = ts.transpileModule(await readFile(new URL(`../${path}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  for (const match of [...outputText.matchAll(/from "([^"]+)"/g)]) {
    const specifier = match[1];
    const resolved = specifier.startsWith("@/") ? await loadModule(specifier.slice(2)) : import.meta.resolve(specifier);
    outputText = outputText.replace(`from "${specifier}"`, `from "${resolved}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  modules.set(path, url);
  return url;
}
const { assetRegistry, assetUrl } = await import(await loadModule("lib/assets/registry"));
const { prepareAsset } = await import(await loadModule("map/romanTestScene"));
const { geographicAnchor } = await import(await loadModule("map/geographicAnchor"));
const { GlbCache } = await import(await loadModule("lib/assets/glbCache"));
assert.equal(assetUrl("roman-kit/provincial-house.glb", "https://cdn.example/assets/"), "https://cdn.example/assets/roman-kit/provincial-house.glb");
const sources = new Map();
let totalBytes = 0;
for (const asset of Object.values(assetRegistry)) {
  const bytes = await readFile(new URL(`../public/assets/${asset.path}`, import.meta.url));
  if (!sources.has(asset.path)) totalBytes += bytes.length;
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  sources.set(asset.path, gltf);
  const bounds = new THREE.Box3().setFromObject(prepareAsset(gltf.scene.clone(true), asset));
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < 1e-6, "Base must land at zero");
  for (const [i, actual] of size.toArray().entries()) assert.ok(Math.abs(actual - asset.dimensionsMeters[i]) < 0.001);
  console.log(`${asset.id}: ${size.toArray().map((v) => v.toFixed(3)).join(" × ")} m`);
}
// East / south must stay east / south across the two projections. Elevation stays metres.
const low = geographicAnchor([31.138, 29.9795], 0);
const high = geographicAnchor([31.138, 29.9795], 100);
assert.ok(high.globe.elements[12] > low.globe.elements[12]);
assert.ok(high.mercator.elements[14] > low.mercator.elements[14]);
const south = new THREE.Vector3(0, 0, 1).transformDirection(low.mercator);
assert.ok(south.y > 0.99);
assert.ok(low.globe.determinant() > 0 && low.mercator.determinant() < 0);

// Exercise concurrent sharing, independent transforms, last-user disposal, retry and pending removal.
const original = GLTFLoader.prototype.loadAsync;
let requests = 0;
let fail = false;
let resume;
GLTFLoader.prototype.loadAsync = async function () {
  requests++;
  if (fail) throw new Error("simulated 404");
  if (resume === null) await new Promise((resolve) => { resume = resolve; });
  return sources.get(assetRegistry["roman-villa-01"].path);
};
try {
  const cache = new GlbCache();
  const [a, b] = await Promise.all([cache.acquire("villa"), cache.acquire("villa")]);
  assert.equal(requests, 1);
  assert.notEqual(a.scene, b.scene);
  a.scene.position.x = 42;
  assert.equal(b.scene.position.x, 0);
  let geometryA, geometryB;
  a.scene.traverse((o) => { if (o.isMesh) geometryA = o.geometry; });
  b.scene.traverse((o) => { if (o.isMesh) geometryB = o.geometry; });
  assert.equal(geometryA, geometryB);
  let textureDisposed = 0;
  const maps = new Set();
  a.scene.traverse((o) => { if (o.isMesh) { if (o.material.map) maps.add(o.material.map); if (o.material.normalMap) maps.add(o.material.normalMap); } });
  for (const map of maps) map.addEventListener("dispose", () => textureDisposed++);
  let disposed = 0;
  geometryA.addEventListener("dispose", () => disposed++);
  a.release(); a.release();
  assert.equal(disposed, 0);
  assert.equal(textureDisposed, 0, "Maps stay alive while another scene uses the asset");
  b.release();
  assert.equal(disposed, 1);
  assert.equal(textureDisposed, maps.size, "Last-user release disposes each atlas once");
  fail = true;
  await assert.rejects(cache.acquire("missing"), /simulated 404/);
  fail = false;
  const retry = await cache.acquire("missing");
  retry.release();
  resume = null;
  const pending = cache.acquire("pending");
  resume();
  (await pending).release();
  const fresh = await cache.acquire("pending");
  fresh.release();
  assert.equal(requests, 5, "Released entries should be evicted; failures should be retryable");
} finally {
  GLTFLoader.prototype.loadAsync = original;
}
console.log(`Roman assets: ${totalBytes.toLocaleString()} bytes; dimensions, placement frame, cache sharing, cleanup and retry pass.`);
