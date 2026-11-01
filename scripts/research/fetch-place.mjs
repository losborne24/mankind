// Phase 5C: fetches the open sources around a place from the allow-listed hosts only (Wikidata, Pleiades, Wikipedia summaries,
// OpenStreetMap via Overpass). Raw responses go to data/research/quarantine/ first; only responses that pass the normalisers in
// lib/research/sources.ts are promoted to trimmed snapshots in data/history/<slug>/source/, with licences and SHA-256 digests in
// manifest.json. Network access is needed only here; everything after works offline from the snapshots.
//   node scripts/research/fetch-place.mjs --title Ostia --lng 12.2923 --lat 41.7556 [--radius 2] [--slug ostia]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const R = await import(await loadTypescript('lib/research/sources'));
const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const title = opt('--title'), lng = Number(opt('--lng')), lat = Number(opt('--lat')), km = Number(opt('--radius', '2'));
if (!title || !Number.isFinite(lng) || !Number.isFinite(lat) || !(km > 0 && km <= 10)) { console.error('Usage: --title <name> --lng <lon> --lat <lat> [--radius km (≤10)] [--slug name]'); process.exit(2); }
const slug = opt('--slug', R.slugify(title)), accessed = new Date().toISOString().slice(0, 10), stamp = new Date().toISOString().replace(/[:.]/g, '-');
const quarantine = `data/research/quarantine/${slug}/${stamp}`, out = `data/history/${slug}/source`;
mkdirSync(quarantine, { recursive: true }); mkdirSync(out, { recursive: true });
let n = 0;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function fetchJson(url, init = {}) {
  R.assertAllowed(url);
  const response = await fetch(url, { ...init, headers: { 'user-agent': R.USER_AGENT, accept: 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(90000) });
  const text = await response.text();
  writeFileSync(`${quarantine}/${String(++n).padStart(3, '0')}-${new URL(url).hostname}.json`, text);
  if (!response.ok) throw Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  if (Buffer.byteLength(text) > R.MAX_RESPONSE_BYTES) throw Error(`${new URL(url).hostname}: response over ${R.MAX_RESPONSE_BYTES} bytes`);
  return JSON.parse(text);
}
const manifest = { place: { title, slug, centre: [lng, lat], radiusKm: km }, fetchedAt: new Date().toISOString(), quarantine, entries: [], errors: [] };
const save = (source, file, body, requests, records) => {
  const text = JSON.stringify({ accessed, ...R.LICENCES[source], ...body }, null, 1) + '\n';
  writeFileSync(`${out}/${file}`, text);
  manifest.entries.push({ source, file: `${out}/${file}`, requests, accessed, ...R.LICENCES[source], sha256: createHash('sha256').update(text).digest('hex'), records });
};

// Wikidata: historical items around the point (CC0).
const query = R.wikidataAroundQuery([lng, lat], km);
const sparqlUrl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
const places = R.normaliseWikidata(await fetchJson(sparqlUrl, { headers: { accept: 'application/sparql-results+json' } }));
save('wikidata', 'wikidata.json', { query, places }, [sparqlUrl], places.length);
console.log(`wikidata: ${places.length} historical items within ${km} km`);

// Pleiades records those items name (CC BY).
const pleiades = [], pleiadesUrls = [];
for (const id of [...new Set(places.map(p => p.pleiadesId).filter(Boolean))].slice(0, 40)) {
  const url = `https://pleiades.stoa.org/places/${encodeURIComponent(id)}/json`;
  try { pleiades.push(R.normalisePleiades(await fetchJson(url))); pleiadesUrls.push(url); } catch (e) { manifest.errors.push({ url, error: e.message }); }
  await pause(300);
}
save('pleiades', 'pleiades.json', { places: pleiades }, pleiadesUrls, pleiades.length);
console.log(`pleiades: ${pleiades.length} records`);

// English Wikipedia summaries for the items that have an article (CC BY-SA; quoted for claims only).
const summaries = [], wikipediaUrls = [];
for (const article of [...new Set(places.map(p => p.article).filter(Boolean))].slice(0, 40)) {
  const page = decodeURIComponent(new URL(article).pathname.replace(/^\/wiki\//, ''));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
  try { summaries.push(R.normaliseWikipedia(await fetchJson(url))); wikipediaUrls.push(url); } catch (e) { manifest.errors.push({ url, error: e.message }); }
  await pause(200);
}
save('wikipedia', 'wikipedia.json', { summaries }, wikipediaUrls, summaries.length);
console.log(`wikipedia: ${summaries.length} summaries`);

// OpenStreetMap remains with a historic tag (ODbL). Overpass is often busy: a failure is recorded, not fatal.
const overpassQuery = R.overpassAroundQuery([lng, lat], Math.round(km * 1000));
try {
  const osm = R.normaliseOverpass(await fetchJson('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(overpassQuery) }));
  save('osm', 'osm.json', { query: overpassQuery, baseTimestamp: osm.baseTimestamp, features: osm.features }, ['https://overpass-api.de/api/interpreter'], osm.features.length);
  console.log(`osm: ${osm.features.length} historic features`);
} catch (e) { manifest.errors.push({ url: 'https://overpass-api.de/api/interpreter', error: e.message }); console.log(`osm: failed (${e.message}); continuing without it`); }

writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1) + '\n');
console.log(`Saved snapshots to ${out} (manifest with digests); raw responses kept in ${quarantine}. ${manifest.errors.length} errors.`);
