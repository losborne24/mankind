import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadModule } from './check-roman-assets.mjs';
const { generateSettlement, DEFAULT_PROCEDURAL_CONFIG: base, plotSupportSamples } = await import(await loadModule('map/settlements/proceduralSettlement'));
const { ProceduralSettlementSession } = await import(await loadModule('map/settlements/ProceduralSettlementSession'));
const { assetRegistry } = await import(await loadModule('lib/assets/registry'));
const { localToSettlement, footprintDistance, createSettlementEnvironment } = await import(await loadModule('map/settlements/settlementEnvironment'));
const { roadNetworkSurface, contactFoundationSurface } = await import(await loadModule('map/settlements/terrainSurfaces'));
const { buildingContacts } = await import(await loadModule('map/settlements/settlementEnvironment'));
const flat = () => ({displayMeters:0,readiness:'confirmed'});
const unknown = () => ({displayMeters:0,readiness:'uncertain'});
const missing = () => ({displayMeters:null,readiness:'unavailable'});
const plane = (origin, slope) => ([lng,lat]) => ({displayMeters:100+(lng-origin[0])*Math.cos(origin[1]*Math.PI/180)*111195*slope+(lat-origin[1])*111195*slope/2,readiness:'confirmed'});
const start = performance.now();
const signatures = new Set();
for (const seed of [7,42,2026,13,89,12345,0,-1]) {
  const config = {...base,seed};
  const a = generateSettlement(config,flat), b = generateSettlement(config,flat);
  assert.deepEqual(a,b,'Identical seed + samples gives identical output');
  assert.equal(a.state,'ready'); assert.equal(a.accepted,8);
  signatures.add(JSON.stringify(a.definition.buildings));
  const {definition:d,navigation:g} = a;
  const relocated = generateSettlement({...config,origin:[13,43]},flat);
  assert.deepEqual(relocated.definition.buildings,d.buildings,'Suitable relocation preserves local structure');
  assert.deepEqual(relocated.navigation,g);
  assert.deepEqual(createSettlementEnvironment(d).scenery,createSettlementEnvironment(d).scenery);
  for (const [i,building] of d.buildings.entries()) {
    const [w,,depth] = assetRegistry[building.assetId].dimensionsMeters;
    for (const other of d.buildings.slice(i+1)) {
      const [ow,,od] = assetRegistry[other.assetId].dimensionsMeters;
      assert.ok(Math.hypot(building.offset[0]-other.offset[0],building.offset[1]-other.offset[1]) > (Math.hypot(w,depth)+Math.hypot(ow,od))/2+1.79);
    }
    const access = d.roads.find(r=>r.accessTo===building.id);
    const entrance = localToSettlement(assetRegistry[building.assetId].grounding.entrance,building.offset,building.headingRadians);
    assert.deepEqual(access.points.at(-1),entrance);
    const facing = localToSettlement([0,1],[0,0],building.headingRadians);
    assert.ok(facing[0]*(access.points[0][0]-entrance[0])+facing[1]*(access.points[0][1]-entrance[1]) > 0,'Entrance faces road');
    const support = plotSupportSamples(building), mesh = contactFoundationSurface(buildingContacts(building));
    assert.deepEqual(support.map(s=>s.point),mesh.points.slice(0,mesh.points.length/2),'Checks actual complex contact lattice'); mesh.geometry.dispose();
    for (const road of d.roads.filter(r=>r.accessTo!==building.id)) {
      for (let j=0;j<=100;j++) {
        const p = road.points[0], q = road.points.at(-1);
        assert.ok(footprintDistance([p[0]+(q[0]-p[0])*j/100,p[1]+(q[1]-p[1])*j/100],{offset:building.offset,width:w,depth,heading:building.headingRadians}) > road.widthMeters/2,'Building clears roads and other approaches');
      }
    }
  }
  const surface=roadNetworkSurface(d.roads,d.roadFrameHeadingRadians);
  assert.ok(surface.points.length>0 && [...surface.geometry.attributes.position.array].every(Number.isFinite));
  const p=surface.geometry.attributes.position, indices=surface.geometry.index;
  let area=0;
  for(let i=0;i<indices.count;i+=3) {
    const [a,b,c]=[0,1,2].map(j=>indices.getX(i+j));
    area+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;
  }
  const length=r=>Math.hypot(r.points[1][0]-r.points[0][0],r.points[1][1]-r.points[0][1]);
  const expected=length(d.roads[0])*d.roads[0].widthMeters+d.roads.slice(1).reduce((sum,r)=>sum+(length(r)-d.roads[0].widthMeters/2)*r.widthMeters,0);
  assert.ok(Math.abs(area-expected)<0.001,'Rotated road union covers junctions once'); surface.geometry.dispose();
  const ids=new Set(g.nodes.map(n=>n.id)), visited=new Set([g.nodes[0].id]);
  for(let i=0;i<g.nodes.length;i++) for(const e of g.edges) {
    assert.ok(ids.has(e.from)&&ids.has(e.to)); assert.ok(e.lengthMeters>0);
    if(visited.has(e.from)||visited.has(e.to)) {visited.add(e.from);visited.add(e.to);}
  }
  assert.equal(visited.size,g.nodes.length); assert.equal(g.edges.length,g.nodes.length-1);
  assert.equal(g.nodes.filter(n=>n.kind==='entrance').length,a.accepted);
  const env=createSettlementEnvironment(d);
  for(const s of env.scenery) {
    const size=assetRegistry[s.assetId].dimensionsMeters;
    assert.ok(env.clearance(s.offset,Math.max(size[0],size[2])*(s.scale??1)/2),'Scenery clears roads, approaches and buildings');
  }
}
assert.equal(signatures.size,8,'Meaningful variation between seeds');
assert.notDeepEqual(generateSettlement({...base,seed:7+4294967296},flat).definition.buildings,generateSettlement({...base,seed:7},flat).definition.buildings,'High seed bits affect layout');
for(const sample of [unknown,missing]) {
  const r=generateSettlement(base,sample); assert.equal(r.state,'waiting-terrain'); assert.equal(r.definition,undefined); assert.equal(r.navigation.nodes.length,0);
}
const slopeSampler=plane(base.origin,0.05);
const slope=generateSettlement(base,slopeSampler); assert.ok(slope.accepted>=5);
const { offsetCoordinate } = await import(await loadModule('map/settlements/romanSettlement'));
for (const b of slope.definition.buildings) {
  const samples=plotSupportSamples(b), heights=samples.map(p=>slopeSampler(offsetCoordinate(base.origin,p.point)).displayMeters);
  assert.ok(Math.max(...heights.map((h,i)=>h-samples[i].base))+0.015-Math.min(...heights)<=base.terrain.maxFoundationRiseMeters);
}
const tight=generateSettlement({...base,terrain:{...base.terrain,maxFoundationRiseMeters:0.03}},slopeSampler);
assert.equal(tight.state,'unsuitable','Foundation guard rejects plots even when the road fits');
const firstPlot=generateSettlement(base,flat).definition.buildings[0].offset;
const { GLOBE_RADIUS_METERS } = await import(await loadModule('lib/geo'));
const island=([lng,lat])=>{
  const x=(lng-base.origin[0])*Math.PI/180*GLOBE_RADIUS_METERS*Math.cos(base.origin[1]*Math.PI/180);
  const z=(base.origin[1]-lat)*Math.PI/180*GLOBE_RADIUS_METERS;
  return {displayMeters:Math.hypot(x-firstPlot[0],z-firstPlot[1])<4?10:0,readiness:'confirmed'};
};
const adapted=generateSettlement(base,island);
assert.ok(adapted.accepted>0); assert.match(adapted.message,/adapted/,'Terrain-dependent changes are reported explicitly');
const steep=generateSettlement(base,plane(base.origin,1)); assert.equal(steep.state,'unsuitable'); assert.equal(steep.definition,undefined);
const small=generateSettlement({...base,targetBuildingCount:12,extentMeters:36},flat); assert.equal(small.state,'partial'); assert.ok(small.accepted<12);
const session=new ProceduralSettlementSession(base);
assert.equal(session.update(flat),undefined); session.start(); assert.equal(session.update(missing).state,'waiting-terrain');
session.invalidate(); const valid=session.update(flat); assert.equal(valid.state,'ready');
session.invalidate(); assert.equal(session.update(unknown),valid,'Retain valid layout during coverage loss');
session.invalidate(); assert.equal(session.update(plane(base.origin,0.01)),valid,'Camera/refinement retains suitable plots');
session.invalidate(); assert.equal(session.update(plane(base.origin,1)).state,'unsuitable','New unsuitable DEM invalidates layout');
session.invalidate(true); assert.equal(session.update(missing).state,'waiting-terrain');
session.cancel(); assert.equal(session.update(flat),undefined); session.start(); assert.equal(session.update(flat).state,'ready');
session.invalidate(true); let cancelled=false;
assert.equal(session.update(c=>{if(!cancelled){cancelled=true;session.cancel();}return flat(c);}),undefined,'Cancelled generation cannot commit');
assert.throws(()=>generateSettlement({...base,seed:NaN},flat),/Seed/);
assert.throws(()=>generateSettlement({...base,targetBuildingCount:50},flat),/5–12/);
console.log(`Procedural settlement: determinism, 8 seeds, relocation, contacts, road/plot clearance, environment, navigation, pending/zero DEM, partial capacity, slopes and cancellation pass (${Math.round(performance.now()-start)} ms).`);

