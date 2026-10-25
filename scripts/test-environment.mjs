import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { classifyEcoregion } from '../map/environment/classification.mjs';

// Compile pure TS modules in memory; no browser/GPU or extra test dependency.
const require = createRequire(import.meta.url);
function load(path) {
  const result = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(
    (name) => name === './styles.json' ? require('../map/environment/styles.json')
      : name.startsWith('@/') ? load(`../${name.slice(2)}.ts`) : require(name), compiled, compiled.exports,
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
new EnvironmentRenderer(integratedMap, 'relief').setState(ancient);
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
assert.equal(style.sources.dem.type, 'raster-dem');
assert.equal(style.sources.dem.encoding, 'terrarium');
assert.equal(style.sources.dem.maxzoom, 4);
assert.deepEqual(JSON.parse(terrainSources).dem, style.sources.dem);
assert.deepEqual(JSON.parse(terrainSources)['dem-shading'], style.sources['dem-shading']);
console.log('Native raster drape integration passed: surface < relief < hillshade < NE ocean; unchanged Terrarium z0–4 sources.');
console.log('Environment checks passed: classification, unknown validity, 5,024 timeline years without source mutations, dataset replacement, independent visibility.');
