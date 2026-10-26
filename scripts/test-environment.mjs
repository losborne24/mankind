import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { classifyEcoregion } from '../map/environment/classification.mjs';

// Compile pure TS modules in memory; no browser/GPU or extra test dependency.
const require = createRequire(import.meta.url);
function load(path) {
  const result = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
  });
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(
    (name) => name === './styles.json' ? require('../map/environment/styles.json')
      : name.startsWith('@/') ? load(`../${name.slice(2)}.ts`)
        : name.startsWith('.') ? load(new URL(`${name}.ts`, new URL(path, import.meta.url))) : require(name), compiled, compiled.exports,
  );
  return compiled.exports;
}
const { getEnvironmentForYear } = load('../map/environment/catalog.ts');
const { EnvironmentRenderer } = load('../map/environment/renderer.ts');
const { createGlobeStyle } = load('../map/mapStyle.ts');
const ancient = getEnvironmentForYear(-2999);
const recent = getEnvironmentForYear(2025);
assert.equal(ancient.id, recent.id);
assert.equal(ancient.reconstructed, false);
assert(ancient.layers.every(l => l.provenance.validity === null));
assert.throws(() => getEnvironmentForYear(NaN), RangeError);
assert.equal(classifyEcoregion({ECO_ID:1,BIOME_NUM:1}), 'forest');
assert.equal(classifyEcoregion({ECO_ID:1,BIOME_NUM:8}), 'grassland');
assert.equal(classifyEcoregion({ECO_ID:1,BIOME_NUM:13}), 'desert');
assert.equal(classifyEcoregion({ECO_ID:1,BIOME_NUM:9}), 'wetland');
assert.equal(classifyEcoregion({ECO_ID:0,BIOME_NUM:11}), null);
assert.equal(classifyEcoregion({ECO_ID:1,BIOME_NUM:99}), null);

const sources = new Map(), layers = new Map();
let mutations = 0;
// Intentionally no terrain, camera, setStyle or geometry API: a replacement
// must be possible without any call to those systems.
const map = {
  addSource(id, source) { sources.set(id, source); mutations++; },
  addLayer(layer, before) { assert.equal(before, 'relief'); layers.set(layer.id, layer); mutations++; },
  getLayer(id) { return layers.get(id); },
  removeLayer(id) { assert(layers.delete(id)); mutations++; },
  removeSource(id) { assert(sources.delete(id)); mutations++; },
  setLayoutProperty(id, key, value) { layers.get(id).layout[key] = value; },
};
const renderer = new EnvironmentRenderer(map, 'relief');
renderer.setState(ancient);
assert.equal(layers.size, 6);
renderer.setVisible('forest', false);
assert.equal(layers.get('environment-forest').layout.visibility, 'none');
assert.equal(layers.get('environment-desert').layout.visibility, 'visible');
const initial = mutations;
for (let year = -2998; year < 2026; year++) renderer.setState(getEnvironmentForYear(year));
assert.equal(mutations, initial, 'Timeline must not rebuild sources/upload textures');
const replacement = structuredClone(ancient);
replacement.id = 'test-period';
replacement.layers[0].geography.tileTemplate = '/test-period/{z}/{x}/{y}.png';
replacement.layers[0].geography.maxzoom = 3;
replacement.layers[0].provenance.dataset = 'Test reconstruction';
renderer.setState(replacement);
assert.equal(layers.size, 6);
assert.equal(sources.get('environment-forest').maxzoom, 3);
assert.equal(layers.get('environment-forest').layout.visibility, 'none');
assert.equal(sources.get('environment-forest').tiles[0], '/test-period/{z}/{x}/{y}.png');
assert(sources.get('environment-forest').attribution.includes('Test reconstruction'));

