import './glb-node-images.mjs';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadModule } from './check-roman-assets.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const manifest = JSON.parse(await read('public/assets/roman-kit/manifest.json'));
const specs = JSON.parse(await read('scripts/roman-kit/buildings.json'));
const modules = JSON.parse(await read('scripts/roman-kit/modules.json'));
assert.equal(Object.keys(specs.assets).length,9);
assert.equal(Object.keys(modules.modules).length,12);
assert.equal(Object.keys(manifest).length,21);
let runtimeBytes = 0;
for (const [name, expected] of Object.entries(manifest)) {
  const bytes = await read(`public/assets/roman-kit/${name}.glb`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256);
  assert.equal(bytes.length,expected.bytes);
  assert.ok(bytes.length < 1_500_000);
  const jsonLength = bytes.readUInt32LE(12);
  const gltfJSON = JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  assert.equal(gltfJSON.materials.length,1);
  assert.equal(gltfJSON.images.length,2);
  assert.ok(gltfJSON.images.every((image) => image.bufferView !== undefined && image.mimeType === 'image/png'));
  assert.ok(!gltfJSON.extensionsRequired?.length, 'No decoder or new extension dependency');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3()).toArray();
  assert.ok(Math.abs(bounds.min.y)<1e-5,'Raw GLB floor is Y=0');
  size.forEach((v,i) => assert.ok(Math.abs(v-expected.dimensionsMeters[i])<1e-4));
  gltf.scene.updateMatrixWorld(true);
  const hits = (origin,direction) => new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(gltf.scene,true);
  if (["provincial-house","taberna","small-temple"].includes(name)) {
    const hit=hits([0,1.5,10],[0,0,-1])[0];
    assert.ok(hit, "Street-facing entrance must face +Z");
    const cell=Math.floor(hit.uv.x*4)+Math.floor(hit.uv.y*2)*4;
    assert.equal(cell,name === "taberna" ? 4 : 3,"Front entrance ray reaches recessed timber or dark workshop bay");
  }
  if (name === "aqueduct-section") {
    for (const x of [-2,2]) assert.equal(hits([x,3.5,5],[0,0,-1]).length,0,"Aqueduct arches stay open");
    assert.ok(hits([0,3.5,5],[0,0,-1]).length>0,"Central masonry pier remains solid");
    const floor=hits([2,12,0],[0,-1,0])[0],coping=hits([2,12,.67],[0,-1,0])[0];
    assert.ok(coping.point.y-floor.point.y>.15,"Water channel is an actual open trough");
  }
  let meshes=0,triangles=0;
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    meshes++;
    triangles+=(mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count)/3;
    for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    const {map,normalMap}=mesh.material;
    assert.ok(map && normalMap && map.colorSpace === THREE.SRGBColorSpace);
    assert.equal(normalMap.colorSpace,THREE.NoColorSpace);
    for (const texture of [map,normalMap]) assert.deepEqual([texture.image.width,texture.image.height],[512,256]);
    const uv=mesh.geometry.getAttribute('uv');
    assert.ok(uv.array.every((v) => v>=0 && v<=1));
    mesh.geometry.dispose();mesh.material.dispose();map.dispose();normalMap.dispose();
  });
  assert.equal(meshes,1);assert.equal(triangles,expected.triangles);
  assert.ok(triangles<15_000);
  if (!name.startsWith('module-')) runtimeBytes+=bytes.length;
}
const {assetRegistry} = await import(await loadModule('lib/assets/registry'));
const {ROMAN_SETTLEMENT}=await import(await loadModule('map/settlements/romanSettlement'));
const owned = Object.values(assetRegistry).filter((a) => a.path.startsWith('roman-kit/'));
assert.equal(owned.length,21);
for (const asset of owned) {
  assert.equal(asset.scale,1);assert.equal(asset.groundOffsetMeters,0);
  assert.equal(asset.source.licenceFile,'roman-kit/PROVENANCE.md');
}
assert.equal(new Set(ROMAN_SETTLEMENT.buildings.slice(0,5).map((b) => b.assetId)).size,5);
// Regression guard: migration must not quietly regenerate the nine environment meshes.
const environment = JSON.parse(await read('scripts/roman-kit/environment-baseline.json'));
assert.equal(Object.keys(environment).length,9);
for (const [name,hash] of Object.entries(environment)) assert.equal(createHash('sha256').update(await read(`public/assets/environment/${name}`)).digest('hex'),hash);
const removedRoot=['public','assets','roman'].join('/');
if (!process.argv.includes('--allow-legacy-files')) await assert.rejects(stat(new URL(removedRoot,root)),{code:'ENOENT'});
// Historical docs may name the pack. Active runtime, tests and generators must not load it.
async function audit(dir) {
  for (const entry of await readdir(new URL(dir,root),{withFileTypes:true})) {
    const path=`${dir}/${entry.name}`;
    if (entry.isDirectory()) await audit(path);
    else if (/\.(ts|tsx|js|mjs|py)$/.test(path)) {
      const source=String(await read(path));
      for (const prefix of [['roman','buildings'],['roman','props']]) assert.ok(!source.includes(prefix.join('/')+'/'),`Legacy asset path in ${path}`);
      assert.ok(!source.includes(['LowPoly','RomanTown'].join('')),`Legacy archive dependency in ${path}`);
    }
  }
}
for (const dir of ['components','map','lib','scripts']) await audit(dir);
console.log(`Roman kit: 9 runtime assets, 12 authoring modules, ${runtimeBytes.toLocaleString()} runtime bytes, 1 draw/model, embedded PNGs, bounds, UVs, source isolation and unchanged environment pass.`);
