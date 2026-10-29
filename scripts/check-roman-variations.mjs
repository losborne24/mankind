import './glb-node-images.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadModule } from './check-roman-assets.mjs';
const read = (path) => readFile(new URL(`../${path}`,import.meta.url));
const inventory = JSON.parse(await read('public/assets/roman-kit/variants.json'));
const bytes = await read('public/assets/roman-kit/residential-variants.glb');
assert.equal(createHash('sha256').update(bytes).digest('hex'),inventory.sha256);
assert.equal(bytes.length,inventory.bytes);
assert.ok(bytes.length<10_000_000);
const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
assert.equal(json.images.length,2,'Exactly one shared atlas pair');
assert.equal(json.materials.length,1);
assert.ok(!json.extensionsRequired?.length);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const {assetRegistry}=await import(await loadModule('lib/assets/registry'));
const {prepareAsset}=await import(await loadModule('lib/assets/prepareAsset'));
const {selectRomanVariants}=await import(await loadModule('map/settlements/romanVariation'));
const {createRomanSettlement,ROMAN_SETTLEMENT,ROMAN_VARIATION_PREVIEW}=await import(await loadModule('map/settlements/romanSettlement'));
const {SettlementScene}=await import(await loadModule('map/settlements/SettlementScene'));
assert.equal(Object.keys(inventory.variants).length,12);
const materials=new Set(),textures=new Set();
for(const [name,spec] of Object.entries(inventory.variants)) {
 const node=gltf.scene.getObjectByName(name);
 assert.ok(node?.isMesh,name);
 materials.add(node.material);textures.add(node.material.map);textures.add(node.material.normalMap);
 const asset=assetRegistry[`roman-${name}`];
 const model=prepareAsset(gltf.scene.clone(true),asset);
 const box=new THREE.Box3().setFromObject(model);
 assert.ok(Math.abs(box.min.y)<1e-5);
 box.getSize(new THREE.Vector3()).toArray().forEach((v,i)=>assert.ok(Math.abs(v-spec.dimensionsMeters[i])<1e-4));
 const geo=node.geometry;
 for(const attribute of Object.values(geo.attributes))assert.ok(attribute.array.every(Number.isFinite));
 assert.ok(geo.getAttribute('color'),'Baked seeded pigments');
 assert.ok(Array.from({length:geo.getAttribute('color').count},(_,i)=>geo.getAttribute('color').getX(i)).some(v=>v<.99),'Real pigments, not a dummy white channel');
 assert.ok(!geo.getAttribute('color_1'),'No unused second colour channel');
 assert.ok(geo.getAttribute('uv').array.every(v=>v>=0&&v<=1));
 assert.equal((geo.index?.count??geo.getAttribute('position').count)/3,spec.triangles);
 assert.ok(spec.triangles<16000);
 // Above and below every opening must be solid plaster: catches stacked-wall regressions.
 if(spec.parameters.kind==='house') {
  gltf.scene.updateMatrixWorld(true);
  for(const y of [.85,2.6,3.25,4.75].filter(y=>y<spec.parameters.wallHeight-.2)) {
   const ray=new THREE.Raycaster(new THREE.Vector3(-spec.parameters.width*.27,y,10),new THREE.Vector3(0,0,-1));
   const hit=ray.intersectObject(node)[0];assert.ok(hit);
   assert.ok(hit.point.z>spec.parameters.depth/2-.17,'Solid wall between storeys');
  }
 }
}
assert.equal(materials.size,1);assert.equal(textures.size,2);
const archetypes=Array.from({length:30},()=> 'house');
const selected=selectRomanVariants(9,archetypes);
assert.deepEqual(selected,selectRomanVariants(9,archetypes));
assert.notDeepEqual(selected,selectRomanVariants(10,archetypes));
for(let i=0;i<30;i+=6)assert.equal(new Set(selected.slice(i,i+6)).size,6);
for(let seed=0;seed<100;seed++) {
 const definition=createRomanSettlement(seed);
 assert.deepEqual(definition.buildings.slice(5),ROMAN_SETTLEMENT.buildings.slice(5),'Landmarks unchanged');
 definition.buildings.slice(0,5).forEach((b,i)=>assert.deepEqual(b.offset,ROMAN_SETTLEMENT.buildings[i].offset));
}
// Real shared library through scene/cache lifecycle, including repeated instanced plots.
const original=GLTFLoader.prototype.loadAsync;
let requests=0;
GLTFLoader.prototype.loadAsync=async(url)=>{
 requests++;
 if(url.includes('/characters/')) {
  const b=await read(`public${url}`);
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 }
 return gltf;
};
try {
 const {GlbCache}=await import(await loadModule('lib/assets/glbCache'));
 let status;
 const scene=new SettlementScene(ROMAN_VARIATION_PREVIEW,s=>{status=s},()=>{},new GlbCache());
 await scene.load();assert.equal(status.loaded,15);assert.equal(requests,2,"One building-library request plus one shared villager asset");
 scene.updateTerrain(()=>100);assert.equal(status.state,'ready');
 const batches=[];scene.scene.traverse(o=>{if(o.isInstancedMesh)batches.push(o)});
 assert.equal(batches.length,3);assert.ok(batches.every(b=>b.count===2));
 scene.relocate([12.5515,41.851]);assert.ok(batches.every(b=>!b.visible));
 scene.updateTerrain(()=>null);assert.equal(status.state,'waiting-terrain');
 scene.invalidateTerrain();scene.updateTerrain(()=>200);assert.ok(batches.every(b=>b.visible&&b.count===2));
 for(const batch of batches) { const matrix=new THREE.Matrix4();batch.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[13]-200.015)<.001,'Instanced geometry follows its plot foundation'); }
 scene.invalidateTerrain();scene.updateTerrain(([lng])=>lng*100000000);assert.ok(batches.every(b=>!b.visible));
 scene.unload();assert.equal(status.loaded,0);
} finally {GLTFLoader.prototype.loadAsync=original;}
const originalHashes=JSON.parse(await read('scripts/roman-kit/original-baseline.json'));
for(const [name,hash] of Object.entries(originalHashes))assert.equal(createHash('sha256').update(await read(`public/assets/roman-kit/${name}`)).digest('hex'),hash);
console.log(`Roman variants: 12 prebuilt meshes, ${bytes.length.toLocaleString()} bytes, one material/atlas, seeded selection, one library request, repeated batching, terrain/relocation/unload and original hashes pass.`);