// Check the actual style integration, not just a mocked insertion argument.
// All environmental surfaces must join the native raster terrain drape below
// its lighting and the authoritative ocean mask. No custom/duplicate mesh.
const style = createGlobeStyle();
const orderedLayers = [...style.layers];
const terrainSources = JSON.stringify(style.sources);
const integratedMap = {
  addSource(id, source) { style.sources[id] = source; },
  addLayer(layer, before) {
    const index = orderedLayers.findIndex(l => l.id === before);
    assert(index >= 0, 'Terrain lighting insertion slot must exist');
    orderedLayers.splice(index, 0, layer);
  },
};
const integratedRenderer = new EnvironmentRenderer(integratedMap, 'relief');
integratedRenderer.setState(ancient);
const indexOf = (id) => orderedLayers.findIndex(l => l.id === id);
for (const record of ancient.layers) {
  const layer = orderedLayers[indexOf(record.id)];
  assert.equal(layer.type, 'raster', 'Use MapLibre native terrain draping');
  assert(indexOf('land-fill-50m') < indexOf(record.id));
  assert(indexOf(record.id) < indexOf('relief'));
  assert.equal(style.sources[record.id].type, 'raster');
}
assert(indexOf('relief') < indexOf('hillshade'));
assert(indexOf('hillshade') < indexOf('ocean-fill-50m'));
assert(indexOf('terrain-light') > indexOf('hillshade'));
assert(indexOf('terrain-light') < indexOf('ocean-fill-50m'));
assert.equal(orderedLayers[indexOf('relief')].layout.visibility, 'none');
assert.equal(orderedLayers[indexOf('hillshade')].layout.visibility, 'none');
assert.notEqual(orderedLayers[indexOf('terrain-light')].layout?.visibility, 'none');
assert.equal(style.sources.dem.type, 'raster-dem');
assert.equal(style.sources.dem.encoding, 'terrarium');
assert.equal(style.sources.dem.maxzoom, 4);
assert.deepEqual(JSON.parse(terrainSources).dem, style.sources.dem);
assert.deepEqual(JSON.parse(terrainSources)['dem-shading'], style.sources['dem-shading']);
console.log('Native raster drape integration passed: surface < optional DEM shading < subtle light < NE ocean; unchanged Terrarium z0–4 sources.');

// Exercise the actual debug buttons: shading must never remove/change terrain
// or its sources; elevation must restore the same source and exaggeration.
const { DebugControl } = load('../map/debugControl.ts');
const { TERRAIN_EXAGGERATION } = load('../map/terrain.ts');
class Element {
  children = [];
  style = {};
  attributes = {};
  listeners = {};
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  set innerHTML(value) { if (value === '') this.children = []; }
  remove() {}
}
globalThis.document = { createElement: () => new Element() };
let terrain = {source:'dem', exaggeration:TERRAIN_EXAGGERATION}, terrainChanges = 0;
const debugMap = {
  getLayer: id => orderedLayers.find(l=>l.id===id),
  getLayoutProperty: (id,key) => orderedLayers.find(l=>l.id===id)?.layout?.[key],
  setLayoutProperty: (id,key,value) => {
    const layer=orderedLayers.find(l=>l.id===id); layer.layout ??= {}; layer.layout[key]=value;
  },
  getTerrain: () => terrain,
  setTerrain: value => {terrain=value; terrainChanges++;},
};
// Route renderer visibility updates to the same live map used by the control.
integratedMap.getLayer = debugMap.getLayer;
integratedMap.setLayoutProperty = debugMap.setLayoutProperty;
const debug = new DebugControl({ environment: integratedRenderer });
const panel = debug.onAdd(debugMap);
const button = label => panel.children.find(el => el.children[0]?.textContent === label);
assert.equal(button('RESOLVE 2017').attributes['aria-pressed'], 'true');
integratedRenderer.setVisible('forest', false);
button('RESOLVE 2017').listeners.click();
assert.equal(button('RESOLVE 2017').attributes['aria-pressed'], 'false');
for (const record of ancient.layers.filter(l => l.classification !== 'water'))
  assert.equal(debugMap.getLayoutProperty(record.id, 'visibility'), 'none');
