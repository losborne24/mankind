import assert from 'node:assert/strict';
import { loadModule } from './check-roman-assets.mjs';
const { createSettlementEnvironment, footprintDistance, buildingContacts } = await import(await loadModule('map/settlements/settlementEnvironment'));
const { createRomanSettlement } = await import(await loadModule('map/settlements/romanSettlement'));
const { settlementSurfaceMaps } = await import(await loadModule('map/settlements/surfaceMaterials'));
const { contactFoundationSurface } = await import(await loadModule('map/settlements/terrainSurfaces'));
const { assetRegistry } = await import(await loadModule('lib/assets/registry'));
const definition = createRomanSettlement(20261028);
const a = createSettlementEnvironment(definition), b = createSettlementEnvironment({...definition, origin:[25,38]});
assert.deepEqual(a.scenery,b.scenery,'Relocation preserves generated local plants');
assert.deepEqual(a.scenery,createSettlementEnvironment(definition).scenery);
assert.ok(a.scenery.length <= definition.scenery.length + 28);
assert.equal(a.scenery.filter(p=>p.tags?.includes('cultivated')).length,definition.scenery.filter(p=>p.tags?.includes('cultivated')).length,'Cultivated plots remain distinct');
for (const p of a.scenery) {
  const asset = assetRegistry[p.assetId];
  if (asset.category !== 'vegetation') continue;
  const radius = Math.max(asset.dimensionsMeters[0],asset.dimensionsMeters[2])*(p.scale??1)/2;
  assert.ok(a.clearance(p.offset,radius),'Every canopy and tuft clears roads, entrances and rotated occupied bounds');
}
const obstructed = createSettlementEnvironment({...definition,scenery:[
  {assetId:'environment-olive-tree-01',offset:[0,-20],tags:['tree']},
  {assetId:'environment-olive-tree-01',offset:definition.buildings[0].offset,tags:['tree']},
  {assetId:'environment-dry-grass-tuft-01',offset:a.entrances[0].point,tags:['ground-cover']},
]});
assert.equal(obstructed.scenery.filter(p=>p.tags?.includes('tree')).length,0,'Reject deliberate tree collisions');
for(const e of a.entrances) assert.ok(a.entranceWear(e.point)>.99);
assert.ok(a.traffic([0,0])>.99 && a.traffic([40,55])===0);
const aqueduct = definition.buildings.find(b=>b.id==='aqueduct');
const feet = buildingContacts(aqueduct);
assert.equal(feet.length,3,'Separate pier contacts rather than an eight-metre rectangular slab');
assert.ok(feet.every(f=>footprintDistance([2,31],f)>0),'Open arch ground remains open');
const house = definition.buildings.find(b=>assetRegistry[b.assetId].grounding.contacts.some(f=>f.base>0));
assert.ok(house,'Authored step contacts retain their positive base height');
const stepSurface=contactFoundationSurface(buildingContacts(house));
assert.ok(stepSurface.seatingOffsets.some(h=>h>0),'Step support tops preserve authored step height');
stepSurface.geometry.dispose();
const surface = contactFoundationSurface(feet);
assert.ok(surface.points.length<100,'Contact geometry stays bounded');surface.geometry.dispose();
for(const asset of Object.values(assetRegistry).filter(a=>a.grounding)){
 for(const f of asset.grounding.contacts){
  assert.ok(f.width>0 && f.depth>0);
  assert.ok(Math.abs(f.offset[0])+f.width/2<=asset.dimensionsMeters[0]/2+.002);
  assert.ok(Math.abs(f.offset[1])+f.depth/2<=asset.dimensionsMeters[2]/2+.002);
 }
}
const maps = settlementSurfaceMaps(definition,[]), repeat = settlementSurfaceMaps(definition,[]);
assert.deepEqual(maps.ground.image.data,repeat.ground.image.data,'Wear map byte repeatability');
assert.deepEqual(maps.road.image.data,repeat.road.image.data,'Road map byte repeatability');
const changed=settlementSurfaceMaps({...definition,seed:123},[]);
assert.notDeepEqual(maps.ground.image.data,changed.ground.image.data);
assert.notDeepEqual(maps.road.image.data,changed.road.image.data);
const pixel=(map,x,z)=>{const {data,width,height}=map.image;const i=Math.round((x/96+.5)*(width-1)),j=Math.round((z/128+.5)*(height-1));return data.slice((j*width+i)*4,(j*width+i)*4+4)};
assert.ok(pixel(maps.road,0,-22)[3]>245,'Junction has no transparent centre seam');
assert.ok(pixel(maps.road,1.95,-25)[3]<150,'Road shoulder feathers before mesh boundary');
assert.ok(pixel(maps.ground,...a.entrances[0].point)[3]>180,'Entrance wear is readable');
for(const pair of [maps,repeat,changed]){pair.ground.dispose();pair.road.dispose()}
console.log('Environment: deterministic seed/relocation, byte-identical maps, separate pier feet, canopy clearance, traffic thinning, bounded wall plants, preserved crops and feathered roads pass.');
