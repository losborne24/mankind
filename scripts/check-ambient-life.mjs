import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModule} from './check-roman-assets.mjs';
const {AmbientLifeSimulation}=await import(await loadModule('map/settlements/AmbientLifeSimulation'));
const {generateSettlement,DEFAULT_PROCEDURAL_CONFIG:base}=await import(await loadModule('map/settlements/proceduralSettlement'));
const {ambientNavigation}=await import(await loadModule('map/settlements/ambientNavigation'));
const {ROMAN_SETTLEMENT}=await import(await loadModule('map/settlements/romanSettlement'));
const {SettlementScene}=await import(await loadModule('map/settlements/SettlementScene'));
const {footprintDistance,buildingContacts}=await import(await loadModule('map/settlements/settlementEnvironment'));
const {GlbCache}=await import(await loadModule('lib/assets/glbCache'));
const flat=()=>({displayMeters:0,readiness:'confirmed'});
const fixtures=[7,42,2026].map(seed=>generateSettlement({...base,seed},flat));
for(const fixture of fixtures) {
  const g=fixture.navigation,a=new AmbientLifeSimulation(g,fixture.seed,5),b=new AmbientLifeSimulation(g,fixture.seed,5);
  assert.deepEqual(a.villagers,b.villagers);
  for(let i=0;i<3600;i++) {
    a.advance(1/30); b.advance(1/60);b.advance(1/60);
    for(const v of a.villagers) {
      if(v.edge) assert.ok(g.edges.includes(v.edge));
      for(let j=1;j<v.route.length;j++) assert.ok(g.edges.some(e=>e.from===v.route[j-1]&&e.to===v.route[j]||e.to===v.route[j-1]&&e.from===v.route[j]));
      if(v.edge) {
        const p=a.nodes.get(v.edge.from).point,q=a.nodes.get(v.edge.to).point;
        assert.ok(Math.abs((v.x-p[0])*(q[1]-p[1])-(v.z-p[1])*(q[0]-p[0]))<1e-6);
      }
      for(const building of fixture.definition.buildings) {
        assert.ok(buildingContacts(building).every(f=>footprintDistance([v.x,v.z],f)>=-1e-6),`Never enter building bounds: seed ${fixture.seed} ${building.id} ${v.node} ${v.destination} at ${v.x},${v.z}`);
      }
    }
  }
  assert.deepEqual(a.villagers,b.villagers,'Identical behaviour at 30 and 60 fps for equal simulation time');
  const c=new AmbientLifeSimulation(g,fixture.seed+1,5);assert.notDeepEqual(c.villagers,new AmbientLifeSimulation(g,fixture.seed,5).villagers);
}
const split={nodes:[{id:'a',point:[0,0],kind:'road'},{id:'b',point:[5,0],kind:'entrance'},{id:'c',point:[50,50],kind:'road'}],edges:[{from:'a',to:'b',lengthMeters:5,roadId:'r'}]};
const disconnected=new AmbientLifeSimulation(split,7,5);
for(let i=0;i<1000;i++){disconnected.advance(.1);for(const v of disconnected.villagers){assert.notEqual(v.node,'c');assert.notEqual(v.destination,'c');}}
const stopped=JSON.stringify(disconnected.villagers);disconnected.advance(1,()=>false);assert.equal(JSON.stringify(disconnected.villagers),stopped);
const authored=ambientNavigation(ROMAN_SETTLEMENT);
assert.equal(new Set(authored.nodes.map(n=>n.id)).size,authored.nodes.length);
assert.ok(authored.nodes.some(n=>n.point[0]===-12&&n.point[1]===1.5),'Authored bend retained');
const authoredSim=new AmbientLifeSimulation(authored,7,5);
for(let i=0;i<3600;i++) {
  authoredSim.advance(1/30);
  for(const v of authoredSim.villagers) for(const building of ROMAN_SETTLEMENT.buildings)
    assert.ok(buildingContacts(building).every(f=>footprintDistance([v.x,v.z],f)>=-1e-6),`Authored road clears ${building.id} at ${v.x},${v.z}`);
}
const small=new AmbientLifeSimulation(fixtures[0].navigation,7,3),large=new AmbientLifeSimulation(fixtures[0].navigation,7,5);
small.advance(120);large.advance(120);assert.deepEqual(small.villagers,large.villagers.slice(0,3),'Count changes cannot perturb existing RNG streams');
const variable=new AmbientLifeSimulation(fixtures[0].navigation,7,3);
for(let i=0;i<3000;i++){variable.advance(.01);variable.advance(.03);}
assert.deepEqual(variable.villagers,small.villagers,'Variable frame lengths preserve equal elapsed inputs');
for(const v of authoredSim.villagers) assert.ok(v.distance>0);