assert.equal(debugMap.getLayoutProperty('environment-water', 'visibility'), 'visible');
integratedRenderer.setVisible('desert', false);
integratedRenderer.setVisible('grassland', true);
assert.equal(debugMap.getLayoutProperty('environment-grassland', 'visibility'), 'none');
assert.equal(terrainChanges, 0);
button('RESOLVE 2017').listeners.click();
assert.equal(debugMap.getLayoutProperty('environment-forest', 'visibility'), 'none');
assert.equal(debugMap.getLayoutProperty('environment-desert', 'visibility'), 'none');
assert.equal(debugMap.getLayoutProperty('environment-grassland', 'visibility'), 'visible');
assert.equal(debugMap.getLayoutProperty('environment-water', 'visibility'), 'visible');
assert.equal(button('DEM Shading').attributes['aria-pressed'], 'false');
assert.equal(button('3D Elevation').attributes['aria-pressed'], 'true');
button('DEM Shading').listeners.click();
assert.equal(debugMap.getLayoutProperty('relief','visibility'), 'visible');
assert.equal(debugMap.getLayoutProperty('hillshade','visibility'), 'visible');
button('DEM Shading').listeners.click();
assert.equal(terrainChanges, 0);
assert.equal(debugMap.getLayoutProperty('relief','visibility'), 'none');
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), undefined);
button('3D Elevation').listeners.click();
assert.equal(terrain, null);
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), undefined);
button('3D Elevation').listeners.click();
assert.deepEqual(terrain, {source:'dem',exaggeration:1.5});
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), undefined);
// Lighting compares an identical physical surface, and keeps its chosen state
// across elevation toggles. It never enables the legacy cloudy DEM overlays.
assert.equal(button('Terrain Lighting').attributes['aria-pressed'], 'true');
const changesBeforeLighting = terrainChanges;
button('Terrain Lighting').listeners.click();
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), 'none');
assert.equal(button('Terrain Lighting').attributes['aria-pressed'], 'false');
assert.equal(terrainChanges, changesBeforeLighting);
button('3D Elevation').listeners.click();
button('3D Elevation').listeners.click();
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), 'none');
assert.deepEqual(terrain, {source:'dem',exaggeration:1.5});
const changesAfterElevation = terrainChanges;
button('Terrain Lighting').listeners.click();
assert.equal(debugMap.getLayoutProperty('terrain-light','visibility'), 'visible');
assert.equal(terrainChanges, changesAfterElevation);
assert.equal(debugMap.getLayoutProperty('relief','visibility'), 'none');
assert.equal(debugMap.getLayoutProperty('hillshade','visibility'), 'none');
debug.onRemove();
delete globalThis.document;
console.log('Independent debug controls passed: 3D Elevation ON / DEM Shading OFF; shading never changes terrain or sources.');
console.log('Environment checks passed: classification, unknown validity, 5,024 timeline years without source mutations, dataset replacement, independent visibility.');

// Natural material adapter must preserve hydrography, terrain, visibility and time stability.
const { naturalSurfaceProvider } = load('../map/surface/provider.ts');
const natural = naturalSurfaceProvider.adapt(ancient);
assert.equal(natural.reconstructed, false);
assert.equal(natural.requestedYear, -2999);
assert.equal(natural.layers.find(l => l.classification === 'water'), ancient.layers.find(l => l.classification === 'water'));
renderer.setSurfaceMode('natural');
assert.equal(sources.get('environment-forest').tiles[0], '/geo/environment/natural-v1/forest/{z}/{x}/{y}.png');
assert.equal(layers.get('environment-forest').layout.visibility, 'none');
assert.equal(layers.get('environment-grassland').paint['raster-opacity'], 1);
const naturalMutations = mutations;
for (let year = -2999; year <= 2026; year++) renderer.setState(getEnvironmentForYear(year));
const afterFirstBaseline = mutations;
// Previous state was the replacement test period: only the first update changes sources.
for (let year = -2999; year <= 2026; year++) renderer.setState(getEnvironmentForYear(year));
assert.equal(mutations, afterFirstBaseline);
assert(afterFirstBaseline >= naturalMutations);
assert.equal(renderer.handleSourceError('environment-water'), false);
assert.equal(renderer.getSurfaceMode(), 'natural');
assert.equal(renderer.handleSourceError('environment-forest'), true);
assert.equal(renderer.getSurfaceMode(), 'resolve');
assert(sources.get('environment-forest').tiles[0].includes('/reference-v1/'));
assert.equal(renderer.handleSourceError('environment-forest'), false);
assert.equal(layers.get('environment-forest').layout.visibility, 'none');
console.log('Natural provider passed: hydrography preserved, dates reuse material tiles, missing material tiles restore RESOLVE, filters survive comparison.');

