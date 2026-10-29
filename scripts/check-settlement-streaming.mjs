import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModule} from './check-roman-assets.mjs';
const {SettlementLODController,settlementLOD,settlementDistance,DEVELOPMENT_SETTLEMENTS:fixtures}=await import(await loadModule('map/settlements/settlementStreaming'));
const {ThreeTestLayer}=await import(await loadModule('map/threeTestLayer'));
const {RegionalSettlement}=await import(await loadModule('map/settlements/RegionalSettlement'));
const {GlbCache,glbCache}=await import(await loadModule('lib/assets/glbCache'));
const {surfaceMapCacheInfo,clearSurfaceMapCache}=await import(await loadModule('map/settlements/surfaceMaterials'));
const {generateSettlement,settlementProfileConfig}=await import(await loadModule('map/settlements/proceduralSettlement'));
const flat=()=>({displayMeters:0,readiness:'confirmed'});
let lod='global';for(const [distance,expected] of [[20000,'global'],[7000,'regional'],[540,'local'],[700,'local'],[860,'regional'],[650,'regional'],[530,'local'],[13000,'global']]) {lod=settlementLOD(distance,lod);assert.equal(lod,expected);}
for(const lat of [0,41.85,75]) for(const pitch of [0,30,60]) {
 const d={...fixtures[0],origin:[12,lat],radiusMeters:0},r=pitch*Math.PI/180;
 // Equal physical camera distances at different pitch/latitude should produce equal LOD.
 const eye=[12,lat+500*Math.sin(r)/111195.08];
 const distance=settlementDistance(eye,500*Math.cos(r),d);
 assert.ok(Math.abs(distance-500)<.01);assert.equal(settlementLOD(distance,'global'),'local');
}
assert.ok(settlementDistance([179.999,0],0,{...fixtures[0],origin:[-179.999,0],radiusMeters:0})<225);
const controller=new SettlementLODController(),a=fixtures[0],b=fixtures[1];
const obs=(descriptor,distance,visible=true)=>({descriptor,distance,visible});
assert.equal(controller.update([obs(a,500),obs(b,400)]).descriptor.id,b.id);
assert.equal(controller.update([obs(a,350),obs(b,400)]).descriptor.id,b.id,'Switch margin retains incumbent');
assert.equal(controller.update([obs(a,200),obs(b,400)]).descriptor.id,a.id);
assert.equal(controller.update([obs(a,200,false)]).lod,'global');
for(let i=0;i<100;i++) assert.ok(['global','local'].includes(controller.update([obs(fixtures[i%3],i%2?10:50000)]).lod));

