import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {loadModule} from './check-roman-assets.mjs';
const {settlementSurfaceMaps}=await import(await loadModule('map/settlements/surfaceMaterials'));
const {generateSettlement,settlementProfileConfig}=await import(await loadModule('map/settlements/proceduralSettlement'));
const rows={};
for(const profile of ['hamlet','village','small-town']) {
 const definition=generateSettlement(settlementProfileConfig(profile),()=>({displayMeters:0,readiness:'confirmed'})).definition;
 const maps=settlementSurfaceMaps(definition,[]);rows[profile]={};
 for(const key of ['ground','road']) {rows[profile][key]=createHash('sha256').update(maps[key].image.data).digest('hex');maps[key].dispose();}
}
const path=new URL('./fixtures/settlement-surface-hashes.json',import.meta.url);
if(process.argv.includes('--record')) await writeFile(path,JSON.stringify(rows,null,2)+'\n');
else assert.deepEqual(rows,JSON.parse(await readFile(path,'utf8')),'Pixel-exact Step 8 ground/road textures, all profiles');
console.log('Ground/road optimization preserves every RGBA byte across all three profiles.');
