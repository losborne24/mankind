import assert from 'node:assert/strict';
import {Vector3} from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadModule } from './check-roman-assets.mjs';
const {generateSettlement,settlementProfileConfig,SETTLEMENT_PROFILES,DEFAULT_PROCEDURAL_CONFIG}=await import(await loadModule('map/settlements/proceduralSettlement'));
const {assetRegistry}=await import(await loadModule('lib/assets/registry'));
const {footprintDistance,localToSettlement,createSettlementEnvironment}=await import(await loadModule('map/settlements/settlementEnvironment'));
const {AmbientLifeSimulation}=await import(await loadModule('map/settlements/AmbientLifeSimulation'));
const {roadNetworkSurface}=await import(await loadModule("map/settlements/terrainSurfaces"));
const flat=()=>({displayMeters:-3,readiness:'confirmed'}), rows=[];
for(const [profile,p] of Object.entries(SETTLEMENT_PROFILES)) for(const seed of [7,42,2026]) for(const count of [p.range[0],p.target,p.range[1]]) {
  const config={...settlementProfileConfig(profile),seed,targetBuildingCount:count};
  const started=performance.now(),r=generateSettlement(config,flat),ms=performance.now()-started;
  assert.ok(['ready','partial'].includes(r.state));
  if(count!==p.range[1]) assert.equal(r.accepted,count,`${profile}/${seed}/${count}`);
  assert.equal(r.state,r.accepted===count?'ready':'partial');assert.ok(r.accepted>=p.range[0]);assert.ok(r.attempts<=Math.min(960,count*24));assert.ok(r.terrainSamples<45000);
  assert.deepEqual(generateSettlement(config,flat),r);
  const d=r.definition,g=r.navigation;
  for(let i=0;i<d.buildings.length;i++) {
    const b=d.buildings[i],size=assetRegistry[b.assetId].dimensionsMeters;
    for(const other of d.buildings.slice(i+1)) {
      const s=assetRegistry[other.assetId].dimensionsMeters;
      assert.ok(Math.hypot(b.offset[0]-other.offset[0],b.offset[1]-other.offset[1])>=Math.hypot(size[0],size[2])/2+Math.hypot(s[0],s[2])/2+1.8-1e-8);
    }
    const door=localToSettlement(assetRegistry[b.assetId].grounding.entrance,b.offset,b.headingRadians),access=d.roads.find(r=>r.accessTo===b.id);
    assert.deepEqual(access.points.at(-1),door);
    const f={offset:b.offset,width:size[0],depth:size[2],heading:b.headingRadians};
    for(const road of d.roads.filter(r=>r.accessTo!==b.id)) for(let k=1;k<road.points.length;k++) {
      const a=road.points[k-1],z=road.points[k],steps=Math.ceil(Math.hypot(z[0]-a[0],z[1]-a[1])*4);
      for(let j=0;j<=steps;j++) assert.ok(footprintDistance([a[0]+(z[0]-a[0])*j/steps,a[1]+(z[1]-a[1])*j/steps],f)>road.widthMeters/2+0.69);
    }
    assert.ok(Math.max(...b.offset.map(Math.abs))+Math.hypot(size[0],size[2])/2<d.groundSizeMeters/2);
  }
  for(const court of d.groundAreas.filter(a=>a.kind==='courtyard')) for(const b of d.buildings) {
    const size=assetRegistry[b.assetId].dimensionsMeters;
    assert.ok(footprintDistance(b.offset,{offset:court.offset,width:court.widthMeters,depth:court.depthMeters,heading:court.headingRadians})>Math.hypot(size[0],size[2])/2);
  }
  // Compare tessellated union area to an independent sweep of road-frame rectangles.
  const rects=d.roads.map(r=>{
    const points=r.points.map(p=>localToSettlement(p,[0,0],-d.roadFrameHeadingRadians));
    const [a,b]=points,horizontal=Math.abs(a[0]-b[0])>Math.abs(a[1]-b[1]);
    return {x0:Math.min(a[0],b[0])-(horizontal?0:r.widthMeters/2),x1:Math.max(a[0],b[0])+(horizontal?0:r.widthMeters/2),z0:Math.min(a[1],b[1])-(horizontal?r.widthMeters/2:0),z1:Math.max(a[1],b[1])+(horizontal?r.widthMeters/2:0)};
  });
  const xs=[...new Set(rects.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);let union=0;
  for(let i=1;i<xs.length;i++) {
    const mid=(xs[i-1]+xs[i])/2,intervals=rects.filter(r=>r.x0<mid&&r.x1>mid).sort((a,b)=>a.z0-b.z0);
    let end=-Infinity,length=0;
    for(const r of intervals){length+=Math.max(0,r.z1-Math.max(end,r.z0));end=Math.max(end,r.z1);}
    union+=(xs[i]-xs[i-1])*length;
  }
  const surface=roadNetworkSurface(d.roads,d.roadFrameHeadingRadians),points=surface.geometry.getAttribute('position'),indices=surface.geometry.index;let area=0;
  for(let i=0;i<indices.count;i+=3){const [a,b,c]=[0,1,2].map(j=>indices.getX(i+j));area+=Math.abs((points.getX(b)-points.getX(a))*(points.getZ(c)-points.getZ(a))-(points.getZ(b)-points.getZ(a))*(points.getX(c)-points.getX(a)))/2;}
  assert.ok(Math.abs(area-union)<0.005,'Multistreet road union has no doubled intersections or missing surface');surface.geometry.dispose();
  const visited=new Set([g.nodes[0].id]);
  for(let i=0;i<g.nodes.length;i++) for(const e of g.edges) {assert.ok(e.lengthMeters>1e-6);if(visited.has(e.from)||visited.has(e.to)){visited.add(e.from);visited.add(e.to);}}
  assert.equal(visited.size,g.nodes.length);assert.equal(g.nodes.filter(n=>n.kind==='entrance').length,r.accepted);
  for(let i=0;i<g.nodes.length;i++) assert.ok(!g.nodes.slice(i+1).some(n=>Math.hypot(n.point[0]-g.nodes[i].point[0],n.point[1]-g.nodes[i].point[1])<1e-6));
  const sim=new AmbientLifeSimulation(g,seed,p.villagers);
  for(let i=0;i<900;i++) sim.advance(1/30,()=>true);
  assert.equal(sim.villagers.length,p.villagers);
  assert.ok(sim.villagers.some(v=>v.distance>2),'Villagers follow expanded graph');
  const env=createSettlementEnvironment(d);
  for(const s of env.scenery) {const size=assetRegistry[s.assetId].dimensionsMeters,radius=Math.max(size[0],size[2])*(s.scale??1)/2;assert.ok(env.clearance(s.offset,radius));for(const court of d.groundAreas.filter(a=>a.kind==='courtyard')) assert.ok(footprintDistance(s.offset,{offset:court.offset,width:court.widthMeters,depth:court.depthMeters,heading:court.headingRadians??0})>radius,'Scenery leaves the rotated shared court clear');}
  rows.push({profile,seed,requested:count,accepted:r.accepted,attempts:r.attempts,terrainSamples:r.terrainSamples,generationMs:ms,roads:d.roads.length,nodes:g.nodes.length,edges:g.edges.length,scenery:env.scenery.length});
}
for(const profile of Object.keys(SETTLEMENT_PROFILES)) {
  const c=settlementProfileConfig(profile);
  assert.notDeepEqual(generateSettlement(c,flat).definition.buildings,generateSettlement({...c,seed:42},flat).definition.buildings);
  assert.equal(generateSettlement(c,()=>({displayMeters:0,readiness:'uncertain'})).state,'waiting-terrain');
  const constrained=generateSettlement({...c,extentMeters:36},flat);
  assert.ok(["partial","unsuitable"].includes(constrained.state));assert.ok(constrained.accepted<c.targetBuildingCount);
  assert.equal(generateSettlement(c,([lng,lat])=>({displayMeters:(lng+lat)*1e6,readiness:'confirmed'})).state,'unsuitable');
}
assert.equal(generateSettlement(DEFAULT_PROCEDURAL_CONFIG,flat).accepted,8);
await mkdir('docs/previews/settlement-density',{recursive:true});
await writeFile('docs/previews/settlement-density/generation-performance.json',JSON.stringify({note:'Synthetic confirmed flat DEM; CPU generation only, no GPU/asset work.',rows},null,2)+'\n');
console.log('Density: 27 profile/seed/capacity cases, terrain states, collision/road/court clearance, connected junctions, villager traversal, scenery clearance and bounded search pass.');

// Profile switches and cancellation while the actual shared GLBs are loading.
const {readFile}=await import('node:fs/promises');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {GlbCache}=await import(await loadModule('lib/assets/glbCache'));
const {SettlementScene}=await import(await loadModule('map/settlements/SettlementScene'));
const originalLoad=GLTFLoader.prototype.loadAsync,cache=new GlbCache();
let leases=0,release;
const gate=new Promise(r=>{release=r;});
GLTFLoader.prototype.loadAsync=async function(url){await gate;const b=await readFile(new URL(`../public${url}`,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const tracked={acquire:async url=>{const l=await cache.acquire(url);leases++;let active=true;return {...l,release(){if(active){active=false;leases--;l.release();}}};}};
const scenes=[];
try {
  const loads=[];
  for(const profile of Object.keys(SETTLEMENT_PROFILES)) {
    const d=generateSettlement(settlementProfileConfig(profile),flat).definition;
    const scene=new SettlementScene(d,()=>{},()=>{},tracked);scenes.push(scene);
    loads.push(scene.load());
    if(profile!=='small-town') scene.dispose();
  }
  release();await Promise.all(loads);
  const town=scenes.at(-1);town.updateTerrain(flat);
  assert.equal(town.loaded,town.definition.buildings.length);assert.equal(town.steepSites,0);
  town.scene.updateMatrixWorld(true);town.sun.shadow.updateMatrices(town.sun);
  for(const b of town.definition.buildings) {
    const size=assetRegistry[b.assetId].dimensionsMeters,model=town.root.getObjectByName(b.id);
    for(const x of [-size[0]/2,size[0]/2]) for(const z of [-size[2]/2,size[2]/2]) {
      const p=localToSettlement([x,z],b.offset,b.headingRadians);
      const clip=new Vector3(p[0],model.position.y+size[1],p[1]).project(town.sun.shadow.camera);
      assert.ok(clip.toArray().every(v=>Math.abs(v)<=1.0001),'Accepted town roofs remain inside shadow coverage');
    }
  }
  for(const entry of town.entries) {
    const uv=entry.surface.geometry.getAttribute('uv'),size=town.definition.groundSizeMeters;
    entry.surface.points.forEach(([x,z],i)=>{assert.ok(Math.abs(uv.getX(i)-(x/size+0.5))<1e-6);assert.ok(Math.abs(uv.getY(i)-(z/size+0.5))<1e-6);});
  }
  for(const profile of ['village','hamlet','village']) {
    town.unload();
    const config=settlementProfileConfig(profile),scene=new SettlementScene(generateSettlement(config,flat).definition,()=>{},()=>{},tracked);scenes.push(scene);
    await scene.load();scene.updateTerrain(flat);assert.equal(scene.steepSites,0);
    scene.invalidateTerrain();scene.updateTerrain(()=>({displayMeters:null,readiness:'unavailable'}));assert.ok(scene.terrainRetained>0);
    scene.relocate([12.5515,41.851]);scene.invalidateTerrain(true);scene.updateTerrain(flat);
    const resources=scene.resources.slice();let disposed=0;
    for(const r of resources)r.addEventListener?.('dispose',()=>disposed++);
    scene.unload();assert.equal(disposed,resources.filter(r=>r.addEventListener).length);
    assert.equal(leases,0);
    await scene.load();scene.updateTerrain(flat);scene.dispose();assert.equal(leases,0);
  }
} finally {for(const scene of scenes)scene.dispose();GLTFLoader.prototype.loadAsync=originalLoad;}
assert.equal(leases,0);
console.log('Density lifecycle: profile switching during real GLB loading, shared leases, treatment UV coverage, terrain reset/retention, reload and owned disposal pass.');