const original=GLTFLoader.prototype.loadAsync;
let requests=0,gate;
GLTFLoader.prototype.loadAsync=async function(url){requests++;if(gate)await gate;const bytes=await readFile(`public${url}`);return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
const layer=new ThreeTestLayer({lngLat:[0,0]});let eye=[0,0],altitude=1e7,moving=false,paints=0;
layer.descriptors=fixtures;
layer.map={_camera:{transform:{getCameraLngLat:()=>({lng:eye[0],lat:eye[1]}),getCameraAltitude:()=>altitude}},getCameraTargetElevation:()=>0,project:()=>({x:500,y:500}),getCanvas:()=>({clientWidth:1000,clientHeight:1000}),getLayer:()=>undefined,isMoving:()=>moving,triggerRepaint:()=>paints++,getTerrain:()=>({exaggeration:1}),terrain:{getDrawnElevationForLngLat:()=>0},queryTerrainElevation:()=>0};
const approach=(d,alt=300)=>{eye=d.origin;altitude=alt;layer.updateStreaming();};
const settle=async()=>{await new Promise(r=>setTimeout(r,230));layer.updateStreaming();layer.updateProcedural();if(layer.settlement){await layer.settlement.load();layer.settlement.updateTerrain(flat);}};
try {
 const initial=requests;layer.updateStreaming();assert.equal(layer.getStreamingStatus().detailedScenes,0);assert.equal(requests,initial,'Global discovery loads no GLBs');
 approach(a,4000);assert.equal(layer.getStreamingStatus().lod,'regional');assert.ok(layer.regional);assert.equal(requests,initial,'Regional clusters load no GLBs');
 const proxy=layer.regional;proxy.updateTerrain(()=>0);assert.equal(proxy.walls.count,6);assert.equal(proxy.walls.geometry.index.count/3,12);
 moving=true;approach(a);await settle();assert.equal(layer.settlement,null,'No new detail during camera travel');moving=false;
 await settle();assert.equal(layer.getStreamingStatus().detailedScenes,1);assert.equal(layer.settlement.loaded,6);assert.equal(layer.settlement.timing.stage,'ready');
 const old=layer.settlement;old.updateAmbientLife(100,true);old.updateAmbientLife(150,true);const state=JSON.stringify(old.ambientLife.simulation.villagers),p=paints;
 for(let i=0;i<30;i++)assert.equal(old.updateAmbientLife(200+i*33,false),false);
 assert.equal(JSON.stringify(old.ambientLife.simulation.villagers),state);assert.equal(paints,p);
 old.updateAmbientLife(1300,true);old.updateAmbientLife(1333,true);assert.notEqual(JSON.stringify(old.ambientLife.simulation.villagers),state);
 approach(a,1500);assert.equal(layer.settlement,null);assert.equal(old.ambientLife.actors.length,0);assert.equal(glbCache.snapshot().users,0);assert.ok(glbCache.snapshot().idle>0);
 const before=requests;approach(a);await settle();assert.equal(requests,before,'Return reuses decoded GLBs');assert.equal(layer.settlement.timing.totals.cpuTextures,0,'Return reuses CPU maps');
 approach(b);await settle();assert.equal(layer.getStreamingStatus().activeId,b.id);assert.equal(layer.getStreamingStatus().detailedScenes,1);assert.equal(layer.settlement.loaded,22);
 approach(fixtures[2]);await settle();assert.equal(layer.settlement.loaded,40);assert.equal(layer.getStreamingStatus().activeId,fixtures[2].id);
 // Start loads behind a gate; leave immediately and switch. Stale completions cannot replace the slot.
 layer.clearStreamingScene();glbCache.clearIdle();clearSurfaceMapCache();
 let resume;gate=new Promise(r=>resume=r);approach(a);await new Promise(r=>setTimeout(r,230));layer.updateStreaming();layer.updateProcedural();const stale=layer.settlement,staleLoad=stale.load();
 approach(b);await new Promise(r=>setTimeout(r,230));layer.updateStreaming();layer.updateProcedural();const fresh=layer.settlement,freshLoad=fresh.load();
 resume();gate=undefined;await Promise.all([staleLoad,freshLoad]);fresh.updateTerrain(flat);
 assert.equal(stale.loaded,0);assert.equal(stale.ambientLife.actors.length,0);assert.equal(layer.settlement,fresh);assert.equal(fresh.loaded,22);
 // Cancel after assets, during cooperative texture rows. It must stop without publishing maps.
 clearSurfaceMapCache();approach(a);await new Promise(r=>setTimeout(r,230));layer.updateStreaming();layer.updateProcedural();const texturing=layer.settlement;
 for(let i=0;i<200&&texturing.timing.stage!=='textures';i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(texturing.timing.stage,'textures');const load=texturing.load();approach(a,20000);await load;
 assert.equal(texturing.timing.stage,'unloaded');assert.equal(layer.settlement,null);assert.equal(glbCache.snapshot().users,0);
 assert.ok(surfaceMapCacheInfo().bytes<=9*1024*1024);assert.ok(glbCache.snapshot().idle<=12);assert.ok(glbCache.snapshot().bytes<=64*1024*1024);
 // Teardown also purges sources whose outstanding requests settle afterwards.
 const teardownCache=new GlbCache(12);let finish;gate=new Promise(r=>finish=r);
 const pending=teardownCache.acquire('/assets/roman-kit/provincial-house.glb');teardownCache.clearIdle();finish();gate=undefined;(await pending).release();assert.equal(teardownCache.snapshot().entries,0);
 // The cache's configurable idle-entry and byte budgets never evict a live lease.
 const cache=new GlbCache(1,1),x=await cache.acquire('/assets/roman-kit/provincial-house.glb');
 assert.equal(cache.snapshot().users,1);x.release();assert.equal(cache.snapshot().entries,0);
 const bounded=new GlbCache(1),x1=await bounded.acquire('/assets/roman-kit/provincial-house.glb'),x2=await bounded.acquire('/assets/roman-kit/taberna.glb');
 x1.release();x2.release();assert.equal(bounded.snapshot().idle,1);bounded.clearIdle();assert.equal(bounded.snapshot().entries,0);
 // Actual layout contacts preserve footprints; two shared geometries regardless of variant count.
 for(const profile of ['hamlet','village','small-town'])for(const seed of [7,42,2026]) {
  const d=generateSettlement({...settlementProfileConfig(profile),seed},flat).definition,proxy=new RegionalSettlement({...a,profile,seed},d);
  proxy.updateTerrain(()=>12);assert.equal(proxy.walls.count,proxy.plots.length);assert.ok(proxy.plots.length>=d.buildings.length);assert.equal(proxy.scene.children.length,2);assert.ok(proxy.plots.length<=d.buildings.length*3,'At most three source masses per building');assert.ok(proxy.plots.every(p=>p.width>0&&p.depth>0&&p.height>0));proxy.dispose();
 }
} finally {layer.clearStreamingScene();layer.regional?.dispose();glbCache.clearIdle();clearSurfaceMapCache();GLTFLoader.prototype.loadAsync=original;}
assert.equal(glbCache.snapshot().entries,0);
console.log('Streaming: LOD hysteresis, latitude/pitch/date line, nearest priority, rapid movement, no distant GLBs, travel debounce, bounded one-slot switching, warm visits, stale loads, texture cancellation, cache budgets, footprint silhouettes, pause/resume and disposal pass.');