// Real GLBs and the existing assembler/cache: replacement while shared requests are pending.
const { readFile } = await import('node:fs/promises');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { SettlementScene } = await import(await loadModule('map/settlements/SettlementScene'));
const { GlbCache } = await import(await loadModule('lib/assets/glbCache'));
const originalLoad=GLTFLoader.prototype.loadAsync;
let releasePending;
const gate=new Promise(resolve=>{releasePending=resolve;});
const cache=new GlbCache();
let leases=0;
const trackedCache={acquire:async url=>{const lease=await cache.acquire(url);leases++;let released=false;return {...lease,release(){if(!released){released=true;leases--;lease.release();}}};}};
let oldStatus,newStatus;
const oldScene=new SettlementScene(generateSettlement(base,flat).definition,s=>{oldStatus=s;},()=>{},trackedCache);
const newScene=new SettlementScene(generateSettlement({...base,seed:42},flat).definition,s=>{newStatus=s;},()=>{},trackedCache);
GLTFLoader.prototype.loadAsync=async function(url){
  await gate;
  const bytes=await readFile(new URL(`../public${url}`,import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
};
try {
  const oldLoad=oldScene.load(); oldScene.unload();
  const newLoad=newScene.load(); releasePending(); await Promise.all([oldLoad,newLoad]);
  assert.equal(oldStatus.state,'unloaded'); assert.equal(oldScene.scene.children[0].children.length,0);
  newScene.updateTerrain(flat); assert.equal(newStatus.state,'ready'); assert.equal(newStatus.loaded,8);
  newScene.invalidateTerrain(); newScene.updateTerrain(unknown); assert.ok(newStatus.terrainRetained>0);
  const owned=newScene.resources.slice(); let disposed=0;
  for(const r of owned) r.addEventListener?.('dispose',()=>disposed++);
  newScene.unload(); assert.equal(leases,0,'Every obsolete and active lease released');
  assert.equal(disposed,owned.filter(r=>r.addEventListener).length,'All owned resources disposed once');
  await newScene.load(); newScene.updateTerrain(flat); assert.equal(newStatus.state,'ready');
  newScene.invalidateTerrain(true); newScene.updateTerrain(missing); assert.equal(newStatus.state,'waiting-terrain');
  newScene.invalidateTerrain(); newScene.updateTerrain(flat); assert.equal(newStatus.state,'ready');
  newScene.unload(); assert.equal(leases,0);
} finally {oldScene.unload();newScene.unload();GLTFLoader.prototype.loadAsync=originalLoad;}
console.log('Procedural assembler: regeneration during GLB loads, shared cache leases, retained DEM, reset, unload/reload and owned-resource disposal pass.');
