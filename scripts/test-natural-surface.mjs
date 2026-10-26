import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { materialWeights, sampleGround, geographicVariation } from '../map/surface/materials.ts';
import { aggregateCoverageRgba } from '../map/surface/raster.ts';
import { RESOLVE_ENVIRONMENTS } from '../map/surface/resolve.ts';
import { decodeTerrarium, deriveTerrain, mercatorToGeographic, mercatorPixelMetres } from '../map/surface/terrain.ts';

// 25% land coverage: transparent ocean RGB must not darken the material.
assert.deepEqual([...aggregateCoverageRgba(new Uint8Array([100, 80, 60, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 2, 2)], [100, 80, 60, 64]);
assert.throws(() => aggregateCoverageRgba(new Uint8Array(12), 3, 1), RangeError);
assert.equal(decodeTerrarium(128, 0, 0), 0);
assert.equal(decodeTerrarium(127, 255, 128), -.5);
const flat = deriveTerrain(Array(9).fill(100), 10);
assert.equal(flat.slope, 0);
assert.equal(flat.curvature, 0);
assert.equal(flat.ruggedness, 0);
assert.deepEqual(flat.normal, [-0, 1, -0]);
// Analytic east-rising plane, including the halo a tile must sample from neighbours.
const plane = deriveTerrain([0, 10, 20, 0, 10, 20, 0, 10, 20], 10);
assert(Math.abs(plane.slope - Math.PI / 4) < 1e-10);
assert(Math.abs(plane.aspect - Math.PI * 1.5) < 1e-10);
assert.equal(plane.curvature, 0);
assert(Math.abs(Math.hypot(...plane.normal) - 1) < 1e-10);
assert.throws(() => deriveTerrain([NaN], 0), RangeError);
assert.deepEqual(mercatorToGeographic(0, .5), [-180, 0]);
assert.deepEqual(mercatorToGeographic(1, .5), [-180, 0]);
assert(Math.abs(mercatorToGeographic(.5, 0)[1] - 85.0511287798066) < 1e-8);
assert(mercatorPixelMetres(60, 4, 256) < mercatorPixelMetres(0, 4, 256));
assert(Math.abs(geographicVariation(-180, 30) - geographicVariation(180, 30)) < 1e-10);
for (const environment of Object.values(RESOLVE_ENVIRONMENTS)) {
  const weights = materialWeights(environment, flat);
  assert(Math.abs(Object.values(weights).reduce((s, w) => s + w, 0) - 1) < 1e-10);
  assert(Object.values(weights).every(w => w >= 0 && w <= 1));
  const steep = materialWeights(environment, plane);
  assert(steep.rock > weights.rock);
  assert.equal(steep.snow, 0, 'Elevation must not invent snow');
  const high = materialWeights(environment, { ...flat, elevation: 6000 });
  assert.deepEqual(weights, high, 'Elevation alone must not change ecology or ground');
  const sample = sampleGround(weights, .2);
  assert(sample.albedo.every(c => c >= 0 && c <= 255));
  assert(sample.roughness >= 0 && sample.roughness <= 1);
}
console.log('Terrain/material checks passed: physical derivatives, normals, antimeridian continuity, normalized blends, no altitude-inferred snow.');

// Optional generated-asset validation, never silently skipped when assets are expected.
if (process.argv.includes('--assets')) {
  const manifest = JSON.parse(await readFile('public/geo/environment/natural-v1/manifest.json'));
  assert.equal(manifest.tiles, 10 * 341);
  assert.equal(manifest.propertyTiles, 5 * 341);
  assert.equal(manifest.propertiesVersion, 1);
  assert.equal(manifest.reconstructed, false);
  assert.equal(manifest.temporalValidity, null);
  const { default: sharp } = await import('sharp');
  for (const key of Object.keys(RESOLVE_ENVIRONMENTS)) {
    const source = await sharp(`public/geo/environment/reference-v1/${key}/4/8/5.png`).ensureAlpha().raw().toBuffer();
    const result = await sharp(`public/geo/environment/natural-v1/${key}/4/8/5.png`).ensureAlpha().raw().toBuffer();
    for (let i = 3; i < result.length; i += 4) assert.equal(result[i], source[i], 'Do not change ecological coverage');
  }
  // Property maps must preserve RGB as linear data, with physically valid roughness.
  for (const key of Object.keys(RESOLVE_ENVIRONMENTS)) {
    const {data,info} = await sharp(`public/geo/environment/natural-v1/${key}-properties/4/8/5.png`).raw().toBuffer({resolveWithObject:true});
    assert.equal(info.channels,3);
    for(let i=2;i<data.length;i+=3) assert(data[i]>=20 && data[i]<=255);
  }
  console.log(`Generated assets passed: ${manifest.tiles} tiles, ${(manifest.bytes / 1048576).toFixed(1)} MiB.`);
}
