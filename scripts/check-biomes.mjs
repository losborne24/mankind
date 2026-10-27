import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const compile = async p => ts.transpileModule(await readFile(new URL(p, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleURL = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
// Prefer the global pyramid; fall back to the regional prototype if it is absent.
const candidates=['pnv-v4-global','pnv-v4'];
const tiles=new URL('../.biome-data/tiles/',import.meta.url);
let version;
for(const name of candidates){
 try{ await readFile(new URL(`${name}/tilejson.json`,tiles)); version=name; break; }catch{}
}
assert.ok(version,`Generate tiles first: expected one of ${candidates.join(', ')} under .biome-data/tiles/`);
process.env.NEXT_PUBLIC_BIOME_TILE_BASE_URL=`http://localhost:8766/${version}`;
const {attachBiomes,BIOME_SOURCE,BIOME_LAYER}=await import(moduleURL(await compile('../map/biomes.ts')));
const {createGlobeStyle}=await import(moduleURL(await compile('../map/mapStyle.ts')));
const require=createRequire(import.meta.resolve('maplibre-gl'));
const {validateStyleMin}=require('@maplibre/maplibre-gl-style-spec');
const style=createGlobeStyle();
style.layers.splice(style.layers.findIndex(l=>l.id==='regional-ocean'),0,{id:'terrain-diagnostic',type:'hillshade',source:'physical-elevation'});
const map={
 addSource:(id,s)=>style.sources[id]=s,
 addLayer:(l,before)=>style.layers.splice(style.layers.findIndex(l=>l.id===before),0,l),
 getLayer:id=>style.layers.find(l=>l.id===id),getSource:id=>style.sources[id],
 removeLayer:id=>style.layers=style.layers.filter(l=>l.id!==id),removeSource:id=>delete style.sources[id],
 moveLayer:(id,before)=>{const layer=map.getLayer(id);map.removeLayer(id);map.addLayer(layer,before);},
};
const metadata=JSON.parse(await readFile(new URL(`${version}/tilejson.json`,tiles)));
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,json:async()=>metadata});
const detach=await attachBiomes(map,new AbortController().signal);
assert.deepEqual(validateStyleMin(style),[]);
const order=style.layers.map(l=>l.id);
for(const [a,b] of [['regional-land',BIOME_LAYER],[BIOME_LAYER,'terrain-diagnostic'],['terrain-diagnostic','regional-ocean'],[BIOME_LAYER,'coastline'],[BIOME_LAYER,'lakes']]) assert.ok(order.indexOf(a)<order.indexOf(b),`${a} must be below ${b}`);
assert.deepEqual(style.sources[BIOME_SOURCE].bounds,metadata.bounds);
assert.equal(style.sources[BIOME_SOURCE].tileSize,256);
assert.equal(style.sources[BIOME_SOURCE].maxzoom,metadata.maxzoom);
// The runtime URL template must follow the generated format, not a hardcoded one.
assert.deepEqual(style.sources[BIOME_SOURCE].tiles,[`http://localhost:8766/${version}/{z}/{x}/{y}.${metadata.format}`]);
if(version==='pnv-v4-global'){
 // `bounds` is what MapLibre may request: the full Web Mercator span, because
 // mapped polar glacier ice is painted beyond the vegetation extent.
 assert.deepEqual(metadata.bounds.map(Math.round),[-180,-85,180,85],'Global tile extent should span Web Mercator');
 // `dataBounds` is where vegetation colour is allowed, and must stay inside the
 // latitudes the PNV raster actually carries classes for.
 const [,south,,north]=metadata.dataBounds;
 assert.ok(south>-85.05&&north<85.05,'Vegetation clip must be inside the tile extent');
 assert.ok(south>-57&&south<-55&&north>83&&north<84,`Unexpected PNV data extent ${south},${north}`);
 assert.equal(metadata.format,'webp');
 assert.ok(metadata.tileCount>10000,'Global pyramid should contain the whole land surface');
 assert.ok(metadata.oceanTilesSkipped>0,'Ocean-only tiles should be skipped');
}
detach();assert.equal(map.getSource(BIOME_SOURCE),undefined);
assert.ok(style.layers.findIndex(l=>l.id==='coastline')>style.layers.findIndex(l=>l.id==='regional-ocean'));
globalThis.fetch=async()=>{throw new Error('offline');};
await assert.rejects(()=>attachBiomes(map,new AbortController().signal));
assert.equal(map.getSource(BIOME_SOURCE),undefined);
globalThis.fetch=originalFetch;
console.log('Real manifest, globe style, biome/hillshade/ocean ordering, dark-atlas restoration and offline fallback validated.');
