// Actual GLBs/CPU pipeline, synthetic flat DEM. Not a browser or GPU benchmark.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModule} from './check-roman-assets.mjs';
const {SettlementScene}=await import(await loadModule('map/settlements/SettlementScene'));
const {GlbCache}=await import(await loadModule('lib/assets/glbCache'));
const {ProceduralSettlementSession}=await import(await loadModule('map/settlements/ProceduralSettlementSession'));
const {settlementProfileConfig}=await import(await loadModule('map/settlements/proceduralSettlement'));
const original=GLTFLoader.prototype.loadAsync;
const flat=()=>({displayMeters:0,readiness:'confirmed'}), rows=[];
GLTFLoader.prototype.loadAsync=async function(url){const b=await readFile(`public${url}`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
try {
 for(const profile of ['hamlet','village','small-town']) {
  const session=new ProceduralSettlementSession(settlementProfileConfig(profile));session.start();
  const result=session.update(flat),scene=new SettlementScene(result.definition,()=>{},()=>{},new GlbCache());
  await scene.load();scene.updateTerrain(flat);
  rows.push({profile,buildings:result.accepted,layout:session.timing.snapshot(),scene:scene.timing.snapshot()});scene.dispose();
 }
} finally {GLTFLoader.prototype.loadAsync=original;}
await mkdir('docs/previews/streaming',{recursive:true});
const output=process.argv[2]??'current';
await writeFile(`docs/previews/streaming/${output}-cpu.json`,JSON.stringify({note:'Node CPU, real GLB parse, synthetic confirmed flat DEM; no network, GPU or browser timings. Single run per profile.',rows},null,2)+'\n');
console.log(rows);
