import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.resolve('maplibre-gl'));
const { mat4 } = require('gl-matrix');
const packageURL = new URL('../node_modules/maplibre-gl/', import.meta.url);
assert.equal(JSON.parse(await readFile(new URL('package.json',packageURL))).version,'6.15.0',
  'Review the compatibility adapter when MapLibre changes');
const source = await readFile(new URL('src/tile/terrain_tile_manager.ts',packageURL),'utf8');
const ast=ts.createSourceFile('terrain_tile_manager.ts',source,ts.ScriptTarget.Latest,true);
const declaration=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='TerrainTileManager');
const methods=['getTerrainCoords','_getTerrainCoordsForRegularTile','_getTerrainCoordsForTileRanges','_isWithinTileRanges','getTileByID'];
const extracted=declaration.members.filter(node=>methods.includes(node.name?.getText(ast))).map(node=>node.getText(ast)).join('\n');
// Run the installed implementation's actual methods without its WebGL/worker constructor.
const compiled=ts.transpileModule(`class Fixture {${extracted}}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const Manager=new Function('mat4','createMat4f64','EXTENT',`${compiled}; return Fixture`)(mat4,()=>new Float64Array(16),8192);
const adapter=ts.transpileModule(await readFile(new URL('../map/terrainTexturePrecision.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {repairTerrainTextureCoordinates,attachTerrainTexturePrecision}=await import(`data:text/javascript;base64,${Buffer.from(adapter).toString('base64')}`);
function tile(z,x,y,wrap=0) {
 const canonical={z,x,y,equals(b){return z===b.z&&x===b.x&&y===b.y},
  isChildOf(b){return z>b.z&&Math.floor(x/2**(z-b.z))===b.x&&Math.floor(y/2**(z-b.z))===b.y}};
 return {canonical,wrap,clone(){return tile(z,x,y,wrap)}};
}
function manager(target) {
 const result=new Manager();result._tiles={target:{tileID:target}};result._renderableTilesKeys=['target'];return result;
}
function projected(matrix,x,y) {return [matrix[0]*x+matrix[12],matrix[5]*y+matrix[13]]}
function checkCorners(matrix,source,target,wrapped=false) {
 const scale=2**(target.canonical.z-source.canonical.z);
 const left=(target.canonical.x/scale-source.canonical.x-(wrapped?source.wrap*2**source.canonical.z:0))*8192;
 const top=(target.canonical.y/scale-source.canonical.y)*8192;
 const width=8192/scale;
 for(const [x,y,wanted] of [[left,top,[-1,1]],[left+width,top+width,[1,-1]]]) {
  projected(matrix,x,y).forEach((v,i)=>assert.ok(Math.abs(v-wanted[i])<1e-5));
 }
}
// Reproduce the real failure: z7 biome and z4 land textures on z21 terrain.
for(const z of [4,7,8,12]) {
 const source=tile(z,2**(z-1),2**(z-2));
 const scale=2**(21-z),target=tile(21,source.canonical.x*scale+5,source.canonical.y*scale+7);
 const terrain=manager(target);
 const original=terrain.getTerrainCoords;
 const before=terrain.getTerrainCoords(source).target.terrainRttPosMatrix32f;
 assert.equal(before.every(Number.isFinite),21-z<=13);
 const restore=repairTerrainTextureCoordinates(terrain);
 const after=terrain.getTerrainCoords(source).target.terrainRttPosMatrix32f;
 assert.ok(after.every(Number.isFinite));checkCorners(after,source,target);
 if(21-z<=13)assert.deepEqual(after,before,'Valid projections stay byte-for-byte unchanged');
 restore();assert.equal(terrain.getTerrainCoords,original);
}
// Wrapped image/range path uses the same fractional projection convention.
{
 const source=tile(7,68,47,1),target=tile(21,68*16384+100,47*16384+200);
 const terrain=manager(target),restore=repairTerrainTextureCoordinates(terrain);
 const ranges={21:{minWrap:0,maxWrap:2,minTileXWrapped:0,maxTileXWrapped:2**21,minTileY:0,maxTileY:2**21}};
 const matrix=terrain.getTerrainCoords(source,ranges).target.terrainRttPosMatrix32f;
 assert.ok(matrix.every(Number.isFinite));checkCorners(matrix,source,target,true);restore();
}
// Exaggeration, terrain disable/re-enable and unmount replace/restore managers.
const callbacks=new Set(),first=manager(tile(21,100,100)),second=manager(tile(21,200,200));
const original=first.getTerrainCoords;
const map={terrain:{tileManager:first},on(type,fn){assert.equal(type,'terrain');callbacks.add(fn)},off(type,fn){callbacks.delete(fn)}};
const detach=attachTerrainTexturePrecision(map);assert.notEqual(first.getTerrainCoords,original);
map.terrain={tileManager:second};callbacks.forEach(fn=>fn());assert.equal(first.getTerrainCoords,original);
assert.notEqual(second.getTerrainCoords,original);
map.terrain=null;callbacks.forEach(fn=>fn());assert.equal(second.getTerrainCoords,original);
map.terrain={tileManager:first};callbacks.forEach(fn=>fn());detach();
assert.equal(first.getTerrainCoords,original);assert.equal(callbacks.size,0);
console.log('Terrain textures: installed MapLibre close-zoom failure reproduced; finite fractional projections, exact crop corners, unchanged valid matrices, wrap/ranges and manager lifecycle pass.');