const { materialTileAddress, GroundMaterialLayer } = load('../map/surface/groundLayer.ts');
assert.deepEqual(materialTileAddress(6, 35, 22), {z:4,x:8,y:5,uv:[.75,.5,.25]});
assert.deepEqual(materialTileAddress(6,35,22,2), {z:2,x:2,y:1,uv:[.1875,.375,.0625]});
assert.deepEqual(materialTileAddress(4, -1, 8), materialTileAddress(4, 15, 8));
assert.deepEqual(materialTileAddress(4, 0, -1), materialTileAddress(4, 0, 0));
assert.throws(() => materialTileAddress(NaN,0,0), RangeError);
const ground = new GroundMaterialLayer([{classification:'forest',template:'/forest/{z}/{x}/{y}.png',normalStrength:.5}], () => {});
const revision = ground.terrainTileRevision;
ground.setVisible('forest',true);
assert.equal(ground.terrainTileRevision,revision);
ground.setVisible('forest',false);
assert.equal(ground.terrainTileRevision,revision+1);
ground.setEnabled(false);
assert.equal(ground.terrainTileRevision,revision+2);
ground.setEnabled(false);
assert.equal(ground.terrainTileRevision,revision+2);
ground.onRemove();
console.log('PBR contracts passed: overzoom UVs, antimeridian/polar addressing, stable cache revisions and safe disposal.');

// Resource lifecycle: pending network work and both texture channels are released.
const released = [];
const pending = new AbortController();
ground.gl = {deleteTexture: value => released.push(value),deleteProgram: value => released.push(value),deleteVertexArray: value => released.push(value)};
ground.cache.set('test', {abort:pending,albedo:'albedo',properties:'properties'});
ground.program = 'program'; ground.vao = 'vao';
ground.onRemove();
assert.equal(pending.signal.aborted,true);
assert.deepEqual(released,['albedo','properties','program','vao']);
assert.equal(ground.cache.size,0);
console.log('PBR cleanup passed: textures, program, VAO and pending requests released.');

// Cold PBR tiles must show forest/woodland cover, not the brown floor texture.
// Shader inputs still receive the physical ground albedo, independently.
const pbrSources = new Map(), pbrLayers = new Map();
const pbrMap = {
  addSource: (id, value) => pbrSources.set(id, value),
  addLayer: (layer) => pbrLayers.set(layer.id, layer),
  getLayer: id => pbrLayers.get(id),
};
const pbrRenderer = new EnvironmentRenderer(pbrMap, 'relief', naturalSurfaceProvider, true);
pbrRenderer.setState(ancient);
assert(pbrSources.get('environment-forest').tiles[0].includes('/natural-v1/forest-appearance/'));
const materialLayer = pbrLayers.get('natural-ground-pbr');
assert(materialLayer.inputs.find(input => input.classification === 'forest').template.includes('/natural-v1/forest/'));
const pbrSourceCount = pbrSources.size;
pbrRenderer.setState(getEnvironmentForYear(2026));
assert.equal(pbrLayers.get('natural-ground-pbr'), materialLayer);
assert.equal(pbrSources.size,pbrSourceCount);
console.log('PBR loading fallback passed: biome cover during loading, independent ground textures, no date-driven layer replacement.');

// RESOLVE and natural selections share the same live surface, with no unload/reload flash.
const forestSource = pbrSources.get('environment-forest');
pbrRenderer.setSurfaceMode('resolve');
assert.equal(pbrSources.get('environment-forest'),forestSource);
assert.equal(pbrLayers.get('natural-ground-pbr'),materialLayer);
pbrRenderer.setSurfaceMode('natural');
assert.equal(pbrSources.get('environment-forest'),forestSource);
assert.equal(pbrLayers.get('natural-ground-pbr'),materialLayer);
console.log('Unified surface passed: RESOLVE/natural use matching material appearance without source or shader replacement.');
