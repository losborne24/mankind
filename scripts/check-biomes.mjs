import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const compile = async p => ts.transpileModule(await readFile(new URL(p, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleURL = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
process.env.NEXT_PUBLIC_BIOME_TILE_BASE_URL='http://localhost:8766/pnv-v2';
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
const metadata=JSON.parse(await readFile(new URL('../.biome-data/tiles/pnv-v2/tilejson.json',import.meta.url)));
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,json:async()=>metadata});
const detach=await attachBiomes(map,new AbortController().signal);
assert.deepEqual(validateStyleMin(style),[]);
const order=style.layers.map(l=>l.id);
for(const [a,b] of [['regional-land',BIOME_LAYER],[BIOME_LAYER,'terrain-diagnostic'],['terrain-diagnostic','regional-ocean'],[BIOME_LAYER,'coastline'],[BIOME_LAYER,'lakes']]) assert.ok(order.indexOf(a)<order.indexOf(b),`${a} must be below ${b}`);
assert.deepEqual(style.sources[BIOME_SOURCE].bounds,metadata.bounds);
assert.equal(style.sources[BIOME_SOURCE].tileSize,256);
detach();assert.equal(map.getSource(BIOME_SOURCE),undefined);
assert.ok(style.layers.findIndex(l=>l.id==='coastline')<style.layers.findIndex(l=>l.id==='regional-land'));
globalThis.fetch=async()=>{throw new Error('offline');};
await assert.rejects(()=>attachBiomes(map,new AbortController().signal));
assert.equal(map.getSource(BIOME_SOURCE),undefined);
globalThis.fetch=originalFetch;
console.log('Real manifest, globe style, biome/hillshade/ocean ordering, dark-atlas restoration and offline fallback validated.');
