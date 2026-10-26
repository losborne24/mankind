#!/usr/bin/env node
/** Offline, bounded tile preparation. No downloads; no build-time side effects.
 * Prepare reference-v1 first. Full z4 surface (8192²), then area-filter to parents.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { prepareSurfaceAppearance } from './prepare-surface-appearance.mjs';
import { materialWeights, sampleGround, geographicVariation } from '../map/surface/materials.ts';
import { aggregateCoverageRgba } from '../map/surface/raster.ts';
import { RESOLVE_ENVIRONMENTS } from '../map/surface/resolve.ts';
import { decodeTerrarium, deriveTerrain, mercatorToGeographic, mercatorPixelMetres } from '../map/surface/terrain.ts';

const output = 'public/geo/environment/natural-v1';
const reference = 'public/geo/environment/reference-v1';
const size = 256, maxzoom = 4, worldSize = size * 2 ** maxzoom;
const classes = Object.keys(RESOLVE_ENVIRONMENTS);
const start = performance.now();
// Check complete inputs before publishing any output.
const inputManifest = await readFile(`${reference}/manifest.json`);
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
  await stat(`public/geo/dem/4/${x}/${y}.png`);
  for (const key of classes) await stat(`${reference}/${key}/4/${x}/${y}.png`);
}
// Bounded decoded DEM LRU: adjacent tiles reuse the same source pixels.
const dem = new Map();
async function getDem(x, y) {
  x = (x + 16) % 16; y = Math.max(0, Math.min(15, y));
  const id = `${x}/${y}`;
  if (dem.has(id)) { const v = dem.get(id); dem.delete(id); dem.set(id, v); return v; }
  const { data, info } = await sharp(`public/geo/dem/4/${id}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size || info.channels !== 3) throw Error(`Unexpected DEM format: ${id}`);
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = decodeTerrarium(...data.subarray(i * 3, i * 3 + 3));
  dem.set(id, heights);
  if (dem.size > 32) dem.delete(dem.keys().next().value);
  return heights;
}
let bytes = 0, tiles = 0;
async function save(key, z, x, y, buffer) {
  await mkdir(`${output}/${key}/${z}/${x}`, { recursive: true });
  await writeFile(`${output}/${key}/${z}/${x}/${y}.png`, buffer);
  bytes += buffer.length; tiles++;
}
if (!process.argv.includes('--parents-only')) for (let x = 0; x < 16; x++) {
  for (let y = 0; y < 16; y++) {
    const neighbours = new Map();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) neighbours.set(`${dx}/${dy}`, await getDem(x + dx, y + dy));
    function height(px, py) {
      const gx = (x * size + px + worldSize) % worldSize;
      const gy = Math.max(0, Math.min(worldSize - 1, y * size + py));
      let dx = Math.floor(gx / size) - x;
      if (dx > 1) dx = -1; if (dx < -1) dx = 1;
      const dy = Math.floor(gy / size) - y;
      return neighbours.get(`${dx}/${dy}`)[(gy % size) * size + gx % size];
    }
    // Once per source DEM pixel, shared by all materials. Geometry remains untouched.
    const terrain = [], noise = new Float32Array(size * size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const [lon, lat] = mercatorToGeographic((x * size + px + 0.5) / worldSize, (y * size + py + 0.5) / worldSize);
      const halo = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) halo.push(height(px + dx, py + dy));
      terrain.push(deriveTerrain(halo, mercatorPixelMetres(lat, maxzoom, size)));
      noise[py * size + px] = geographicVariation(lon, lat);
    }
    for (const key of classes) {
      const { data: mask, info } = await sharp(`${reference}/${key}/4/${x}/${y}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== 512 || info.height !== 512 || info.channels !== 4) throw Error('Unexpected reference tile format');
      const rgb = Buffer.alloc(size * size * 3);
      const properties = Buffer.alloc(size * size * 3);
      for (let i = 0; i < terrain.length; i++) {
        const sample = sampleGround(materialWeights(RESOLVE_ENVIRONMENTS[key], terrain[i]), noise[i]);
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = sample.albedo[c];
        properties[i * 3] = Math.round((terrain[i].normal[0] * .5 + .5) * 255);
        properties[i * 3 + 1] = Math.round((terrain[i].normal[2] * .5 + .5) * 255);
        properties[i * 3 + 2] = Math.round(sample.roughness * 255);
      }
      // One-pixel DEM sampling centres are expanded using bilinear filtering.
      // Extend using neighbour values below via a halo to avoid tile-edge clamping.
      const haloRgb = Buffer.alloc((size + 2) ** 2 * 3);
      const haloProperties = Buffer.alloc((size + 2) ** 2 * 3);
      for (let py = -1; py <= size; py++) for (let px = -1; px <= size; px++) {
        const dest = ((py + 1) * (size + 2) + px + 1) * 3;
        if (px >= 0 && px < size && py >= 0 && py < size) {
          rgb.copy(haloRgb, dest, (py * size + px) * 3, (py * size + px) * 3 + 3);
          properties.copy(haloProperties, dest, (py * size + px) * 3, (py * size + px) * 3 + 3);
        } else {
          const [lon, lat] = mercatorToGeographic((x * size + px + .5) / worldSize, (y * size + py + .5) / worldSize);
          // The derivative halo extends two pixels; getDem already includes neighbours.
          const h = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) h.push(height(px + dx, py + dy));
          const t = deriveTerrain(h, mercatorPixelMetres(lat, 4, size));
          const s = sampleGround(materialWeights(RESOLVE_ENVIRONMENTS[key], t), geographicVariation(lon, lat));
          haloProperties[dest] = Math.round((t.normal[0] * .5 + .5) * 255);
          haloProperties[dest + 1] = Math.round((t.normal[2] * .5 + .5) * 255);
          haloProperties[dest + 2] = Math.round(s.roughness * 255);
          for (let c = 0; c < 3; c++) haloRgb[dest + c] = s.albedo[c];
        }
      }
      const expanded = await sharp(haloRgb, { raw: { width: size + 2, height: size + 2, channels: 3 } })
        .resize((size + 2) * 2, (size + 2) * 2, { kernel: 'linear' }).extract({ left: 2, top: 2, width: 512, height: 512 }).raw().toBuffer();
      const propertyTile = await sharp(haloProperties, { raw: { width: size + 2, height: size + 2, channels: 3 } })
        .resize((size + 2) * 2, (size + 2) * 2, { kernel: 'linear' }).extract({ left: 2, top: 2, width: 512, height: 512 }).png().toBuffer();
      await save(`${key}-properties`, 4, x, y, propertyTile);
      const rgba = Buffer.alloc(512 * 512 * 4);
      for (let i = 0; i < 512 * 512; i++) {
        rgba[i * 4] = expanded[i * 3]; rgba[i * 4 + 1] = expanded[i * 3 + 1]; rgba[i * 4 + 2] = expanded[i * 3 + 2];
        // Classification support only, NEVER interpolate or reverse-engineer RGB category IDs.
        rgba[i * 4 + 3] = mask[i * 4 + 3];
      }
      await save(key, 4, x, y, await sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer());
    }
  }
  console.log(`Natural surface column ${x + 1}/16`);
}
// Sparse coverage index prevents allocating GPU textures for empty ecological tiles.
const emptyTiles = new Set();
for (const key of classes) for (let x=0;x<16;x++) for (let y=0;y<16;y++) {
  const stats = await sharp(`${output}/${key}/4/${x}/${y}.png`).stats();
  if (stats.channels[3]?.max === 0) emptyTiles.add(`${key}/4/${x}/${y}`);
}
// Area-weighted premultiplied-alpha aggregation; all LODs share finest-level inputs.
for (let z = 3; z >= 0; z--) for (const key of classes) {
  for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) {
    const children = [];
    if ([0,1].every(dy => [0,1].every(dx => emptyTiles.has(`${key}/${z+1}/${2*x+dx}/${2*y+dy}`)))) emptyTiles.add(`${key}/${z}/${x}/${y}`);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) children.push({ input: await readFile(`${output}/${key}/${z + 1}/${2 * x + dx}/${2 * y + dy}.png`), left: dx * 512, top: dy * 512 });
    const mosaic = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } }).composite(children).raw().toBuffer();
    await save(key, z, x, y, await sharp(aggregateCoverageRgba(mosaic, 1024, 1024), { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer());
  }
}
// Property channels are continuous data (not alpha): average each channel independently.
for (let z = 3; z >= 0; z--) for (const key of classes) {
  for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) {
    const raw = Buffer.alloc(1024 * 1024 * 3);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const child = await sharp(`${output}/${key}-properties/${z + 1}/${2 * x + dx}/${2 * y + dy}.png`).removeAlpha().raw().toBuffer();
      for (let row = 0; row < 512; row++) child.copy(raw, ((dy * 512 + row) * 1024 + dx * 512) * 3, row * 512 * 3, (row + 1) * 512 * 3);
    }
    const parent = Buffer.alloc(512 * 512 * 3);
    for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) for (let c = 0; c < 3; c++) {
      const i = (py * 2 * 1024 + px * 2) * 3 + c;
      parent[(py * 512 + px) * 3 + c] = Math.round((raw[i] + raw[i + 3] + raw[i + 3072] + raw[i + 3075]) / 4);
    }
    await save(`${key}-properties`, z, x, y, await sharp(parent, {raw: {width:512, height:512, channels:3}}).png().toBuffer());
  }
}
const appearance = await prepareSurfaceAppearance(output, classes);
const manifest = {
  appearanceVersion: 1, appearanceTiles: appearance.tiles, appearanceBytes: appearance.bytes,
  version: 'natural-v1', emptyTiles: [...emptyTiles], propertiesVersion: 1, propertyEncoding: 'RGB: east normal ×0.5+0.5, south normal ×0.5+0.5, roughness; linear data', tileSize: 512, maxzoom, tiles: classes.length * 341 * 3, albedoTiles: classes.length * 341, propertyTiles: classes.length * 341,
  preparation: { regeneratedTiles: tiles + appearance.tiles, regeneratedBytes: bytes + appearance.bytes, seconds: (performance.now() - start) / 1000 },
  bytes: appearance.bytes + (await Promise.all(classes.flatMap(key => [key, `${key}-properties`]).flatMap(key => Array.from({length: 5}, (_, z) =>
    Array.from({length: 2 ** z}, (_, x) => Array.from({length: 2 ** z}, (_, y) =>
      stat(`${output}/${key}/${z}/${x}/${y}.png`).then(s => s.size))).flat()).flat()))).reduce((a, b) => a + b, 0),
  referenceSha256: createHash('sha256').update(inputManifest).digest('hex'),
  temporalValidity: null, reconstructed: false,
  notice: 'Artistic natural ground materials using modern RESOLVE ecological priors and Terrarium derivatives. NOT historical reconstruction. No inferred snow, climate, soil survey, geology, or local forest boundaries.',
  rendering: 'Native terrain-tile PBR shader; matching material drape fallback; no extra geometry.',
};
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({...manifest, emptyTiles: `${emptyTiles.size} empty tiles omitted at runtime`}));