const bytes=await readFile('public/assets/characters/roman-villager.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const bounds=new THREE.Box3().setFromObject(gltf.scene);assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(bounds.max.y>1.7&&bounds.max.y<1.9);
for(const name of ['leftLeg','rightLeg','leftArm','rightArm','body'])assert.ok(gltf.scene.getObjectByName(name));
// Real cache, real rendered road surfaces and the real DEM readiness lifecycle.
const original=GLTFLoader.prototype.loadAsync;
let leases=0,gate;
GLTFLoader.prototype.loadAsync=async function(url){if(gate)await gate;const b=await readFile(`public${url}`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const cache=new GlbCache();const tracked={acquire:async url=>{const l=await cache.acquire(url);leases++;let released=false;return{...l,release(){if(!released){released=true;leases--;l.release();}}};}};
let status,repaints=0;
const scene=new SettlementScene(fixtures[0].definition,s=>status=s,()=>repaints++,tracked);
const metrics={};
try {
  await scene.load();scene.updateTerrain(()=>({displayMeters:80,readiness:'uncertain'}));
  assert.equal(scene.updateAmbientLife(0,true),false,'Provisional DEM cannot place inhabitants');
  scene.invalidateTerrain();scene.updateTerrain(flat);assert.equal(scene.updateAmbientLife(100,true),true);
  assert.equal(status.ambientLife.active,3,'Zero elevation supports all road endpoints');
  const models=scene.ambientLife.actors;
  const geometries = model => {const result=[];model.traverse(o=>{if(o.isMesh)result.push(o.geometry);});return result;};
  assert.ok(geometries(models[0].model).length>0);geometries(models[0].model).forEach((g,i)=>assert.equal(g,geometries(models[1].model)[i],'Shared mesh resources'));
  for(let i=1;i<=300;i++)scene.updateAmbientLife(100+i*1000/30,true);
  assert.ok(scene.ambientLife.simulation.villagers.some(v=>v.distance>1));
  const before=scene.ambientLife.actors.map(a=>a.height);
  scene.invalidateTerrain();scene.updateTerrain(()=>({displayMeters:2,readiness:'confirmed'}));scene.updateAmbientLife(10133,true);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(models[i].height-before[i])<.06,'Changed terrain height cannot jump');
  for(let i=1;i<=120;i++)scene.updateAmbientLife(10133+i*1000/30,true);
  assert.ok(models.every(a=>a.height>1.9));
  scene.invalidateTerrain();scene.updateTerrain(()=>({displayMeters:null,readiness:'unavailable'}));
  assert.ok(scene.updateAmbientLife(14200,true),'Retained road remains usable during DEM loss');
  scene.invalidateTerrain(true);scene.updateTerrain(()=>({displayMeters:0,readiness:'uncertain'}));
  assert.equal(scene.updateAmbientLife(14300,true),false);
  scene.invalidateTerrain();scene.updateTerrain(()=>({displayMeters:120,readiness:'confirmed'}));
  scene.updateAmbientLife(15000,true);assert.ok(models.every(a=>a.height>=120&&a.height<120.081),'Displayed/exaggerated height used once');
  scene.relocate([12.5515,41.851]);assert.ok(models.every(a=>a.height===undefined&&!a.model.visible));
  scene.updateTerrain(()=>({displayMeters:300,readiness:'confirmed'}));scene.updateAmbientLife(16000,true);assert.ok(models.every(a=>a.height>299));
  const snapshot=JSON.stringify(scene.ambientLife.simulation.villagers),paints=repaints;
  for(let i=0;i<20;i++)assert.equal(scene.updateAmbientLife(17000+i*33,false),false);
  assert.equal(JSON.stringify(scene.ambientLife.simulation.villagers),snapshot);assert.equal(repaints,paints,'Paused animation requests no frames');
  scene.configureAmbientLife({enabled:false,count:5,paths:false});assert.equal(scene.updateAmbientLife(18000,true),false);
  scene.configureAmbientLife({enabled:true,count:5,paths:true});scene.updateAmbientLife(19000,true);assert.equal(status.ambientLife.active,5);
  scene.configureAmbientLife({enabled:true,count:0,paths:false});assert.equal(scene.updateAmbientLife(20000,true),false);
  scene.configureAmbientLife({enabled:true,count:3,paths:false});scene.updateAmbientLife(21000,true);
  const start=performance.now();for(let i=1;i<=600;i++)scene.updateAmbientLife(21000+i*1000/60,true);
  metrics.nodeViewMsPerFrame=(performance.now()-start)/600;
  scene.unload();assert.equal(leases,0);assert.equal(scene.ambientLife.actors.length,0);
  await scene.load();scene.updateTerrain(flat);scene.updateAmbientLife(0,true);assert.equal(status.ambientLife.active,3);
  assert.deepEqual(scene.ambientLife.simulation.villagers,new AmbientLifeSimulation(fixtures[0].navigation,7,3).villagers,"Reload resets initial state and fixed-step remainder");
  const replacement=new SettlementScene(fixtures[1].definition,()=>{},()=>{},tracked);
  let resume;gate=new Promise(r=>resume=r);scene.unload();const old=scene.load();scene.unload();const fresh=replacement.load();resume();await Promise.all([old,fresh]);gate=undefined;
  assert.equal(scene.ambientLife.actors.length,0);replacement.updateTerrain(flat);replacement.updateAmbientLife(0,true);assert.equal(replacement.ambientLife.actors.length,3);
  replacement.dispose();assert.equal(leases,0,'Stale loads and scene switching release every cache lease');
} finally {scene.dispose();GLTFLoader.prototype.loadAsync=original;}
let triangles=0,draws=0;const resources=new Set();gltf.scene.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;resources.add(o.geometry);}});
Object.assign(metrics,{assetBytes:bytes.length,trianglesPerVillager:triangles,drawsPerVillager:draws,sharedGeometries:resources.size});
await mkdir('docs/previews',{recursive:true});await writeFile('docs/previews/ambient-life-node-performance.json',JSON.stringify(metrics,null,2)+'\n');
console.log('Ambient life: three seeds, routes, disconnected graph, building clearance, 30/60 fps determinism, articulated GLB, shared resources, zero/provisional/missing DEM, smooth heights, exaggeration, relocation, disabled/distant pause, count bounds, reload, pending replacement and disposal pass.');console.log(metrics);
