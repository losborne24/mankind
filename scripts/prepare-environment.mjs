#!/usr/bin/env node
/** Offline only. pnpm build NEVER downloads/prepares geography.
 * Usage: node scripts/prepare-environment.mjs [--offline] [--maxzoom=4]
 * Inputs cached in .cache/environment; outputs ignored in public/geo/environment.
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { classifyEcoregion } from '../map/environment/classification.mjs';

const offline = process.argv.includes('--offline');
const maxzoom = Number(process.argv.find(a => a.startsWith('--maxzoom='))?.split('=')[1] ?? 4);
if (!Number.isInteger(maxzoom) || maxzoom < 0 || maxzoom > 4) throw Error('maxzoom must be 0–4');
const cache = '.cache/environment';
const output = 'public/geo/environment/reference-v1';
const tileSize = 512;
const styles = JSON.parse(await readFile('map/environment/styles.json', 'utf8'));
const sources = {
  ecoregions: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Resolve_Ecoregions/FeatureServer/0/query?where=1%3D1&outFields=ECO_ID,BIOME_NUM,ECO_NAME&returnGeometry=true&outSR=4326&maxAllowableOffset=0.025&f=geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_rivers_lake_centerlines.geojson',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_lakes.geojson',
};
// Immutable inputs for this version. A changed upstream export needs review,
// a new dataset version and a new checksum; never silently replace the baseline.
const expectedHashes = {
  ecoregions: '9a9795e535abb77ea65e4cb8387911c2159ddd529f92956c7be98ae055bd0176',
  rivers: 'f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51',
  lakes: 'd350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52',
};
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const inputs = {};
const hashes = {};
for (const [name, url] of Object.entries(sources)) {
  const path = `${cache}/${name}.json`;
  let bytes;
  try { bytes = await readFile(path); } catch {
    if (offline) throw Error(`Missing offline input ${path}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    const parsed = JSON.parse(bytes);
    if (parsed.type !== 'FeatureCollection' || !parsed.features.length || parsed.exceededTransferLimit)
      throw Error(`Invalid/truncated source: ${name}`);
    await writeFile(path, bytes);
  }
  inputs[name] = JSON.parse(bytes);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  if (hashes[name] !== expectedHashes[name]) throw Error(`${name}: checksum changed; review provenance and version before regenerating`);
}
if (inputs.ecoregions.features.length !== 847) throw Error('Unexpected ecoregion count; review source changes');

/** Geographic coordinates to normalized Web Mercator; source polygons are split at ±180. */
function project([lon, lat]) {
  const phi = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2];
}
function lines(geometry) {
  if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  if (geometry.type === 'LineString') return [geometry.coordinates];
  return [];
}
function path(geometry, size, close = true) {
  return lines(geometry).map(ring => ring.map((point, i) => {
    const [x,y] = project(point);
    return `${i ? 'L' : 'M'}${(x*size).toFixed(2)},${(y*size).toFixed(2)}`;
  }).join('') + (close ? 'Z' : '')).join('');
}
const textures = {
  canopy: '<circle cx="4" cy="5" r="2.5" fill="#142e26" opacity=".22"/><circle cx="12" cy="13" r="3" fill="#91a07a" opacity=".09"/>',
  grass: '<path d="M3 6l2-2m5 9l2-2" stroke="#c2c695" stroke-width=".6" opacity=".16"/>',
  sand: '<path d="M0 7Q4 3 8 7T16 7" fill="none" stroke="#dfc38b" stroke-width=".6" opacity=".2"/>',
  marsh: '<path d="M1 6h5m3 7h6M3 5V2m9 10V8" stroke="#a5bbb0" stroke-width=".65" opacity=".24"/>',
  none: '',
};
let bytesTotal = 0;
let tileCount = 0;
const stats = {};
for (const [key, style] of Object.entries(styles)) {
  if (key === 'ice') continue; // Rock & Ice cannot establish ancient snow/ice extents.
  const features = key === 'water' ? [] : inputs.ecoregions.features.filter(f => classifyEcoregion(f.properties) === key);
  stats[key] = { features: features.length, bytes: 0 };
  for (let z = 0; z <= maxzoom; z++) {
    const size = tileSize * 2 ** z;
    const shapes = features.map(f => `<path d="${path(f.geometry,size)}" fill-rule="evenodd"/>`).join('');
    // Decorative texture stays clipped to sourced classification. It never chooses a biome.
    const texture = textures[style.texture];
    let drawing = `<defs><pattern id="texture" width="16" height="16" patternUnits="userSpaceOnUse">${texture}</pattern><clipPath id="biome">${shapes}</clipPath></defs><g fill="${style.color}">${shapes}</g>`;
    if (texture) drawing += `<rect width="100%" height="100%" fill="url(#texture)" clip-path="url(#biome)"/>`;
    if (key === 'water') {
      const lakes = inputs.lakes.features.filter(f => f.properties.featurecla === 'Lake');
      const rivers = inputs.rivers.features.filter(f => f.properties.featurecla === 'River');
      stats[key].features = lakes.length + rivers.length;
      drawing = `<g fill="${style.color}">${lakes.map(f=>`<path fill-rule="evenodd" d="${path(f.geometry,size)}"/>`).join('')}</g>`;
      drawing += `<g fill="none" stroke="${style.color}" stroke-linecap="round" stroke-linejoin="round">${rivers.map(f=>`<path stroke-width="${z < 2 ? .55 : .9}" d="${path(f.geometry,size,false)}"/>`).join('')}</g>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${drawing}</svg>`;
    // Render one mosaic per class/zoom, then slice lossless tiles. Bounded at 8192².
    const raw = await sharp(Buffer.from(svg), {limitInputPixels: 70000000}).ensureAlpha().raw().toBuffer();
    for (let x=0; x<2**z; x++) {
      await mkdir(`${output}/${key}/${z}/${x}`, {recursive:true});
      for (let y=0; y<2**z; y++) {
        const png = await sharp(raw,{raw:{width:size,height:size,channels:4}})
          .extract({left:x*tileSize,top:y*tileSize,width:tileSize,height:tileSize})
          .png({compressionLevel:9}).toBuffer();
        await writeFile(`${output}/${key}/${z}/${x}/${y}.png`,png);
        stats[key].bytes += png.length;
        bytesTotal += png.length;
        tileCount++;
      }
    }
    console.log(`${key} z${z} ready`);
  }
}
await writeFile(`${output}/manifest.json`, JSON.stringify({version:'reference-v1', tileSize, maxzoom, sources, hashes, stats, tileCount, bytesTotal, temporalValidity:null, notice:'Provisional modern ecoregions and hydrography. NOT reconstructed 3000 BCE.', licences:{ecoregions:'CC-BY-4.0; RESOLVE / Dinerstein et al. 2017; simplified, reclassified, rasterised', rivers:'Public domain; Natural Earth', lakes:'Public domain; Natural Earth; reservoirs excluded'}},null,2)+'\n');
await copyFile(`${output}/manifest.json`, 'docs/phase-3a/asset-manifest.json');
console.log(`${tileCount} tiles; ${(bytesTotal/1024/1024).toFixed(2)} MiB`);
